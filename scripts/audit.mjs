/**
 * 全系统审计：静态检查 + 数据一致性 + 接口边界 + 安全
 * node --env-file=.env scripts/audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
let warn = 0;
const ok = (n, d = '') => {
  pass++;
  console.log(`  ✓ ${n}${d ? '  — ' + d : ''}`);
};
const bad = (n, d = '') => {
  fail++;
  console.log(`  ✗ ${n}${d ? '  — ' + d : ''}`);
};
const note = (n, d = '') => {
  warn++;
  console.log(`  ! ${n}${d ? '  — ' + d : ''}`);
};

const token = fs.readFileSync('data/web-token', 'utf8').trim();
const BASE = 'http://127.0.0.1:3870';
const api = async (p, opts = {}) => {
  const r = await fetch(`${BASE}${p}${p.includes('?') ? '&' : '?'}token=${token}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json' },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('=== A. 代码静态检查 ===');
{
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'backup', 'tools', 'data', 'logs'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.mjs')) files.push(p);
    }
  };
  walk(ROOT);
  ok('js 文件', `${files.length} 个`);

  // 引用不存在的本地模块
  let broken = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from ['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(f), m[1]);
      if (!fs.existsSync(target)) {
        bad(`坏引用 ${path.relative(ROOT, f)} → ${m[1]}`);
        broken++;
      }
    }
  }
  if (!broken) ok('本地 import 全部存在');

  // 未使用的配置键（写了但没人读）
  const cfg = fs.readFileSync('src/config.mjs', 'utf8');
  const keys = [...cfg.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const unused = keys.filter((k) => {
    // 同时算上 config.k 和 const { k } = config 两种写法
    const uses = all.match(new RegExp(`\\b${k}\\b`, 'g')) || [];
    return uses.length <= 1; // 只在 config.mjs 定义处出现一次 = 没人读
  });
  if (unused.length) note('配置键没人用', unused.join(', '));
  else ok('配置键都有使用');

  // 后台模块字段是否都存在于 config
  const { allModules } = await import('../server/store.mjs');
  const { config } = await import('../src/config.mjs');
  const missing = [];
  for (const mod of allModules()) {
    for (const f of mod.fields) {
      if (!(f.key in config)) missing.push(`${mod.id}.${f.key}`);
    }
  }
  if (missing.length) bad('后台字段在 config 里不存在', missing.join(', '));
  else ok('后台 10 个模块的字段全部对应到 config');
}

console.log('\n=== B. 数据一致性 ===');
{
  const db = new DatabaseSync('data/bot.db');

  // state 重复行
  const dup = db.prepare('SELECT qq, key, COUNT(*) c FROM state GROUP BY qq, key HAVING c > 1').all();
  if (dup.length) bad('state 有重复键', JSON.stringify(dup.slice(0, 3)));
  else ok('state 无重复');

  // 孤儿：有消息但没 users 记录
  const orphan = db
    .prepare('SELECT DISTINCT qq FROM messages WHERE qq NOT IN (SELECT qq FROM users)')
    .all();
  if (orphan.length) bad('有消息但没用户记录', orphan.map((o) => o.qq).join(','));
  else ok('用户记录完整');

  // turns 的 qq 是否都在 users 里
  const badTurns = db.prepare('SELECT COUNT(*) c FROM turns WHERE qq NOT IN (SELECT qq FROM users)').get().c;
  if (badTurns > 0) note('turns 里有非用户记录', `${badTurns} 条（测试台正常）`);
  else ok('turns 都对应真实用户');

  // 摘要/事实的用户一致性
  for (const t of ['summaries', 'facts', 'media_seen', 'sticker_stats']) {
    const c = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    console.log(`  · ${t}: ${c} 条`);
  }

  // 事实表是否真的空
  const f = db.prepare('SELECT COUNT(*) c FROM facts').get().c;
  if (f === 0) note('facts 表仍然是空的', '真实聊天还没抽出事实');
  const last = db.prepare("SELECT value FROM state WHERE key = 'lastFactMsgId' LIMIT 1").get();
  const maxMsg = db.prepare('SELECT MAX(id) m FROM messages').get().m;
  if (last && maxMsg) {
    const gap = maxMsg - Number(last.value);
    console.log(`  · 距离下次事实提取还差 ${Math.max(0, 16 - gap)} 条消息（last=${last.value}, max=${maxMsg}）`);
  }

  db.close();
}

console.log('\n=== C. 表情库一致性 ===');
{
  const idx = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8')).stickers;
  const missingFile = idx.filter((s) => s.type !== 'text' && !fs.existsSync(path.join('stickers', s.file)));
  if (missingFile.length) bad('索引里有图但文件不存在', missingFile.slice(0, 3).map((s) => s.file).join(','));
  else ok('索引与文件一一对应', `${idx.length} 条`);

  const ids = idx.map((s) => s.id);
  const dupe = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupe.length) bad('表情 id 重复', dupe.slice(0, 3).join(','));
  else ok('表情 id 无重复');

  const { loadStickers } = await import('../src/sticker.mjs');
  const loaded = loadStickers('stickers');
  if (loaded.length !== idx.length) bad('加载数量与索引不一致', `${loaded.length} vs ${idx.length}`);
  else ok('loadStickers 读全了');

  const badCat = idx.filter((s) => !s.category);
  if (badCat.length) bad('有条目没分类', String(badCat.length));
  else ok('全部有分类');
}

console.log('\n=== D. 配置合理性 ===');
{
  const { config } = await import('../src/config.mjs');
  const checks = [
    ['historyTurns', 2, 30],
    ['summaryEvery', 10, 100],
    ['temperature', 0.2, 1.6],
    ['maxTokens', 100, 2000],
    ['actDeflectBelow', 0, 0.6],
    ['actMediaAskBelow', 0, 0.8],
    ['stickerBaseP', 0, 1],
    ['proactiveMaxPerDay', 0, 10],
    ['riskThreshold', 1, 10],
  ];
  let badRange = 0;
  for (const [k, lo, hi] of checks) {
    const v = config[k];
    if (typeof v !== 'number' || v < lo || v > hi) {
      bad(`配置 ${k}=${v} 超出 ${lo}~${hi}`);
      badRange++;
    }
  }
  if (!badRange) ok('关键数值都在合理区间');
  const effective = Object.keys(config)
    .filter((k) => config[k] !== undefined)
    .length;
  console.log(`  · config 共 ${effective} 个键`);
}

console.log('\n=== E. 接口边界 ===');
  const eAlive = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) }).then((r) => r.status).catch(() => 0);
  if (!eAlive) console.log('  · 跳过（' + BASE + ' 没在监听；生产在云上时属正常）');
{
  if (eAlive) {
  // 越权
  let r = await fetch(`${BASE}/api/state?token=bad`);
  if (r.status === 401) ok('错误 token 被拒');
  else bad('错误 token 竟然能过', String(r.status));

  // 路径穿越：关键看会不会真的把 config/.env 吐出来
  for (const p of ['/stickers/../../config.json', '/stickers/..%2F..%2Fconfig.json', '/stickers/../../.env']) {
    const rr = await fetch(`${BASE}${p}`);
    const text = await rr.text();
    const leaked = /DEEPSEEK_API_KEY|"persona"\s*:|apiKey/i.test(text);
    if (leaked) bad('路径穿越泄露了文件内容', `${p} → ${rr.status}`);
    else ok(`路径穿越没泄露 ${p.slice(0, 34)}`, `${rr.status} ${(rr.headers.get('content-type') || '').split(';')[0]}`);
  }

  // 上传超大图
  const big = 'data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024).toString('base64');
  const up = await api('/api/stickers/upload', { method: 'POST', body: JSON.stringify({ dataUrl: big }) });
  if (up.status === 400) ok('超大图被拒');
  else bad('超大图没拦住', String(up.status));

  // 非法人设
  const ps = await api('/api/users/persona', { method: 'POST', body: JSON.stringify({ qq: '1', persona: 'nope' }) });
  if (ps.status === 400) ok('非法人设被拒');
  else bad('非法人设没拦住');

  // 空消息
  const sb = await api('/api/sandbox/send', { method: 'POST', body: JSON.stringify({ text: '' }) });
  if (sb.status === 400) ok('空消息被拒');
  else bad('空消息没拦住');
  }
}

console.log('\n=== F. 文件与磁盘 ===');
{
  const logs = fs.readdirSync('logs').length;
  console.log(`  · logs/ ${logs} 个文件`);
  const rootLogs = fs.readdirSync(ROOT).filter((f) => f.endsWith('.log'));
  console.log(`  · 根目录日志 ${rootLogs.join(', ') || '无'}`);
  const tmp = fs.readdirSync('data').filter((f) => f.startsWith('_'));
  if (tmp.length) note('临时文件残留', tmp.join(', '));
  else ok('没有临时文件残留');

  const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\林知夏备份';
  const bak = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];
  if (bak.length) ok('D 盘备份', `${bak.length} 份`);
  else bad('D 盘没有备份');

  // 数据库体积
  const dbSize = fs.statSync('data/bot.db').size;
  ok('数据库体积', `${Math.round(dbSize / 1024)}KB`);
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 / ${warn} 提醒 ===`);
if (fail > 0) process.exitCode = 1;
