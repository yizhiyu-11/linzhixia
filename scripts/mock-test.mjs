/**
 * 端到端测试：不用 NapCat，用一个假的 OneBot 服务端冒充 QQ。
 * 验证：连接 → 收事件 → 调模型失败 → 兜底回复 → 发回 QQ。
 *
 * 用法：node scripts/mock-test.mjs
 */
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = 3999;
// 用一个在白名单里的号（白名单来自 config.json，mock 里改不了）
const QQ = '10000002';
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error(`超时 ${ms}ms`)), ms));

let child;
let finished = false;

const finish = (code, msg) => {
  if (finished) return;
  finished = true;
  console.log(msg);
  child?.kill();
  wss.close();
  setTimeout(() => process.exit(code), 200);
};

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[mock] OneBot 假服务端已启动 :${PORT}`);

  child = spawn(process.execPath, ['src/index.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ONEBOT_WS_URL: `ws://127.0.0.1:${PORT}`,
      ALLOWED_QQS: QQ,
      OWNER_QQ: QQ,
      DEEPSEEK_API_KEY: 'sk-dummy-for-test', // 故意填错的，用来触发兜底
      LOG_LEVEL: 'info',
      WEB_CONSOLE: '0', // 避免和正在跑的后台抢 3870 端口
      DB_PATH: 'data/_mock.db',
      BOT_LOCK: 'data/_mock.lock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (b) => process.stdout.write('[bot] ' + b.toString()));
  child.stderr.on('data', (b) => process.stdout.write('[bot!] ' + b.toString()));
  child.on('exit', (c) => console.log(`[mock] bot 退出，code=${c}`));
});

wss.on('connection', (ws) => {
  console.log('[mock] bot 已连接');

  // 回应 API 调用
  ws.on('message', (buf) => {
    const msg = JSON.parse(buf.toString());
    if (msg.action === 'get_login_info') {
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 99999, nickname: '测试小号' }, echo: msg.echo }));
      // 登录信息回完，推一条私聊消息
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            post_type: 'message',
            message_type: 'private',
            sub_type: 'friend',
            message_id: 123456,
            user_id: Number(QQ),
            self_id: 99999,
            time: Math.floor(Date.now() / 1000),
            sender: { user_id: Number(QQ), nickname: '阿屿' },
            message: [{ type: 'text', data: { text: '今天被领导骂了 烦死' } }],
            raw_message: '今天被领导骂了 烦死',
          }),
        );
        console.log('[mock] 已推送私聊消息：「今天被领导骂了 烦死」');
        // 紧接着再推一条：验证"上一轮还没回完时"发的消息不会被丢弃
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              post_type: 'message',
              message_type: 'private',
              sub_type: 'friend',
              message_id: 123457,
              user_id: Number(QQ),
              self_id: 99999,
              time: Math.floor(Date.now() / 1000),
              sender: { user_id: Number(QQ), nickname: '阿屿' },
              message: [{ type: 'text', data: { text: '真的受不了' } }],
              raw_message: '真的受不了',
            }),
          );
          console.log('[mock] 又推了一条：「真的受不了」');
        }, 150);
      }, 300);
      return;
    }

    if (msg.action === 'send_private_msg') {
      const text = msg.params?.message?.[0]?.data?.text ?? '';
      console.log(`[mock] 收到 send_private_msg → ${msg.params.user_id}：${text}`);
      ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 }, echo: msg.echo }));
      if (msg.params.user_id !== Number(QQ)) {
        return finish(1, '[mock] 目标 QQ 不对 ❌');
      }
      if (!text.includes('等我一下') && !text.includes('卡住')) {
        return finish(1, `[mock] 期望兜底话术，实际收到：「${text}」❌`);
      }
      return finish(0, '\n[mock] 端到端链路通了：连接 → 收消息 → 调用失败 → 兜底回复 ✅');
    }

    // 其他调用一律回 ok
    ws.send(JSON.stringify({ status: 'ok', retcode: 0, data: {}, echo: msg.echo }));
  });
});

timeout(30000).catch((e) => finish(1, `\n[mock] ${e.message} ❌`));
