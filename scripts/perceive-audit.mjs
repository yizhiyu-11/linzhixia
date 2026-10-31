/**
 * 感知层体检：只跑 perceive()，不生成回复（比跑整条链路快 5 倍）。
 *
 * node --env-file=.env scripts/perceive-audit.mjs [--limit 200] [--run test/runs/run-baseline-001.jsonl]
 *
 * 指标：
 *   话题稳定率 —— 连续片段组内，相邻两轮 topic 相同的比例（越接近 1 越好）
 *   情绪准确率 —— 用语料类别当弱标注（"开心兴奋"→开心 等）
 *   意图准确率 —— 同上
 *   耗时 / 失败率
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat } from '../src/brain.mjs';
import { Memory } from '../src/memory.mjs';
import { createLogger } from '../src/logger.mjs';
import { perceive, perceiveLine } from '../src/perceive.mjs';

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const LIMIT = Number(getArg('limit', 200));
const RUN = path.resolve(getArg('run', 'test/runs/run-baseline-001.jsonl'));

const rows = fs.readFileSync(RUN, 'utf8').trim().split('\n').map(JSON.parse);

// 优先取连续片段（才能算话题稳定率），再补单条
const dialogues = rows.filter((r) => r.group);
const singles = rows.filter((r) => !r.group);
const picked = [...dialogues, ...singles].slice(0, LIMIT);

const memory = new Memory('data/_audit.db');
memory.ensureUser('audit');
const log = createLogger('warn');
const chatFn = (m, tag) => chat(m, { qq: 'audit', memory, log, tag });

const EMO_MAP = { 开心兴奋: '开心', 难过低落: '难过', 生气抱怨: '生气', 焦虑压力: '焦虑', 撒娇亲密: '撒娇' };
const INTENT_MAP = {
  提问: '提问',
  求建议: '求建议',
  陈述分享: '分享',
  寒暄问候: '分享',
  确认否定附和: '敷衍',
  超短句: '敷衍',
  '纯符号/表情文字': '敷衍',
};

const out = [];
const prevTopic = {};
const t0 = Date.now();
for (let i = 0; i < picked.length; i++) {
  const r = picked[i];
  const start = Date.now();
  const prev = prevTopic[r.group || '*'] || '';
  const p = await perceive({ text: r.text, recent: [], hasImage: false, activity: '', prevTopic: prev, chatFn, log });
  if (p?.topic) prevTopic[r.group || '*'] = p.topic;
  out.push({ ...r, perception: p, ms: Date.now() - start });
  if (process.env.AUDIT_DETAIL === '1' && p) {
    console.log('  · [' + (r.group || '单条') + '] ' + r.text.slice(0, 18) + ' → ' + p.topic + '/' + p.topicDetail);
  }
  if ((i + 1) % 25 === 0) console.log(`[audit] ${i + 1}/${picked.length}`);
}
const elapsed = Date.now() - t0;
memory.close();
try {
  fs.rmSync('data/_audit.db', { force: true });
  fs.rmSync('data/_audit.db-wal', { force: true });
  fs.rmSync('data/_audit.db-shm', { force: true });
} catch {
  /* ignore */
}

const ok = out.filter((x) => x.perception);
const fail = out.length - ok.length;

// 话题稳定率：组内相邻
const groups = {};
for (const x of ok) if (x.group) (groups[x.group] = groups[x.group] || []).push(x.perception.topic);
let same = 0;
let total = 0;
for (const list of Object.values(groups)) {
  for (let i = 1; i < list.length; i++) {
    total++;
    if (list[i] === list[i - 1]) same++;
  }
}

// 弱标注准确率
let emoN = 0;
let emoOk = 0;
let intN = 0;
let intOk = 0;
const emoWrong = [];
const intWrong = [];
for (const x of ok) {
  const expE = EMO_MAP[x.category];
  if (expE) {
    emoN++;
    if (x.perception.emotion === expE) emoOk++;
    else emoWrong.push({ exp: expE, got: x.perception.emotion, text: x.text });
  }
  const expI = INTENT_MAP[x.category];
  if (expI) {
    intN++;
    if (x.perception.intent === expI) intOk++;
    else intWrong.push({ exp: expI, got: x.perception.intent, text: x.text });
  }
}

const ms = out.map((x) => x.ms).sort((a, b) => a - b);
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(0) + '%' : '-');

console.log('\n=== 感知层体检 ===');
console.log(`样本 ${out.length} 条，成功 ${ok.length}，失败 ${fail}（${pct(fail, out.length)}）`);
console.log(`耗时 p50 ${ms[Math.floor(ms.length / 2)]}ms / p90 ${ms[Math.floor(ms.length * 0.9)]}ms / 平均 ${Math.round(elapsed / out.length)}ms`);
console.log(`\n话题稳定率（组内相邻相同）: ${pct(same, total)}  (${same}/${total})`);
console.log(`情绪准确率（弱标注）:        ${pct(emoOk, emoN)}  (${emoOk}/${emoN})`);
console.log(`意图准确率（弱标注）:        ${pct(intOk, intN)}  (${intOk}/${intN})`);

console.log('\n情绪判错（前 8）:');
for (const w of emoWrong.slice(0, 8)) console.log(`  期望${w.exp} → 判成${w.got}　${w.text}`);
console.log('\n意图判错（前 8）:');
for (const w of intWrong.slice(0, 8)) console.log(`  期望${w.exp} → 判成${w.got}　${w.text}`);

console.log('\n样例 6 条:');
for (const x of ok.slice(0, 6)) console.log(`  ${x.text}\n    ${perceiveLine(x.perception)}`);

const report = {
  at: new Date().toISOString(),
  run: path.basename(RUN),
  n: out.length,
  ok: ok.length,
  fail,
  topicStability: total ? +(same / total).toFixed(3) : null,
  emotionAcc: emoN ? +(emoOk / emoN).toFixed(3) : null,
  intentAcc: intN ? +(intOk / intN).toFixed(3) : null,
  latency: { p50: ms[Math.floor(ms.length / 2)], p90: ms[Math.floor(ms.length * 0.9)] },
};
fs.writeFileSync('test/runs/perceive-audit.json', JSON.stringify(report, null, 2), 'utf8');
console.log('\n结果写入 test/runs/perceive-audit.json');
