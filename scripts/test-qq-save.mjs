/**
 * QQ 收藏测试：发图 + 说「存」，应入表情库并回一句确认
 * node --env-file=.env scripts/test-qq-save.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const ROOT = process.cwd();
const PORT = 3990;
const SENDER = 10008;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const before = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8')).stickers.length;

const cfg = path.join(ROOT, 'data/_save-config.json');
fs.writeFileSync(
  cfg,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: { thinkMinMs: 120, thinkMaxMs: 250, typingMsPerChar: 4, typingMinMs: 10, typingMaxMs: 40, splitReply: true, splitMax: 2, splitPauseMinMs: 40, splitPauseMaxMs: 90, thinkSlowChance: 0 },
      voice: { voiceEnabled: false },
      stickers: { stickerEnabled: false },
      access: { allowedQqs: [String(SENDER)] },
    },
    null,
    2,
  ),
  'utf8',
);
fs.rmSync(path.join(ROOT, 'data/_save.db'), { force: true });
fs.rmSync(path.join(ROOT, 'data/_save.lock'), { force: true });

const img = path.join(ROOT, 'data/console-shot.png');
const uri = 'file:///' + img.replace(/\\/g, '/');

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
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99990 }, echo: m.echo }));
      return;
    }
    if (m.action === 'send_private_msg') {
      replies.push((m.params?.message || []).filter((s) => s.type === 'text').map((s) => s.data?.text || '').join(''));
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
    DB_PATH: 'data/_save.db',
    BOT_LOCK: 'data/_save.lock',
    CONFIG_FILE: 'data/_save-config.json',
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

let done = false;
waiter = () => (done = true);
botWs.send(
  JSON.stringify({
    post_type: 'message',
    message_type: 'private',
    sub_type: 'friend',
    message_id: 950001,
    user_id: SENDER,
    self_id: 99990,
    time: Math.floor(Date.now() / 1000),
    sender: { user_id: SENDER, nickname: '收藏测试' },
    message: [
      { type: 'text', data: { text: '这张存一下' } },
      { type: 'image', data: { file: uri, url: uri } },
    ],
    raw_message: '存',
  }),
);

const t0 = Date.now();
while (!done && Date.now() - t0 < 40000) await sleep(300);
await sleep(800);
child.kill();
wss.close();

console.log('她回：', replies.join(' / ') || '(没回)');
const after = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8')).stickers.length;
console.log(`库数量：${before} → ${after}`);
const all = log.join('');
for (const line of all.split('\n')) if (/收藏入库|重载|存好/.test(line)) console.log('  ' + line.trim());

// 清理：把这次收藏的删掉
if (after > before) {
  const list = JSON.parse(fs.readFileSync('stickers/index.json', 'utf8')).stickers;
  const added = list.filter((s) => String(s.id).startsWith('upload-'));
  for (const s of added) {
    fs.rmSync(path.join('stickers', s.file), { force: true });
  }
  const kept = list.filter((s) => !String(s.id).startsWith('upload-'));
  fs.writeFileSync('stickers/index.json', JSON.stringify({ stickers: kept }, null, 2), 'utf8');
  console.log(`已清理 ${added.length} 张测试图，恢复 ${kept.length}`);
}
process.exit(0);
