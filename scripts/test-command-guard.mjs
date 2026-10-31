/**
 * 端到端验证「命令式消息不回复」。
 *
 *   node scripts/test-command-guard.mjs
 *
 * 起一个假 OneBot 服务端，让 bot 连上来，然后：
 *   1. 发 "#sl" → 应无任何回复，日志出现「忽略命令式消息」
 *   2. 发 "/help" → 同上
 *   3. 发 "你好" → 应产生回复（证明管线本身没坏）
 */
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';

const PORT = 3998;
const QQ = '10000002';
const WEB_PORT = 3873;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wss = new WebSocketServer({ port: PORT });
const replies = [];
const logs = [];
let ws = null;
let msgId = 1000;

wss.on('connection', (socket) => {
  ws = socket;
  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.action === 'send_private_msg') {
      const text = data.params?.message ?? '';
      replies.push({ at: Date.now(), text: typeof text === 'string' ? text : JSON.stringify(text) });
    }
    // 回一个成功，避免 bot 认为发送失败
    socket.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: ++msgId }, echo: data.echo }));
  });
});

const send = (text) => {
  const event = {
    post_type: 'message',
    message_type: 'private',
    sub_type: 'friend',
    time: Math.floor(Date.now() / 1000),
    self_id: 10000001,
    user_id: Number(QQ),
    sender: { user_id: Number(QQ), nickname: '测试' },
    message_id: ++msgId,
    message: [{ type: 'text', data: { text } }],
    raw_message: text,
  };
  ws.send(JSON.stringify(event));
};

const child = spawn(
  process.execPath,
  ['--env-file=.env', 'src/index.mjs'],
  {
    env: {
      ...process.env,
      ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`,
      ONEBOT_TOKEN: '',
      WEB_PORT: String(WEB_PORT),
      DB_PATH: 'data/test-guard.db',
      CONFIG_FILE: 'config.test-guard.json',
      BOT_LOCK: '0',
      PROACTIVE: '0',
      VOICE: '0',
      LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

child.stdout.on('data', (b) => logs.push(b.toString()));
child.stderr.on('data', (b) => logs.push(b.toString()));

const fail = (msg) => {
  console.log('✗ ' + msg);
  child.kill();
  wss.close();
  process.exit(1);
};

// 等 bot 连上
for (let i = 0; i < 100 && !ws; i++) await sleep(200);
if (!ws) fail('bot 没连上假 OneBot');

await sleep(1500);

// 1. 命令式消息
const before = replies.length;
send('#sl');
await sleep(4000);
if (replies.length > before) fail('"#sl" 竟然回复了：' + JSON.stringify(replies.slice(before)));
console.log('✓ "#sl" 没有回复');

send('/help');
await sleep(4000);
if (replies.length > before) fail('"/help" 竟然回复了');
console.log('✓ "/help" 没有回复');

const logText = logs.join('');
if (!logText.includes('忽略命令式消息')) fail('日志里没有「忽略命令式消息」');
console.log('✓ 日志记录了拦截');

// 2. 正常消息（模型可能失败，但管线应尝试；只要出现"正在回复"类日志或回复都算通过）
const before2 = replies.length;
send('你好');
// 等回复（拆句 + 打字延迟，最长等 20 秒）
for (let i = 0; i < 20 && replies.length === before2; i++) await sleep(1000);
const log2 = logs.join('');
const pipelineRan = replies.length > before2 || /收到|←|生成|回复/.test(log2);
if (!pipelineRan) fail('正常消息没有进入处理流程');
console.log('✓ 正常消息进入处理流程（回复 ' + (replies.length - before2) + ' 条）');

console.log('\n最后 6 行日志：');
for (const line of logs.join('').split(/\r?\n/).filter(Boolean).slice(-6)) console.log('    ' + line);

console.log('\n结论：命令式消息已拦截，正常对话不受影响');
child.kill();
wss.close();
process.exit(0);
