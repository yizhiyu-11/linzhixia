/**
 * 清掉过期的场景/主动状态，让新逻辑立即生效（只在服务器上跑）
 * 用法：node scripts/reset-scene-state.mjs
 */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'data/bot.db');
const keys = ['scene', 'sceneSince', 'sceneHistory', 'proactiveTypes'];

const before = db.prepare(`SELECT qq,key,value FROM state WHERE key IN ('scene','sceneSince')`).all();
console.log('=== 清理前 ===');
for (const r of before) {
  console.log(`  ${r.qq} ${r.key} = ${String(r.value).slice(0, 80)}`);
}

const stmt = db.prepare('DELETE FROM state WHERE key = ?');
for (const k of keys) {
  const n = stmt.run(k);
  console.log(`  删除 ${k}：${n.changes} 行`);
}

const after = db.prepare(`SELECT COUNT(*) AS n FROM state WHERE key IN ('scene','sceneSince')`).get();
console.log(`=== 清理后：剩 ${after.n} 行 ===`);
db.close();
