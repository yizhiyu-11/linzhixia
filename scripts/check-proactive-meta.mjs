import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2] || 'data/bot.db', { readOnly: true });

const rows = db
  .prepare(`SELECT content FROM messages WHERE role='assistant' AND meta LIKE '%"proactive":true%' ORDER BY id DESC LIMIT 8`)
  .all();
console.log(`带 proactive 标记的 assistant 消息：${rows.length} 条（取最近 8 条用于去重）`);
for (const r of rows) console.log('  · ' + String(r.content).replace(/\s+/g, ' ').slice(0, 40));

const total = db.prepare(`SELECT COUNT(*) n FROM messages WHERE role='assistant'`).get();
const marked = db.prepare(`SELECT COUNT(*) n FROM messages WHERE role='assistant' AND meta LIKE '%proactive%'`).get();
console.log(`\nassistant 总数 ${total.n}，其中带 proactive 标记 ${marked.n}`);
db.close();
