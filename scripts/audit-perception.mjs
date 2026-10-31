/** 感知层数据审计（只读） */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'data/_audit/bot.db', { readOnly: true });

const roles = db.prepare('SELECT role, COUNT(*) AS n FROM messages GROUP BY role').all();
const perc = db.prepare('SELECT COUNT(*) AS n FROM perceptions').get();
const users = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE role = 'user'").get();
const rows = db.prepare('SELECT qq, text, json, created_at FROM perceptions ORDER BY id ASC').all();

console.log('消息按角色：', JSON.stringify(roles));
console.log(`user 消息 ${users.n} 条，感知记录 ${perc.n} 条，覆盖率 ${((100 * perc.n) / users.n).toFixed(1)}%`);

const emo = {};
const intent = {};
const jump = {};
const certs = [];
let switches = 0;
let emptyText = 0;
const byUser = {};

for (const r of rows) {
  let p;
  try {
    p = JSON.parse(r.json);
  } catch {
    continue;
  }
  emo[p.emotion] = (emo[p.emotion] || 0) + 1;
  intent[p.intent] = (intent[p.intent] || 0) + 1;
  jump[p.jump] = (jump[p.jump] || 0) + 1;
  if (Number.isFinite(p.certainty)) certs.push(p.certainty);
  if (!String(r.text || '').trim()) emptyText++;
  byUser[r.qq] = byUser[r.qq] || [];
  byUser[r.qq].push(p.emotion);
}

for (const list of Object.values(byUser)) {
  for (let i = 1; i < list.length; i++) if (list[i] !== list[i - 1]) switches++;
}

const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const pct = (o, n) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${((100 * v) / n).toFixed(0)}%`)
    .join(' · ');

console.log('\n情绪分布：', pct(emo, rows.length));
console.log('意图分布：', pct(intent, rows.length));
console.log('jump 分布：', pct(jump, rows.length));
console.log(`certainty：平均 ${avg(certs)}，最低 ${Math.min(...certs)}，最高 ${Math.max(...certs)}`);
console.log(`情绪翻转：${switches} 次 / ${rows.length} 条 = ${((100 * switches) / rows.length).toFixed(1)}%`);
console.log(`空文本（纯图片/表情包）感知：${emptyText} 条`);

// 每用户情绪种类数
for (const [qq, list] of Object.entries(byUser)) {
  console.log(`  ${qq}：${list.length} 条，用到 ${new Set(list).size} 种情绪`);
}
db.close();
