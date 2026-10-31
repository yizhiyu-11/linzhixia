/**
 * 全量自检：把各个模块挨个跑一遍，看有没有回归。
 * 不连 QQ、不发消息，只调本地逻辑 + 少量真实 API（语音/读空气各一次）。
 *
 * node --env-file=.env scripts/selftest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config } from '../src/config.mjs';
import { loadPersona, buildSystemPrompt } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { splitIntoBursts, tidyPunctuation } from '../src/reply.mjs';
import { thinkDelay, typingDelay, burstGap, planSchedule } from '../src/pacing.mjs';
import { pickStrategy, MODES } from '../src/strategy.mjs';
import { readUser, replyGoal, readUserSmart, looksTypo, decideReply } from '../src/read.mjs';
import { looksRepeated, similarity } from '../src/repeat.mjs';
import { maybeSummarize, summaryBlock } from '../src/summarize.mjs';
import { loadStickers, classifyCategory, pickByCategory, extractStickerTags } from '../src/sticker.mjs';
import { loadImage } from '../src/image.mjs';
import { synthesize, closeVoice } from '../src/voice.mjs';
import { chat } from '../src/brain.mjs';
import { createLogger } from '../src/logger.mjs';

const log = createLogger('warn');
const results = [];
const ok = (name, detail = '') => results.push({ ok: true, name, detail });
const bad = (name, detail = '') => results.push({ ok: false, name, detail });

async function test(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail || '');
  } catch (e) {
    bad(name, e.message + (e.cause ? ' | cause=' + (e.cause.code || e.cause.message) : '') + (process.env.SELFTEST_DEBUG ? ' | ' + (e.stack || '').split('\n').slice(0, 5).join(' >> ') : ''));
  }
}

// ── A. 配置 ────────────────────────────────────────────────
await test('配置·关键项齐全', () => {
  const keys = ['apiKey', 'bailianKey', 'wsUrl', 'historyTurns', 'summaryEvery', 'typoSilence'];
  const miss = keys.filter((k) => config[k] === undefined);
  if (miss.length) throw new Error('缺 ' + miss.join(','));
  return `historyTurns=${config.historyTurns} summaryEvery=${config.summaryEvery}`;
});

// ── B. 人设 / prompt ───────────────────────────────────────
await test('人设·prompt 结构完整', () => {
  const p = loadPersona('default');
  const sys = buildSystemPrompt(p, {
    facts: [{ key: '生日', value: '3 月 14 日' }],
    relation: null,
    now: new Date(),
    hint: '',
    stickers: loadStickers('stickers'),
    stickerCatalog: ['- 开心：笑'],
    summary: '【之前聊过的事（摘要，可能不全）】\n- 上周末去爬山',
  });
  const need = ['打字习惯', '别像 AI', '参考语气', '表情包', '之前聊过的事', '3 月 14 日'];
  const miss = need.filter((x) => !sys.includes(x));
  if (miss.length) throw new Error('prompt 缺段落：' + miss.join(','));
  if (!sys.includes(p.fewShots[0].u)) throw new Error('few-shot 没进去');
  return `${sys.length} 字符 / few-shot ${p.fewShots.length} 组`;
});

// ── C. 节奏 ────────────────────────────────────────────────
await test('节奏·取值范围', () => {
  const ds = Array.from({ length: 200 }, () => thinkDelay(10, config));
  const min = Math.min(...ds);
  const max = Math.max(...ds);
  if (min < config.thinkMinMs * 0.9) throw new Error(`延迟过短 ${min}`);
  if (max > (config.thinkSlowMaxMs || 9000) + 2500) throw new Error(`延迟过长 ${max}`);
  const slow = ds.filter((d) => d > config.thinkMaxMs + 1200).length / ds.length;
  if (slow < 0.05) throw new Error('分心档几乎没出现：' + slow.toFixed(2));
  const typing = typingDelay('一二三四五', config);
  if (typing < config.typingMinMs * 0.8) throw new Error('打字延迟低于下限');
  const plan = planSchedule(10, ['a', 'b'], config);
  if (!plan.totalMs) throw new Error('排程空');
  return `思考 ${(min / 1000).toFixed(1)}~${(max / 1000).toFixed(1)}s，分心档 ${(slow * 100).toFixed(0)}%`;
});

// ── D. 策略 ────────────────────────────────────────────────
await test('策略·权重与收窄', () => {
  const seen = {};
  for (let i = 0; i < 600; i++) {
    const s = pickStrategy({ mood: 60, incoming: '在干嘛' });
    seen[s.id] = (seen[s.id] || 0) + 1;
  }
  const modes = Object.keys(seen);
  if (modes.length < 6) throw new Error('策略太集中：' + modes.join(','));

  // avoid 生效
  for (let i = 0; i < 50; i++) {
    const s = pickStrategy({ mood: 60, incoming: 'x', avoid: ['tease', 'short'] });
    if (s.id === 'tease' || s.id === 'short') throw new Error('avoid 没生效：' + s.id);
  }
  // prefer 生效
  for (let i = 0; i < 50; i++) {
    const s = pickStrategy({ mood: 60, incoming: 'x', prefer: ['short'] });
    if (s.id !== 'short') throw new Error('prefer 没生效：' + s.id);
  }
  return `${modes.length} 种策略，prefer/avoid 正常`;
});

// ── E. 读空气 ──────────────────────────────────────────────
await test('读空气·规则', () => {
  const cases = [
    ['今天累死了，什么都不想干', '难过', '倾诉'],
    ['我该怎么办啊，明天就要交', '焦虑', '求建议'],
    ['哈哈哈我升职了', '开心', '分享'],
    ['嗯', '平静', '敷衍'],
    ['你是不是不想理我了', '平静', '试探'],
  ];
  for (const [text, emo, intent] of cases) {
    const r = readUser(text);
    if (r.emotion !== emo || r.intent !== intent) {
      throw new Error(`「${text}」读成 ${r.emotion}/${r.intent}，期望 ${emo}/${intent}`);
    }
  }
  if (!looksTypo('tudyu') || !looksTypo('123456789') || looksTypo('我今天好累')) {
    throw new Error('错字检测不对');
  }
  return `${cases.length} 个用例 + 错字检测`;
});

await test('读空气·决策概率', () => {
  const typo = readUser('asdfgh');
  const c = {};
  for (let i = 0; i < 600; i++) {
    const d = decideReply(typo);
    c[d.mode] = (c[d.mode] || 0) + 1;
  }
  if (!c.ignore || !c.ask) throw new Error('决策分布异常：' + JSON.stringify(c));
  const goal = replyGoal(typo);
  if (!goal.goal) throw new Error('手滑没有 goal');
  return JSON.stringify(c);
});

await test('读空气·小模型（反讽）', async () => {
  const m = new Memory('data/_st.db');
  m.ensureUser('t');
  const r = await readUserSmart({
    text: '你可真行啊',
    recent: [],
    chatFn: (msgs, tag) => chat(msgs, { qq: 't', memory: m, log, tag }),
    log,
    enabled: true,
  });
  m.close();
  if (r.emotion !== '生气' && r.intent !== '试探') throw new Error(`反讽读成 ${r.emotion}/${r.intent}`);
  return `${r.emotion}/${r.intent}（${r.source}）`;
});

// ── F. 切分 ────────────────────────────────────────────────
await test('切分·硬断/软断/标点', () => {
  const a = splitIntoBursts('突然说旅游|||你是不是有安排|||去哪', { maxSegments: 4 });
  if (a.length !== 3) throw new Error('||| 没切开：' + a.length);
  const b = splitIntoBursts('嗯。', { maxSegments: 4 });
  if (b.length !== 1) throw new Error('单词被切碎');
  const c = splitIntoBursts('我当然是人类啊，男朋友', { maxSegments: 4 })[0];
  if (/[，。]/.test(c)) throw new Error('标点没洗干净：' + c);
  const d = splitIntoBursts('（笑）行吧', { maxSegments: 4 });
  if (d.some((x) => x.includes('（'))) throw new Error('括号旁白没清');
  return `3/1/${c.length} 字`;
});

// ── G. 重复检测 ────────────────────────────────────────────
await test('重复检测', () => {
  const recent = ['你问两遍我有点慌', '这一下有点吓人'];
  if (!looksRepeated('你问三遍我有点慌', recent).repeated) throw new Error('近义改写没抓到');
  if (looksRepeated('在改稿子 第三版了', recent).repeated) throw new Error('误判');
  if (similarity('abc', 'abc') !== 1) throw new Error('相同文本相似度应为 1');
  return '近义捕获 + 无误判';
});

// ── H. 记忆 ────────────────────────────────────────────────
await test('记忆·读写与摘要', async () => {
  fs.rmSync('data/_st2.db', { force: true });
  const m = new Memory('data/_st2.db');
  m.ensureUser('t', '测试');
  for (let i = 0; i < 30; i++) m.addMessage('t', i % 2 ? 'assistant' : 'user', '第 ' + i + ' 条：周末想去爬山，你说去奥森');
  const recent = m.recentMessages('t', 8);
  if (recent.length !== 16) throw new Error('最近消息数量不对：' + recent.length);
  const sum = await maybeSummarize({
    memory: m,
    qq: 't',
    chatFn: (msgs, tag) => chat(msgs, { qq: 't', memory: m, log, tag }),
    log,
  });
  if (!sum) throw new Error('摘要没生成');
  const block = summaryBlock(m, 't');
  if (!block.includes('摘要')) throw new Error('摘要没进 prompt 块');
  if (Number(m.getState('t', 'lastSummaryMsgId')) < 20) throw new Error('摘要水位没记录');
  m.close();
  fs.rmSync('data/_st2.db', { force: true });
  return `${sum.length} 字摘要`;
});

// ── I. 表情包 ──────────────────────────────────────────────
await test('表情包·加载与选择', () => {
  const list = loadStickers('stickers');
  if (list.length < 40) throw new Error('表情包太少：' + list.length);
  const cats = [...new Set(list.map((s) => s.category))];
  if (cats.length < 8) throw new Error('分类太少：' + cats.join(','));
  for (const [text, cat] of [
    ['哈哈哈哈', '好笑'],
    ['好累啊', '累困'],
    ['抱抱', '撒娇'],
  ]) {
    if (classifyCategory(text) !== cat) throw new Error(`「${text}」分类错：${classifyCategory(text)}`);
  }
  const pick = pickByCategory(list, '撒娇', []);
  if (!pick) throw new Error('挑不到图');
  const { text, tags } = extractStickerTags('笑死\n[fig:好笑]');
  if (!tags.length || text.includes('fig')) throw new Error('标签没抠干净');
  return `${list.length} 张 / ${cats.length} 类`;
});

// ── J. 语音 ────────────────────────────────────────────────
await test('语音·合成与文件头', async () => {
  const v = await synthesize('欸，你听得到我说话吗？', {
    engine: 'bailian',
    voice: config.voiceName,
    bailianKey: config.bailianKey,
    bailianBase: config.bailianBase,
    emotion: 'neutral',
  });
  const buf = fs.readFileSync(v.filePath);
  if (buf.length < 2048) throw new Error('音频太小');
  if (v.filePath.endsWith('.wav')) {
    const riff = buf.toString('ascii', 0, 4);
    if (riff !== 'RIFF') throw new Error('wav 头不对');
    const riffSize = buf.readUInt32LE(4);
    if (riffSize > buf.length) throw new Error(`RIFF 长度仍是假的：${riffSize}`);
  }
  return `${v.engine} ${Math.round(v.bytes / 1024)}KB`;
});

// ── K. 图片 ────────────────────────────────────────────────
await test('图片·本地文件转 dataURL', async () => {
  // 从库里动态取第一张图（库换过好几版，别写死文件名）
  const idxRaw = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8').replace(/^\uFEFF/, ''));
  const first = (idxRaw.stickers || []).find((s) => s.type !== 'text' && s.file);
  if (!first) throw new Error('库里没有图片');
  const p = path.resolve('stickers', first.file);
  const { dataUrl, bytes } = await loadImage(p, 5 * 1024 * 1024);
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('dataURL 前缀不对');
  if (bytes < 100) throw new Error('图片太小');
  return `${Math.round(bytes / 1024)}KB`;
});

// ── L. HTTP 后台 ───────────────────────────────────────────
await test('后台·接口与静态页', async () => {
  // 后台没在跑就跳过（自检不负责拉起服务）
  const port = Number(process.env.WEB_PORT) || config.webPort || 3870;
  const alive = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).then(() => true).catch(() => false);
  if (!alive) return `跳过（${port} 没在监听，先启动一次再测）`;
  const token = fs.readFileSync('data/web-token', 'utf8').trim();
  const state = await fetch(`http://127.0.0.1:${port}/api/state?token=${token}`).then((r) => r.json());
  if (!state.modules || state.modules.length < 4) throw new Error('模块数量不对');
  const bad401 = await fetch(`http://127.0.0.1:${port}/api/state?token=wrong`).then((r) => r.status);
  if (bad401 !== 401) throw new Error('错误 token 没被拒：' + bad401);
  const html = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
  if (!html.includes('<div id="root">')) throw new Error('静态页没构建');
  return `${state.modules.length} 个模块，鉴权正常`;
});

closeVoice();

// ── 结果 ───────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('\n=== 自检结果 ===');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
