/**
 * 试一个模型：node --env-file=.env scripts/tts-try.mjs <model> <voice> "<文本>" [instruction]
 */
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import crypto from 'node:crypto';

const KEY = process.env.DASHSCOPE_API_KEY;
const [model, voice, text, instruction] = process.argv.slice(2);
const OUT = path.resolve('data/tts-try');
fs.mkdirSync(OUT, { recursive: true });

const synth = ({ model, voice, text, instruction = '', format = 'mp3', sampleRate = 22050, timeoutMs = 45000 }) =>
  new Promise((resolve, reject) => {
    const taskId = crypto.randomUUID().replace(/-/g, '');
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: { Authorization: `bearer ${KEY}` },
    });
    const audio = [];
    const events = [];
    let settled = false;
    let started = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve({ buf: Buffer.concat(audio), events });
    };
    const timer = setTimeout(() => finish(new Error(`超时（${audio.length} 帧）`)), timeoutMs);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model,
            parameters: {
              text_type: 'PlainText',
              voice,
              format,
              sample_rate: sampleRate,
              volume: 50,
              rate: 1,
              pitch: 1,
              enable_ssml: false,
              ...(instruction ? { instruction } : {}),
            },
            input: {},
          },
        }),
      );
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // 先当 JSON 解析，失败就是音频
      const s = buf.toString('utf8');
      if (s.startsWith('{')) {
        let msg;
        try {
          msg = JSON.parse(s);
        } catch {
          audio.push(buf);
          return;
        }
        const ev = msg?.header?.event;
        events.push(ev);
        if (ev === 'task-started' && !started) {
          started = true;
          ws.send(JSON.stringify({ header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' }, payload: { input: { text } } }));
          ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
        } else if (ev === 'task-failed') {
          finish(new Error(`失败：${msg?.header?.error_code} ${msg?.header?.error_message}`));
        } else if (ev === 'task-finished') {
          finish(null);
        }
        return;
      }
      audio.push(buf);
    });

    ws.on('error', (e) => finish(new Error(e.message)));
    ws.on('close', () => finish(null));
  });

const t0 = Date.now();
try {
  const { buf, events } = await synth({ model, voice, text, instruction });
  const file = path.join(OUT, `${model}-${voice}-${Date.now()}.mp3`);
  fs.writeFileSync(file, buf);
  const isMp3 = buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  console.log(`✓ ${model} / ${voice}`);
  console.log(`  ${Math.round(buf.length / 1024)} KB  ${Date.now() - t0}ms  ${isMp3 ? 'mp3 头正常' : '头可疑：' + buf.slice(0, 8).toString('hex')}`);
  console.log(`  事件：${[...new Set(events)].join(', ')}`);
  console.log(`  文件：${file}`);
} catch (e) {
  console.log(`✗ ${model} / ${voice}：${e.message.slice(0, 200)}`);
  process.exit(1);
}
