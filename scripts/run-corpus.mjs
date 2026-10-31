/**
 * 跑语料：把 sample-*.jsonl 逐条喂给 bot（不连 QQ），记录每轮的感知和回复。
 *
 * node --env-file=.env scripts/run-corpus.mjs test/runs/smoke-60.jsonl --out test/runs/run-001.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const args = process.argv.slice(2);
const SAMPLE = path.resolve(args[0] || 'test/runs/smoke-60.jsonl');
const getArg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = path.resolve(getArg('out', 'test/runs/run-' + Date.now() + '.jsonl'));
const FAKE_PORT = Number(getArg('port', 3997));
const SENDER = 10001;
const ROOT = path.resolve('.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const samples = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map(JSON.parse);
console.log(`[run] 载入 ${samples.length} 条，输出 ${OUT}`);

// ── 测试专用配置 ───────────────────────────────────────────
const runCfg = path.join(ROOT, 'data', '_run-config.json');
fs.writeFileSync(
  runCfg,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: {
        thinkMinMs: 200,
        thinkMaxMs: 500,
        typingMsPerChar: 5,
        typingMinMs: 20,
        typingMaxMs: 100,
        splitReply: true,
        splitMax: 3,
        splitPauseMinMs: 50,
        splitPauseMaxMs: 150,
        thinkSlowChance: 0,
        thinkSlowMaxMs: 600,
      },
      voice: { voiceEnabled: false, voiceChance: 0 },
      stickers: { stickerEnabled: true, stickerPureChance: 0.2, stickerFallbackChance: 0.08 },
      access: { allowedQqs: [String(SENDER)] },
    },
    null,
    2,
  ),
  'utf8',
);
fs.rmSync(path.join(ROOT, 'data', '_run.db'), { force: true });
fs.rmSync(path.join(ROOT, 'data', '_run.lock'), { force: true });

// ── 假 OneBot ─────────────────────────────────────────────
const wss = new WebSocketServer({ port: FAKE_PORT });
let botWs = null;
let waiter = null;
wss.on('connection', (ws) => {
  botWs = ws;
  console.log('[run] bot 已连接');
  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.action === 'get_login_info') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99997, nickname: '语料机器人' }, echo: msg.echo }));
      return;
    }
    if (msg.action === 'send_private_msg') {
      const segs = msg.params?.message || [];
      const text = segs.filter((s) => s.type === 'text').map((s) => s.data?.text || '').join('');
      const hasImage = segs.some((s) => s.type === 'image');
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 }, echo: msg.echo }));
      if (waiter) waiter({ text, hasImage, at: Date.now() });
      return;
    }
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: msg.echo }));
  });
});

// ── 启动 bot ───────────────────────────────────────────────
const child = spawn(process.execPath, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    ONEBOT_WS_URL: `ws://127.0.0.1:${FAKE_PORT}`,
    DB_PATH: 'data/_run.db',
    BOT_LOCK: 'data/_run.lock',
    CONFIG_FILE: 'data/_run-config.json',
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
  console.log('[run] bot 没连上');
  child.kill();
  process.exit(1);
}
await sleep(1500);

// ── 逐条回放 ───────────────────────────────────────────────
const records = [];
let seq = 200000;
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const replies = [];
  const logStart = botLog.join('').length;
  const start = Date.now();
  let settleTimer = null;
  let resolveSettle = null;
  const settled = new Promise((r) => (resolveSettle = r));
  const timeout = setTimeout(() => resolveSettle(), 16000);

  waiter = (item) => {
    replies.push(item);
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => resolveSettle(), 700);
  };

  botWs.send(
    JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: seq++,
      user_id: SENDER,
      self_id: 99997,
      time: Math.floor(Date.now() / 1000),
      sender: { user_id: SENDER, nickname: '语料测试' },
      message: [{ type: 'text', data: { text: s.text } }],
      raw_message: s.text,
    }),
  );

  await settled;
  clearTimeout(timeout);
  clearTimeout(settleTimer);
  waiter = null;

  records.push({
    ...s,
    replies: replies.map((r) => ({ text: r.text, image: r.hasImage })),
    log: botLog.join('').slice(logStart),
    latencyMs: replies.length ? replies[0].at - start : null,
    totalMs: Date.now() - start,
  });

  if ((i + 1) % 10 === 0) console.log(`[run] ${i + 1}/${samples.length}`);
  await sleep(200 + Math.random() * 250);
  // 组与组之间多等一会儿，模拟真实间隔
  if (s.turn === 5) await sleep(1200);
}

child.kill();
wss.close();
await sleep(300);

// 从 bot 日志里抠出每轮的 👁 行
const eyeLines = [...botLog.join('').matchAll(/👁[^\n]*/g)].map((m) => m[0]);
records.forEach((r, i) => (r.perceive = eyeLines[i] || ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
fs.writeFileSync(OUT.replace(/\.jsonl$/, '.botlog.txt'), botLog.join(''), 'utf8');

const lat = records.filter((r) => r.latencyMs).map((r) => r.latencyMs).sort((a, b) => a - b);
console.log(`\n✓ 完成 ${records.length} 条 → ${OUT}`);
console.log(`  有回复 ${records.filter((r) => r.replies.length).length} 条，首响 p50 ${lat[Math.floor(lat.length / 2)] || 0}ms`);
process.exit(0);
