/**
 * 启动编排：先体检 → 再拉 NapCat → 最后启动机器人。
 * 任何一步失败都告诉用户「为什么」和「怎么办」。
 *
 *   node scripts/boot.mjs              正常启动
 *   node scripts/boot.mjs --no-open    不自动打开管理后台
 *   node scripts/boot.mjs --check      只体检，不启动
 *   node scripts/boot.mjs --json       最后输出一行 JSON 结论（给测试用）
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const NODE = process.execPath;
const NAPCAT_DIR = process.env.NAPCAT_DIR || 'E:\\napcat';
const ARGS = process.argv.slice(2);
const NO_OPEN = ARGS.includes('--no-open');
const ONLY_CHECK = ARGS.includes('--check');
const JSON_OUT = ARGS.includes('--json');
const WAIT_SEC = Number((ARGS.find((a) => a.startsWith('--wait=')) || '').split('=')[1]) || 90;
const SKIP_NAPCAT = process.env.SKIP_NAPCAT === '1';

const WEB_PORT = Number(process.env.WEB_PORT || 3870);
const WS_URL = process.env.ONEBOT_WS_URL || 'ws://127.0.0.1:3001';
const WS_PORT = Number(new URL(WS_URL.replace(/^ws/, 'http')).port || 3001);

const log = (s = '') => console.log(s);
const rule = () => log('─'.repeat(54));

const portOpen = (port, timeout = 700) =>
  new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (v) => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeout);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, '127.0.0.1');
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readTail = (file, bytes = 4000) => {
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
  } catch {
    return '';
  }
};

const napcatLatestLog = () => {
  const files = [];
  if (fs.existsSync(path.join(NAPCAT_DIR, 'boot.log'))) files.push(path.join(NAPCAT_DIR, 'boot.log'));
  try {
    for (const f of fs.readdirSync(NAPCAT_DIR)) if (/^napcat-.*\.log$/.test(f)) files.push(path.join(NAPCAT_DIR, f));
  } catch {
    /* ignore */
  }
  if (!files.length) return null;
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
};

/** 把技术错误翻译成人话 */
const diagnose = (text) => {
  const t = text || '';
  if (/ECONNREFUSED[^\n]*3001/.test(t)) return { reason: `NapCat 没在 ${WS_PORT} 端口监听`, fix: '检查 QQ 是否登录，或重跑本脚本让它自动拉起 NapCat' };
  if (/database is locked|SQLITE_BUSY/i.test(t)) return { reason: '另一个机器人实例还在跑，数据库被锁', fix: '关掉旧实例（任务管理器结束 node.exe），或删 data/bot.lock' };
  if (/EADDRINUSE/i.test(t) && /3870/.test(t)) return { reason: `管理后台端口 ${WEB_PORT} 被占用`, fix: '关掉占用 3870 的程序，或在 .env 里改 WEB_PORT' };
  if (/EADDRINUSE/i.test(t)) return { reason: '端口被占用', fix: '看日志里是哪个端口，关掉占用程序' };
  if (/401|invalid[_ ]?api[_ ]?key|Unauthorized|authentication/i.test(t)) return { reason: 'API key 无效或过期', fix: '检查 .env 里的 DEEPSEEK_API_KEY' };
  if (/insufficient|balance|余额/i.test(t)) return { reason: '模型 API 余额不足', fix: '去对应平台充值' };
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed/i.test(t)) return { reason: '网络连不上模型服务', fix: '检查网络/代理，或稍后重试' };
  if (/Cannot find module/i.test(t)) return { reason: '缺文件或依赖被删了', fix: '确认 E:\\ai-gf 完整，必要时从 backup 恢复' };
  if (/code=1006/.test(t)) return { reason: 'OneBot 连接被断开', fix: '确认 NapCat 的 token 与 .env 里的 ONEBOT_TOKEN 一致' };
  return null;
};

