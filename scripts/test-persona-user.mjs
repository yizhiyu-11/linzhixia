/**
 * 人设分配测试：给用户设 tsundere，她应该用"沈野"的口气回
 * node --env-file=.env scripts/test-persona-user.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { Memory } from '../src/memory.mjs';

const ROOT = process.cwd();
const PORT = 3989;
const SENDER = 10009;
const DB = path.join(ROOT, 'data/_pt.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(DB, { force: true });
fs.rmSync(path.join(ROOT, 'data/_pt.lock'), { force: true });

// 预置：用户 + 指定人设
{
  const m = new Memory('data/_pt.db');
  m.ensureUser(String(SENDER), '人设测试');
  m.setState(String(SENDER), 'persona', 'tsundere');
  m.close();
  console.log('[persona] 预置 persona=tsundere');
}

const cfg = path.join(ROOT, 'data/_pt-config.json');
fs.writeFileSync(
  cfg,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: { thinkMinMs: 120, thinkMaxMs: 250, typingMsPerChar: 4, typingMinMs: 10, typingMaxMs: 40, splitReply: true, splitMax: 1, splitPauseMinMs: 40, splitPauseMaxMs: 90, thinkSlowChance: 0 },
      voice: { voiceEnabled: false },
      stickers: { stickerEnabled: false },
      access: { allowedQqs: [String(SENDER)] },
    },
    null,
    2,
  ),
  'utf8',
);

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
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99989 }, echo: m.echo }));
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
  env: { ...process.env, ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`, DB_PATH: 'data/_pt.db', BOT_LOCK: 'data/_pt.lock', CONFIG_FILE: 'data/_pt-config.json', WEB_CONSOLE: '0', LOG_LEVEL: 'debug' },
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
    message_id: 960001,
    user_id: SENDER,
    self_id: 99989,
    time: Math.floor(Date.now() / 1000),
    sender: { user_id: SENDER, nickname: '人设测试' },
    message: [{ type: 'text', data: { text: '你今天怎么不理我' } }],
    raw_message: 'x',
  }),
);
const t0 = Date.now();
while (!done && Date.now() - t0 < 40000) await sleep(300);
await sleep(500);
child.kill();
wss.close();

console.log('她回：', replies.join(' / ') || '(没回)');
const all = log.join('');
for (const line of all.split('\n')) if (/人设|沈野/.test(line)) console.log('  ' + line.trim());
console.log('\n（默认人设是林知夏，傲娇是沈野——回复口气应该不一样）');
