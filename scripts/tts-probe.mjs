/**
 * 百炼实时语音合成（WebSocket）—— 支持情感标签和自然语言指令。
 *
 *   node --env-file=.env scripts/tts-probe.mjs
 *
 * 用途：验证 qwen-audio / cosyvoice 在你这台机器上能不能跑通，并把样音落盘。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const KEY = process.env.DASHSCOPE_API_KEY;
const OUT = path.resolve('data/tts-probe');
fs.mkdirSync(OUT, { recursive: true });

const URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

/**
 * 合成一段文本，返回 mp3/wav 字节
 */
export function synth({ model, voice, text, instruction = '', format = 'mp3', sampleRate = 24000, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const taskId = crypto.randomUUID().replace(/-/g, '');
    const ws = new WebSocket(URL, { headers: { Authorization: `bearer ${KEY}` } });
    const chunks = [];
    let settled = false;
    let started = false;

    const done = (err, buf) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve(buf);
    };

    const timer = setTimeout(() => done(new Error(`超时 ${timeoutMs}ms（收到 ${chunks.length} 帧）`)), timeoutMs);

    const params = {
      text_type: 'PlainText',
      format,
      sample_rate: sampleRate,
      volume: 50,
      rate: 1,
      pitch: 1,
    };
    if (voice) params.voice = voice;
    if (instruction) params.instruction = instruction;

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model,
            parameters: params,
            input: {},
          },
        }),
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary || Buffer.isBuffer(data)) {
        chunks.push(Buffer.from(data));
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      const ev = msg?.header?.event;
      const name = ev === 'task-failed' ? 'task-failed' : ev;
      if (name === 'task-started' && !started) {
        started = true;
        ws.send(
          JSON.stringify({
            header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: { text } },
          }),
        );
        ws.send(
          JSON.stringify({
            header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: {} },
          }),
        );
        return;
      }
      if (name === 'task-finished') {
        done(null, Buffer.concat(chunks));
        return;
      }
      if (name === 'task-failed') {
        done(new Error(`合成失败：${msg?.header?.error_code || ''} ${msg?.header?.error_message || JSON.stringify(msg).slice(0, 200)}`));
      }
    });

    ws.on('error', (e) => done(new Error(`WebSocket 错误：${e.message}`)));
    ws.on('close', () => {
      if (!settled) done(null, Buffer.concat(chunks));
    });
  });
}

// ---------------- 直接运行：探测几个模型 ----------------
if (import.meta.url === `file:///${process.cwd().replace(/\\/g, '/')}/scripts/tts-probe.mjs`.replace(/^file:\/\/\//, 'file:///')) {
  const CASES = [
    {
      name: 'qwen-audio 带情感标签',
      model: 'qwen-audio-3.1-tts-flash',
      voice: 'longanhuan_v3.1',
      text: '[tired]我今天不想说话。[sighing]',
    },
    {
      name: 'qwen-audio 带指令',
      model: 'qwen-audio-3.1-tts-flash',
      voice: 'longanhuan_v3.1',
      text: '你终于回我了',
      instruction: '用撒娇的语气，语速慢一点，尾音上扬',
    },
    {
      name: 'cosyvoice-v3-flash 系统音色',
      model: 'cosyvoice-v3-flash',
      voice: 'longanyang',
      text: '我在楼下买咖啡',
    },
    {
      name: 'qwen3-tts-flash 对照（无情感）',
      model: 'qwen3-tts-flash',
      voice: 'Cherry',
      text: '你终于回我了',
    },
  ];

  for (const c of CASES) {
    const t0 = Date.now();
    try {
      const buf = await synth(c);
      const file = path.join(OUT, `${c.model}-${Date.now()}.mp3`);
      fs.writeFileSync(file, buf);
      console.log(`  ✓ ${c.name}  ${Math.round(buf.length / 1024)}KB  ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`  ✗ ${c.name}  ${e.message.slice(0, 160)}`);
    }
  }
}
