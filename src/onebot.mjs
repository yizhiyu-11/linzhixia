/**
 * OneBot v11 客户端（NapCat 用这个协议）
 * 只做三件事：连上去、把事件归一化成 {userId, nickname, text, images}、能发消息。
 */
import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

/** CQ 码剥离：老式字符串消息里可能带 [CQ:image,file=xxx] 这类标记 */
function stripCq(text) {
  return String(text || '').replace(/\[CQ:[^\]]+\]/g, '');
}

/** 把 OneBot 的 message（数组或字符串）压成纯文本 + 图片源列表 */
function normalizeMessage(message) {
  const images = [];
  const faces = [];
  if (typeof message === 'string') {
    const cqImages = message.match(/\[CQ:image,[^\]]*\]/g) || [];
    for (const seg of cqImages) {
      const m = seg.match(/url=([^,\]]+)/);
      if (m) images.push(m[1]);
    }
    return { text: stripCq(message).trim(), images, faces };
  }
  const parts = [];
  for (const seg of Array.isArray(message) ? message : []) {
    if (seg?.type === 'text') parts.push(seg.data?.text ?? '');
    else if (seg?.type === 'image') {
      // NapCat 一般给 url；有的版本只给 file
      const src = seg.data?.url || seg.data?.file;
      if (src) images.push(src);
    } else if (seg?.type === 'face') {
      // QQ 小黄脸：不占图片通道，但语义很明确，记下 id
      if (seg.data?.id != null) faces.push(Number(seg.data.id));
    }
  }
  return { text: parts.join('').trim(), images, faces };
}

export class OneBot extends EventEmitter {
  constructor({ url, token, log }) {
    super();
    this.url = url;
    this.token = token;
    this.log = log;
    this.ws = null;
    this.pending = new Map(); // echo -> {resolve, reject, timer}
    this.seq = 0;
    this.closedByUser = false;
    this.seen = new Map(); // message_id -> 时间戳（去重，微信/QQ 都会重推）
    this.backoff = 1000;
    this.ready = false;
  }

  start() {
    const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
    this.log.info(`连接 OneBot：${this.url}`);
    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', async () => {
      this.log.info('OneBot 已连接');
      this.backoff = 1000;
      this.ready = true;
      try {
        this.failStreak = 0;
        this.hinted = false;
        const info = await this.call('get_login_info', {});
        this.log.info(`登录账号：${info?.nickname}（${info?.user_id}）`);
        this.emit('ready', info);
      } catch (e) {
        this.log.warn(`get_login_info 失败：${e.message}`);
        this.emit('ready', null);
      }
    });

    this.ws.on('message', (buf) => this.#onFrame(buf));

    this.ws.on('close', (code) => {
      this.ready = false;
      if (this.closedByUser) return;
      this.log.warn(`OneBot 断开（code=${code}），${this.backoff}ms 后重连`);
      setTimeout(() => this.start(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    });

    this.ws.on('error', (e) => {
      this.log.warn(`OneBot 错误：${e.message}`);
      const refused = String(e.message || '').includes('ECONNREFUSED');
      if (refused) {
        this.failStreak = (this.failStreak || 0) + 1;
        // 连续失败到第 5 次时，给一条人话提示（只提示一次）
        if (this.failStreak === 5 && !this.hinted) {
          this.hinted = true;
          this.log.warn('一直连不上 OneBot（已重试 5 次）。常见原因：');
          this.log.warn('  1) OneBot 工具（如 NapCat / SnowLuma）没有启动');
          this.log.warn('  2) 工具启动了，但 QQ 版本不匹配，注入失败 —— 看工具窗口的报错');
          this.log.warn('  3) 端口不是 3001，或地址写在 app\\.env 的 ONEBOT_WS_URL 里');
          this.log.warn('  4) OneBot 设了 token，但 .env 里的 ONEBOT_TOKEN 没填/不一致');
          this.log.warn('处理：先双击「林知夏 测试连接」看具体原因；浏览器聊天不受影响。');
        }
      }
    });
  }

  #onFrame(buf) {
    let data;
    try {
      data = JSON.parse(buf.toString());
    } catch {
      return;
    }

    // 1) 响应帧：带 echo
    if (data.echo !== undefined && this.pending.has(data.echo)) {
      const p = this.pending.get(data.echo);
      this.pending.delete(data.echo);
      clearTimeout(p.timer);
      if (data.status === 'failed' || data.retcode !== 0) {
        p.reject(new Error(`OneBot ${data.retcode}: ${data.message || data.wording || '调用失败'}`));
      } else {
        p.resolve(data.data);
      }
      return;
    }

    // 2) 事件帧
    if (data.post_type === 'message') this.#onMessage(data);
    else if (data.post_type === 'meta_event') this.log.debug(`meta_event: ${data.meta_event_type}`);
  }

  #onMessage(ev) {
    const id = ev.message_id;
    if (id != null) {
      if (this.seen.has(id)) return;
      this.seen.set(id, Date.now());
      if (this.seen.size > 500) {
        const cutoff = Date.now() - 5 * 60_000;
        for (const [k, t] of this.seen) if (t < cutoff) this.seen.delete(k);
      }
    }

    const { text, images, faces } = normalizeMessage(ev.message);
    const payload = {
      userId: String(ev.user_id),
      nickname: ev.sender?.card || ev.sender?.nickname || '',
      text,
      images,
      faces: faces || [],
      messageType: ev.message_type, // private | group
      groupId: ev.group_id ? String(ev.group_id) : null,
      time: ev.time,
    };

    // 纯系统表情（小黄脸）也是消息，别当空消息丢掉
    if (!text && images.length === 0 && (faces || []).length === 0) return;
    this.emit('message', payload);
  }

  /** 调用 OneBot API，10 秒超时 */
  call(action, params = {}, timeoutMs = 10000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('OneBot 未连接'));
    }
    const echo = `c${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`OneBot ${action} 超时`));
      }, timeoutMs);
      this.pending.set(echo, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ action, params, echo }));
    });
  }

  /** 发私聊文本。auto_escape 防止用户内容里的 CQ 码被解析 */
  async sendPrivate(userId, text) {
    return this.call('send_private_msg', {
      user_id: Number(userId),
      message: [{ type: 'text', data: { text } }],
      auto_escape: true,
    });
  }

  /** 发语音。给本地文件路径，NapCat 内部用 ffmpeg 转 silk */
  async sendRecord(userId, filePath) {
    const file = 'file:///' + String(filePath).replace(/\\/g, '/');
    return this.call('send_private_msg', {
      user_id: Number(userId),
      message: [{ type: 'record', data: { file } }],
    });
  }

  /** 发表情包 / 图片。给本地文件路径 */
  async sendImage(userId, filePath) {
    const file = 'file:///' + String(filePath).replace(/\\/g, '/');
    return this.call('send_private_msg', {
      user_id: Number(userId),
      message: [{ type: 'image', data: { file } }],
    });
  }

  stop() {
    this.closedByUser = true;
    this.ws?.close();
  }
}
