/**
 * 删除某个 QQ 的"记忆"：聊天记录、摘要、长期事实、内部状态、关系。
 *
 * 先备份再删：
 *   1) 整库备份到 data/backup/bot-<时间>.db（VACUUM INTO，运行中也能做）
 *   2) 该用户的数据单独导出成 JSON，方便以后翻或恢复
 *
 * 用量记录（usage）默认保留——那是账单数据，不是"记忆"。
 * 用法：node --env-file=.env scripts/forget-user.mjs 10000002 [--purge-usage]
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const qq = process.argv[2];
const purgeUsage = process.argv.includes('--purge-usage');

if (!qq || !/^\d{5,12}$/.test(qq)) {
  console.error('用法: node scripts/forget-user.mjs <QQ号> [--purge-usage]');
  process.exit(1);
}

const DB = path.resolve('data', 'bot.db');
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const backupDir = path.resolve('data', 'backup');
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `bot-${stamp}.db`);
const exportFile = path.join(backupDir, `user-${qq}-${stamp}.json`);

const db = new DatabaseSync(DB);

// 1) 整库备份
db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
console.log(`✔ 整库备份：${backupFile}`);

// 2) 导出该用户的数据
const dump = {
  qq,
  exportedAt: new Date().toISOString(),
  messages: db.prepare('SELECT * FROM messages WHERE qq = ? ORDER BY id').all(qq),
  facts: db.prepare('SELECT * FROM facts WHERE qq = ?').all(qq),
  summaries: db.prepare('SELECT * FROM summaries WHERE qq = ? ORDER BY id').all(qq),
  perceptions: db.prepare('SELECT * FROM perceptions WHERE qq = ? ORDER BY id').all(qq),
  state: db.prepare('SELECT * FROM state WHERE qq = ?').all(qq),
  relation: db.prepare('SELECT * FROM relation WHERE qq = ?').all(qq),
  usage: db.prepare('SELECT * FROM usage WHERE qq = ? ORDER BY id').all(qq),
};
fs.writeFileSync(exportFile, JSON.stringify(dump, null, 2), 'utf8');
console.log(`✔ 用户数据导出：${exportFile}`);
console.log(
  `  消息 ${dump.messages.length} 条 / 摘要 ${dump.summaries.length} 条 / 事实 ${dump.facts.length} 条 / 状态 ${dump.state.length} 条 / 用量 ${dump.usage.length} 条`,
);

// 3) 删除
const targets = [
  ['messages', 'DELETE FROM messages WHERE qq = ?'],
  ['facts', 'DELETE FROM facts WHERE qq = ?'],
  ['summaries', 'DELETE FROM summaries WHERE qq = ?'],
  ['perceptions', 'DELETE FROM perceptions WHERE qq = ?'],
  ['state', 'DELETE FROM state WHERE qq = ?'],
  ['relation', 'DELETE FROM relation WHERE qq = ?'],
  ['users', 'DELETE FROM users WHERE qq = ?'],
];
if (purgeUsage) targets.push(['usage', 'DELETE FROM usage WHERE qq = ?']);

db.exec('BEGIN');
try {
  for (const [name, sql] of targets) {
    const r = db.prepare(sql).run(qq);
    console.log(`  删除 ${name}: ${r.changes} 行`);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('删除失败，已回滚：', e.message);
  process.exit(1);
}

// 4) 复核
console.log('=== 删除后 ===');
for (const [name, sql] of targets) {
  const row = db.prepare(sql.replace('DELETE FROM', 'SELECT COUNT(*) c FROM').replace('WHERE', 'WHERE')).get(qq);
  console.log(`  ${name}: ${row.c} 行`);
}
db.close();

console.log(`\n恢复方式：把 ${exportFile} 里的数据重新 INSERT 回去，或直接用整库备份 ${path.basename(backupFile)} 覆盖 data/bot.db（先停 bot）。`);
