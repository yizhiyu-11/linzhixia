/**
 * 调试：看 DashScope 实时 TTS 到底返回什么事件。
 *   node --env-file=.env scripts/tts-debug.mjs [model] [voice]
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
let binaryBytes = 0;
let started = false;

const t0 = Date.now();
const stamp = () => `[${String(Date.now() - t0).padStart(6)}ms]`;

ws.on('open', () => {
  console.log(stamp(), '已连接');
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
  console.log(stamp(), '已发 run-task');
});

ws.on('message', (data, isBinary) => {
  if (isBinary || Buffer.isBuffer(data)) {
    binaryBytes += data.length;
    console.log(stamp(), `二进制帧 ${data.length} 字节（累计 ${binaryBytes}）`);
    return;
  }
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    console.log(stamp(), '非 JSON:', data.toString().slice(0, 120));
    return;
  }
  const ev = msg?.header?.event;
  console.log(stamp(), '事件:', ev, JSON.stringify(msg).slice(0, 260));
  if (ev === 'task-started' && !started) {
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
    console.log(stamp(), '已发 continue-task + finish-task');
  }
  if (ev === 'task-finished' || ev === 'task-failed') {
    setTimeout(() => {
      console.log(stamp(), `结束，音频共 ${binaryBytes} 字节`);
      ws.close();
      process.exit(0);
    }, 500);
  }
});

ws.on('error', (e) => console.log(stamp(), '错误:', e.message));
ws.on('close', (code, reason) => console.log(stamp(), '关闭:', code, reason?.toString().slice(0, 80)));

setTimeout(() => {
  console.log(stamp(), '超时退出');
  process.exit(1);
}, 40000);
