/**
 * 语音合成，三条路（按 auto 的优先级）：
 *   bailian —— 阿里云百炼 qwen3-tts-flash，付费但稳定、音色自然（推荐）
 *   edge    —— 微软 Edge 朗读接口，免 key、音质好，但会被限流
 *   sapi    —— Windows 自带语音（Huihui），离线兜底，音质一般
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { synth as synthQwenAudio, EMOTION_INSTRUCTION, EMOTION_RATE, EMOTION_TAG } from './tts-dashscope.mjs';
import { config as appConfig } from './config.mjs';

// 哪些情绪用「俏皮」那个音色（默认音色更温柔，这两个场景需要更活）
const PLAYFUL_MOODS = new Set(['撒娇', '调侃', '开心']);

const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 复用同一个 WebSocket，别每次都新建连接（新建频繁会被限流） */
let shared = null;
async function getEdge(voice) {
  if (!shared) {
    shared = new MsEdgeTTS();
    await shared.setMetadata(voice, FORMAT);
  }
  return shared;
}
function dropEdge() {
  try {
    shared?.close();
  } catch {
    /* 忽略 */
  }
  shared = null;
}

function clean(text) {
  return String(text || '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edge TTS → mp3 */
async function synthEdge(text, { voice, rate, pitch, dir }) {
  const tmpDir = path.join(dir, `.tmp-${uid()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  try {
    const tts = await getEdge(voice);
    const { audioFilePath } = await tts.toFile(tmpDir, text, { rate: rate ?? 0, pitch: pitch ?? 0 });
    const finalPath = path.join(dir, `v-${uid()}.mp3`);
    await fs.rename(audioFilePath, finalPath);
    const stat = await fs.stat(finalPath);
    if (stat.size < 1024) throw new Error('合成结果太小');
    return { filePath: finalPath, bytes: stat.size, engine: 'edge' };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** MiniMax（百炼托管）：支持 emotion，返回 base64 mp3 */
async function synthMinimax(text, { voiceId, dir, apiKey, baseUrl, emotion }) {
  const body = {
    model: 'MiniMax/speech-2.8-hd',
    input: {
      text,
      voice_setting: {
        voice_id: voiceId || 'female-shaonv',
        ...(emotion ? { emotion } : {}),
      },
    },
  };
  const res = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  const b64 = data?.output?.data?.audio;
  if (!b64) {
    const msg = data?.output?.base_resp?.status_msg || JSON.stringify(data).slice(0, 200);
    throw new Error(`MiniMax TTS 失败：${msg}`);
  }
  // MiniMax 这里返回的是 hex 而不是 base64（'494433' 就是 'ID3' 的十六进制）
  const buf = Buffer.from(b64, 'hex');
  if (buf.length < 1024) throw new Error('MiniMax 返回的音频太小');

  const finalPath = path.join(dir, `v-${uid()}.mp3`);
  await fs.writeFile(finalPath, buf);
  return {
    filePath: finalPath,
    bytes: buf.length,
    engine: 'minimax',
    characters: data?.usage?.characters ?? text.length,
  };
}
/** 回复情绪 → TTS emotion 参数（MiniMax 用英文枚举） */
export function emotionFor(text) {
  const t = String(text || '');
  if (/(生气|讨厌|烦死|滚|气死|不理你)/.test(t)) return 'angry';
  if (/(难过|委屈|想哭|难受|不(太)?想(说话|聊)|没力气|算了|随便吧|心累)/.test(t)) return 'sad';
  if (/(真的假的|居然|什么？！|啊？|天呐)/.test(t)) return 'surprised';
  if (/(哈哈|笑死|开心|好耶|太好了|棒|绝了)/.test(t)) return 'happy';
  return 'neutral';
}
/** 修掉"流式 wav"的假长度字段（0x7FFFFFFF），否则转码端会把结尾切掉 */
function normalizeWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  const out = Buffer.from(buf);
  out.writeUInt32LE(out.length - 8, 4); // RIFF chunk size
  // 找 data 块，写真实长度
  let i = 12;
  while (i + 8 <= out.length) {
    const id = out.toString('ascii', i, i + 4);
    const size = out.readUInt32LE(i + 4);
    if (id === 'data') {
      out.writeUInt32LE(out.length - (i + 8), i + 4);
      break;
    }
    i += 8 + size + (size % 2);
  }
  return out;
}

/** 尾部补静音（毫秒），给最后一个字留收音空间 */
function padSilence(buf, ms) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  // 从 fmt 块里读采样参数
  let ch = 1;
  let sr = 24000;
  let bps = 16;
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') {
      ch = buf.readUInt16LE(i + 10);
      sr = buf.readUInt32LE(i + 12);
      bps = buf.readUInt16LE(i + 22);
      break;
    }
    i += 8 + size + (size % 2);
  }
  const bytes = Math.round(((sr * ch * bps) / 8) * (ms / 1000));
  if (bytes <= 0) return buf;
  const out = Buffer.concat([buf, Buffer.alloc(bytes, 0)]);
  return normalizeWav(out);
}
/** 阿里云百炼 qwen3-tts-flash → wav */
async function synthBailian(text, { voice, dir, apiKey, baseUrl, rate, pitch, timeoutMs = 8000 }) {
  const res = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: { text, voice },
      ...(rate || pitch ? { parameters: { ...(rate ? { rate } : {}), ...(pitch ? { pitch } : {}) } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`百炼 TTS ${res.status}：${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.output?.audio?.url;
  if (!url) throw new Error('百炼没返回音频地址：' + JSON.stringify(data).slice(0, 200));

  const audio = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!audio.ok) throw new Error(`下载音频失败 ${audio.status}`);
  let buf = Buffer.from(await audio.arrayBuffer());
  if (buf.length < 1024) throw new Error('下载到的音频太小');

  // 百炼返回的是"流式 wav"：RIFF 和 data 的长度字段都是 0x7FFFFFFF。
  // ffmpeg/NapCat 据此会算错时长，转 silk 时把结尾截掉——听起来就是"最后一个字没发完"。
  // 这里把真实长度写回头部，并在尾部补一小段静音，让最后一个字的收音有地方落。
  buf = normalizeWav(buf);
  buf = padSilence(buf, 180);

  const finalPath = path.join(dir, `v-${uid()}.wav`);
  await fs.writeFile(finalPath, buf);
  return {
    filePath: finalPath,
    bytes: buf.length,
    engine: 'bailian',
    characters: data?.usage?.characters ?? text.length,
  };
}
/** Windows SAPI → wav（离线兜底） */
async function synthSapi(text, { dir, sapiVoice }) {
  const wav = path.join(dir, `v-${uid()}.wav`);
  const txt = path.join(dir, `.say-${uid()}.txt`);
  await fs.writeFile(txt, text, 'utf8');
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
${sapiVoice ? `try { $s.SelectVoice('${sapiVoice}') } catch {}` : ''}
$s.Rate = 1
$s.SetOutputToWaveFile('${wav.replace(/\\/g, '\\\\')}')
$s.Speak([IO.File]::ReadAllText('${txt.replace(/\\/g, '\\\\')}', [Text.Encoding]::UTF8))
$s.Dispose()
`;
  try {
    await new Promise((resolve, reject) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
        windowsHide: true,
      });
      let err = '';
      p.stderr.on('data', (b) => (err += b.toString()));
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `SAPI 退出码 ${code}`))));
      p.on('error', reject);
    });
    const stat = await fs.stat(wav);
    if (stat.size < 1024) throw new Error('SAPI 输出太小');
    return { filePath: wav, bytes: stat.size, engine: 'sapi' };
  } finally {
    await fs.rm(txt, { force: true }).catch(() => {});
  }
}

/**
 * @param {string} text
 * @param {object} opts { voice, sapiVoice, engine: 'auto'|'edge'|'sapi', dir, rate, pitch }
 */
export async function synthesize(text, opts = {}) {
  const content = clean(text);
  if (!content) throw new Error('没有要念的内容');

  const dir = path.resolve(opts.dir || 'data/voice');
  await fs.mkdir(dir, { recursive: true });

  const engine = opts.engine || 'auto';
  const voice = opts.voice || 'zh-CN-XiaoxiaoNeural';
  const order =
    engine === 'auto' ? ['bailian', 'edge', 'sapi'] : [engine];
  let lastErr;

  for (const eng of order) {
    try {
      if (eng === 'bailian') {
        if (!opts.bailianKey) throw new Error('没配 DASHSCOPE_API_KEY');
        // 首次请求偶尔会卡住（冷启动），给一次重试
        let lastBailianErr;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const prosody = prosodyFor(opts.emotion);
            return await synthBailian(content, {
              voice: opts.voice || 'Cherry',
              dir,
              apiKey: opts.bailianKey,
              baseUrl: opts.bailianBase || 'https://dashscope.aliyuncs.com',
              rate: opts.rate ?? prosody.rate,
              timeoutMs: opts.timeoutMs || 8000,
              pitch: opts.pitch ?? prosody.pitch,
            });
          } catch (e) {
            lastBailianErr = e;
            if (attempt === 0) await sleep(400);
          }
        }
        throw lastBailianErr;
      }
      if (eng === 'minimax') {
        if (!opts.bailianKey) throw new Error('没配 DASHSCOPE_API_KEY');
        return await synthMinimax(content, {
          voiceId: opts.minimaxVoice || 'female-shaonv',
          dir,
          apiKey: opts.bailianKey,
          baseUrl: opts.bailianBase || 'https://dashscope.aliyuncs.com',
          emotion: opts.emotion,
        });
      }
      if (eng === 'qwen-audio') {
        if (!opts.bailianKey) throw new Error('没配 DASHSCOPE_API_KEY');
        const playful = PLAYFUL_MOODS.has(opts.emotion);
        // 调用方可能没传这些（比如预热、试听），统一回退到全局配置
        const qwenVoice = opts.qwenVoice ?? appConfig.qwenVoice;
        const qwenVoiceAlt = opts.qwenVoiceAlt ?? appConfig.qwenVoiceAlt;
        const qwenVoiceCustom = opts.qwenVoiceCustom ?? appConfig.qwenVoiceCustom;
        const voiceId = qwenVoiceCustom || (playful ? qwenVoiceAlt : qwenVoice);
        // 情绪表达：默认用官方标签（比"用撒娇的语气说"这种元描述更准），
        // 指令只在没标签时兜底。
        const tag = EMOTION_TAG[opts.emotion] || '';
        const tagsOn = opts.voiceUseTags ?? appConfig.voiceUseTags ?? true;
        const useTag = tagsOn !== false && tag && !content.trim().startsWith('[');
        const ttsText = useTag ? `${tag}${content}` : content;
        const instruction = useTag ? '' : EMOTION_INSTRUCTION[opts.emotion] || '用平常聊天的语气，自然一点';
        // 情绪决定快慢：基础语速 × 情绪倍率（可在后台关掉）
        const baseRate = opts.voiceRate ?? appConfig.voiceRate ?? 1;
        const byEmotion = opts.voiceRateByEmotion ?? appConfig.voiceRateByEmotion ?? true;
        const moodRate = byEmotion === false ? 1 : EMOTION_RATE[opts.emotion] ?? 1;
        const rate = Math.min(2, Math.max(0.5, baseRate * moodRate));
        const r = await synthQwenAudio({
          model: opts.qwenModel || appConfig.voiceModel || 'qwen-audio-3.1-tts-flash',
          voice: voiceId,
          text: ttsText,
          instruction,
          format: 'wav',
          rate,
          key: opts.bailianKey,
        });
        const file = path.join(dir, `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.wav`);
        await fs.writeFile(file, r.buf);
        return { filePath: file, bytes: r.buf.length, engine: 'qwen-audio', voice: voiceId, ms: r.ms };
      }
      if (eng === 'edge') {
        return await synthEdge(content, { voice, rate: opts.rate, pitch: opts.pitch, dir });
      }
      if (eng === 'sapi') {
        return await synthSapi(content, { dir, sapiVoice: opts.sapiVoice });
      }
      throw new Error(`未知引擎：${eng}`);
    } catch (e) {
      lastErr = e;
      if (eng === 'edge') dropEdge();
      if (engine !== 'auto') throw e;
      await sleep(300);
    }
  }

  throw lastErr || new Error('语音合成失败');
}

/** 保留最近 keep 个语音文件 */
export async function pruneVoiceFiles(dir = 'data/voice', keep = 40) {
  const abs = path.resolve(dir);
  let files;
  try {
    files = await fs.readdir(abs);
  } catch {
    return 0;
  }
  const stats = await Promise.all(
    files
      .filter((f) => /\.(mp3|wav)$/.test(f))
      .map(async (f) => ({ f, t: (await fs.stat(path.join(abs, f))).mtimeMs })),
  );
  stats.sort((a, b) => b.t - a.t);
  let removed = 0;
  for (const s of stats.slice(keep)) {
    await fs.rm(path.join(abs, s.f), { force: true });
    removed += 1;
  }
  return removed;
}

/** 退出时收拾连接 */
export function closeVoice() {
  dropEdge();
}

/** 情绪 → 语速/音高（qwen3-tts 支持 parameters.rate / pitch，实测生效） */
export function prosodyFor(emotion) {
  switch (emotion) {
    case 'happy':
      return { rate: 1.08, pitch: 1.03 };
    case 'sad':
      return { rate: 0.92, pitch: 0.97 };
    case 'angry':
      return { rate: 1.05, pitch: 1.02 };
    case 'surprised':
      return { rate: 1.06, pitch: 1.04 };
    default:
      return { rate: 1.0, pitch: 1.0 };
  }
}