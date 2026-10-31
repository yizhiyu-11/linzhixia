/**
 * 系统体检：把后台接口、数据库、关键表都过一遍。
 * node --env-file=.env scripts/health.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const token = fs.readFileSync('data/web-token', 'utf8').trim();
const BASE = 'http://127.0.0.1:3870';
const ok = (n, d = '') => console.log(`  ✓ ${n}${d ? '  — ' + d : ''}`);
const bad = (n, d = '') => console.log(`  ✗ ${n}${d ? '  — ' + d : ''}`);

const get = async (p) => {
  const r = await fetch(`${BASE}${p}${p.includes('?') ? '&' : '?'}token=${token}`);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('=== 接口 ===');
for (const [name, path] of [
  ['state', '/api/state'],
  ['turns', '/api/turns?limit=3'],
  ['usage', '/api/usage?hours=1'],
  ['memory', '/api/memory'],
  ['profile', '/api/profile'],
  ['stickers', '/api/stickers'],
  ['users', '/api/users'],
]) {
  try {
    const r = await get(path);
    if (r.status === 200) ok(name, Object.keys(r.body).join(','));
    else bad(name, `HTTP ${r.status}`);
  } catch (e) {
    bad(name, e.message);
  }
}

console.log('\n=== 鉴权 ===');
{
  const r = await fetch(`${BASE}/api/state?token=wrong`);
  r.status === 401 ? ok('错误 token 被拒') : bad('错误 token 竟然通过', String(r.status));
}

console.log('\n=== 数据库 ===');
{
  const db = new DatabaseSync('data/bot.db');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  Object.values(integrity)[0] === 'ok' ? ok('完整性检查') : bad('完整性检查', JSON.stringify(integrity));

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);
  ok('表', tables.join(','));

  for (const t of ['messages', 'summaries', 'facts', 'state', 'perceptions', 'turns', 'usage']) {
    if (!tables.includes(t)) bad(`缺表 ${t}`);
  }

  const dup = db
    .prepare("SELECT qq, key, COUNT(*) c FROM facts GROUP BY qq, key HAVING c > 1")
    .all();
  dup.length ? bad('facts 有重复 key', JSON.stringify(dup)) : ok('facts 无重复');

  const orphan = db.prepare('SELECT COUNT(*) c FROM turns WHERE act IS NULL').get().c;
  orphan === 0 ? ok('turns 都有 act') : console.log(`  ! turns 有 ${orphan} 条没有 act`);

  const noTag = db.prepare("SELECT COUNT(*) c FROM usage WHERE tag IS NULL OR tag = ''").get().c;
  console.log(`  · usage 无 tag（历史数据）: ${noTag}`);

  db.close();
}

console.log('\n=== 进程 / 日志 ===');
{
  const err = fs.existsSync('bot.err.log') ? fs.readFileSync('bot.err.log', 'utf8').trim() : '';
  err ? bad('bot.err.log 有内容', err.slice(0, 120)) : ok('bot.err.log 为空');

  // bot.out.log 可能刚被 maintain 轮转到 logs/，读不到不算错误
  let log = '';
  let logNote = '';
  if (fs.existsSync('bot.out.log')) {
    log = fs.readFileSync('bot.out.log', 'utf8');
  } else {
    // 找最新的归档日志
    const dir = 'logs';
    const cands = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => /^bot\.out-.*\.log$/.test(f))
          .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
          .sort((a, b) => b.at - a.at)
      : [];
    if (cands.length) {
      log = fs.readFileSync(path.join(dir, cands[0].f), 'utf8');
      logNote = `（当前日志已轮转到 logs/${cands[0].f}）`;
    }
  }
  if (!log) {
    console.log(`  · 没有可读的运行日志${logNote}`);
  } else {
    const warns = (log.match(/WARN/g) || []).length;
    warns ? console.log(`  · 启动以来 WARN ${warns} 条${logNote}`) : ok(`启动以来无 WARN${logNote}`);
  }
}
