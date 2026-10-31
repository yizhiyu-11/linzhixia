/**
 * 生成人工标注表：从一次 run 里分层抽 50 条，输出 CSV（Excel 打开就能填）。
 *
 * node scripts/make-label-sheet.mjs test/runs/run-baseline-001.jsonl [--n 50]
 * 填完用 scripts/calibrate.mjs 算一致率。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const RUN = path.resolve(args[0] || '');
if (!RUN || !fs.existsSync(RUN)) {
  console.error('用法: node scripts/make-label-sheet.mjs <run.jsonl> [--n 50]');
  process.exit(1);
}
const getArg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(getArg('n', 50));
const OUT = RUN.replace(/\.jsonl$/, '.label-sheet.csv');

const rows = fs.readFileSync(RUN, 'utf8').trim().split('\n').map(JSON.parse);
const usable = rows.filter((r) => (r.replies || []).some((x) => x.text) || /💤/.test(r.log || ''));

// 分层：按类别轮转取样，保证覆盖
const byCat = new Map();
for (const r of usable) {
  const k = r.category;
  if (!byCat.has(k)) byCat.set(k, []);
  byCat.get(k).push(r);
}
const cats = [...byCat.keys()];
const picked = [];
let i = 0;
while (picked.length < N && i < 2000) {
  const c = cats[i % cats.length];
  const list = byCat.get(c);
  if (list.length) picked.push(list.shift());
  i++;
}

const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
const lines = [
  'sample_id,类别,他说,她回,你的判断(好/一般/差),硬失败(无/H1/H2/H3/H4/H5),备注',
  ...picked.map((r) => {
    const reply = (r.replies || []).map((x) => x.text).filter(Boolean).join(' / ');
    const img = (r.replies || []).some((x) => x.image) ? '[带表情包]' : '';
    return [r.sample_id, esc(r.category), esc(r.text), esc(reply + img)].join(',') + ',,,';
  }),
];
fs.writeFileSync(OUT, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8'); // BOM + CRLF：Excel 直接双击不会乱码

// 同时给一份 Markdown，方便在手机/网页上快速看
const md = RUN.replace(/\.jsonl$/, '.label-sheet.md');
const mdLines = ['# 人工标注表（50 条）\n', '填法：每条写"好/一般/差"，如果明显崩了写上硬失败类型。\n'];
for (const r of picked) {
  const reply = (r.replies || []).map((x) => x.text).filter(Boolean).join(' / ') || '(没回)';
  mdLines.push(`## ${r.sample_id} · ${r.category}`);
  mdLines.push(`你：${r.text}`);
  mdLines.push(`她：${reply}`);
  mdLines.push(`判断：____   硬失败：____\n`);
}
fs.writeFileSync(md, mdLines.join('\n'), 'utf8');

console.log(`✓ 标注表 ${picked.length} 条`);
console.log(`  CSV：${OUT}`);
console.log(`  MD ：${md}`);
console.log('  填完运行: node scripts/calibrate.mjs <label-sheet.csv> <run.llm.json>');
