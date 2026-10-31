/** 打印指定区间（或前后若干条）的消息，便于看上下文。 */
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2] || 'C:/ai-gf/data/bot.db';
const center = Number(process.argv[3] || 0);
const span = Number(process.argv[4] || 6);

const db = new DatabaseSync(dbPath, { readOnly: true });

if (center > 0) {
  const rows = db
    .prepare('SELECT * FROM messages WHERE id BETWEEN ? AND ? ORDER BY id ASC')
    .all(center - span, center + span);
  for (const r of rows) {
    const t = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19);
    const mark = r.id === center ? ' <<<' : '';
    console.log(`#${r.id} [${t}Z] ${r.role.padEnd(9)} ${JSON.stringify(r.content).slice(0, 200)}${mark}`);
  }
} else {
  const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 20').all().reverse();
  for (const r of rows) {
    const t = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`#${r.id} [${t}Z] ${r.role.padEnd(9)} ${JSON.stringify(r.content).slice(0, 200)}`);
  }
}

db.close();
