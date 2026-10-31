// 临时诊断：把最近的对话按时间顺序打出来，看人机感出在哪
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/bot.db');
const rows = db
  .prepare('SELECT role, content, created_at FROM messages ORDER BY id DESC LIMIT 24')
  .all()
  .reverse();

for (const r of rows) {
  const t = new Date(r.created_at).toTimeString().slice(0, 5);
  const who = r.role === 'user' ? '你  ' : '她  ';
  console.log(`${t} ${who}| ${r.content.replace(/\n/g, ' ⏎ ')}`);
}

const counts = db.prepare("SELECT role, COUNT(*) c FROM messages GROUP BY role").all();
console.log('\n=== 统计 ===');
for (const c of counts) console.log(`${c.role}: ${c.c}`);
