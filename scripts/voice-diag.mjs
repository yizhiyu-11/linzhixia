/**
 * 诊断语音：合成一句，量时长，判断有没有被截断。
 * node --env-file=.env scripts/voice-diag.mjs
 */
import fs from 'node:fs';
import { config } from '../src/config.mjs';
import { synthesize, closeVoice } from '../src/voice.mjs';

/** 读 wav 头算时长 */
function wavInfo(buf) {
  if (buf.length < 44) return null;
  let i = 12;
  let fmt = null;
  let dataLen = null;
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') {
      const ch = buf.readUInt16LE(i + 10);
      const sr = buf.readUInt32LE(i + 12);
      const bps = buf.readUInt16LE(i + 22);
      fmt = { ch, sr, bps };
    } else if (id === 'data') {
      dataLen = size;
      break;
    }
    i += 8 + size + (size % 2);
  }
  if (!fmt || dataLen == null) return null;
  const bytesPerSec = (fmt.sr * fmt.ch * fmt.bps) / 8;
  return { seconds: dataLen / bytesPerSec, ...fmt };
}

const samples = [
  '欸 你今天怎么这么安静',
  '我刚洗完澡 头发还在滴水 你先说',
  '那你早点睡吧 明天还要上班呢 别熬了',
];

for (const text of samples) {
  try {
    const v = await synthesize(text, {
      voice: config.voiceName,
      engine: 'bailian',
      bailianKey: config.bailianKey,
      bailianBase: config.bailianBase,
    });
    const buf = fs.readFileSync(v.filePath);
    const info = v.filePath.endsWith('.wav') ? wavInfo(buf) : null;
    const expect = text.replace(/\s/g, '').length / 4.5; // 中文约 4.5 字/秒
    console.log(
      `「${text}」\n  文件 ${(v.bytes / 1024).toFixed(0)}KB  时长 ${
        info ? info.seconds.toFixed(2) : '?'
      }s  预期约 ${expect.toFixed(2)}s  采样率 ${info?.sr ?? '?'}  ${info?.ch ?? '?'}ch`,
    );
  } catch (e) {
    console.log(`「${text}」失败：${e.message}`);
  }
}
closeVoice();
