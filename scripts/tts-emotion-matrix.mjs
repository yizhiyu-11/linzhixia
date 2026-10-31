/**
 * 情绪表达方式对比：同一句，只改"怎么让它撒娇"。
 *
 *   node --env-file=.env scripts/tts-emotion-matrix.mjs [--send]
 */
import fs from 'node:fs';
import path from 'node:path';
import { synth } from '../src/tts-dashscope.mjs';
import { config } from '../src/config.mjs';

const OWNER = process.env.OWNER_QQ || config.allowedQqs?.[0] || '';
const OUT = path.resolve('data/tts-matrix');
fs.mkdirSync(OUT, { recursive: true });

const MODEL = 'qwen-audio-3.1-tts-flash';
const V1 = 'longanlingxin_v3.1'; // 知心温暖
const V4 = 'qiaoxiaojiao_v3.1'; // 俏丽可爱

// 每一种都是"怎么让它撒娇"的不同思路
const CASES = [
  {
    id: 'A',
    label: '现在的做法：指令 + 慢速 0.92',
    voice: V4,
    text: '你终于回我了',
    instruction: '用撒娇的语气说，带点鼻音，尾音上扬',
    rate: 0.92,
  },
  {
    id: 'B',
    label: '只调速度回 1.0，指令不变',
    voice: V4,
    text: '你终于回我了',
    instruction: '用撒娇的语气说，带点鼻音，尾音上扬',
    rate: 1.0,
  },
  {
    id: 'C',
    label: '用官方情感标签 [mischievously]',
    voice: V4,
    text: '[mischievously]你终于回我了',
    instruction: '',
    rate: 1.0,
  },
  {
    id: 'D',
    label: '标签 + 语气词（波浪号）',
    voice: V4,
    text: '[mischievously]你终于回我了~',
    instruction: '',
    rate: 1.0,
  },
  {
    id: 'E',
    label: '标点造停顿（省略号）',
    voice: V4,
    text: '[mischievously]你终于…回我了',
    instruction: '',
    rate: 1.0,
  },
  {
    id: 'F',
    label: '不撒娇，纯音色基准（对照用）',
    voice: V1,
    text: '你终于回我了',
    instruction: '',
    rate: 1.0,
  },
];

function wavDur(buf) {
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
}

const results = [];
for (const c of CASES) {
  try {
    const { buf, ms } = await synth({
      model: MODEL,
      voice: c.voice,
      text: c.text,
      instruction: c.instruction,
      format: 'wav',
      rate: c.rate,
    });
    const file = path.join(OUT, `${c.id}.wav`);
    fs.writeFileSync(file, buf);
    const dur = wavDur(buf);
    console.log(`  ${c.id} ${c.label.padEnd(28)} ${dur.toFixed(2)}s  ${ms}ms`);
    results.push({ ...c, file, dur });
  } catch (e) {
    console.log(`  ${c.id} 失败：${e.message.slice(0, 100)}`);
  }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results.map((r) => ({ id: r.id, label: r.label, voice: r.voice, text: r.text, dur: Number(r.dur.toFixed(2)) })), null, 2), 'utf8');

if (process.argv.includes('--send') && OWNER && results.length) {
  const { OneBot } = await import('../src/onebot.mjs');
  const { createLogger } = await import('../src/logger.mjs');
  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });
  bot.start();
  for (let i = 0; i < 80 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await bot.sendPrivate(OWNER, '情绪表达对比：同一句「你终于回我了」，6 种让它撒娇的思路。');
  await sleep(600);
  for (const r of results) {
    await bot.sendPrivate(OWNER, `${r.id}　${r.label}`);
    await sleep(350);
    try {
      await bot.sendRecord(OWNER, r.file);
    } catch (e) {
      console.log(`  发送失败 ${r.id}: ${e.message}`);
    }
    await sleep(700);
  }
  bot.stop();
  console.log('已发到 QQ');
}
