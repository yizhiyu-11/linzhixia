/**
 * 判定（第一层：纯规则，免费）。
 * 只看"硬失败"和明显的质量问题，不做语义打分——语义交给第二层模型判定。
 *
 * node scripts/judge-run.mjs test/runs/run-001.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const RUN = path.resolve(args[0] || '');
if (!RUN || !fs.existsSync(RUN)) {
  console.error('用法: node scripts/judge-run.mjs test/runs/run-xxx.jsonl');
  process.exit(1);
}
const OUT = RUN.replace(/\.jsonl$/, '.report.json');
const MD = RUN.replace(/\.jsonl$/, '.REPORT.md');

const rows = fs.readFileSync(RUN, 'utf8').trim().split('\n').map(JSON.parse);

// H1：点评对方说话方式
const H1 = /(复读|卡带|(喊|说|问|提|讲|念|发)了?(两|三|好几|几)遍|第(两|三)遍|重复|学我|发重|刷屏|催我|是故意的吗)/;
// 地点词，用来做粗略的自相矛盾检测
const PLACES = ['公司', '家', '楼下', '便利店', '地铁', '路上', '沙发', '厨房', '阳台', '床上', '餐厅', '超市', '公园', '咖啡店'];

const norm = (s) => String(s || '').replace(/[\s，。！？、~…]/g, '');
const punctOnly = (s) => /^[？?！!。…\-—、，,~\s]+$/.test(s || '');

/** 从回复里抽"她在哪" */
function placesIn(text) {
  const t = String(text || '');
  const hits = [];
  for (const p of PLACES) {
    // 必须出现在"在/到/去 + 地点"的上下文里，避免"我家里"这种误判
    const re = new RegExp(`(在|到|去|回)${p}`);
    if (re.test(t)) hits.push(p);
  }
  return hits;
}

const perItem = [];
let lastReply = '';
let lastPlace = null;
let lastGroup = null;

for (const r of rows) {
  const text = (r.replies || []).map((x) => x.text).filter(Boolean).join(' / ');
  const flags = [];
  let hardFail = null;

  const skipped = /💤 这条不回/.test(r.log || '');
  if (skipped) {
    // 按设计不回（手滑/没看懂），不算失败
  } else if (!r.replies || !r.replies.length) {
    hardFail = 'H5 空回复';
  } else if (!text && r.replies.every((x) => x.image)) {
    // 只发了表情包，算合理
  } else if (!text) {
    hardFail = 'H5 空回复';
  } else if (H1.test(text) && !H1.test(r.text)) {
    hardFail = 'H1 点评对方说话方式';
  } else if (punctOnly(text)) {
    hardFail = 'H5 只有标点';
  } else if (lastReply && norm(text) === norm(lastReply)) {
    hardFail = 'H5 与上一条完全一样';
  }

  // 自相矛盾：同一组里前后说的地点不一致
  if (!hardFail && r.group && r.group !== lastGroup) lastPlace = null;
  if (!hardFail) {
    const nowPlace = placesIn(text)[0] || null;
    if (nowPlace && lastPlace && nowPlace !== lastPlace) {
      hardFail = `H2 地点矛盾（${lastPlace} → ${nowPlace}）`;
    }
    if (nowPlace) lastPlace = nowPlace;
  }
  if (r.group) lastGroup = r.group;

  // 质量提示（不算硬失败）
  const len = norm(text).length;
  if (!hardFail && !skipped) {
    if (text && len > 60) flags.push('过长');
    if (text && len <= 1 && String(r.text).length >= 12) flags.push('敷衍');
    if (!text && !(r.replies || []).some((x) => x.image)) flags.push('无文字');
  }

  lastReply = text;
  perItem.push({
    sample_id: r.sample_id,
    category: r.category,
    group: r.group,
    turn: r.turn,
    input: r.text,
    reply: text,
    image: (r.replies || []).some((x) => x.image),
    latencyMs: r.latencyMs,
    hardFail,
    skipped,
    flags,
    perceive: r.perceive || '',
    log: r.log || '',
  });
}

