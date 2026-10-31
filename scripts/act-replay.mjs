/**
 * 裁决层 v2 原型 + 离线回放对比（不影响 src，纯实验）
 *
 *   node scripts/act-replay.mjs
 *
 * 数据：data/_replay/bot.db 的 perceptions 表（线上真实感知结果）
 * 对比：旧 decideAct（import 自 src/act.mjs） vs 新打分版（本文件内实现）
 */
import { DatabaseSync } from 'node:sqlite';
import { decideAct as decideOld } from '../src/act.mjs';

const db = new DatabaseSync('data/_replay/bot.db', { readOnly: true });
const rows = db
  .prepare(`SELECT qq, text, json, created_at FROM perceptions ORDER BY id ASC`)
  .all();

const parsed = [];
for (const r of rows) {
  try {
    const p = JSON.parse(r.json);
    parsed.push({ qq: r.qq, text: r.text || '', p, at: r.created_at });
  } catch {
    /* 跳过坏数据 */
  }
}

// ───────────────────────── v2：打分版 ─────────────────────────
const ACTS = ['answer', 'engage', 'advance', 'deflect', 'sticky'];

function decideV2({ perception, scene = null, goal = '', meta = {}, recentActs = [], mood = 60 }) {
  if (!perception) return { act: 'answer', why: '没有感知', strength: 0 };

  const { intent, emotion, continuity, jump, certainty } = perception;

  // ── 第一层：硬约束（正确性优先，不参与打分）──────────
  if (intent === '提问' || intent === '求建议') {
    return { act: 'answer', why: `他在${intent}，必须先答`, strength: 1 };
  }
  if (intent === '倾诉' || emotion === '难过' || emotion === '焦虑') {
    return { act: 'engage', why: `他在${intent === '倾诉' ? '倾诉' : emotion}，先接住`, strength: 0.9 };
  }

  // ── 第二层：其余情况打分（answer 是默认，不被惩罚）──
  const scores = Object.fromEntries(ACTS.map((a) => [a, 0]));
  const why = [];
  scores.answer += 1.0; // 默认倾向

  if (intent === '敷衍') scores.advance += 2.5;

  // 情绪（难过/焦虑已在硬约束处理）
  if (emotion === '撒娇') scores.engage += 1.2;

  // 连续度
  if (continuity < 0.2) scores.deflect += certainty >= 0.6 ? 1.2 : 0.4;
  if (continuity > 0.7 && intent !== '敷衍') scores.sticky += 0.8;

  // 话题耗尽
  if (jump === 'exhausted') scores.deflect += 1.2;

  // 场景：有待办时她"有话可说"
  if (scene?.pending?.length) {
    scores.advance += 0.8;
    scores.sticky -= 0.3;
  }
  if (scene && /发呆|躺着|刷手机/.test(scene.doing || '')) scores.advance += 0.5;

  // 目标冲突
  if (goal === '安抚' && scores.deflect > 0) {
    scores.deflect -= 2.0;
  }

  // 重复惩罚：只罚风格类动作，answer 是正确行为，不罚
  const last3 = recentActs.slice(-3);
  for (const a of ['advance', 'deflect', 'sticky', 'engage']) {
    const used = last3.filter((x) => x === a).length;
    if (used) scores[a] -= 1.2 * used;
  }
  if (recentActs.slice(-2).includes('deflect')) scores.deflect -= 3.0;

  // 低置信度：激进动作减半
  if (certainty < 0.5) {
    scores.deflect *= 0.6;
    scores.advance *= 0.7;
  }

  // 心情低：少演温柔
  if (mood < 35) scores.engage -= 0.5;

  // 加一点抖动，避免每轮同分
  for (const a of ACTS) scores[a] += Math.random() * 0.06;

  const sorted = ACTS.map((a) => ({ a, s: scores[a] })).sort((x, y) => y.s - x.s);
  const top = sorted[0];
  const strength = Math.max(0, Math.min(1, (top.s - sorted[1].s) / 1.5));
  // 保守回退：分差太小就别改默认行为
  if (strength < 0.15) return { act: 'answer', why: '分差太小，按接住处理', strength };
  return { act: top.a, why: why.join('、') || '默认接住', strength };
}

// ───────────────────────── 回放 ─────────────────────────
const byUser = {};
for (const r of parsed) (byUser[r.qq] = byUser[r.qq] || []).push(r);

const count = (obj, k) => (obj[k] = (obj[k] || 0) + 1);
const oldDist = {};
const newDist = {};
const strengthHist = { low: 0, mid: 0, high: 0 };
const changes = [];
let n = 0;

for (const [qq, list] of Object.entries(byUser)) {
  const oldHist = [];
  const newHist = [];
  for (const item of list) {
    const o = decideOld({ perception: item.p, recentActs: oldHist, mood: 60 });
    const nv = decideV2({ perception: item.p, recentActs: newHist, mood: 60 });

    count(oldDist, o.act);
    count(newDist, nv.act);
    if (nv.strength < 0.3) strengthHist.low++;
    else if (nv.strength < 0.6) strengthHist.mid++;
    else strengthHist.high++;

    if (o.act !== nv.act) {
      changes.push({ qq, text: item.text.slice(0, 22), old: o.act, new: nv.act, s: nv.strength.toFixed(2), why: nv.why });
    }

    oldHist.push(o.act);
    newHist.push(nv.act);
    n++;
  }
}

const pct = (dist, k) => ((100 * (dist[k] || 0)) / n).toFixed(1) + '%';
const entropy = (dist) => {
  let h = 0;
  for (const k of ACTS) {
    const p = (dist[k] || 0) / n;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h.toFixed(2);
};

console.log(`\n样本：${n} 条真实感知（${Object.keys(byUser).length} 个用户）\n`);
console.log('act 分布（旧 → 新）');
for (const a of ACTS) {
  console.log(`  ${a.padEnd(9)} ${pct(oldDist, a).padStart(6)}  →  ${pct(newDist, a).padStart(6)}`);
}
console.log(`  分布熵          ${entropy(oldDist)}  →  ${entropy(newDist)}`);
console.log(`\nstrength 分布：低(<0.3) ${strengthHist.low} / 中 ${strengthHist.mid} / 高(>0.6) ${strengthHist.high}`);
console.log(`\n判断改变：${changes.length} 条（${((100 * changes.length) / n).toFixed(0)}%）`);
for (const c of changes.slice(0, 12)) {
  console.log(`  「${c.text}」 ${c.old} → ${c.new}（${c.s}）${c.why}`);
}
db.close();
