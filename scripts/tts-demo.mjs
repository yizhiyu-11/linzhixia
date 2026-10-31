/**
 * 现状样本：完全走线上那条链路（标签 + 情绪音色 + 情绪语速）。
 *
 *   node --env-file=.env scripts/tts-demo.mjs [--send]
 */
import fs from 'node:fs';
import path from 'node:path';
import { synthesize } from '../src/voice.mjs';
import { config } from '../src/config.mjs';
import { EMOTION_RATE, EMOTION_TAG } from '../src/tts-dashscope.mjs';

const OWNER = process.env.OWNER_QQ || config.allowedQqs?.[0] || '';
const OUT = path.resolve('data/tts-demo');
fs.mkdirSync(OUT, { recursive: true });

// 台词按"她真的会说的话"来写，带语气词
const LINES = [
  { mood: '撒娇', text: '你终于回我了' },
  { mood: '开心', text: '我抢到票了' },
  { mood: '难过', text: '我今天不想说话' },
  { mood: '生气', text: '你再说一遍试试' },
  { mood: '调侃', text: '就你这点出息' },
  { mood: '平静', text: '我在楼下买咖啡' },
];

const dur = (buf) => {
  let off = 12;
  let rate = 24000;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') rate = buf.readUInt32LE(body + 4);
    else if (id === 'data') {
      const avail = buf.length - body;
      if (size > avail || size === 0 || size === 0x7fffffff) size = avail;
      data = buf.slice(body, body + size);
    }
    off = body + size + (size % 2);
  }
  return data ? data.length / 2 / rate : 0;
};

const results = [];
for (const line of LINES) {
  try {
    const v = await synthesize(line.text, {
      engine: 'qwen-audio',
      bailianKey: config.bailianKey,
      emotion: line.mood,
      qwenVoice: config.qwenVoice,
      qwenVoiceAlt: config.qwenVoiceAlt,
      qwenVoiceCustom: config.qwenVoiceCustom,
      voiceUseTags: config.voiceUseTags,
      voiceRate: config.voiceRate,
      voiceRateByEmotion: config.voiceRateByEmotion,
      dir: OUT,
    });
    const buf = fs.readFileSync(v.filePath);
    console.log(`  ${line.mood}  ${dur(buf).toFixed(2)}s  ×${EMOTION_RATE[line.mood]}  ${EMOTION_TAG[line.mood] || '(无标签)'}  ${v.voice}`);
    results.push({ ...line, ...v, dur: dur(buf) });
  } catch (e) {
    console.log(`  ${line.mood} 失败：${e.message.slice(0, 100)}`);
  }
}

if (process.argv.includes('--send') && OWNER && results.length) {
  const { OneBot } = await import('../src/onebot.mjs');
  const { createLogger } = await import('../src/logger.mjs');
  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });
  bot.start();
  for (let i = 0; i < 80 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await bot.sendPrivate(OWNER, '现在的效果（标签 + 情绪音色 + 情绪语速）：');
  await sleep(500);
  for (const r of results) {
    await bot.sendPrivate(OWNER, `${r.mood}｜${r.text}`);
    await sleep(300);
    try {
      await bot.sendRecord(OWNER, r.filePath);
    } catch (e) {
      console.log(`  发送失败 ${r.mood}: ${e.message}`);
    }
    await sleep(700);
  }
  bot.stop();
  console.log('已发到 QQ');
}