// ── 汇总 ───────────────────────────────────────────────────
const total = perItem.length;
const failed = perItem.filter((x) => x.hardFail);
const byCat = new Map();
for (const x of perItem) {
  const c = byCat.get(x.category) || { n: 0, fail: 0, flags: 0 };
  c.n++;
  if (x.hardFail) c.fail++;
  if (x.flags.length) c.flags++;
  byCat.set(x.category, c);
}
const byType = new Map();
for (const x of failed) {
  const k = x.hardFail.split(' ')[0] + ' ' + (x.hardFail.split(' ')[1] || '');
  byType.set(k, (byType.get(k) || 0) + 1);
}
const catStats = [...byCat].map(([name, v]) => ({
  name,
  n: v.n,
  fail: v.fail,
  flags: v.flags,
  passRate: +(((v.n - v.fail) / v.n) * 100).toFixed(1),
}));
const lat = perItem.filter((x) => x.latencyMs).map((x) => x.latencyMs).sort((a, b) => a - b);
const pct = (n) => ((n / total) * 100).toFixed(1) + '%';

const report = {
  run: path.basename(RUN),
  generatedAt: new Date().toISOString(),
  total,
  replied: perItem.filter((x) => x.reply || x.image).length,
  hardFail: failed.length,
  hardFailRate: +(failed.length / total * 100).toFixed(1),
  byType: Object.fromEntries(byType),
  byCategory: Object.fromEntries(catStats.map((v) => [v.name, v])),
  latency: { p50: lat[Math.floor(lat.length / 2)] || 0, p90: lat[Math.floor(lat.length * 0.9)] || 0 },
  items: perItem,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

// ── Markdown ───────────────────────────────────────────────
const lines = [];
lines.push(`# 语料测试报告 · ${path.basename(RUN)}\n`);
lines.push(`- 时间：${new Date().toLocaleString('zh-CN')}`);
lines.push(`- 样本：${total} 条，有回复 ${report.replied} 条`);
lines.push(`- **硬失败率：${report.hardFailRate}%**（${failed.length}/${total}）`);
lines.push(`- 首响 p50 ${report.latency.p50}ms / p90 ${report.latency.p90}ms\n`);

lines.push('## 硬失败类型\n');
if (!byType.size) lines.push('无 ✅');
else {
  lines.push('| 类型 | 条数 | 占比 |');
  lines.push('|---|---:|---:|');
  for (const [k, n] of [...byType].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${n} | ${pct(n)} |`);
}

lines.push('\n## 分类通过率\n');
lines.push('| 类别 | 条数 | 失败 | 通过率 |');
lines.push('|---|---:|---:|---:|');
for (const v of [...catStats].sort((a, b) => a.passRate - b.passRate)) {
  lines.push(`| ${v.name} | ${v.n} | ${v.fail} | ${v.passRate}% |`);
}

lines.push('\n## 失败样例（最多 20 条）\n');
for (const x of failed.slice(0, 20)) {
  lines.push(`- **[${x.hardFail}]** 你：${String(x.input).slice(0, 30)}`);
  lines.push(`  - 她：${String(x.reply || '(空)').slice(0, 60)}`);
}

lines.push('\n## 质量提示（不算失败）\n');
const flagged = perItem.filter((x) => !x.hardFail && x.flags.length).slice(0, 15);
if (!flagged.length) lines.push('无');
else for (const x of flagged) lines.push(`- [${x.flags.join('/')}] 你：${String(x.input).slice(0, 24)} → 她：${String(x.reply).slice(0, 40)}`);

fs.writeFileSync(MD, lines.join('\n'), 'utf8');

console.log(`✓ 判定完成：${total} 条`);
console.log(`  硬失败 ${failed.length} 条（${report.hardFailRate}%）`);
for (const [k, n] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${n}`);
console.log(`  首响 p50 ${report.latency.p50}ms`);
console.log(`\n报告：${MD}`);
