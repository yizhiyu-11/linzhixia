/** 统计场景池：有多少场景带 pending、每个时段能提供多少"有话说"的素材 */
import fs from 'node:fs';

const src = fs.readFileSync('src/scene.mjs', 'utf8');
const lineRe = /\{ location: '([^']+)', doing: '([^']+)', pending: \[(.*?)\], hours: \[(\d+), (\d+)\] \}/g;

const holds = [];
let m;
while ((m = lineRe.exec(src))) {
  const pending = [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  holds.push({ location: m[1], doing: m[2], pending, hours: [Number(m[4]), Number(m[5])] });
}

const withPending = holds.filter((h) => h.pending.length);
console.log(`场景总数：${holds.length}`);
console.log(`带 pending：${withPending.length}（${((100 * withPending.length) / holds.length).toFixed(0)}%）`);

// 按时段看：该时段可选场景里，平均有多少比例带 pending
console.log('\n每个时段"有话说"的比例：');
for (let h = 0; h < 24; h++) {
  const pool = holds.filter((x) => h >= x.hours[0] && h < x.hours[1]);
  if (!pool.length) continue;
  const p = pool.filter((x) => x.pending.length).length;
  const bar = '█'.repeat(Math.round((p / pool.length) * 20));
  console.log(`  ${String(h).padStart(2, '0')} 点  可选 ${String(pool.length).padStart(2)} 个，带 pending ${String(p).padStart(2)} 个  ${((100 * p) / pool.length).toFixed(0)}%  ${bar}`);
}

// pending 的 TTL 与场景时长
const ttl = /PENDING_TTL = (\d+) \* 60_000/.exec(src)?.[1];
const holdMin = /HOLD_MIN = (\d+) \* 60_000/.exec(src)?.[1];
const holdMax = /HOLD_MAX = (\d+) \* 60_000/.exec(src)?.[1];
console.log(`\n场景持续：${holdMin}~${holdMax} 分钟；pending TTL：${ttl} 分钟`);
console.log(`→ 假设场景 60 分钟：前 ${ttl} 分钟有 pending，后 ${60 - Number(ttl)} 分钟没有`);
