/**
 * 接收端记忆 + 发送端反馈的端到端测试
 * node --env-file=.env scripts/test-memory.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const PORT = 3991;
const SENDER = 10007;
const DB = path.join(ROOT, 'data/_mem.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(DB, { force: true });
fs.rmSync(path.join(ROOT, 'data/_mem.lock'), { force: true });

const cfg = path.join(ROOT, 'data/_mem-config.json');
fs.writeFileSync(
  cfg,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: { thinkMinMs: 120, thinkMaxMs: 250, typingMsPerChar: 4, typingMinMs: 10, typingMaxMs: 50, splitReply: true, splitMax: 2, splitPauseMinMs: 40, splitPauseMaxMs: 100, thinkSlowChance: 0 },
      voice: { voiceEnabled: false },
      stickers: { stickerEnabled: true, stickerBaseP: 0.95, stickerMaxPerDay: 50, stickerPureP: 0 },
      access: { allowedQqs: [String(SENDER)] },
    },
    null,
    2,
  ),
  'utf8',
);

// 一张"没见过"的图（截图，不在表情库里）
const unseen = path.join(ROOT, 'data/console-shot.png');
const unseenUri = 'file:///' + unseen.replace(/\\/g, '/');

const wss = new WebSocketServer({ port: PORT });
let botWs = null;
const replies = [];
let waiter = null;
wss.on('connection', (ws) => {
  botWs = ws;
  ws.on('message', (buf) => {
    let m;
    try {
      m = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (m.action === 'get_login_info') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99991 }, echo: m.echo }));
      return;
    }
    if (m.action === 'send_private_msg') {
      const segs = m.params?.message || [];
      replies.push(segs.map((s) => (s.type === 'text' ? s.data?.text || '' : s.type === 'image' ? '[图]' : '')).join(''));
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: m.echo }));
      if (waiter) waiter();
      return;
    }
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: m.echo }));
  });
});

const child = spawn(process.execPath, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`,
    DB_PATH: 'data/_mem.db',
    BOT_LOCK: 'data/_mem.lock',
    CONFIG_FILE: 'data/_mem-config.json',
    WEB_CONSOLE: '0',
    LOG_LEVEL: 'info',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
child.stdout.on('data', (d) => log.push(d.toString()));
child.stderr.on('data', (d) => log.push('[err] ' + d.toString()));

for (let i = 0; i < 160 && !botWs; i++) await sleep(250);
await sleep(1500);

let seq = 900000;
async function send(payload, label, waitMs = 7000) {
  const before = replies.length;
  let done = false;
  waiter = () => (done = true);
  botWs.send(
    JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: seq++,
      user_id: SENDER,
      self_id: 99991,
      time: Math.floor(Date.now() / 1000),
      sender: { user_id: SENDER, nickname: '记忆测试' },
      ...payload,
    }),
  );
  const t0 = Date.now();
  while (!done && Date.now() - t0 < waitMs) await sleep(250);
  await sleep(500);
  console.log(`  【${label}】${replies.slice(before).join(' / ') || '(没回)'}`);
}

console.log('\n=== 1. 触发一次发图（应为表情包）===');
await send({ message: [{ type: 'text', data: { text: '好耶 今天终于搞定了' } }], raw_message: 'x' }, '发文字');

console.log('\n=== 2. 立刻回一句（应记 fast 反馈）===');
await sleep(800);
await send({ message: [{ type: 'text', data: { text: '哈哈 我也觉得' } }], raw_message: 'y' }, '回话');

console.log('\n=== 3. 发一张没见过的图（应调模型 + 记进 media_seen）===');
await send(
  { message: [{ type: 'text', data: { text: '你看这个' } }, { type: 'image', data: { file: unseenUri, url: unseenUri } }], raw_message: 'z' },
  '发新图',
);

console.log('\n=== 4. 再发同一张图（应走记忆，不调模型）===');
await send({ message: [{ type: 'image', data: { file: unseenUri, url: unseenUri } }], raw_message: 'z' }, '发同一张');

await sleep(500);
child.kill();
wss.close();

const all = log.join('');
fs.writeFileSync('test/runs/memory-test.log', all, 'utf8');
console.log('\n=== 日志检查 ===');
for (const line of all.split('\n')) {
  if (/🖼|🎴|表情包反馈|走记忆|库里的图/.test(line)) console.log('  ' + line.trim());
}

console.log('\n=== 数据库检查 ===');
{
  const db = new DatabaseSync('data/_mem.db');
  const seen = db.prepare('SELECT kind, desc, category, count FROM media_seen').all();
  console.log('  media_seen:', JSON.stringify(seen));
  const st = db.prepare('SELECT id, category, sent, replied_fast, replied_slow, no_reply, score FROM sticker_stats').all();
  console.log('  sticker_stats:', JSON.stringify(st));
  db.close();
}
process.exit(0);
