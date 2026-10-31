/** 两次跑批的指标对比（不覆盖已有的 compare-runs.mjs） */
import fs from 'node:fs';

const load = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
const cur = load('test/runs/run-stageA-smoke60.jsonl');
const old = load('test/runs/run-smoke-002.jsonl');

const textOf = (r) =>
  (r.replies || [])
    .map((x) => (typeof x === 'string' ? x : x.text || ''))
    .filter((t) => t && t.trim())
    .join('');

const stats = (rows) => {
  const lens = [];
  let noReply = 0;
  let punctOnly = 0;
  let withTone = 0;
  for (const r of rows) {
    const t = textOf(r);
    if (!t) noReply++;
    else if (/^[？?！!。…\-—、，,~\s]+$/.test(t)) punctOnly++;
    else lens.push(t.replace(/\s/g, '').length);
    if (r.perceive && /\(\d*\.?\d+\)/.test(r.perceive)) withTone++;
  }
  lens.sort((a, b) => a - b);
  return {
    total: rows.length,
    noReply,
    punctOnly,
    avgLen: lens.length ? (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1) : '0',
    median: lens[Math.floor(lens.length / 2)] || 0,
    short3: lens.filter((n) => n < 3).length,
    withTone,
  };
};

const a = stats(cur);
const b = stats(old);

console.log('指标             新（阶段A）   旧（10/23）');
console.log(`样本             ${String(a.total).padEnd(12)}${b.total}`);
console.log(`无回复           ${String(a.noReply).padEnd(12)}${b.noReply}`);
console.log(`只有标点         ${String(a.punctOnly).padEnd(12)}${b.punctOnly}`);
console.log(`平均字数         ${String(a.avgLen).padEnd(12)}${b.avgLen}`);
console.log(`中位字数         ${String(a.median).padEnd(12)}${b.median}`);
console.log(`<3 字            ${String(a.short3).padEnd(12)}${b.short3}`);
console.log(`\n感知行带强度（新）：${a.withTone}/${a.total}`);

const diffs = [];
for (let i = 0; i < Math.min(cur.length, old.length); i++) {
  const t1 = textOf(cur[i]);
  const t2 = textOf(old[i]);
  if (!t1 || !t2) continue;
  if (Math.abs(t1.length - t2.length) >= 12) diffs.push({ id: cur[i].sample_id, text: cur[i].text, cur: t1, old: t2 });
}
console.log(`\n长度差异 ≥12 字的样本：${diffs.length}`);
for (const d of diffs.slice(0, 6)) {
  console.log(`  #${d.id} ${d.text}`);
  console.log(`    新：${d.cur}`);
  console.log(`    旧：${d.old}`);
}
