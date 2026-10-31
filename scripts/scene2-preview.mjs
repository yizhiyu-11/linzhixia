/**
 * 场景 v2 预览 + 校验（不接线上，只读 json）
 *   node scripts/scene2-preview.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'personas/life';
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const template = read('template.json');
const preset = read('presets/office.json');

const sceneFiles = fs.readdirSync(path.join(ROOT, 'scenes')).filter((f) => f.endsWith('.json'));
const scenes = sceneFiles.flatMap((f) => {
  const data = read(path.join('scenes', f));
  return (data.scenes || []).map((s) => ({ ...s, band: s.band || data.band, _file: f, _fileBand: data.band }));
});

const errors = [];
const warn = [];
const ok = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// ── 校验 ───────────────────────────────────────────────
const KEYS = ['id', 'place', 'location', 'doing', 'pace', 'chat', 'items'];
const PLACES = ['home', 'commute', 'work', 'outside', 'bed', 'shop'];
const ITEM_KINDS = Object.keys(template.itemRules);

for (const s of scenes) {
  for (const k of KEYS) ok(s[k] !== undefined, `${s.id || s.doing}：缺字段 ${k}`);
  ok(PLACES.includes(s.place), `${s.id}：place 非法 ${s.place}`);
  ok(['busy', 'normal', 'quiet'].includes(s.pace), `${s.id}：pace 非法 ${s.pace}`);
  ok(typeof s.chat === 'number' && s.chat >= 0 && s.chat <= 1, `${s.id}：chat 越界 ${s.chat}`);
  ok(Array.isArray(s.items) && s.items.length >= 1 && s.items.length <= 3, `${s.id}：items 数量 ${s.items?.length}`);

  for (const it of s.items || []) {
    ok(ITEM_KINDS.includes(it.kind), `${s.id}：item kind 非法 ${it.kind}`);
    ok(String(it.text || '').length >= 4, `${s.id}：item 太短「${it.text}」`);
    const rule = template.itemRules[it.kind] || {};
    const [lo, hi] = rule.expectMin || [0, 999];
    ok(it.expectMin >= lo && it.expectMin <= hi, `${s.id}：${it.text} 时长 ${it.expectMin} 超出 ${lo}-${hi}`);
    if (it.carry) ok(rule.carry === true, `${s.id}：${it.text} 标了 carry 但 ${it.kind} 不允许`);
    if (it.appraisal) {
      const a = it.appraisal;
      ok(a.relevance >= 0 && a.relevance <= 1, `${s.id}：appraisal.relevance 越界`);
      ok(a.goalCongruence >= -1 && a.goalCongruence <= 1, `${s.id}：appraisal.goalCongruence 越界`);
      ok(['self', 'other', 'circumstance'].includes(a.agency), `${s.id}：appraisal.agency 非法`);
      ok(a.selfImage >= -1 && a.selfImage <= 1, `${s.id}：appraisal.selfImage 越界`);
    }
  }

  // 与 preset 的时段一致性
  const band = template.bands[s.band];
  ok(Boolean(band), `${s.id}：band 非法 ${s.band}`);
  if (band) {
  }
}

// 重复 id
const ids = new Set();
for (const s of scenes) {
  if (ids.has(s.id)) errors.push(`重复 id：${s.id}`);
  ids.add(s.id);
}

// chat 与 pace 一致性（文档里的不变式）
for (const s of scenes) {
  if (s.pace === 'busy' && s.chat > 0.6) warn.push(`${s.id}：busy 但 chat=${s.chat} 偏高`);
  if (s.pace === 'quiet' && s.chat < 0.5) warn.push(`${s.id}：quiet 但 chat=${s.chat} 偏低`);
}

// ── 预览一天 ────────────────────────────────────────────
const bandsOf = (p) => {
  const [l0, l1] = p.lunch;
  return [
    ['morning', p.wake, p.leave],
    ['forenoon', p.workStart, l0],
    ['noon', l0, l1],
    ['afternoon', l1, p.workEnd],
    ['evening', p.workEnd, 21.5],
    ['night', 21.5, 24],
  ];
};

console.log('=== 作息（office preset）===');
for (const [b, from, to] of bandsOf(preset)) {
  const meta = template.bands[b];
  console.log(`  ${meta.label.padEnd(3)} ${String(from).padStart(5)} - ${String(to).padEnd(5)} chat=${meta.chat} pace=${meta.pace}`);
}

console.log(`\n=== 场景（${scenes.length} 条，只做了晚间和夜间）===`);
for (const s of scenes) {
  const items = s.items.map((i) => `${i.text}（${i.kind}，${i.expectMin}分${i.carry ? '，跨场景' : ''}${i.appraisal ? '，带评价' : ''}）`);
  console.log(`  [${s.band}] ${s.location} · ${s.doing}`);
  console.log(`        pace=${s.pace} chat=${s.chat}`);
  for (const i of items) console.log(`        - ${i}`);
}

console.log(`\n=== 结果 ===`);
if (errors.length) {
  console.log(`  ✗ ${errors.length} 个错误`);
  for (const e of errors) console.log('    - ' + e);
} else {
  console.log('  ✓ 校验全部通过');
}
if (warn.length) {
  console.log(`  ⚠ ${warn.length} 个提醒`);
  for (const w of warn) console.log('    - ' + w);
}

// 统计
const kinds = {};
for (const s of scenes) for (const i of s.items) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
console.log('  item 类型分布：' + JSON.stringify(kinds));
console.log('  带评价的事项：' + scenes.flatMap((s) => s.items).filter((i) => i.appraisal).length);
process.exit(errors.length ? 1 : 0);
