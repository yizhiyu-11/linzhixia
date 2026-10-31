/** 按用户统计最近的主动消息与间隔（只读） */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'data/bot.db', { readOnly: true });
const rows = db
  .prepare(
    `SELECT qq, content, created_at FROM messages
     WHERE role='assistant' AND meta LIKE '%"proactive":true%'
     ORDER BY id DESC LIMIT 40`,
  )
  .all();

const fmt = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const byQq = {};
for (const r of rows.reverse()) (byQq[r.qq] = byQq[r.qq] || []).push(r);

for (const [qq, list] of Object.entries(byQq)) {
  console.log(`\n=== ${qq}（${list.length} 条）===`);
  let prev = null;
  for (const r of list) {
    const gap = prev ? Math.round((r.created_at - prev) / 60000) : null;
    const flag = gap !== null && gap < 180 ? `  ⚠ 间隔仅 ${gap} 分钟` : gap !== null ? `  间隔 ${gap} 分钟` : '';
    console.log(`  ${fmt(r.created_at)}  ${String(r.content).replace(/\s+/g, ' ').slice(0, 34)}${flag}`);
    prev = r.created_at;
  }
  // 每天条数
  const perDay = {};
  for (const r of list) {
    const d = new Date(r.created_at);
    const k = `${d.getMonth() + 1}/${d.getDate()}`;
    perDay[k] = (perDay[k] || 0) + 1;
  }
  console.log('  每天条数：', JSON.stringify(perDay));
}

db.close();
