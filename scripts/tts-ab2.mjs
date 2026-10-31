/**
 * 语音对比第二轮：百炼的"带情绪"能力到底行不行。
 *
 *   node --env-file=.env scripts/tts-ab2.mjs          只生成
 *   node --env-file=.env scripts/tts-ab2.mjs --send   生成并发到 QQ
 *
 * 三组：
 *   A. qwen3-tts-flash        现在用的，只能选音色（基准）
 *   B. qwen-audio + 指令       自然语言"用撒娇的语气说"
 *   C. qwen-audio + 标签       [tired] 这类标签直接写进文本
 */
import fs from 'node:fs';
import path from 'node:path';
import { synth, EMOTION_INSTRUCTION, EMOTION_TAG } from '../src/tts-dashscope.mjs';
import { synthesize } from '../src/voice.mjs';
import { config } from '../src/config.mjs';

const KEY = process.env.DASHSCOPE_API_KEY;
const OWNER = process.env.OWNER_QQ || config.allowedQqs?.[0] || '';
const OUT = path.resolve('data/tts-ab2');
fs.mkdirSync(OUT, { recursive: true });

const QWEN_AUDIO = { model: 'qwen-audio-3.1-tts-flash', voice: 'longanhuan_v3.1' };
const COSY = { model: 'cosyvoice-v3-flash', voice: 'longanyang' };

const LINES = [
  { id: '1', mood: '撒娇', text: '你终于回我了' },
  { id: '2', mood: '难过', text: '我今天不想说话' },
  { id: '3', mood: '生气', text: '你再说一遍试试' },
  { id: '4', mood: '平静', text: '我在楼下买咖啡' },
  { id: '5', mood: '调侃', text: '就你这点出息' },
];

const results = [];
const kb = (p) => Math.round(fs.statSync(p).size / 1024);

for (const line of LINES) {
  console.log(`\n第 ${line.id} 句（${line.mood}）：${line.text}`);

  // A. 现状基准：qwen3-tts-flash（无情绪）
  try {
    const r = await synthesize(line.text, {
      engine: 'bailian',
      bailianKey: KEY,
      bailianBase: config.bailianBase,
      voice: config.voiceName || 'Chelsie',
      dir: OUT,
    });
    const src = typeof r === 'string' ? r : r.filePath || r.file;
    const dest = path.join(OUT, `${line.id}A-qwen3tts.wav`);
    fs.copyFileSync(src, dest);
    console.log(`  A 现状  ${kb(dest)}KB`);
    results.push({ line, tag: 'A', label: '现在用的（无情绪）', file: dest });
  } catch (e) {
    console.log(`  A 失败：${e.message.slice(0, 100)}`);
  }

  // B. 指令版
  try {
    const { buf, ms } = await synth({ ...QWEN_AUDIO, format: 'wav', text: line.text, instruction: EMOTION_INSTRUCTION[line.mood] });
    const dest = path.join(OUT, `${line.id}B-instruction.wav`);
    fs.writeFileSync(dest, buf);
    console.log(`  B 指令  ${kb(dest)}KB  ${ms}ms`);
    results.push({ line, tag: 'B', label: `指令：${EMOTION_INSTRUCTION[line.mood]}`, file: dest });
  } catch (e) {
    console.log(`  B 失败：${e.message.slice(0, 100)}`);
  }

  // C. 标签版（标签只在 qwen-audio 上有效）
  try {
    const tag = EMOTION_TAG[line.mood] || '';
    const { buf, ms } = await synth({ ...QWEN_AUDIO, format: 'wav', text: `${tag}${line.text}` });
    const dest = path.join(OUT, `${line.id}C-tag.wav`);
    fs.writeFileSync(dest, buf);
    console.log(`  C 标签  ${kb(dest)}KB  ${ms}ms  ${tag || '(无)'}`);
    results.push({ line, tag: 'C', label: `标签 ${tag || '无'}`, file: dest });
  } catch (e) {
    console.log(`  C 失败：${e.message.slice(0, 100)}`);
  }
}

// 额外：cosyvoice 的声音（可选音色对比）
try {
  const { buf } = await synth({ ...COSY, format: 'wav', text: '我在楼下买咖啡' });
  const dest = path.join(OUT, 'X-cosyvoice-v3.wav');
  fs.writeFileSync(dest, buf);
  console.log(`\nX cosyvoice-v3-flash  ${kb(dest)}KB（另一个音色，参考用）`);
  results.push({ line: { id: 'X', mood: '参考' }, tag: 'X', label: 'cosyvoice v3 音色', file: dest });
} catch (e) {
  console.log('X 失败：', e.message.slice(0, 100));
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results.map((r) => ({ id: r.line.id, mood: r.line.mood, tag: r.tag, label: r.label, file: path.basename(r.file) })), null, 2), 'utf8');
console.log(`\n共 ${results.length} 个文件 → ${OUT}`);

if (process.argv.includes('--send') && OWNER) {
  const { OneBot } = await import('../src/onebot.mjs');
  const { createLogger } = await import('../src/logger.mjs');
  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });
  bot.start();
  for (let i = 0; i < 80 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const line of LINES) {
    const items = results.filter((r) => r.line.id === line.id);
    if (!items.length) continue;
    await bot.sendPrivate(OWNER, `第 ${line.id} 句 · ${line.mood}：「${line.text}」`);
    await sleep(500);
    for (const it of items) {
      try {
        await bot.sendRecord(OWNER, it.file);
        await sleep(800);
      } catch (e) {
        console.log(`  发送失败 ${it.tag}：${e.message}`);
      }
    }
  }
  bot.stop();
  console.log('已发到 QQ');
}
