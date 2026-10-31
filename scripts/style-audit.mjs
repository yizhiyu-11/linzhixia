/**
 * 风格体检：用一批固定探针消息生成回复，统计"像不像真人"的硬指标，
 * 和 style-profile 里的目标区间比对，给一个分数。
 *
 * 用法：node --env-file=.env scripts/style-audit.mjs
 */
import fs from 'node:fs';
import { config } from '../src/config.mjs';
import { loadPersona } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { generateReply } from '../src/brain.mjs';
import { splitIntoBursts } from '../src/reply.mjs';
import { loadStickers } from '../src/sticker.mjs';
import { createLogger } from '../src/logger.mjs';

const PROBES = [
  '在干嘛',
  '今天好累',
  '你是人类吗',
  '我买了个新键盘',
  '哈哈哈哈哈哈',
  '你说我是不是有点没用',
  '我想你了',
  '晚上吃什么',
  '在吗',
  '我睡了',
  '今天被领导骂了',
  '你在忙吗',
  '我好像感冒了',
  '周末去哪玩',
  '你好无聊啊',
];

/** 目标区间：按真人 QQ 聊天习惯定的（来自外部"去 AI 味"资料 + 实测） */
const TARGET = {
  medianChars: [3, 12], // 单条中位字数
  p90Chars: [8, 30], // 90% 分位
  questionRate: [0.05, 0.35], // 含问号的回复占比
  commaRate: [0, 0.1], // 含逗号的回复占比
  periodRate: [0, 0.05], // 含句号的回复占比
  shortRate: [0.25, 0.7], // ≤6 字的回复占比
  burstsAvg: [1, 2.4], // 平均几条
};

const log = createLogger('warn');
const persona = loadPersona(config.persona);
const memory = new Memory('data/_audit.db');
const stickers = loadStickers('stickers');
memory.ensureUser('audit', '体检');

const rows = [];
for (const probe of PROBES) {
  try {
    const r = await generateReply({
      persona,
      memory,
      qq: 'audit',
      text: probe,
      images: 0,
      extraHint: '',
      stickers,
      log,
    });
    const { text } = { text: r.text };
    const bursts = splitIntoBursts(text, { maxSegments: config.splitMax });
    bursts.forEach((b) => rows.push({ probe, text: b }));
    memory.addMessage('audit', 'user', probe);
    memory.addMessage('audit', 'assistant', text);
  } catch (e) {
    console.error(`探针失败 ${probe}: ${e.message}`);
  }
}

memory.close();
try {
  fs.rmSync('data/_audit.db', { force: true });
  fs.rmSync('data/_audit.db-wal', { force: true });
  fs.rmSync('data/_audit.db-shm', { force: true });
} catch {
  /* ignore */
}

const lens = rows.map((r) => r.text.length).sort((a, b) => a - b);
const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] || 0;
const rate = (re) => rows.filter((r) => re.test(r.text)).length / rows.length;

const stat = {
  条数: rows.length,
  中位字数: pct(0.5),
  p90字数: pct(0.9),
  短句率: Number(rate(/^.{0,6}$/).toFixed(2)),
  问号率: Number(rate(/[？?]/).toFixed(2)),
  逗号率: Number(rate(/[，,]/).toFixed(2)),
  句号率: Number(rate(/。/).toFixed(2)),
};

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const checks = [
  ['中位字数', stat.中位字数, TARGET.medianChars],
  ['p90 字数', stat.p90字数, TARGET.p90Chars],
  ['短句率', stat.短句率, TARGET.shortRate],
  ['问号率', stat.问号率, TARGET.questionRate],
  ['逗号率', stat.逗号率, TARGET.commaRate],
  ['句号率', stat.句号率, TARGET.periodRate],
];

console.log('\n=== 生成的样本（前 12 条）===');
rows.slice(0, 12).forEach((r) => console.log(`  「${r.text}」  ← ${r.probe}`));

console.log('\n=== 指标 vs 目标 ===');
let pass = 0;
for (const [name, v, range] of checks) {
  const ok = inRange(v, range);
  if (ok) pass++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}: ${v}  (目标 ${range[0]}~${range[1]})`);
}
console.log(`\n得分：${pass}/${checks.length}`);
