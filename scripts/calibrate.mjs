/**
 * 校准：人工标注 vs 模型判定，算一致率（Cohen's κ）。
 *
 * node scripts/calibrate.mjs test/runs/run-baseline-001.label-sheet.csv test/runs/run-baseline-001.llm.json
 *
 * κ 解读：<0.4 不能用 / 0.4-0.6 勉强 / 0.6-0.8 可用 / >0.8 很好
 */
import fs from 'node:fs';
import path from 'node:path';

const [labelFile, judgeFile] = process.argv.slice(2).map((p) => path.resolve(p));
if (!labelFile || !judgeFile) {
  console.error('用法: node scripts/calibrate.mjs <label-sheet.csv> <run.llm.json>');
  process.exit(1);
}

// ── 读人工标注（自己写个极简 CSV 解析，够用）──────────────
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 1 || r[0]);
}

const csv = parseCsv(fs.readFileSync(labelFile, 'utf8').replace(/^\uFEFF/, ''));
const header = csv.shift();
const idx = (name) => header.findIndex((h) => h.includes(name));
const iId = idx('sample_id');
const iLabel = idx('你的判断');
const iHard = idx('硬失败');

const human = new Map();
for (const r of csv) {
  const id = Number(r[iId]);
  if (!id) continue;
  const label = String(r[iLabel] || '').trim();
  if (!['好', '一般', '差'].includes(label)) continue;
  const hardRaw = String(r[iHard] || '').trim();
  human.set(id, { label, hard: hardRaw ? hardRaw.toUpperCase() : '无' });
}

// ── 读模型判定 ─────────────────────────────────────────────
const judge = JSON.parse(fs.readFileSync(judgeFile, 'utf8'));
const items = judge.items || judge;
const model = new Map();
for (const it of items) {
  const id = Number(it.sample_id);
  if (!id) continue;
  const scores = [it.承接, it.情绪, it.信息, it.自然].filter((x) => Number.isFinite(x));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  // 判定器直接给三档时优先用它；只有旧格式（四维分）才按平均分折算
  const label = ['好', '一般', '差'].includes(it.判断) ? it.判断 : avg >= 4 ? '好' : avg >= 2.5 ? '一般' : '差';
  model.set(id, { label, hard: String(it.硬失败 || '无').toUpperCase(), avg });
}

// ── Cohen's κ ─────────────────────────────────────────────
function kappa(pairs) {
  const n = pairs.length;
  if (!n) return { k: 0, po: 0, pe: 0, n: 0 };
  const labels = [...new Set(pairs.flatMap(([a, b]) => [a, b]))];
  const count = (idx) => {
    const m = new Map();
    for (const p of pairs) m.set(p[idx], (m.get(p[idx]) || 0) + 1);
    return m;
  };
  const c1 = count(0);
  const c2 = count(1);
  let agree = 0;
  for (const [a, b] of pairs) if (a === b) agree++;
  const po = agree / n;
  let pe = 0;
  for (const L of labels) pe += ((c1.get(L) || 0) / n) * ((c2.get(L) || 0) / n);
  const k = pe === 1 ? 1 : (po - pe) / (1 - pe);
  return { k: +k.toFixed(3), po: +po.toFixed(3), pe: +pe.toFixed(3), n };
}

const ids = [...human.keys()].filter((id) => model.has(id));
const labelPairs = ids.map((id) => [human.get(id).label, model.get(id).label]);
const isHard = (h) => h && h !== '无';
const hardPairs = ids.map((id) => [isHard(human.get(id).hard) ? '硬失败' : '正常', isHard(model.get(id).hard) ? '硬失败' : '正常']);

const kLabel = kappa(labelPairs);
const kHard = kappa(hardPairs);

console.log(`\n=== 校准结果（${ids.length} 条对齐样本）===`);
console.log(`三档判断一致率 ${(kLabel.po * 100).toFixed(1)}%   κ = ${kLabel.k}`);
console.log(`硬失败一致率   ${(kHard.po * 100).toFixed(1)}%   κ = ${kHard.k}`);
const verdict = Math.min(kLabel.k, kHard.k);
console.log(
  verdict >= 0.8 ? '→ 判定器很好，可以直接用' : verdict >= 0.6 ? '→ 可用，继续跑' : verdict >= 0.4 ? '→ 勉强，建议改评分锚点' : '→ 不可用，必须改锚点后重标',
);

// 分歧明细
const diff = ids.filter((id) => human.get(id).label !== model.get(id).label);
if (diff.length) {
  console.log(`\n分歧 ${diff.length} 条（人工 ≠ 模型）：`);
  for (const id of diff.slice(0, 12)) {
    const h = human.get(id);
    const m = model.get(id);
    const it = items.find((x) => Number(x.sample_id) === id);
    console.log(`  #${id} 人工=${h.label} 模型=${m.label}(${m.avg.toFixed(1)})`);
    console.log(`     你：${String(it?.input).slice(0, 30)}`);
    console.log(`     她：${String(it?.reply).slice(0, 40)}`);
  }
}
