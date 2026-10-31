/**
 * 主动消息体检：看看重复在哪、场景有多单一
 * 用法：node scripts/db-proactive-report.mjs [数据库路径]
 */
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2] || 'data/bot.db';
const db = new DatabaseSync(dbPath, { readOnly: true });

const fmt = (ms) => new Date(ms).toLocaleString('zh-CN', { hour12: false });

// 1. 主动消息（靠 state 里 lastProactive 无法回溯，用 messages 表里 assistant 且前面没有 user 的近似判断）
const rows = db
  .prepare(
    `SELECT m.id, m.qq, m.role, m.content AS text, m.meta, m.created_at,
            (SELECT role FROM messages p WHERE p.qq=m.qq AND p.id<m.id ORDER BY p.id DESC LIMIT 1) AS prev_role
     FROM messages m
     WHERE m.role='assistant'
     ORDER BY m.id DESC
     LIMIT 400`,
  )
  .all();

const proactive = rows.filter((r) => r.prev_role !== 'user');
console.log('=== 主动消息（近似：上一条不是用户）===');
console.log('总数', proactive.length, '（样本最近', rows.length, '条 assistant）');
console.log('');

const texts = proactive.map((r) => ({
  at: r.created_at,
  text: String(r.text || '').replace(/\s+/g, ' ').trim(),
}));

// 2. 开头重复
const head = (t) => t.slice(0, 2);
const headCount = {};
for (const t of texts) headCount[head(t.text)] = (headCount[head(t.text)] || 0) + 1;
const topHead = Object.entries(headCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);
console.log('=== 开头 2 字重复度 ===');
for (const [h, n] of topHead) console.log(`  ${h}…  ${n} 次`);

// 3. 完全重复
const exact = {};
for (const t of texts) exact[t.text] = (exact[t.text] || 0) + 1;
const dup = Object.entries(exact)
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1]);
console.log('');
console.log('=== 完全重复 ===');
if (!dup.length) console.log('  无');
for (const [t, n] of dup.slice(0, 10)) console.log(`  ${n}×  ${t.slice(0, 40)}`);

// 4. 长度分布
const lens = texts.map((t) => t.text.length);
console.log('');
console.log('=== 长度 ===');
console.log('  最短', Math.min(...lens), '最长', Math.max(...lens), '平均', Math.round(lens.reduce((a, b) => a + b, 0) / (lens.length || 1)));

// 5. 场景多样性
const scenes = db.prepare(`SELECT qq,value FROM state WHERE key='scene'`).all();
console.log('');
console.log('=== 当前场景 ===');
for (const s of scenes) {
  try {
    const v = JSON.parse(s.value);
    console.log(`  ${s.qq}: ${v.location} / ${v.doing} / pending=${(v.pending || []).map((p) => p.text).join('|')}`);
  } catch {
    console.log(`  ${s.qq}: (解析失败)`);
  }
}

// 6. 最近的主动预览
console.log('');
console.log('=== 最近 25 条主动消息 ===');
for (const t of texts.slice(0, 25)) {
  console.log(`  ${fmt(t.at)}  ${t.text.slice(0, 50)}`);
}

db.close();
