/**
 * 100 条消息的压力测试（soak）。
 *
 * 做法：
 *   1. 起一个假的 OneBot 服务端（:3998），把 bot 接上去
 *   2. 逐条"假装用户"发 100 句话，等 bot 回完再发下一条
 *   3. bot 的回复通过另一个 WS 连接转发到真实 QQ（NapCat :3001）
 *   4. 全程计时、记录，最后汇总
 *
 * node --env-file=.env scripts/soak.mjs [数量] [目标QQ]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';

const COUNT = Number(process.argv[2] || 100);
const TARGET = String(process.argv[3] || '10000002');
const FAKE_PORT = 3998;
const REAL_URL = 'ws://127.0.0.1:3001';
const REAL_TOKEN = 'abc24adc7a71';
const SENDER = 10001;
const DRY = process.env.SOAK_DRY === '1'; // 干跑：不往真实 QQ 转发
const ROOT = path.resolve('.');
const RESULT_FILE = process.env.SOAK_OUT ? path.resolve(process.env.SOAK_OUT) : path.join(ROOT, 'data', '_soak-result.json');

// ── 100 句测试语料：覆盖各种意图、情绪、错字、重复 ──────────────
const CUSTOM = process.env.SOAK_SCRIPT ? fs.readFileSync(process.env.SOAK_SCRIPT, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : null;
const SCRIPT = CUSTOM || [
  // 打招呼 / 短句
  '在吗', '早', '晚安', '在干嘛', '今天好累', '我回来了', '人呢',
  '我刚下班', '吃饭了吗', '现在几点',
  // 抱怨 / 情绪
  '今天被领导当着全组骂了，真的受不了',
  '烦死了，改了一天的方案又被推翻',
  '好累啊，什么都不想干',
  '我好像感冒了，头很疼',
  '压力好大，感觉要崩了',
  '今天运气特别差，出门就下雨',
  '我不想上班了',
  '心里有点难受，说不上来为什么',
  '刚才跟同事吵了一架，气死我了',
  '这个月工资还没发，快没钱了',
  // 求建议
  '我该怎么办啊，明天就要交',
  '你觉得我该不该换工作',
  '要不要跟他道歉',
  '这个周末去哪玩比较好',
  '怎么才能早睡',
  // 分享喜事
  '哈哈哈哈我升职了',
  '今天项目上线了，忙了三个月终于成了',
  '我买了个新键盘',
  '我养了只猫',
  '今天吃了一家超好吃的火锅',
  '周末要去爬山',
  '我剪头发了',
  // 提问
  '你喜欢什么花', '你会做饭吗', '这电影好看吗', '周末有空吗',
  '你猜我在哪', '你睡了吗', '你吃饭了没',
  // 撒娇 / 试探
  '我想你了', '你是不是不喜欢我了', '你怎么不回我', '你是不是在跟别人聊',
  '抱抱', '陪我聊会儿',
  // 打字错误 / 乱码
  'tudyu', 'asdfgh', '123456789', 'woshishui', 'zheshishenme', 'aaaaa',
  // 重复（故意连发同一句）
  '原神启动', '原神启动', '我要玩原神', '我要玩原神',
  // 长段落
  '今天早上七点就起来了，赶地铁的时候人特别多，站了四十分钟才到公司，结果一到就被拉去开会，会开到中午，饭都没吃上',
  '我最近在想要不要搬到离公司近一点的地方，现在每天通勤来回三个小时，实在太浪费时间了，但是房租又贵不少',
  '昨天晚上看了个纪录片，讲的是深海生物，那些鱼长得特别奇怪，有的还会发光，看到半夜才睡',
  '我妈今天给我打电话，问我什么时候找对象，我说还没有，她就一直念叨，搞得我很烦',
  '刚把冰箱里剩的东西都清了，做了个炒饭，味道居然还不错，就是有点咸',
  // 日常闲聊
  '今天天气不错', '外面下雨了', '好无聊啊', '我在地铁上', '刚洗完澡',
  '晚饭吃什么好', '我打游戏输了', '这周过得好快', '明天要早起',
  '你今天干嘛了', '在忙吗', '困了', '有点想吃烧烤',
  '最近在追一个剧', '想出去走走', '手机快没电了', '刚睡醒',
  '今天走了两万步', '楼下新开了家店', '想喝奶茶',
  // 冷淡 / 敷衍
  '嗯', '哦', '？', '好', '随便', '行吧',
  // 反讽
  '你可真行啊', '呵呵，随便你吧', '行吧 你说的都对',
];

// 不够就用通用句补齐
while (SCRIPT.length < COUNT) SCRIPT.push(`随便说一句 ${SCRIPT.length}`);

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (...a) => console.log('[soak]', ...a);

// ── 假 OneBot 服务端 ────────────────────────────────────────
const wss = new WebSocketServer({ port: FAKE_PORT });
let botWs = null;
const inbox = []; // bot 发出的 send_private_msg
let waiter = null;

wss.on('connection', (ws) => {
  botWs = ws;
  log('bot 已连接假服务端');
  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.action === 'get_login_info') {
      ws.send(
        JSON.stringify({
          status: 'ok',
          retcode: 0,
          data: { user_id: 99998, nickname: '压力测试号' },
          echo: msg.echo,
        }),
      );
      return;
    }
    if (msg.action === 'send_private_msg') {
      const segs = msg.params?.message || [];
      const text = segs.filter((s) => s.type === 'text').map((s) => s.data?.text || '').join('');
      const hasImage = segs.some((s) => s.type === 'image');
      const item = { text, hasImage, at: now() };
      inbox.push(item);
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 }, echo: msg.echo }));
      if (waiter) waiter(item);
      return;
    }
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: msg.echo }));
  });
});

// ── 真实 QQ 转发通道（干跑时不连，纯本地） ──────────────────
let real = null;
if (!DRY) {
  real = new WebSocket(REAL_URL, { headers: { Authorization: `Bearer ${REAL_TOKEN}` } });
  await new Promise((resolve, reject) => {
    real.on('open', resolve);
    real.on('error', reject);
  });
}
let echoId = 1;
function forward(text) {
  if (!text || !real) return;
  real.send(
    JSON.stringify({
      action: 'send_private_msg',
      params: { user_id: TARGET, message: [{ type: 'text', data: { text } }] },
      echo: `f${echoId++}`,
    }),
  );
}

// ── 启动被测 bot ───────────────────────────────────────────
fs.rmSync(path.join(ROOT, 'data', '_soak.db'), { force: true });
fs.rmSync(path.join(ROOT, 'data', '_soak.lock'), { force: true });

// 测试专用配置：节奏调快、语音关掉、白名单只放测试号
// 以前这个文件是手工放的，被清理脚本删掉后 bot 会退回真实配置，
// 结果白名单把测试号过滤掉——所有消息都"没回"，白跑 8 分钟。这里改成自动生成。
const SOAK_CONFIG = path.join(ROOT, 'data', '_soak-config.json');
fs.writeFileSync(
  SOAK_CONFIG,
  JSON.stringify(
    {
      persona: { persona: 'default' },
      pacing: {
        thinkMinMs: 300,
        thinkMaxMs: 700,
        typingMsPerChar: 10,
        typingMinMs: 50,
        typingMaxMs: 200,
        splitReply: true,
        splitMax: 3,
        splitPauseMinMs: 100,
        splitPauseMaxMs: 300,
        thinkSlowChance: 0,
        thinkSlowMaxMs: 1000,
      },
      voice: { voiceEnabled: false, voiceChance: 0, voiceName: 'Chelsie', voiceEngine: 'bailian' },
      stickers: { stickerEnabled: true, stickerPureChance: 0.2, stickerFallbackChance: 0.08 },
      access: { allowedQqs: ['10001'] },
    },
    null,
    2,
  ),
  'utf8',
);

const child = spawn(process.execPath, ['--env-file=.env', 'src/index.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    ONEBOT_WS_URL: `ws://127.0.0.1:${FAKE_PORT}`,
    DB_PATH: 'data/_soak.db',
    BOT_LOCK: 'data/_soak.lock',
    CONFIG_FILE: 'data/_soak-config.json',
    WEB_CONSOLE: '0',
    LOG_LEVEL: 'info',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const botOut = [];
child.stdout.on('data', (d) => botOut.push(d.toString()));
child.stderr.on('data', (d) => botOut.push('[err] ' + d.toString()));

// 等 bot 连上
for (let i = 0; i < 120 && !botWs; i++) await sleep(250);
if (!botWs) {
  log('bot 没连上，退出');
  child.kill();
  process.exit(1);
}
await sleep(1200);

// ── 逐条发消息 ─────────────────────────────────────────────
const records = [];
let seq = 100000;

for (let i = 0; i < COUNT; i++) {
  const text = SCRIPT[i];
  const start = now();
  let firstAt = null;
  const replies = [];

  const onReply = (item) => {
    if (!firstAt) firstAt = now();
    replies.push(item);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settleResolve ? settleResolve() : null), 700);
  };
  waiter = onReply;

  let settleResolve = null;
  let settleTimer = null;
  const settled = new Promise((res) => {
    settleResolve = res;
  });
  const timeout = setTimeout(() => settleResolve(), 8000);

  botWs.send(
    JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: seq++,
      user_id: SENDER,
      self_id: 99998,
      time: Math.floor(Date.now() / 1000),
      sender: { user_id: SENDER, nickname: '测试用户' },
      message: [{ type: 'text', data: { text } }],
      raw_message: text,
    }),
  );

  await settled;
  clearTimeout(timeout);
  clearTimeout(settleTimer);
  waiter = null;

  if (!DRY) for (const r of replies) if (r.text) forward(r.text);

  records.push({
    i,
    text,
    replies: replies.map((r) => ({ text: r.text, image: r.hasImage })),
    latencyMs: firstAt ? firstAt - start : null,
    totalMs: now() - start,
    skipped: replies.length === 0,
  });

  if ((i + 1) % 10 === 0) log(`进度 ${i + 1}/${COUNT}  平均首响 ${Math.round(records.filter((r) => r.latencyMs).reduce((a, b) => a + b.latencyMs, 0) / Math.max(1, records.filter((r) => r.latencyMs).length))}ms`);
  await sleep(250 + Math.random() * 350);
}

child.kill();
if (real) real.close();
wss.close();
await sleep(500);

// ── 汇总 ───────────────────────────────────────────────────
const replied = records.filter((r) => !r.skipped);
const lat = records.filter((r) => r.latencyMs).map((r) => r.latencyMs).sort((a, b) => a - b);
const texts = replied.flatMap((r) => r.replies.map((x) => x.text)).filter(Boolean);
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] || 0;

fs.writeFileSync(
  RESULT_FILE,
  JSON.stringify(
    {
      count: COUNT,
      replied: replied.length,
      skipped: records.length - replied.length,
      latency: { p50: p(0.5), p90: p(0.9), max: lat[lat.length - 1] || 0, avg: Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)) },
      records,
      botLog: botOut.join(''),
    },
    null,
    2,
  ),
);

console.log('\n=== 汇总 ===');
console.log(`发出 ${COUNT} 条，回了 ${replied.length} 条，没回 ${records.length - replied.length} 条`);
console.log(`首响 p50 ${p(0.5)}ms  p90 ${p(0.9)}ms  最长 ${lat[lat.length - 1] || 0}ms`);
console.log(`总气泡 ${texts.length} 个，结果存 ${RESULT_FILE}`);
process.exit(0);
