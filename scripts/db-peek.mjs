/** 打印 messages 表结构 + 最近若干条含指定片段的消息（本地或服务器都能跑）。 */
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2] || 'C:/ai-gf/data/bot.db';
const needle = process.argv[3] || '#';

const db = new DatabaseSync(dbPath, { readOnly: true });

const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='messages'").get();
console.log('--- schema ---');
console.log(schema?.sql || '(没有 messages 表)');

try {
  const rows = db
    .prepare('SELECT * FROM messages WHERE content LIKE ? ORDER BY rowid DESC LIMIT 20')
    .all(`%${needle}%`);
  console.log(`\n--- 含 "${needle}" 的消息 ${rows.length} 条 ---`);
  for (const r of rows) {
    console.log(JSON.stringify(r).slice(0, 300));
  }
} catch (e) {
  console.log('查询失败：' + e.message);
}

try {
  const last = db.prepare('SELECT * FROM messages ORDER BY rowid DESC LIMIT 6').all();
  console.log('\n--- 最近 6 条 ---');
  for (const r of last) console.log(JSON.stringify(r).slice(0, 300));
} catch (e) {
  console.log('查询失败：' + e.message);
}

db.close();
