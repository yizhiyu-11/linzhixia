/**
 * 客观分析生成的语音：时长、语速、音高（中位数 F0）、音高起伏、能量。
 *
 *   node scripts/tts-analyze.mjs [目录]
 *
 * 只处理 16-bit PCM 的 wav。目的是把"听起来有什么不一样"变成数字。
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'data/tts-ab2');

/** 解析 RIFF/WAVE */
function readWav(buf) {
  if (buf.slice(0, 4).toString('latin1') !== 'RIFF' || buf.slice(8, 12).toString('latin1') !== 'WAVE') {
    throw new Error('不是 wav');
  }
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // 流式 wav 的长度字段可能是 0x7FFFFFFF，按实际剩余取
      const avail = buf.length - body;
      if (size > avail || size === 0 || size === 0x7fffffff) size = avail;
      data = buf.slice(body, body + size);
    }
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('缺 fmt/data');
  if (fmt.audioFormat !== 1) throw new Error(`不是 PCM（format=${fmt.audioFormat}）`);
  if (fmt.bits !== 16) throw new Error(`不是 16bit（${fmt.bits}）`);
  return { ...fmt, samples: new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2)) };
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))];
};

const median = (a) => pct(a, 50);

/** 逐帧估算 F0（自相关），返回有声音帧的 F0 序列 */
function f0Track(samples, sampleRate, frameMs = 40, hopMs = 20) {
  const frame = Math.round((frameMs / 1000) * sampleRate);
  const hop = Math.round((hopMs / 1000) * sampleRate);
  const minLag = Math.floor(sampleRate / 500); // 最高 500Hz
  const maxLag = Math.floor(sampleRate / 70); // 最低 70Hz
  const out = [];
  const energies = [];

  for (let start = 0; start + frame < samples.length; start += hop) {
    // 去直流 + 能量
    let mean = 0;
    for (let i = 0; i < frame; i++) mean += samples[start + i];
    mean /= frame;
    let energy = 0;
    for (let i = 0; i < frame; i++) {
      const v = samples[start + i] - mean;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / frame);
    energies.push(rms);
    if (rms < 200) continue; // 静音

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let n = 0;
      for (let i = 0; i + lag < frame; i += 2) {
        corr += (samples[start + i] - mean) * (samples[start + i + lag] - mean);
        n++;
      }
      corr /= n;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    // 归一化相关度太低就当无音
    const rmsFrame = rms * rms;
    if (bestLag > 0 && bestCorr / rmsFrame > 0.3) out.push(sampleRate / bestLag);
  }
  return { f0: out, energies };
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => /^[0-9X][ABC]-.*\.wav$/i.test(f))
  .sort();

const rows = [];
for (const f of files) {
  const p = path.join(DIR, f);
  try {
    const w = readWav(fs.readFileSync(p));
    const dur = w.samples.length / w.sampleRate / w.channels;
    const { f0, energies } = f0Track(w.samples, w.sampleRate);
    const voicedF0 = f0.filter((x) => x >= 70 && x <= 500);
    rows.push({
      file: f,
      dur: Number(dur.toFixed(2)),
      f0med: Math.round(median(voicedF0)),
      f0p10: Math.round(pct(voicedF0, 10)),
      f0p90: Math.round(pct(voicedF0, 90)),
      f0range: Math.round(pct(voicedF0, 90) - pct(voicedF0, 10)),
      voiced: Math.round((voicedF0.length / Math.max(1, energies.length)) * 100),
    });
  } catch (e) {
    rows.push({ file: f, err: e.message });
  }
}

console.log('文件                     时长   中位F0  F0低   F0高   起伏   有声占比');
console.log('─'.repeat(72));
for (const r of rows) {
  if (r.err) {
    console.log(`${r.file.padEnd(24)} ${r.err}`);
    continue;
  }
  console.log(
    `${r.file.padEnd(24)} ${String(r.dur).padStart(5)}s ${String(r.f0med).padStart(6)} ${String(r.f0p10).padStart(5)} ${String(r.f0p90).padStart(5)} ${String(r.f0range).padStart(6)} ${String(r.voiced).padStart(6)}%`,
  );
}

// 按句子对比同一句三个版本
const byLine = {};
for (const r of rows) {
  const m = r.file.match(/^(\d)([ABC])-/);
  if (!m) continue;
  (byLine[m[1]] ||= {})[m[2]] = r;
}
console.log('\n同一句的差异（A=现用无情绪 / B=指令 / C=标签）');
console.log('─'.repeat(72));
for (const [id, g] of Object.entries(byLine)) {
  const parts = ['A', 'B', 'C'].filter((k) => g[k] && !g[k].err).map((k) => `${k}: ${g[k].dur}s/${g[k].f0med}Hz/起伏${g[k].f0range}`);
  if (parts.length) console.log(`第 ${id} 句  ` + parts.join('   '));
}
