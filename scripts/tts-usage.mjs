/**
 * 量一下 qwen-audio 的真实计费：跑两句不同长度，打印服务端返回的 usage。
 *   node --env-file=.env scripts/tts-usage.mjs
 */
import WebSocket from 'ws';
import crypto from 'node:crypto';

const KEY = process.env.DASHSCOPE_API_KEY;
const MODEL = 'qwen-audio-3.1-tts-flash';
const VOICE = 'longanlingxin_v3.1';

const run = (text) =>
  new Promise((resolve) => {
    const taskId = crypto.randomUUID().replace(/-/g, '');
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: { Authorization: `bearer ${KEY}` },
    });
    let started = false;
    let audioBytes = 0;
    const t0 = Date.now();
    let usage = null;

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: MODEL,
            parameters: { text_type: 'PlainText', voice: VOICE, format: 'wav', sample_rate: 22050, volume: 50, rate: 1, pitch: 1, enable_ssml: false },
            input: {},
          },
        }),
      );
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const s = buf.toString('utf8');
      if (!s.startsWith('{')) {
        audioBytes += buf.length;
        return;
      }
      let msg;
      try {
        msg = JSON.parse(s);
      } catch {
        audioBytes += buf.length;
        return;
      }
      const ev = msg?.header?.event;
      if (ev === 'task-started' && !started) {
        started = true;
        ws.send(JSON.stringify({ header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' }, payload: { input: { text } } }));
        ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
      }
      if (ev === 'task-finished') {
        usage = msg.payload?.usage || msg.usage || null;
        console.log(`  「${text}」(${text.length} 字)`);
        console.log(`    音频 ${Math.round(audioBytes / 1024)}KB  耗时 ${Date.now() - t0}ms`);
        console.log(`    usage: ${JSON.stringify(usage)}`);
        // 完整 payload 也打一次，看看有没有别的计费字段
        console.log(`    finish payload keys: ${Object.keys(msg.payload || {}).join(', ')}`);
        if (msg.payload?.output) console.log(`    output: ${JSON.stringify(msg.payload.output).slice(0, 200)}`);
        ws.close();
        resolve();
      }
      if (ev === 'task-failed') {
        console.log(`  失败：${msg?.header?.error_message}`);
        ws.close();
        resolve();
      }
    });

    setTimeout(() => {
      ws.close();
      resolve();
    }, 30000);
  });

for (const t of ['你终于回我了', '我今天加班到十点，老板还在群里发消息，我真的有点撑不住了，想找个地方躲起来']) {
  await run(t);
}
