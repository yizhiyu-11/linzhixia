/** 日志统计：告警条数与最近几条（避免中文出现在 .cmd 里） */
import fs from 'node:fs';

const files = ['logs/bot.out.log', 'logs/bot.err.log'];
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log(`  ${f}: 不存在`);
    continue;
  }
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const bad = lines.filter((l) => /WARN|ERROR|\u5931\u8d25|\u9519\u8bef/.test(l));
  console.log(`\n=== ${f} ===  行数 ${lines.length}，告警 ${bad.length}`);
  for (const l of bad.slice(-12)) console.log('  ' + l.slice(0, 150));
}
