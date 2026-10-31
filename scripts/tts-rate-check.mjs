/**
 * 验证语速参数到底有没有生效：固定情绪，只改 rate，量时长。
 *   node --env-file=.env scripts/tts-rate-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { synth } from '../src/tts-dashscope.mjs';
import { config } from '../src/config.mjs';

const OUT = path.resolve('data/tts-rate');
fs.mkdirSync(OUT, { recursive: true });

function wavInfo(buf) {
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
  const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2));
  // 估算有声时长：30ms 帧，RMS 超过阈值算"在说话"
  const frame = Math.round(rate * 0.03);
  let voiced = 0;
  let total = 0;
  for (let i = 0; i + frame < samples.length; i += frame) {
    let e = 0;
    for (let j = 0; j < frame; j++) e += samples[i + j] * samples[i + j];
    if (Math.sqrt(e / frame) > 200) voiced++;
    total++;
  }
  return { dur: samples.length / rate, speech: (voiced * 0.03), total: total * 0.03 };
}

const text = '你终于回我了';
const voice = 'longanlingxin_v3.1';
console.log('固定情绪「平静」，只改 rate：');
const rows = [];
for (const rate of [0.8, 1.0, 1.25]) {
  const { buf } = await synth({ model: 'qwen-audio-3.1-tts-flash', voice, text, instruction: '用平常聊天的语气，自然放松', format: 'wav', rate });
  const info = wavInfo(buf);
  rows.push({ rate, ...info });
  console.log(`  rate ${rate.toFixed(2)} → 总长 ${info.dur.toFixed(2)}s，有声 ${info.speech.toFixed(2)}s`);
}

const base = rows.find((r) => r.rate === 1.0);
console.log('\n相对 1.0 的时长比（越小=越快）：');
for (const r of rows) {
  console.log(`  rate ${r.rate.toFixed(2)} → 总长 ×${(r.dur / base.dur).toFixed(2)}，有声 ×${(r.speech / base.speech).toFixed(2)}`);
}
