/**
 * 假 OneBot 服务端（测试用，不进安装包）。
 *
 *   node scripts/fake-onebot.mjs [端口] [--say "消息"] [--from QQ]
 *
 * 作用：在本机监听端口，模拟 NapCat 的 OneBot WebSocket：
 *   · 回应 get_login_info / send_private_msg 等动作
 *   · 可选：连上后主动发一条"用户消息"，验证机器人是否回复
 */
import { WebSocketServer } from 'ws';

const args = process.argv.slice(2);
const port = Number(args[0]) || 3001;
const sayIdx = args.indexOf('--say');
const sayText = sayIdx >= 0 ? args[sayIdx + 1] : '';
const fromIdx = args.indexOf('--from');
const fromQq = fromIdx >= 0 ? Number(args[fromIdx + 1]) : 123456789;
const BOT_QQ = 100000001;

const wss = new WebSocketServer({ port });
const clients = new Set();
let seq = 1;

console.log(`[fake-onebot] 监听 ws://127.0.0.1:${port}`);

const reply = (payload) => {
  for (const c of clients) {
    if (c.readyState === c.OPEN) c.send(JSON.stringify(payload));
  }
};

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[fake-onebot] 客户端已连接（当前 ' + clients.size + ' 个）');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const { action, echo, params } = msg;
    console.log(`[fake-onebot] ← ${action}`);

    if (action === 'get_login_info') {
      reply({ status: 'ok', retcode: 0, data: { user_id: BOT_QQ, nickname: '测试机器人' }, echo });
    } else if (action === 'send_private_msg') {
      const text = params?.message;
      console.log(`[fake-onebot] → 机器人发给 ${params?.user_id}：${typeof text === 'string' ? text : JSON.stringify(text)}`);
      reply({ status: 'ok', retcode: 0, data: { message_id: seq++ }, echo });
    } else if (action === 'get_friend_list') {
      reply({ status: 'ok', retcode: 0, data: [{ user_id: fromQq, nickname: '测试用户' }], echo });
    } else {
      reply({ status: 'ok', retcode: 0, data: {}, echo });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[fake-onebot] 客户端断开（剩 ${clients.size} 个）`);
  });

  // 可选：连上后 3 秒发一条用户消息
  if (sayText) {
    setTimeout(() => {
      const event = {
        post_type: 'message',
        message_type: 'private',
        sub_type: 'friend',
        time: Math.floor(Date.now() / 1000),
        self_id: BOT_QQ,
        user_id: fromQq,
        sender: { user_id: fromQq, nickname: '测试用户' },
        message_id: seq++,
        message: [{ type: 'text', data: { text: sayText } }],
        raw_message: sayText,
      };
      console.log(`[fake-onebot] 模拟用户消息：${sayText}`);
      reply(event);
    }, 3000);
  }
});

process.on('SIGINT', () => {
  wss.close();
  process.exit(0);
});
