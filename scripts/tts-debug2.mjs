/**
 * 调试 2：把服务端返回的二进制帧当文本打出来看错误。
 *   node --env-file=.env scripts/tts-debug2.mjs [model] [voice]
 */
import WebSocket from 'ws';
import crypto from 'node:crypto';

const KEY = process.env.DASHSCOPE_API_KEY;
const model = process.argv[2] || 'cosyvoice-v3-flash';
const voice = process.argv[3] || 'longanyang';
const text = process.argv[4] || '你终于回我了';
const URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const taskId = crypto.randomUUID().replace(/-/g, '');

const ws = new WebSocket(URL, { headers: { Authorization: `bearer ${KEY}` } });
let started = false;
const t0 = Date.now();
const stamp = () => `[${String(Date.now() - t0).padStart(6)}ms]`;

ws.on('open', () => {
  console.log(stamp(), '已连接，发 run-task');
  ws.send(
    JSON.stringify({
      header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
      payload: {
        task_group: 'audio',
        task: 'tts',
        function: 'SpeechSynthesizer',
        model,
        parameters: { text_type: 'PlainText', format: 'mp3', sample_rate: 24000, volume: 50, rate: 1, pitch: 1, voice },
        input: {},
      },
    }),
  );
});

ws.on('message', (data, isBinary) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (isBinary || Buffer.isBuffer(data)) {
    console.log(stamp(), `二进制 ${buf.length} 字节：`, buf.toString('utf8').slice(0, 400));
    return;
  }
  const msg = JSON.parse(buf.toString());
  console.log(stamp(), '事件:', msg?.header?.event, JSON.stringify(msg).slice(0, 300));
  if (msg?.header?.event === 'task-started' && !started) {
    started = true;
    ws.send(JSON.stringify({ header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' }, payload: { input: { text } } }));
    ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
  }
});

ws.on('error', (e) => console.log(stamp(), '错误:', e.message));
ws.on('close', (c, r) => console.log(stamp(), '关闭:', c, r?.toString()));

setTimeout(() => process.exit(0), 15000);
