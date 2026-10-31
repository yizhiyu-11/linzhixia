/**
 * 启动前体检（只读，不改任何东西；加 --fix 才自动修可以修的）。
 *
 *   node scripts/doctor.mjs            人读输出
 *   node scripts/doctor.mjs --json     给 boot.mjs / 测试用
 *   node scripts/doctor.mjs --net      额外测 DeepSeek 连通性
 *   node scripts/doctor.mjs --fix      自动清理残留锁 / 用备份还原坏配置
 *
 * 退出码：0 全部通过（允许 warn），1 有致命问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve('.');
const ARGS = process.argv.slice(2);
const ENV_FILE_ARG = (() => {
  const i = ARGS.indexOf('--env-file');
  return i >= 0 ? ARGS[i + 1] : null;
})();
const JSON_OUT = ARGS.includes('--json');
const PRE_START = ARGS.includes('--pre-start');
const NO_QQ = process.env.ONEBOT_DISABLED === '1'; // 开发模式：不连 QQ
const NET = ARGS.includes('--net');
const FIX = ARGS.includes('--fix');

const NAPCAT_DIR = process.env.NAPCAT_DIR || 'C:\\napcat';
const WEB_PORT = Number(process.env.WEB_PORT || 3870);
const WS_URL = process.env.ONEBOT_WS_URL || 'ws://127.0.0.1:3001';

/** 端口是否在监听 */
const portOpen = (port, host = '127.0.0.1', timeout = 800) =>
  new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeout);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false));
    s.once('error', () => finish(false));
    s.connect(port, host);
  });

