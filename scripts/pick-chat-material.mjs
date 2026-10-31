/** 从线上库挑几段真实对话，当商品图素材（只读，自动打码 QQ 号） */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'data/bot.db', { readOnly: true });
const rows = db
  .prepare(`SELECT qq, role, content, created_at FROM messages ORDER BY id DESC LIMIT 120`)
  .all();

// 按 qq 分组，取最近几组问答
const byQq = {};
for (const r of rows) {
  (byQq[r.qq] = byQq[r.qq] || []).push(r);
}

const fmt = (ms) => {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let n = 0;
for (const [qq, list] of Object.entries(byQq)) {
  const ordered = list.slice().reverse();
  console.log(`\n=== 用户 ${qq.slice(0, 3)}*** ===`);
  for (let i = 0; i < ordered.length && n < 40; i++) {
    const m = ordered[i];
    const text = String(m.content).replace(/\s+/g, ' ').slice(0, 46);
    console.log(`  ${fmt(m.created_at)} ${m.role === 'user' ? '他' : '她'}：${text}`);
    n++;
  }
}
db.close();