const guidance = () => {
  log('');
  log('  下一步：');
  log('    · 按上面的「处理」修好后，重新双击 启动机器人.cmd');
  log('    · 想看完整检查：双击 诊断.cmd');
  log('    · 日志：E:\\ai-gf\\bot.out.log、bot.err.log、E:\\napcat\\boot.log');
};

const writeReport = (obj) => {
  try {
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'data', 'startup-report.txt'), JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
};

// ---------- 1. 体检 ----------
const runDoctor = (extra = []) => {
  const r = spawnSync(NODE, [path.join(ROOT, 'scripts', 'doctor.mjs'), '--json', ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 60000,
  });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, checks: [], fatal: 1, error: '体检脚本没返回结果', raw: (r.stdout || '') + (r.stderr || '') };
  }
};

log('=== 启动前检查 ===');
let doc = runDoctor(['--fix', '--pre-start']);

// 有可自动修的，重跑一次拿干净结果
if (doc.checks?.some((c) => c.autofixed)) doc = runDoctor();

for (const c of doc.checks || []) {
  const mark = c.ok ? '✓' : c.level === 'fatal' ? '✗' : '!';
  log(`${mark} ${c.title.padEnd(12, ' ')} ${c.detail}`);
  if (!c.ok) {
    if (c.reason) log(`    原因：${c.reason}`);
    if (c.fix) log(`    处理：${c.fix}`);
  }
}
log('');

if (!doc.ok) {
  rule();
  log('启动已中止，没有动机器人。');
  guidance();
  rule();
  writeReport({ at: new Date().toISOString(), ok: false, stage: 'doctor', checks: doc.checks });
  if (JSON_OUT) log(JSON.stringify({ ok: false, stage: 'doctor', reason: doc.checks?.find((c) => !c.ok && c.level === 'fatal')?.reason || '' }));
  process.exit(1);
}

if (ONLY_CHECK) {
  log('=== 只体检，不启动（--check）===');
  process.exit(0);
}

// 桥接没起来时先判断：SKIP_NAPCAT 模式下不停 bot、不注入 QQ，直接说明情况
{
  const up = await portOpen(WS_PORT);
  if (!up && SKIP_NAPCAT) {
    rule();
    log('QQ 桥接没在跑（端口 ' + WS_PORT + ' 没监听）');
    log('  SKIP_NAPCAT=1：本脚本不会去拉起 NapCat，也不会停掉现有机器人');
    log('  处理：先启动桥接（SnowLuma 或 NapCat），确认端口在监听，再重跑');
    rule();
    process.exit(1);
  }
}

// 机器人进程在，但 NapCat 断了 → 这是"半死"状态，要修
if (doc.running) {
  const lock = Number(fs.readFileSync(path.join(ROOT, 'data', 'bot.lock'), 'utf8').trim());
  const wsAlive = await portOpen(WS_PORT);
  if (wsAlive) {
    log(`机器人已经在跑了（pid ${lock}），不用重复启动。`);
    const token = readTail(path.join(ROOT, 'data', 'web-token'), 200).trim();
    if (token) log(`管理后台：http://127.0.0.1:${WEB_PORT}/?token=${token}`);
    writeReport({ at: new Date().toISOString(), ok: true, stage: 'already-running', pid: lock });
    process.exit(0);
  }

  log('检测到「半死」状态：');
  log(`  · 机器人进程还在（pid ${lock}）`);
  log(`  · 但 NapCat 断开了（${WS_PORT} 没监听），它现在发不出消息`);
  log('  → 先拉起 NapCat，再重启机器人');
  log('');
  try {
    process.kill(lock, 'SIGTERM');
  } catch {
    /* ignore */
  }
  await sleep(1500);
  try {
    process.kill(lock, 'SIGKILL');
  } catch {
    /* 已经退了 */
  }
  fs.rmSync(path.join(ROOT, 'data', 'bot.lock'), { force: true });
  log(`  已停掉旧机器人（pid ${lock}），继续启动流程`);
  log('');
}

