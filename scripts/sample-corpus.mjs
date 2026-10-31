/**
 * 分层抽样：从 5000 条语料里抽出一次测试用的子集。
 *
 * 规则：
 *  - 连续对话按组抽（整组 5 条一起），占比 30%
 *  - 其余按类别权重分配，每类下限 8 条
 *  - 同一样本内文本去重（单条最多出现 1 次）
 *  - 顺序打乱，但组内保持顺序；随机种子写进清单，可复现
 *
 * node scripts/sample-corpus.mjs --n 400 --out test/runs/sample-400.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const N = Number(getArg('n', 400));
const OUT = path.resolve(getArg('out', `test/runs/sample-${N}.jsonl`));
const SEED = Number(getArg('seed', 20261023));
const CORPUS = path.resolve(getArg('corpus', 'test/corpus/messages-5000.jsonl'));

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const rows = fs.readFileSync(CORPUS, 'utf8').trim().split('\n').map(JSON.parse);
const dialogues = rows.filter((r) => r.source === 'dialogue');
const singles = rows.filter((r) => r.source === 'single');

// ── 连续片段：整组抽 ───────────────────────────────────────
const groupIds = [...new Set(dialogues.map((r) => r.group))];
const groupMap = new Map(groupIds.map((g) => [g, dialogues.filter((r) => r.group === g)]));
const wantDialogueLines = Math.round(N * 0.3);
const wantGroups = Math.max(1, Math.round(wantDialogueLines / 5));
const pickedGroups = shuffle(groupIds).slice(0, wantGroups);

// ── 单条：按类别分层 ───────────────────────────────────────
const byCat = new Map();
for (const r of singles) {
  const k = r.category;
  if (!byCat.has(k)) byCat.set(k, []);
  byCat.get(k).push(r);
}
const cats = [...byCat.entries()].map(([name, list]) => ({ name, list }));
const totalSingles = singles.length;
const wantSingles = N - pickedGroups.length * 5;

// 先按权重分配，保证下限
const MIN = 8;
const alloc = new Map();
let remaining = wantSingles;
for (const c of cats) {
  const quota = Math.max(MIN, Math.round((wantSingles * c.list.length) / totalSingles));
  const n = Math.min(quota, c.list.length);
  alloc.set(c.name, n);
  remaining -= n;
}
// 多退少补
let guard = 0;
while (remaining !== 0 && guard++ < 500) {
  const target = remaining > 0 ? cats[Math.floor(rnd() * cats.length)] : cats[Math.floor(rnd() * cats.length)];
  const cur = alloc.get(target.name);
  if (remaining > 0 && cur < target.list.length) {
    alloc.set(target.name, cur + 1);
    remaining -= 1;
  } else if (remaining < 0 && cur > 1) {
    alloc.set(target.name, cur - 1);
    remaining += 1;
  }
}

const pickedSingles = [];
for (const c of cats) {
  const n = alloc.get(c.name) || 0;
  pickedSingles.push(...shuffle(c.list).slice(0, n));
}

// ── 去重（同一样本内文本唯一）──────────────────────────────
const seen = new Set();
const uniq = (list) => list.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)));
const finalDialogue = uniq(pickedGroups.flatMap((g) => groupMap.get(g)));
const finalSingles = uniq(pickedSingles);

// ── 合并 + 打乱（组内保序）─────────────────────────────────
const blocks = [];
const gBlocks = new Map();
for (const r of finalDialogue) {
  if (!gBlocks.has(r.group)) gBlocks.set(r.group, []);
  gBlocks.get(r.group).push(r);
}
for (const g of shuffle([...gBlocks.keys()])) blocks.push(gBlocks.get(g));
for (const r of shuffle(finalSingles)) blocks.push([r]);

const out = [];
let sid = 1;
for (const block of blocks) {
  for (const r of block) {
    out.push({
      sample_id: sid++,
      text: r.text,
      category: r.category,
      sub: r.sub,
      group: r.group,
      turn: r.turn,
      source: r.source,
    });
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const stat = {
  total: out.length,
  dialogue: out.filter((r) => r.source === 'dialogue').length,
  singles: out.filter((r) => r.source === 'single').length,
  groups: new Set(out.filter((r) => r.group).map((r) => r.group)).size,
  categories: new Set(out.map((r) => r.category)).size,
  seed: SEED,
};
fs.writeFileSync(OUT.replace(/\.jsonl$/, '.manifest.json'), JSON.stringify(stat, null, 2), 'utf8');

console.log(`✓ 抽样 ${out.length} 条 → ${OUT}`);
console.log(`  连续对话 ${stat.dialogue} 条（${stat.groups} 组）  单条 ${stat.singles} 条`);
console.log(`  覆盖类别 ${stat.categories} 个  随机种子 ${SEED}`);