/** 进程是否存在（pid 存活） */
const pidAlive = (pid) => {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/** 用 PowerShell 查进程（Windows） */
const psJson = (script) => {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='SilentlyContinue'; ${script} | ConvertTo-Json -Compress`],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  );
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) return null;
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return null;
  }
};

/** 读 .env（不依赖 --env-file） */
const readEnvFile = () => {
  const p = ENV_FILE_ARG ? path.resolve(ENV_FILE_ARG) : path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
};

const napcatLogPath = () => {
  const candidates = [];
  const dir = NAPCAT_DIR;
  if (fs.existsSync(path.join(dir, 'boot.log'))) candidates.push(path.join(dir, 'boot.log'));
  for (const f of ['try.out.log', 'boot.out.log']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) candidates.push(p);
  }
  try {
    for (const f of fs.readdirSync(dir)) {
      if (/^napcat-.*\.log$/.test(f)) candidates.push(path.join(dir, f));
    }
  } catch {
    /* ignore */
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
};

/** 从 NapCat 日志判断登录状态 */
const napcatState = () => {
  const p = napcatLogPath();
  if (!p) return { file: null, state: 'no-log', text: '' };
  let text = '';
  try {
    text = fs.readFileSync(p, 'utf8').slice(-20000);
  } catch {
    return { file: p, state: 'unreadable', text: '' };
  }
  const flat = text.replace(/\x1b\[[0-9;]*m/g, '');
  // 以"最后出现的标记"为准：退出之后的二维码提示不算"还在等扫码"
  const last = (re) => {
    let idx = -1;
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(flat))) idx = m.index;
    return idx;
  };
  const iExit = last(/Process exited/);
  const iQr = last(/请扫描下面的二维码/);
  const iWs = last(/WebSocket服务.*已启动|WebSocket Server\] Server Started/);
  const iLogin = last(/正在快速登录|快速登录成功|登录成功/);

  if (iExit > Math.max(iQr, iWs, iLogin)) return { file: p, state: 'exited', text: flat };
  if (iWs >= 0) return { file: p, state: 'ws-up', text: flat };
  if (iQr >= 0) return { file: p, state: 'need-qr', text: flat };
  if (iLogin >= 0) return { file: p, state: 'logging-in', text: flat };
  return { file: p, state: 'unknown', text: flat };
};

const checks = [];
const add = (c) => {
  checks.push(c);
  return c;
};

// 1. 单实例锁
{
  const lockFile = path.join(ROOT, 'data', 'bot.lock');
  if (!fs.existsSync(lockFile)) {
    add({ id: 'lock', title: '单实例锁', ok: true, level: 'info', detail: '没有锁（正常）' });
  } else {
    const raw = fs.readFileSync(lockFile, 'utf8').trim();
    const pid = Number(raw);
    const alive = pidAlive(pid);
    if (alive) {
      add({
        id: 'lock',
        title: '单实例锁',
        ok: true,
        level: 'info',
        detail: `已有实例在跑（pid ${pid}）`,
        running: true,
      });
    } else if (FIX) {
      fs.rmSync(lockFile, { force: true });
      add({ id: 'lock', title: '单实例锁', ok: true, level: 'info', detail: `清掉了上次残留的锁（pid ${pid} 已不存在）`, autofixed: true });
    } else {
      add({
        id: 'lock',
        title: '单实例锁',
        ok: false,
        level: 'fatal',
        detail: `data/bot.lock 里的 pid ${pid} 已经不存在了（上次没正常退出）`,
        reason: '锁是上次崩溃留下的',
        fix: '自动清理即可，或手动删 data/bot.lock',
        canFix: true,
      });
    }
  }
}

// 2. node
{
  const major = Number(process.versions.node.split('.')[0]);
  const ok = major >= 22;
  add({
    id: 'node',
    title: 'Node 版本',
    ok,
    level: ok ? 'info' : 'fatal',
    detail: `v${process.versions.node}${ok ? '' : '（需要 22+，node:sqlite 依赖它）'}`,
    reason: ok ? '' : 'Node 太旧，跑不了 node:sqlite',
    fix: ok ? '' : '换用 dsh 自带的 node',
  });
}

// 3. .env
{
  const env = readEnvFile();
  const missing = ['DEEPSEEK_API_KEY'].filter((k) => !env[k]);
  const emptyKey = env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.length < 10;
  add({
    id: 'env',
    title: '.env 配置',
    ok: missing.length === 0 && !emptyKey,
    level: missing.length || emptyKey ? 'fatal' : 'info',
    detail:
      missing.length || emptyKey
        ? `${missing.join('、') || 'DEEPSEEK_API_KEY'}${emptyKey ? ' 看起来是空的' : ' 缺失'}`
        : `关键项齐全（${Object.keys(env).length} 个变量）`,
    reason: missing.length || emptyKey ? '缺 API key，模型调不通' : '',
    fix: missing.length || emptyKey ? '在安装目录的 .env 里补上 DEEPSEEK_API_KEY=sk-...' : '',
  });
}

// 4. config.json
{
  const cfg = path.join(ROOT, 'config.json');
  const bak = cfg + '.bak';
  if (!fs.existsSync(cfg)) {
    add({ id: 'config', title: 'config.json', ok: true, level: 'info', detail: '没有这个文件（用默认配置）' });
  } else {
    try {
      const obj = JSON.parse(fs.readFileSync(cfg, 'utf8').replace(/^\uFEFF/, ''));
      add({ id: 'config', title: 'config.json', ok: true, level: 'info', detail: `可解析，${Object.keys(obj).length} 个模块` });
    } catch (e) {
      let fixed = false;
      if (FIX && fs.existsSync(bak)) {
        fs.copyFileSync(bak, cfg);
        fixed = true;
      }
      add({
        id: 'config',
        title: 'config.json',
        ok: fixed,
        level: fixed ? 'info' : 'fatal',
        detail: fixed ? '原来是坏的，已用 config.json.bak 还原' : `解析失败：${e.message}`,
        reason: fixed ? '' : '配置文件写坏了，启动会直接用默认值或报错',
        fix: fixed ? '' : '检查 config.json 语法，或用 config.json.bak 覆盖',
        canFix: fs.existsSync(bak),
        autofixed: fixed,
      });
    }
  }
}

// 5. 数据库
{
  const p = path.join(ROOT, 'data', 'bot.db');
  if (!fs.existsSync(p)) {
    add({ id: 'db', title: '数据库', ok: true, level: 'info', detail: '还没有 bot.db（首次启动会创建）' });
  } else {
    let db;
    try {
      db = new DatabaseSync(p);
      const integrity = db.prepare('PRAGMA integrity_check').get();
      const value = integrity?.integrity_check ?? Object.values(integrity || {})[0];
      let busy = false;
      try {
        db.exec('BEGIN IMMEDIATE');
        db.exec('ROLLBACK');
      } catch (e) {
        busy = /busy|locked/i.test(e.message);
      }
      const size = Math.round(fs.statSync(p).size / 1024);
      const okAll = value === 'ok' && !busy;
      add({
        id: 'db',
        title: '数据库',
        ok: okAll,
        level: okAll ? 'info' : busy ? 'warn' : 'fatal',
        detail: busy ? `${size}KB，完整性 ok，但写锁被占用（可能机器人正在跑）` : `${size}KB，完整性 ${value}`,
        reason: okAll ? '' : busy ? '另一个进程正在写库' : '数据库文件可能损坏',
        fix: okAll ? '' : busy ? '正常，机器人跑着就会占锁' : '用 scripts/restore.mjs 从备份恢复',
      });
    } catch (e) {
      add({
        id: 'db',
        title: '数据库',
        ok: false,
        level: 'fatal',
        detail: `打不开：${e.message}`,
        reason: '数据库文件被占用或损坏',
        fix: '关掉占用它的程序；或从安装目录的 backup 恢复',
      });
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }
  }
}

// 6. QQ
const qqProcs = psJson(`Get-Process -Name QQ | Select-Object Id,StartTime`);
if (NO_QQ) {
  add({
    id: 'qq',
    title: 'QQ 相关检查',
    ok: true,
    level: 'info',
    detail: '开发模式（ONEBOT_DISABLED=1）：跳过 QQ / NapCat / OneBot 检查',
  });
} else {
{
  const list = Array.isArray(qqProcs) ? qqProcs : qqProcs ? [qqProcs] : [];
  add({
    id: 'qq',
    title: 'QQ 进程',
    ok: list.length > 0,
    // QQ 没开不算致命：NapCat 启动时会自己把 QQ 拉起来（用本机登录态快速登录）
    level: list.length ? 'info' : 'warn',
    detail: list.length ? `${list.length} 个进程` : '没在跑（启动时 NapCat 会拉起它）',
    reason: list.length ? '' : 'QQ 没开',
    fix: list.length ? '' : '启动脚本会让 NapCat 拉起 QQ；本机没有登录态时会退化成需要扫码',
  });
}

// 7. NapCat 进程
const napProcs = psJson(`Get-Process -Name NapCatWinBootMain | Select-Object Id`);
{
  const list = Array.isArray(napProcs) ? napProcs : napProcs ? [napProcs] : [];
  add({
    id: 'napcat',
    title: 'NapCat 进程',
    ok: list.length > 0,
    level: list.length ? 'info' : 'warn',
    detail: list.length ? `在跑（pid ${list[0].Id}）` : '没在跑',
    reason: list.length ? '' : 'NapCat 没启动',
    fix: list.length ? '' : '启动脚本会自动拉起；手动可用 E:\\napcat\\napcat-run.cmd',
  });
}

// 8. 3001 端口
const wsPort = Number(new URL(WS_URL.replace(/^ws/, 'http')).port || 3001);
const wsUp = await portOpen(wsPort);
{
  add({
    id: 'port',
    title: `OneBot 端口 ${wsPort}`,
    ok: wsUp,
    level: wsUp ? 'info' : PRE_START ? 'warn' : 'fatal',
    detail: wsUp ? '在监听' : PRE_START ? '没监听（启动阶段会尝试拉起 NapCat）' : '没监听',
    reason: wsUp ? '' : 'NapCat 的 OneBot 服务没起来',
    fix: wsUp ? '' : PRE_START ? '启动脚本会拉起 NapCat，失败时会给原因' : '见 NapCat 日志；通常是 QQ 掉登录',
  });
}

// 9. 登录状态（只在端口没起时才有意义）
{
  const st = napcatState();
  if (wsUp) {
    add({ id: 'login', title: 'QQ 登录状态', ok: true, level: 'info', detail: 'OneBot 已连上，视为已登录' });
  } else if (st.state === 'need-qr') {
    add({
      id: 'login',
      title: 'QQ 登录状态',
      ok: false,
      level: PRE_START ? 'warn' : 'fatal',
      detail: `NapCat 在等扫码（${path.basename(st.file)}）`,
      reason: 'QQ 掉登录了：NapCat 拿不到本机登录态，只能等扫码',
      fix: PRE_START
        ? '启动脚本会先重启 NapCat 试一次快速登录；还不行才需要你手动登录 QQ'
        : '在电脑版 QQ 上登录你的机器人号，然后重新运行启动脚本；或扫二维码',
    });
  } else if (st.state === 'exited') {
    add({
      id: 'login',
      title: 'QQ 登录状态',
      ok: false,
      level: PRE_START ? 'warn' : 'fatal',
      detail: `NapCat 进程已退出（${path.basename(st.file)}）`,
      reason: 'NapCat 启动后自己退出了，通常是登录失败或注入失败',
      fix: PRE_START ? '启动脚本会重新拉起它' : '看 E:\\napcat\\boot.log 末尾；确认 QQ 已登录后重试',
    });
  } else if (st.state === 'logging-in') {
    add({
      id: 'login',
      title: 'QQ 登录状态',
      ok: false,
      level: 'warn',
      detail: 'NapCat 正在快速登录，稍等',
      reason: '还在登录中',
      fix: '等 10-20 秒再看',
    });
  } else {
    add({
      id: 'login',
      title: 'QQ 登录状态',
      ok: false,
      level: 'warn',
      detail: st.file ? `看不出来（${path.basename(st.file)}: ${st.state}）` : '没有 NapCat 日志',
      reason: '缺少判断依据',
      fix: '启动一次 NapCat 再看',
    });
  }
}
}

// 10. 管理后台端口
{
  const busy = await portOpen(WEB_PORT);
  const lockPid = (() => {
    try {
      return Number(fs.readFileSync(path.join(ROOT, 'data', 'bot.lock'), 'utf8').trim());
    } catch {
      return 0;
    }
  })();
  const ours = busy && pidAlive(lockPid);
  add({
    id: 'console',
    title: `管理后台端口 ${WEB_PORT}`,
    ok: !busy || ours,
    level: !busy || ours ? 'info' : 'warn',
    detail: busy ? (ours ? '被机器人自己占用（正常）' : '被别的程序占用') : '空闲',
    reason: !busy || ours ? '' : '有别的程序占了 3870',
    fix: !busy || ours ? '' : '关掉占用的程序，或改 .env 里的 WEB_PORT',
  });
}

// 11. 磁盘
{
  const rows = [];
  let ok = true;
  for (const d of ['E:\\', 'D:\\', 'C:\\'].filter((p) => { try { fs.statfsSync(p); return true; } catch { return false; } })) {
    try {
      const st = fs.statfsSync(d);
      const freeGb = (st.bavail * st.bsize) / 1024 ** 3;
      rows.push(`${d[0]}: 剩 ${freeGb.toFixed(1)}GB`);
      if (freeGb < 1) ok = false;
    } catch {
      /* 盘不存在就算了 */
    }
  }
  add({
    id: 'disk',
    title: '磁盘空间',
    ok,
    level: ok ? 'info' : 'warn',
    detail: rows.join('，') || '读不到',
    reason: ok ? '' : '空间不足 1GB',
    fix: ok ? '' : '清理 logs/ 或 backup/',
  });
}

// 12. DeepSeek 连通性（可选）
if (NET) {
  const base = (readEnvFile().DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const t0 = Date.now();
  let ok = false;
  let detail = '';
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    const r = await fetch(base + '/models', { signal: ac.signal });
    clearTimeout(timer);
    ok = r.status < 500;
    detail = `HTTP ${r.status}，${Date.now() - t0}ms`;
  } catch (e) {
    detail = `${e.name === 'AbortError' ? '超时' : e.message}（${Date.now() - t0}ms）`;
  }
  add({
    id: 'net',
    title: 'DeepSeek 连通性',
    ok,
    level: ok ? 'info' : 'warn',
    detail,
    reason: ok ? '' : '连不上模型服务',
    fix: ok ? '' : '检查网络 / 代理，或看余额',
  });
}

// 生产环境可能用 SnowLuma 等其它桥接：端口通了就不该报 NapCat 缺失
{
  const _port = Number(new URL(WS_URL.replace(/^ws/, 'http')).port || 3001);
  const _up = await portOpen(_port);
  const _nap = checks.find((c) => c.id === 'napcat');
  if (_nap && !_nap.ok && _up) {
    _nap.ok = true;
    _nap.level = 'info';
    _nap.detail = `由其它桥接提供（${_port} 已监听，不一定是 NapCat）`;
    _nap.reason = '';
    _nap.fix = '';
  }
}

// ---- 汇总 ----
const fatal = checks.filter((c) => !c.ok && c.level === 'fatal');
const warns = checks.filter((c) => !c.ok && c.level === 'warn');
const running = checks.find((c) => c.id === 'lock')?.running === true;

const result = {
  ok: fatal.length === 0,
  running,
  fatal: fatal.length,
  warn: warns.length,
  checks: checks.map((c) => ({
    id: c.id,
    title: c.title,
    ok: c.ok,
    level: c.level,
    detail: c.detail,
    reason: c.reason || '',
    fix: c.fix || '',
    autofixed: !!c.autofixed,
  })),
};

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('=== 启动前检查 ===');
  for (const c of checks) {
    const mark = c.ok ? '✓' : c.level === 'fatal' ? '✗' : '!';
    console.log(`${mark} ${c.title.padEnd(12, ' ')} ${c.detail}`);
    if (!c.ok) {
      if (c.reason) console.log(`    原因：${c.reason}`);
      if (c.fix) console.log(`    处理：${c.fix}`);
    }
  }
  console.log('');
  if (fatal.length) {
    console.log(`=== 结论：有 ${fatal.length} 个问题，先修好再启动 ===`);
  } else if (warns.length) {
    console.log(`=== 结论：可以启动（${warns.length} 条提醒）===`);
  } else {
    console.log('=== 结论：全部正常 ===');
  }
  console.log(`    报告机器人：${checks.filter((c) => c.ok).length}/${checks.length} 项通过`);
}

process.exit(fatal.length ? 1 : 0);
