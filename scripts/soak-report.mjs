/**
 * 分析 soak 结果：data/_soak-result.json
 * node scripts/soak-report.mjs
 */
import fs from 'node:fs';

const file = process.argv[2] || process.env.SOAK_OUT || 'data/_soak-result.json';
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
const recs = r.records;
const replied = recs.filter((x) => !x.skipped);
const texts = replied.flatMap((x) => x.replies.map((y) => y.text)).filter(Boolean);
const lat = recs.filter((x) => x.latencyMs).map((x) => x.latencyMs).sort((a, b) => a - b);
const pct = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] || 0;

const len = (s) => s.replace(/\s/g, '').length;
const lens = texts.map(len).sort((a, b) => a - b);

const RP = /(复读机?|卡带|说了?(两|三|好几)遍|第(两|三)遍|重复了|又重复|同样的话|刚说过)/;
const rep = texts.filter((t) => RP.test(t));

// 她连续说同样的话
let dupAdj = 0;
for (let i = 1; i < texts.length; i++) if (texts[i] === texts[i - 1]) dupAdj++;

// 完全相同回复出现次数
const freq = new Map();
for (const t of texts) freq.set(t, (freq.get(t) || 0) + 1);
const topDup = [...freq.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

const emptyish = texts.filter((t) => len(t) <= 1);
const long = texts.filter((t) => len(t) > 40);
const withImage = replied.filter((x) => x.replies.some((y) => y.image)).length;

// 分类统计
function bucket(text) {
  if (/^[a-zA-Z0-9]{3,}$/.test(text.trim())) return '乱码';
  if (['嗯', '哦', '？', '好', '随便', '行吧'].includes(text.trim())) return '敷衍';
  if (/(怎么办|该不该|要不要|怎么才能)/.test(text)) return '求建议';
  if (/(累|烦|难受|气|崩|疼|压力|不想)/.test(text)) return '发泄';
  if (/(哈哈|升职|好吃|不错|成了)/.test(text)) return '分享';
  if (/[?？]/.test(text)) return '提问';
  if (/(想你|抱抱|不喜欢我|不理我)/.test(text)) return '撒娇试探';
  if (text.length > 25) return '长段';
  return '闲聊';
}
const buckets = new Map();
for (const rec of recs) {
  const b = bucket(rec.text);
  const cur = buckets.get(b) || { n: 0, replied: 0, lens: [], samples: [] };
  cur.n++;
  if (!rec.skipped) {
    cur.replied++;
    const t = rec.replies.map((x) => x.text).join(' / ');
    cur.lens.push(len(t));
    if (cur.samples.length < 3) cur.samples.push(t);
  }
  buckets.set(b, cur);
}

console.log('=== 总体 ===');
console.log(`发出 ${r.count} 条，回了 ${r.replied} 条（${((r.replied / r.count) * 100).toFixed(0)}%），没回 ${r.skipped} 条`);
console.log(`首响 p50 ${pct(0.5)}ms  p90 ${pct(0.9)}ms  最长 ${lat[lat.length - 1] || 0}ms`);
console.log(`气泡 ${texts.length} 个，带表情包 ${withImage} 次`);
console.log(`回复字数：中位 ${lens[Math.floor(lens.length / 2)]}，p90 ${lens[Math.floor(lens.length * 0.9)]}，最长 ${lens[lens.length - 1]}`);

console.log('\n=== 问题检查 ===');
const problems = [];
if (rep.length) problems.push(`点评重复 ${rep.length} 次：${rep.slice(0, 3).join(' | ')}`);
if (dupAdj) problems.push(`连续两条完全相同 ${dupAdj} 次`);
if (long.length) problems.push(`超长回复（>40字）${long.length} 条：${long[0]?.slice(0, 40)}`);
if (emptyish.length) problems.push(`超短回复（≤1字）${emptyish.length} 条`);
if (topDup.length) problems.push(`相同回复重复出现 ${topDup.length} 组，最多 ${topDup[0][1]} 次：「${topDup[0][0]}」`);
console.log(problems.length ? problems.map((p) => '  ✗ ' + p).join('\n') : '  ✓ 没发现异常');

console.log('\n=== 分类表现 ===');
for (const [name, v] of [...buckets.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const avg = v.lens.length ? Math.round(v.lens.reduce((a, b) => a + b, 0) / v.lens.length) : 0;
  console.log(`  ${name.padEnd(6)} ${String(v.n).padStart(3)} 条，回了 ${v.replied}，平均 ${avg} 字`);
  if (v.samples[0]) console.log(`         例：${v.samples[0].slice(0, 48)}`);
}

console.log('\n=== 最有代表性的 12 条 ===');
for (const rec of recs.filter((x) => !x.skipped).slice(0, 12)) {
  console.log(`  你：${rec.text.slice(0, 26)}`);
  console.log(`  她：${rec.replies.map((x) => x.text).join(' / ').slice(0, 60)}`);
}

console.log('\n=== 没回的 ===');
for (const rec of recs.filter((x) => x.skipped)) console.log(`  「${rec.text.slice(0, 30)}」`);
