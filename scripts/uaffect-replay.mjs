/**
 * 用户情绪模型回放：用历史消息验证"v 能不能提前看出他要变短/不聊了"。
 *
 * 弱标签（设计 §12.8）：
 *   变短 = 下一条他说的比这条短 40% 以上（且这条本身 ≥6 字，过滤"嗯/哦"噪声）
 *   不聊 = 120 分钟内没有下一条
 *
 * 跑法：node scripts/uaffect-replay.mjs [db路径]
 * 默认 data/bot.db（线上真实数据，感知记录没有 tone → 强度按 0.5 估）
 */
import { DatabaseSync } from 'node:sqlite';
import { compute, judge } from '../src/uaffect.mjs';

const DB = process.argv[2] || 'data/bot.db';
const db = new DatabaseSync(DB, { readOnly: true });

const msgs = db.prepare('SELECT id, qq, role, content, created_at FROM messages ORDER BY id ASC').all();
const percs = db.prepare('SELECT id, qq, text, json, created_at FROM perceptions ORDER BY id ASC').all();
db.close();

const byUser = new Map();
for (const m of msgs) {
  if (!byUser.has(m.qq)) byUser.set(m.qq, []);
  byUser.get(m.qq).push(m);
}
const percByUser = new Map();
for (const p of percs) {
  if (!percByUser.has(p.qq)) percByUser.set(p.qq, []);
  percByUser.get(p.qq).push(p);
}

const truncate = (s, n = 14) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

let usedDefault = 0;
const rows = [];

for (const [qq, list] of byUser) {
  const queue = (percByUser.get(qq) || []).slice();
  let state = null;
  let prevUserAt = 0;

  for (let i = 0; i < list.length; i += 1) {
    const m = list[i];
    if (m.role !== 'user') continue;

    // 感知记录按顺序配对（文本相同且时间在 60 秒内）
    let perc = null;
    while (queue.length && queue[0].created_at < m.created_at - 1000) queue.shift();
    const head = queue[0];
    if (head && head.text === m.content && head.created_at - m.created_at < 60_000) {
      perc = queue.shift();
      try {
        perc.json = JSON.parse(perc.json);
      } catch {
        perc = null;
      }
    }

    const text = String(m.content || '');
    const len = text.length;
    const gapMin = prevUserAt ? (m.created_at - prevUserAt) / 60_000 : -1;
    prevUserAt = m.created_at;

    if (!perc) {
      // 没有感知也照样更新（行为信号仍然有效）
      state = compute(state, { msgLen: len, gapMin, hour: new Date(m.created_at).getHours(), now: m.created_at });
      continue;
    }

    const p = perc.json;
    const tone = p.tone || (p.emotion ? { label: p.emotion, intensity: 0.5 } : null);
    if (!p.tone) usedDefault += 1;

    state = compute(state, {
      tone,
      msgLen: len,
      gapMin,
      hour: new Date(m.created_at).getHours(),
      now: m.created_at,
    });

    // 下一条他说的话
    let next = null;
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[j].role === 'user') {
        next = list[j];
        break;
      }
    }

    rows.push({
      qq,
      text,
      len,
      at: m.created_at,
      gapIn: gapMin,
      v: state.v,
      trend: state.trend,
      conf: state.confidence,
      blind: judge(state).blind,
      nextLen: next ? String(next.content || '').length : 0,
      gapNext: next ? (next.created_at - m.created_at) / 60_000 : Infinity,
      hasNext: Boolean(next),
    });
  }
}

// ── 标签 ────────────────────────────────────────────────
for (const r of rows) {
  r.shorter = r.hasNext && r.len >= 6 && r.gapNext <= 120 && r.nextLen <= r.len * 0.6;
  r.stop = r.gapNext > 120;
}

const usable = rows.filter((r) => r.hasNext && r.len >= 6 && r.gapNext <= 120);
const withNext = rows.filter((r) => r.hasNext);

