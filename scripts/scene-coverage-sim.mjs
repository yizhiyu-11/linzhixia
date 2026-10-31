/**
 * 场景素材覆盖率模拟：现状 vs 生命周期化 vs 再补全 pending
 *   node scripts/scene-coverage-sim.mjs
 */
import fs from 'node:fs';

const src = fs.readFileSync('src/scene.mjs', 'utf8');
const lineRe = /\{ location: '([^']+)', doing: '([^']+)', pending: \[(.*?)\], hours: \[(\d+), (\d+)\] \}/g;
const holds = [];
let m;
while ((m = lineRe.exec(src))) {
  const pending = [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  holds.push({ location: m[1], doing: m[2], pending, hours: [Number(m[4]), Number(m[5])] });
}

const PENDING_TTL = 90;

function simulate({ lifecycle = false, forcePending = false, days = 20 }) {
  let withSeed = 0;
  let total = 0;
  for (let d = 0; d < days; d++) {
    for (let t = 7 * 60; t < 24 * 60; t += 5) {
      const hour = Math.floor(t / 60);
      const pool = holds.filter((h) => hour >= h.hours[0] && hour < h.hours[1]);
      const usePool = pool.length ? pool : holds;
      const hold = usePool[Math.floor(((t + d * 13) / 52) % usePool.length)];
      const elapsed = (((t + d * 37) % 52) / 52) * 52;

      const hasPending = hold.pending.length > 0 || forcePending;
      let seeds = 0;
      if (!lifecycle) {
        if (hasPending && elapsed < PENDING_TTL) seeds = 1;
      } else if (hasPending) {
        seeds = 1;
      }
      total++;
      if (seeds) withSeed++;
    }
  }
  return (100 * withSeed) / total;
}

const now = simulate({});
const life = simulate({ lifecycle: true });
const full = simulate({ lifecycle: true, forcePending: true });

console.log('场景素材覆盖率（她手上有可讲的事的时间占比）\n');
console.log(`  当前配置（TTL 90 + 每个场景都有待办）     ${now.toFixed(1)}%`);
console.log(`  参考：改造前（TTL 30 + 75% 场景有待办）   ${life.toFixed(1)}%`);
console.log(`  参考：改造前（TTL 30 + 100% 场景有待办）  ${full.toFixed(1)}%`);

const hasPend = holds.filter((h) => h.pending.length).length / holds.length;
console.log(`\n  场景池：${holds.length} 条，带 pending ${(hasPend * 100).toFixed(0)}%`);
