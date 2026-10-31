/**
 * 图片链路端到端测试：发图 → 理解 → 回复；同一张图连发 → 走缓存 + 刷屏保护。
 *
 * node --env-file=.env scripts/test-image.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve('.');
const PORT = 3996;
const SENDER = 10002;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 找一张"无语"表情包
const idx = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8').replace(/^\uFEFF/, ''));
const list = Array.isArray(idx) ? idx : idx.stickers || [];
const target = list.find((x) => x.category === '无语') || list[0];
const imgPath = path.join(ROOT, 'stickers', target.category, `${target.id}.png`);
if (!fs.existsSync(imgPath)) {
  console.error('找不到测试图片:', imgPath);
  process.exit(1);
}
const fileUri = 'file:///' + imgPath.replace(/\\/g, '/');

const cfgPath = path.join(ROOT, 'data', '_img-config.json');
fs.writeFileSync(
  cfgPath,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: { thinkMinMs: 200, thinkMaxMs: 400, typingMsPerChar: 5, typingMinMs: 20, typingMaxMs: 80, splitReply: true, splitMax: 2, splitPauseMinMs: 50, splitPauseMaxMs: 150, thinkSlowChance: 0 },
      voice: { voiceEnabled: false },
      stickers: { stickerEnabled: true, stickerPureChance: 0.2, stickerFallbackChance: 0 },
      access: { allowedQqs: [String(SENDER)] },
    },
    null,
    2,
  ),
  'utf8',
);
fs.rmSync(path.join(ROOT, 'data', '_img.db'), { force: true });
fs.rmSync(path.join(ROOT, 'data', '_img.lock'), { force: true });

const wss = new WebSocketServer({ port: PORT });
let botWs = null;
const replies = [];
let waiter = null;

wss.on('connection', (ws) => {
  botWs = ws;
  console.log('[img] bot 已连接');
  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.action === 'get_login_info') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99996, nickname: '图片测试' }, echo: msg.echo }));
      return;
    }
    if (msg.action === 'send_private_msg') {
      const segs = msg.params?.message || [];
      const text = segs.filter((s) => s.type === 'text').map((s) => s.data?.text || '').join('');
      const hasImage = segs.some((s) => s.type === 'image');
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 }, echo: msg.echo }));
      replies.push({ text, hasImage });
      if (waiter) waiter();
      return;
    }
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: msg.echo }));
  });
});

const child = spawn(process.execPath, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`,
    DB_PATH: 'data/_img.db',
    BOT_LOCK: 'data/_img.lock',
    CONFIG_FILE: 'data/_img-config.json',
    WEB_CONSOLE: '0',
    LOG_LEVEL: 'info',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const botLog = [];
child.stdout.on('data', (d) => botLog.push(d.toString()));
child.stderr.on('data', (d) => botLog.push('[err] ' + d.toString()));

for (let i = 0; i < 160 && !botWs; i++) await sleep(250);
if (!botWs) {
  console.error('[img] bot 没连上');
  child.kill();
  process.exit(1);
}
await sleep(1500);

let seq = 300000;
async function sendImage(text) {
  const before = replies.length;
  let done = false;
  waiter = () => {
    done = true;
  };
  botWs.send(
    JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: seq++,
      user_id: SENDER,
      self_id: 99996,
      time: Math.floor(Date.now() / 1000),
      sender: { user_id: SENDER, nickname: '图片测试' },
      message: [
        ...(text ? [{ type: 'text', data: { text } }] : []),
        { type: 'image', data: { file: fileUri, url: fileUri } },
      ],
      raw_message: text || '[图片]',
    }),
  );
  for (let i = 0; i < 60 && !done; i++) await sleep(500);
  await sleep(800);
  return replies.slice(before);
}

console.log('\n=== 第 1 次发图（应调模型理解）===');
let r = await sendImage('你看这个');
console.log('  她：', r.map((x) => x.text).join(' / ') || '(没回)');

console.log('\n=== 第 2 次发同一张图（应走缓存）===');
r = await sendImage('');
console.log('  她：', r.map((x) => x.text).join(' / ') || '(没回)');

console.log('\n=== 第 3 次发同一张图（应判刷屏）===');
r = await sendImage('');
console.log('  她：', r.map((x) => x.text).join(' / ') || '(没回)');

console.log('\n=== 第 4 次（再来一张，不该被刷屏逻辑误伤）===');
r = await sendImage('这个呢');
console.log('  她：', r.map((x) => x.text).join(' / ') || '(没回)');

await sleep(500);
child.kill();
wss.close();

const log = botLog.join('');
console.log('\n=== 日志检查 ===');
console.log('  看图理解次数:', (log.match(/🖼/g) || []).length);
console.log('  命中缓存:', (log.match(/走缓存/g) || []).length);
console.log('  刷屏判定:', (log.match(/刷同一张图/g) || []).length);
console.log('  看图失败:', (log.match(/看图失败/g) || []).length);
const acts = [...log.matchAll(/🎯 (\w+)「([^」]*)」/g)].map((m) => `${m[1]}(${m[2].slice(0, 16)})`);
console.log('  裁决:', acts.join(' | '));

fs.writeFileSync('test/runs/image-test.log', log, 'utf8');
console.log('\n完整日志：test/runs/image-test.log');
process.exit(0);
