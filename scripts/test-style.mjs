/**
 * 句式固化守卫的端到端测试：
 * 先在库里塞 20 条"同一个开头"的历史回复，再发消息，看她是否被提醒/重写。
 *
 * node --env-file=.env scripts/test-style.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve('.');
const PORT = 3995;
const SENDER = 10003;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DB = path.join(ROOT, 'data', '_sg.db');

fs.rmSync(DB, { force: true });
fs.rmSync(path.join(ROOT, 'data', '_sg.lock'), { force: true });

// 1) 预置历史：20 条都以"你不就"开头
{
  const db = new DatabaseSync(DB);
  db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, qq TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, meta TEXT, created_at INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS users (qq TEXT PRIMARY KEY, nickname TEXT, created_at INTEGER NOT NULL, last_seen INTEGER)`);
  const ins = db.prepare('INSERT INTO messages (qq, role, content, meta, created_at) VALUES (?,?,?,?,?)');
  db.prepare('INSERT OR REPLACE INTO users (qq, nickname, created_at) VALUES (?,?,?)').run(String(SENDER), '测试', Date.now());
  const variants = ['想要这个', '爱这么干', '觉得好看', '爱较真', '就这脾气', '非要这样'];
  for (let i = 0; i < 20; i++) {
    ins.run(String(SENDER), 'user', '随便聊聊' + i, null, Date.now() - (40 - i) * 60_000);
    ins.run(String(SENDER), 'assistant', '你不就' + variants[i % variants.length], null, Date.now() - (39 - i) * 60_000);
  }
  db.close();
  console.log('[style] 预置 20 条同开头回复');
}

const cfgPath = path.join(ROOT, 'data', '_sg-config.json');
fs.writeFileSync(
  cfgPath,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: { thinkMinMs: 150, thinkMaxMs: 300, typingMsPerChar: 5, typingMinMs: 20, typingMaxMs: 60, splitReply: true, splitMax: 2, splitPauseMinMs: 50, splitPauseMaxMs: 120, thinkSlowChance: 0 },
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
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.action === 'get_login_info') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99995, nickname: '句式测试' }, echo: msg.echo }));
      return;
    }
    if (msg.action === 'send_private_msg') {
      const segs = msg.params?.message || [];
      replies.push(segs.filter((s) => s.type === 'text').map((s) => s.data?.text || '').join(''));
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 }, echo: msg.echo }));
      if (waiter) waiter();
      return;
    }
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: msg.echo }));
  });
});

const child = spawn(process.execPath, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`, DB_PATH: 'data/_sg.db', BOT_LOCK: 'data/_sg.lock', CONFIG_FILE: 'data/_sg-config.json', WEB_CONSOLE: '0', LOG_LEVEL: 'info' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
child.stdout.on('data', (d) => log.push(d.toString()));
child.stderr.on('data', (d) => log.push('[err] ' + d.toString()));

for (let i = 0; i < 160 && !botWs; i++) await sleep(250);
if (!botWs) {
  console.error('[style] bot 没连上');
  child.kill();
  process.exit(1);
}
await sleep(1500);

for (const text of ['在吗', '那你说怎么办', '我是不是太较真了']) {
  const before = replies.length;
  let done = false;
  waiter = () => (done = true);
  botWs.send(
    JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: 500000 + replies.length,
      user_id: SENDER,
      self_id: 99995,
      time: Math.floor(Date.now() / 1000),
      sender: { user_id: SENDER, nickname: '句式测试' },
      message: [{ type: 'text', data: { text } }],
      raw_message: text,
    }),
  );
  for (let i = 0; i < 60 && !done; i++) await sleep(300);
  await sleep(600);
  console.log(`  你：${text}\n  她：${replies.slice(before).join(' / ') || '(没回)'}`);
}

await sleep(400);
child.kill();
wss.close();
fs.writeFileSync('test/runs/style-test.log', log.join(''), 'utf8');

const all = log.join('');
console.log('\n=== 检查 ===');
console.log('  句式固化提示:', (all.match(/🔂 句式固化/g) || []).length);
console.log('  重写触发:', (all.match(/🔂 又踩同一个句式/g) || []).length);
console.log('\n日志片段:');
for (const line of all.split('\n')) if (line.includes('🔂')) console.log('  ' + line.trim());
process.exit(0);