// ---------- 2. 确保 QQ 桥接 ----------
// 生产环境可能用 SnowLuma 而不是 NapCat：SKIP_NAPCAT=1 时只检测，不注入。
let wsUp = await portOpen(WS_PORT);
if (!wsUp && SKIP_NAPCAT) {
  rule();
  log('QQ 桥接没在跑（端口 ' + WS_PORT + ' 没监听）');
  log('  SKIP_NAPCAT=1，本脚本不会去拉起 NapCat（避免动 QQ）');
  log('  处理：先启动你的桥接（SnowLuma 或 NapCat），确认 ' + WS_PORT + ' 在监听，再重跑');
  rule();
  process.exit(1);
}
if (!wsUp) {
  log('=== 启动 NapCat ===');
  const napRunning = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Process -Name NapCatWinBootMain -ErrorAction SilentlyContinue | Measure-Object).Count"], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  }).stdout?.trim();

  if (!napRunning || napRunning === '0') {
    const logFile = path.join(NAPCAT_DIR, `napcat-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`);
    const out = fs.openSync(logFile, 'a');
    const qqPath = (() => {
      const r = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ' -ErrorAction SilentlyContinue).UninstallString"], {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      }).stdout?.trim();
      if (!r) return process.env.QQ_PATH || 'D:\\qq\\QQ.exe';
      return path.join(path.dirname(r.replace(/"/g, '')), 'QQ.exe');
    })();

    let child;
    try {
      child = spawn(path.join(NAPCAT_DIR, 'NapCatWinBootMain.exe'), [qqPath, path.join(NAPCAT_DIR, 'NapCatWinBootHook.dll'), '-q', '10000001'], {
        cwd: NAPCAT_DIR,
        detached: true,
        stdio: ['ignore', out, out],
        env: {
          ...process.env,
          NAPCAT_PATCH_PACKAGE: path.join(NAPCAT_DIR, 'qqnt.json'),
          NAPCAT_LOAD_PATH: path.join(NAPCAT_DIR, 'loadNapCat.js'),
          NAPCAT_INJECT_PATH: path.join(NAPCAT_DIR, 'NapCatWinBootHook.dll'),
          NAPCAT_LAUNCHER_PATH: path.join(NAPCAT_DIR, 'NapCatWinBootMain.exe'),
          NAPCAT_MAIN_PATH: path.join(NAPCAT_DIR, 'napcat.mjs'),
        },
      });
      child.on('error', (e) => log(`  拉起 NapCat 失败：${e.message}`));
      child.unref();
      log(`  已拉起 NapCat（pid ${child.pid}），日志：${path.basename(logFile)}`);
    } catch (e) {
      log(`  拉起 NapCat 出错：${e.message}（目录：${NAPCAT_DIR}）`);
    }
  } else {
    log('  NapCat 已在跑，等它把端口起来');
  }

  const deadline = Date.now() + WAIT_SEC * 1000;
  let said = '';
  while (Date.now() < deadline) {
    wsUp = await portOpen(WS_PORT);
    if (wsUp) break;
    const tail = readTail(napcatLatestLog() || '', 6000);
    let state = 'waiting';
    if (/请扫描下面的二维码/.test(tail)) state = 'need-qr';
    else if (/正在快速登录|登录成功/.test(tail)) state = 'logging-in';
    else if (/Process exited/i.test(tail)) state = 'exited';

    const msg = {
      'need-qr': '  QQ 掉登录了，NapCat 在等扫码…',
      'logging-in': '  正在快速登录 QQ…',
      exited: '  NapCat 进程退出了…',
      waiting: '  等 OneBot 端口…',
    }[state];
    if (msg && msg !== said) {
      log(msg);
      said = msg;
    }
    await sleep(2000);
  }

  if (!wsUp) {
    const tail = readTail(napcatLatestLog() || '', 8000);
    const qrUrl = tail.match(/二维码解码URL:\s*(\S+)/)?.[1];
    const needQr = /请扫描下面的二维码/.test(tail);
    rule();
    log(needQr ? '启动失败：QQ 掉登录了，需要登录' : '启动失败：NapCat 没能把 OneBot 端口起来');
    if (needQr) {
      log('  原因：NapCat 拿不到本机登录态，只能等扫码，但二维码一直没被扫。');
      log('  处理：打开电脑版 QQ 登录 10000001，然后重新运行本脚本。');
      if (qrUrl) log(`  二维码链接：${qrUrl}`);
      log(`  二维码图片：${path.join(NAPCAT_DIR, 'cache', 'qrcode.png')}`);
    } else {
      const d = diagnose(tail) || { reason: '原因不明', fix: `看日志：${napcatLatestLog() || path.join(NAPCAT_DIR, 'boot.log')}` };
      log(`  原因：${d.reason}`);
      log(`  处理：${d.fix}`);
    }
    guidance();
    rule();
    writeReport({ at: new Date().toISOString(), ok: false, stage: 'napcat', needQr, tail: tail.slice(-1500) });
    if (JSON_OUT) log(JSON.stringify({ ok: false, stage: 'napcat', needQr }));
    process.exit(1);
  }
  log('  ✓ OneBot 端口已就绪');
}

// ---------- 3. 启动机器人 ----------
log('');
log('=== 启动机器人 ===');
const outFile = path.join(ROOT, 'bot.out.log');
const errFile = path.join(ROOT, 'bot.err.log');
const before = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;

const outFd = fs.openSync(outFile, 'a');
const errFd = fs.openSync(errFile, 'a');
const bot = spawn(NODE, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', outFd, errFd],
  env: process.env,
});
bot.unref();
log(`  pid ${bot.pid}`);

const readNew = () => {
  try {
    const fd = fs.openSync(outFile, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.max(0, size - before);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, before);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
};

const deadline = Date.now() + 30000;
let ready = false;
while (Date.now() < deadline) {
  await sleep(700);
  const text = readNew();
  if (/就绪，等待消息/.test(text)) {
    ready = true;
    break;
  }
  // 进程死了就没必要等了
  try {
    process.kill(bot.pid, 0);
  } catch {
    break;
  }
}

const tailOut = readNew();
const tailErr = readTail(errFile, 3000);

if (ready) {
  const token = readTail(path.join(ROOT, 'data', 'web-token'), 200).trim();
  const acct = tailOut.match(/登录账号：(.+)/)?.[1]?.trim() || '';
  log(`  ✓ OneBot 已连接${acct ? `，账号 ${acct}` : ''}`);
  log('  ✓ 就绪，等待消息');
  log('');
  rule();
  log(`  启动成功。管理后台：http://127.0.0.1:${WEB_PORT}/?token=${token}`);
  rule();
  writeReport({ at: new Date().toISOString(), ok: true, stage: 'ready', pid: bot.pid, account: acct });
  if (JSON_OUT) log(JSON.stringify({ ok: true, stage: 'ready', pid: bot.pid }));

  if (!NO_OPEN && token) {
    spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${WEB_PORT}/?token=${token}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  process.exit(0);
}

// 失败：翻译原因
const d = diagnose(tailOut + '\n' + tailErr) || {
  reason: '启动后没等到「就绪」，也没匹配到已知错误',
  fix: '看 bot.out.log / bot.err.log 最后 20 行',
};
rule();
log('启动失败：机器人没能就绪');
log(`  原因：${d.reason}`);
log(`  处理：${d.fix}`);
log('');
log('  最近日志：');
for (const line of `${tailOut}\n${tailErr}`.trim().split(/\r?\n/).filter(Boolean).slice(-8)) log(`    ${line}`);
guidance();
rule();
writeReport({ at: new Date().toISOString(), ok: false, stage: 'bot', reason: d.reason, tail: (tailOut + tailErr).slice(-2000) });
if (JSON_OUT) log(JSON.stringify({ ok: false, stage: 'bot', reason: d.reason }));
process.exit(1);
