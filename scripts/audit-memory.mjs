/** 记忆系统使用情况审计（只读） */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'data/_audit/bot.db', { readOnly: true });
const q = (sql) => db.prepare(sql).all();

console.log('=== 各表规模 ===');
for (const t of ['messages', 'facts', 'summaries', 'relation', 'perceptions', 'turns', 'media_seen', 'state']) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  console.log(`  ${t.padEnd(12)} ${n}`);
}

console.log('\n=== 每个用户 ===');
const users = q('SELECT qq FROM users');
for (const { qq } of users) {
  const m = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE qq = ?').get(qq).n;
  const f = db.prepare('SELECT COUNT(*) AS n FROM facts WHERE qq = ?').get(qq).n;
  const s = db.prepare('SELECT COUNT(*) AS n FROM summaries WHERE qq = ?').get(qq).n;
  const rel = db.prepare('SELECT * FROM relation WHERE qq = ?').get(qq);
  const days = db
    .prepare("SELECT COUNT(DISTINCT date(created_at/1000, 'unixepoch', 'localtime')) AS d FROM messages WHERE qq = ?")
    .get(qq).d;
  console.log(
    `  ${qq}: 消息 ${m} 条 / ${days} 天，事实 ${f} 条，摘要 ${s} 条，关系 ${rel ? rel.stage + '(' + rel.intimacy + ')' : '无'}`,
  );
}

console.log('\n=== 事实样例（最近 10 条）===');
for (const r of q('SELECT qq, key, value, updated_at FROM facts ORDER BY updated_at DESC LIMIT 10')) {
  const d = new Date(r.updated_at).toLocaleString('zh-CN');
  console.log(`  ${r.qq} ${r.key}=${r.value}  (${d})`);
}

console.log('\n=== 摘要样例（最近 5 条）===');
for (const r of q('SELECT qq, level, period, content FROM summaries ORDER BY id DESC LIMIT 5')) {
  console.log(`  [L${r.level} ${r.period}] ${String(r.content).slice(0, 90)}`);
}

console.log('\n=== 消息保留情况 ===');
const oldest = db.prepare('SELECT MIN(created_at) AS t FROM messages').get().t;
console.log(`  最早一条：${new Date(oldest).toLocaleString('zh-CN')}`);
db.close();
