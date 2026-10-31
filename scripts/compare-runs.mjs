/**
 * 成对比较：同一批输入，A/B 两版回复，盲评哪条好。
 *
 * node --env-file=.env scripts/compare-runs.mjs <A.jsonl> <B.jsonl> [--n 40]
 *
 * - 按 sample_id 对齐（两版必须是同一批样本）
 * - 随机左右顺序，避免位置偏好
 * - 输出胜率 + 逐条明细
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat } from '../src/brain.mjs';
import { Memory } from '../src/memory.mjs';
import { createLogger } from '../src/logger.mjs';

const args = process.argv.slice(2);
const A = path.resolve(args[0] || '');
const B = path.resolve(args[1] || '');
const getArg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(getArg('n', 40));
if (!fs.existsSync(A) || !fs.existsSync(B)) {
  console.error('用法: node --env-file=.env scripts/compare-runs.mjs A.jsonl B.jsonl [--n 40]');
  process.exit(1);
}

const load = (f) => {
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
  return new Map(rows.map((r) => [Number(r.sample_id), r]));
};
const a = load(A);
const b = load(B);
const ids = [...a.keys()].filter((id) => b.has(id));
if (!ids.length) {
  console.error('两个 run 没有共同的 sample_id，无法对齐');
  process.exit(1);
}

const textOf = (r) => {
  const t = (r.replies || []).map((x) => x.text).filter(Boolean).join(' / ');
  return t || ((r.replies || []).some((x) => x.image) ? '[只发了表情包]' : '(没回)');
};

// 均匀抽样
const step = Math.max(1, Math.floor(ids.length / N));
const picked = ids.filter((_, i) => i % step === 0).slice(0, N);

const SYS = `你在比较两条聊天回复，哪一条更好。
只回答一个字母：A 或 B；如果都不行就回答 N；如果两条差不多就回答 T。
判断依据（按重要性）：
1. 有没有真的接住他那句话的内容
2. 情绪对不对（他低落别怼他，他求助别敷衍）
3. 像不像真人在打字
不要因为"更长"就给高分。`;

const memory = new Memory('data/_compare.db');
memory.ensureUser('cmp');
const log = createLogger('warn');

const results = [];
let Awin = 0;
let Bwin = 0;
let tie = 0;
let none = 0;

for (const id of picked) {
  const ra = a.get(id);
  const rb = b.get(id);
  const ta = textOf(ra);
  const tb = textOf(rb);
  if (ta === tb) {
    tie++;
    results.push({ id, input: ra.text, A: ta, B: tb, winner: 'same' });
    continue;
  }

  // 随机左右顺序
  const flip = Math.random() < 0.5;
  const left = flip ? tb : ta;
  const right = flip ? ta : tb;

  const userMsg = `他说：${ra.text}\n\n回复一：${left}\n\n回复二：${right}`;
  let verdict = 'N';
  try {
    const r = await chat(
      [
        { role: 'system', content: SYS },
        { role: 'user', content: userMsg },
      ],
      { qq: 'cmp', memory, log, tag: 'cmp' },
    );
    const m = String(r.text || '').toUpperCase().match(/\b([ABTN])\b/);
    verdict = m ? m[1] : 'N';
  } catch (e) {
    verdict = 'N';
  }

  // 还原成 A/B
  let winner = 'none';
  if (verdict === 'A') winner = flip ? 'B' : 'A';
  else if (verdict === 'B') winner = flip ? 'A' : 'B';
  else if (verdict === 'T') winner = 'tie';

  if (winner === 'A') Awin++;
  else if (winner === 'B') Bwin++;
  else if (winner === 'tie') tie++;
  else none++;

  results.push({ id, input: ra.text, A: ta, B: tb, winner });
  if (results.length % 10 === 0) console.log(`[cmp] ${results.length}/${picked.length}`);
}

memory.close();
const decided = Awin + Bwin;
const rateA = decided ? (Awin / decided) * 100 : 0;

const out = {
  at: new Date().toISOString(),
  A: path.basename(A),
  B: path.basename(B),
  n: picked.length,
  Awin,
  Bwin,
  tie,
  none,
  winRateA: +rateA.toFixed(1),
  winRateB: +(100 - rateA).toFixed(1),
  items: results,
};
const OUT = path.resolve('test/runs/compare-' + Date.now() + '.json');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

console.log('\n=== 成对比较 ===');
console.log(`样本 ${picked.length} 对（A=${path.basename(A)}  B=${path.basename(B)}）`);
console.log(`A 胜 ${Awin}  B 胜 ${Bwin}  平 ${tie}  都废 ${none}`);
console.log(`胜率：A ${rateA.toFixed(0)}%  /  B ${(100 - rateA).toFixed(0)}%`);
console.log(rateA > 55 ? '→ A 明显更好' : rateA < 45 ? '→ B 明显更好' : '→ 两者差别不大');
console.log(`明细：${OUT}`);