const rate = (arr, key) => (arr.length ? arr.filter((r) => r[key]).length / arr.length : 0);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function auc(scores, labels) {
  const pos = scores.filter((_, i) => labels[i]);
  const neg = scores.filter((_, i) => !labels[i]);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

function wilson(p, n) {
  if (!n) return [NaN, NaN];
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

console.log(`\n库：${DB}`);
console.log(`用户消息 ${rows.length} 条（有感知 ${rows.length}），有下一条的 ${withNext.length} 条，可用样本 ${usable.length} 条`);
console.log(`感知缺 tone、按 0.5 估的：${usedDefault} 条`);

const shorterRate = rate(usable, 'shorter');
const stopRate = rate(rows, 'stop');
console.log(`\n基线：变短 ${pct(shorterRate)}（${usable.filter((r) => r.shorter).length}/${usable.length}），` +
  `120 分钟不聊 ${pct(stopRate)}（${rows.filter((r) => r.stop).length}/${rows.length}）`);

const vs = rows.map((r) => r.v).sort((a, b) => a - b);
const q = (f) => vs[Math.min(vs.length - 1, Math.floor(vs.length * f))].toFixed(2);
console.log(`v 分布：最小 ${vs[0].toFixed(2)} · p25 ${q(0.25)} · 中位 ${q(0.5)} · p75 ${q(0.75)} · 最大 ${vs[vs.length - 1].toFixed(2)}`);
console.log(`blind（置信度不足，不做动作）：${pct(rows.filter((r) => r.blind).length / rows.length)}`);

// AUC 用全部 rows（含短句），标签 stop 不依赖长度
const vScores = rows.map((r) => -r.v);
const tScores = rows.map((r) => -r.trend);
const stopLabels = rows.map((r) => r.stop);
console.log(`\nAUC：-v → 不聊 ${auc(vScores, stopLabels).toFixed(3)}，-trend → 不聊 ${auc(tScores, stopLabels).toFixed(3)}`);

const vScores2 = usable.map((r) => -r.v);
const tScores2 = usable.map((r) => -r.trend);
const shortLabels = usable.map((r) => r.shorter);
console.log(`AUC：-v → 变短 ${auc(vScores2, shortLabels).toFixed(3)}，-trend → 变短 ${auc(tScores2, shortLabels).toFixed(3)}`);

// 规则准确率：v ≤ -0.25 判"要变短 / 要不聊"
function ruleEval(list, labelKey, threshold = -0.25) {
  let hit = 0;
  for (const r of list) {
    const pred = r.v <= threshold;
    if (pred === r[labelKey]) hit += 1;
  }
  const acc = hit / list.length;
  const base = Math.max(rate(list, labelKey), 1 - rate(list, labelKey));
  const [lo, hi] = wilson(acc, list.length);
  return { acc, base, n: list.length, ci: [lo, hi] };
}

const rs = ruleEval(usable, 'shorter');
const rp = ruleEval(rows, 'stop');
console.log(`\n规则 v≤-0.25 → 变短：准确率 ${pct(rs.acc)}（95% CI ${pct(rs.ci[0])}~${pct(rs.ci[1])}，n=${rs.n}），全猜多数类 ${pct(rs.base)}`);
console.log(`规则 v≤-0.25 → 不聊：准确率 ${pct(rp.acc)}（95% CI ${pct(rp.ci[0])}~${pct(rp.ci[1])}，n=${rp.n}），全猜多数类 ${pct(rp.base)}`);

// 分桶看单调性
const buckets = [
  ['v ≤ -0.4', (r) => r.v <= -0.4],
  ['-0.4 ~ -0.2', (r) => r.v > -0.4 && r.v <= -0.2],
  ['-0.2 ~ 0', (r) => r.v > -0.2 && r.v <= 0],
  ['v > 0', (r) => r.v > 0],
];
console.log('\n按 v 分桶（可用样本）：');
for (const [name, fn] of buckets) {
  const b = usable.filter(fn);
  if (!b.length) {
    console.log(`  ${name.padEnd(12)} n=0`);
    continue;
  }
  console.log(`  ${name.padEnd(12)} n=${String(b.length).padStart(3)}  变短 ${pct(rate(b, 'shorter'))}  下条平均长度 ${(b.reduce((s, r) => s + r.nextLen, 0) / b.length).toFixed(1)}`);
}

// 抽样给人工看
console.log('\n前 12 条样本（v / 本句 / 下一句长度 / 间隔分钟 / 是否变短）：');
for (const r of rows.slice(0, 12)) {
  console.log(
    `  ${r.v.toFixed(2).padStart(6)}  「${truncate(r.text)}」 len=${String(r.len).padStart(2)} → ${String(r.nextLen).padStart(2)}` +
      `  ${Number.isFinite(r.gapNext) ? `${r.gapNext.toFixed(0)}min` : '无下一条'}` +
      `${r.shorter ? '  变短' : ''}`,
  );
}

/* ── 附加：行为信号（相对他自己的基线）能不能预测下一轮 ─────────────
 * 背景：真实数据里情绪 59% 是"平静"，v 几乎不动（下面会看到）。
 * 所以真正要回答的是：换"个人基线"（他自己的中位间隔/中位长度）当主输入，值不值得做。
 */
const perUser = new Map();
for (const r of rows) {
  if (!perUser.has(r.qq)) perUser.set(r.qq, []);
  perUser.get(r.qq).push(r);
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
for (const [qq, list] of perUser) {
  const lenMed = median(list.map((r) => r.len)) || 1;
  const ins = list.map((r) => r.gapIn).filter((g) => Number.isFinite(g) && g >= 0 && g < 240);
  const gapMed = median(ins) || 1;
  for (const r of list) {
    r.lenRatio = r.len / lenMed; // 本句相对他自己的长度
    r.gapInRatio = Number.isFinite(r.gapIn) && r.gapIn >= 0 ? r.gapIn / gapMed : 1; // 他这次隔了多久才来
    r.slowNext = Number.isFinite(r.gapNext) && r.gapNext > gapMed * 1.5; // 下一条会不会更慢
  }
  console.log(`\n${qq}：中位长度 ${lenMed} 字，中位间隔 ${gapMed.toFixed(1)} 分钟`);
}

const u2 = usable.filter((r) => Number.isFinite(r.gapNext));
const shortLabels2 = u2.map((r) => r.shorter);
const slowLabels = u2.map((r) => r.slowNext);
console.log(`\n行为信号预测力（n=${u2.length}）：`);
console.log(`  -本句长度比 → 下条变短   AUC ${auc(u2.map((r) => -r.lenRatio), shortLabels2).toFixed(3)}`);
console.log(`  本次间隔比 → 下条更慢     AUC ${auc(u2.map((r) => r.gapInRatio), slowLabels).toFixed(3)}`);
console.log(`  -本句长度比 → 下条更慢    AUC ${auc(u2.map((r) => -r.lenRatio), slowLabels).toFixed(3)}`);
console.log(`  -v → 下条更慢            AUC ${auc(u2.map((r) => -r.v), slowLabels).toFixed(3)}`);
console.log(`  下条更慢的基线            ${pct(rate(u2, 'slowNext'))}`);
