/** 每日观察：从数据库取真实累计（不受日志重建影响）
 *  用法：node scripts/observe-stats.mjs [小时数]
 */
import { DatabaseSync } from 'node:sqlite';

const hours = Number(process.argv[2]) || 24;
const since = Date.now() - hours * 3600_000;

let db;
try {
  db = new DatabaseSync(process.argv[3] || 'data/bot.db', { readOnly: true });
} catch (e) {
  console.log('  打不开数据库：' + e.message);
  process.exit(0);
}

const one = (sql, ...args) => {
  try {
    return db.prepare(sql).get(...args) || {};
  } catch {
    return {};
  }
};
const all = (sql, ...args) => {
  try {
    return db.prepare(sql).all(...args);
  } catch {
    return [];
  }
};

const proactive = one(
  `SELECT COUNT(*) AS n FROM messages
   WHERE role = 'assistant' AND meta LIKE '%"proactive":true%' AND created_at > ?`,
  since,
);
const turns = one('SELECT COUNT(*) AS n FROM turns WHERE at > ?', since);
const cost = one(
  'SELECT SUM(cost_yuan) AS c, SUM(prompt_tokens) AS p, SUM(completion_tokens) AS k FROM usage WHERE created_at > ?',
  since,
);
const scenes = one('SELECT COUNT(*) AS n FROM scene_log WHERE at > ?', since);
const users = all(
  `SELECT qq, COUNT(*) AS n FROM messages
   WHERE role = 'assistant' AND meta LIKE '%"proactive":true%' AND created_at > ?
   GROUP BY qq`,
  since,
);

console.log(`=== 最近 ${hours} 小时（数据库）===`);
console.log(`  主动消息    ${proactive.n || 0} 条`);
for (const u of users) console.log(`    · ${u.qq}：${u.n} 条`);
console.log(`  对话轮次    ${turns.n || 0} 轮`);
console.log(`  场景切换    ${scenes.n || 0} 次`);
console.log(
  `  花费        ¥${Number(cost.c || 0).toFixed(3)}（输入 ${cost.p || 0} / 输出 ${cost.k || 0} tokens）`,
);

db.close();
