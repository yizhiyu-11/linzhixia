/**
 * 情绪模型原型：事件注入 + 指数衰减 + 基线漂移
 *
 *   node scripts/affect-sim.mjs
 *
 * 输出：一天中每分钟的愉悦度(valence)、激活度(arousal)、精力(energy)，
 * 以及当前情绪标签，写到 data/_affect-curve.json 供画图。
 */
import fs from 'node:fs';

// ── 模型参数 ───────────────────────────────────────────
const HALF_LIFE = { minor: 45, medium: 150, major: 420 }; // 分钟
// 激活度比愉悦度衰减快：气头过去得快，情绪底色留得久
const AROUSAL_RATE = 0.45;
const ENERGY_RATE = 0.8;
const BASELINE = { v: 0.08, a: 0.35, e: 0.6 };

/** 一天的事件（场景层/互动层会产生这些） */
const EVENTS = [
  { t: 7.4, label: '起床没睡够', v: -0.15, a: -0.1, e: -0.35, size: 'minor' },
  { t: 8.3, label: '地铁被挤', v: -0.2, a: 0.3, e: -0.1, size: 'minor' },
  { t: 10.6, label: '被老板说了', v: -0.55, a: 0.5, e: -0.15, size: 'major' },
  { t: 12.2, label: '午饭好吃', v: 0.25, a: 0.05, e: 0.25, size: 'minor' },
  { t: 15.4, label: '稿子过了', v: 0.4, a: 0.15, e: 0.1, size: 'medium' },
  { t: 19.2, label: '他夸她了', v: 0.5, a: 0.3, e: 0.15, size: 'medium' },
  { t: 22.5, label: '有点困但不想睡', v: -0.1, a: -0.2, e: -0.3, size: 'minor' },
];

const decay = (impulse, halfLifeMin, dtMin) => impulse * Math.pow(0.5, dtMin / halfLifeMin);

function run() {
  const points = [];
  let v = BASELINE.v;
  let a = BASELINE.a;
  let e = BASELINE.e;
  const active = []; // {v,a,e,halfLife,label,until}
  let lastT = 0;

  for (let minute = 0; minute <= 24 * 60; minute += 1) {
    const t = minute / 60;

    // 到点注入事件
    for (const ev of EVENTS) {
      if (ev.t * 60 === minute) {
        active.push({ ...ev, halfLife: HALF_LIFE[ev.size], age: 0 });
      }
    }

    // 每分钟按半衰期衰减
    for (const ev of active) {
      ev.age += 1;
      ev.v = decay(ev.v, ev.halfLife, 1);
      ev.a = decay(ev.a, ev.halfLife * AROUSAL_RATE, 1);
      ev.e = decay(ev.e, ev.halfLife * ENERGY_RATE, 1);
    }

    // 合成：基线 + 所有未衰减完的注入
    const sum = active.reduce(
      (acc, ev) => ({ v: acc.v + ev.v, a: acc.a + ev.a, e: acc.e + ev.e }),
      { v: 0, a: 0, e: 0 },
    );
    v = clamp(BASELINE.v + sum.v, -1, 1);
    a = clamp(BASELINE.a + sum.a, 0, 1);
    e = clamp(BASELINE.e + sum.e, 0, 1);

    points.push({
      t: Number(t.toFixed(2)),
      v: Number(v.toFixed(3)),
      a: Number(a.toFixed(3)),
      e: Number(e.toFixed(3)),
      label: labelOf(v, a, e),
    });
    lastT = t;
  }
  return points;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** 维度 → 离散情绪标签 */
function labelOf(v, a, e) {
  if (e < 0.3 && v < 0.1) return '累';
  if (v <= -0.35 && a >= 0.55) return '生气';
  if (v <= -0.3 && a < 0.4) return '低落';
  if (v <= -0.1 && a >= 0.5) return '烦躁';
  if (v >= 0.25 && a >= 0.55) return '兴奋';
  if (v >= 0.35 && a >= 0.45) return '开心';
  if (v >= 0.25) return '舒服';
  if (a >= 0.6 && v > -0.1) return '紧张';
  return '平静';
}

const points = run();
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/_affect-curve.json', JSON.stringify({ points, events: EVENTS }, null, 0), 'utf8');

// 打印关键时间点
const pick = [7.4, 9, 10.6, 11.5, 12.2, 15.4, 17, 19.2, 21, 22.5, 23.9];
console.log('时间   愉悦    激活    精力   标签');
for (const h of pick) {
  const p = points[Math.min(points.length - 1, Math.round(h * 60))];
  console.log(
    `${String(h).padStart(4)}  ${p.v.toFixed(2).padStart(6)} ${p.a.toFixed(2).padStart(6)} ${p.e.toFixed(2).padStart(6)}   ${p.label}`,
  );
}

// 统计
const labels = {};
for (const p of points) labels[p.label] = (labels[p.label] || 0) + 1;
console.log('\n一天里各情绪占比：');
for (const [k, c] of Object.entries(labels).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${k.padEnd(4)} ${((100 * c) / points.length).toFixed(1)}%`);
}
