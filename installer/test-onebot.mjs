/**
 * 检查 OneBot 连接（客户双击「测试连接」时跑这个）。
 *
 * 读取同目录上两级 app\.env 的 ONEBOT_WS_URL / ONEBOT_TOKEN，
 * 连上去调用 get_login_info，打印机器人账号。
 */
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import net from 'node:net';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const appDir = path.resolve(here, '..');
const envFile = path.join(appDir, '.env');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv(envFile);
const fromEnv = Boolean(process.env.ONEBOT_WS_URL);
const url = process.env.ONEBOT_WS_URL || env.ONEBOT_WS_URL || 'ws://127.0.0.1:3001';
const token = process.env.ONEBOT_TOKEN ?? env.ONEBOT_TOKEN ?? '';

// 命令行/向导传了环境变量时，以环境变量为准（此时还没写 .env）
if (!fromEnv && env.ONEBOT_DISABLED === '1') {
  console.log('配置里关掉了 QQ 连接（ONEBOT_DISABLED=1），当前是纯浏览器模式。');
  console.log('想接 QQ，把 app\\.env 里的 ONEBOT_DISABLED 改成 0 再试。');
  process.exit(2);
}

console.log(`连接 ${url} …`);

const headers = token ? { Authorization: `Bearer ${token}` } : {};
const ws = new WebSocket(url, { headers });
let done = false;

const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(code), 100);
};

async function portAlive(host, port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(1200);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', () => resolve(false));
    s.connect(port, host);
  });
}

const timer = setTimeout(async () => {
  let u;
  try {
    u = new URL(url);
  } catch {
    u = null;
  }
  const alive = u ? await portAlive(u.hostname, Number(u.port) || 3001) : false;
  if (alive) {
    finish(
      1,
      [
        `端口 ${u.port} 有程序在监听，但它不回应 OneBot 协议。`,
        '可能原因：',
        '  · 那个端口被别的软件占用了（换一个端口，或关掉那个软件）',
        '  · OneBot 服务开着，但还没登录 QQ / 还没启用 WebSocket',
        `  核对：${url}`,
      ].join('\n'),
    );
    return;
  }
  finish(
    1,
    [
      '连不上。常见原因：',
      '  · OneBot 服务（NapCat / SnowLuma）没启动',
      `  · 地址不对（当前填的是 ${url}）`,
      '  · 端口被防火墙拦了',
    ].join('\n'),
  );
}, 8000);

ws.on('open', () => {
  ws.send(JSON.stringify({ action: 'get_login_info', params: {}, echo: 'check' }));
});

ws.on('message', (raw) => {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (data.echo !== 'check') return;
  clearTimeout(timer);
  if (data.status === 'ok' && data.data) {
    const { user_id, nickname } = data.data;
    finish(0, `连接成功：${nickname}（${user_id}）`);
  } else {
    finish(1, `OneBot 返回异常：${JSON.stringify(data).slice(0, 160)}`);
  }
});

ws.on('error', (e) => {
  clearTimeout(timer);
  const msg = String(e.message || e);
  if (msg.includes('401')) {
    finish(1, '连接被拒（401）：token 不对，去 OneBot 配置里核对 token。');
  } else if (msg.includes('ECONNREFUSED')) {
    finish(1, '连不上：没有程序在监听这个端口。先启动 OneBot 服务。');
  } else {
    finish(1, '连接出错：' + msg);
  }
});
