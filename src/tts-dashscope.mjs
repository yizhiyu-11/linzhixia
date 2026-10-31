/**
 * 百炼实时语音合成（WebSocket 直连）—— 支持自然语言指令和情感标签。
 *
 * 和其他引擎的区别：
 *   · qwen3-tts-flash（现用的 HTTP 接口）只能选音色，不能控制情绪
 *   · qwen-audio-3.x-tts 支持 instruction（"用撒娇的语气说"）和 [tired] 这类标签
 *   · cosyvoice-v3 支持 instruction（系统音色有固定格式要求）
 *
 * 用法：
 *   const { buf } = await synth({ model, voice, text, instruction })
 */
import crypto from 'node:crypto';
import WebSocket from 'ws';

const ENDPOINT = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

/** 情感 → 自然语言指令（给 qwen-audio / cosyvoice 复刻音色用） */
export const EMOTION_INSTRUCTION = {
  撒娇: '用撒娇的语气说，带点鼻音，尾音上扬',
  开心: '用轻快开心的语气说，声音明亮',
  难过: '用低落疲惫的语气，声音轻，尾音下沉',
  生气: '用生气的语气说，音调提高，有点冲',
  平静: '用平常聊天的语气，自然放松',
  调侃: '用调侃的语气，带一点笑意',
  困: '用困倦的语气，含糊一点',
  惊讶: '用惊讶的语气，音调上扬',
};

/**
 * 情绪 → 语速倍率（乘在用户设的基础语速上）。
 * 设计依据：人低落时说话慢、生气时快、撒娇时略慢但不拖。
 */
export const EMOTION_RATE = {
  撒娇: 0.97,
  开心: 1.03,
  难过: 0.94,
  生气: 1.06,
  平静: 1.0,
  调侃: 1.0,
  困: 0.9,
  惊讶: 1.05,
};

export const EMOTION_TAG = {
  撒娇: '[mischievously]',
  开心: '[excited]',
  难过: '[sad]',
  生气: '[angry]',
  平静: '',
  调侃: '[sarcastic]',
  困: '[tired]',
  惊讶: '[amazed]',
};

/**
 * 合成一段文本。
 * @param {object} o
 * @param {string} o.model   qwen-audio-3.1-tts-flash | cosyvoice-v3-flash | cosyvoice-v2 ...
 * @param {string} o.voice   音色名
 * @param {string} o.text    文本（qwen-audio 可含 [tag]）
 * @param {string} [o.instruction] 自然语言指令（≤100 字符）
 * @param {string} [o.format] mp3 | wav | pcm
 * @returns {Promise<{buf: Buffer, events: string[], ms: number}>}
 */
export function synth({ model, voice, text, instruction = '', format = 'mp3', sampleRate = 22050, rate = 1, timeoutMs = 45000, key = process.env.DASHSCOPE_API_KEY }) {
  if (!key) throw new Error('没配 DASHSCOPE_API_KEY');
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const taskId = crypto.randomUUID().replace(/-/g, '');
    const ws = new WebSocket(ENDPOINT, { headers: { Authorization: `bearer ${key}` } });
    const audio = [];
    const events = [];
    let settled = false;
    let started = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve({ buf: Buffer.concat(audio), events, ms: Date.now() - t0 });
    };
    const timer = setTimeout(() => done(new Error(`合成超时 ${timeoutMs}ms`)), timeoutMs);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model,
            parameters: {
              text_type: 'PlainText',
              voice,
              format,
              sample_rate: sampleRate,
              volume: 50,
              rate: Math.min(2, Math.max(0.5, Number(rate) || 1)),
              pitch: 1,
              enable_ssml: false,
              ...(instruction ? { instruction: instruction.slice(0, 100) } : {}),
            },
            input: {},
          },
        }),
      );
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const s = buf.toString('utf8');
      if (s.startsWith('{')) {
        let msg;
        try {
          msg = JSON.parse(s);
        } catch {
          audio.push(buf);
          return;
        }
        const ev = msg?.header?.event;
        events.push(ev);
        if (ev === 'task-started' && !started) {
          started = true;
          ws.send(JSON.stringify({ header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' }, payload: { input: { text } } }));
          ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
        } else if (ev === 'task-failed') {
          done(new Error(`合成失败：${msg?.header?.error_code || ''} ${msg?.header?.error_message || ''}`));
        } else if (ev === 'task-finished') {
          done(null);
        }
        return;
      }
      audio.push(buf);
    });

    ws.on('error', (e) => done(new Error(`WebSocket 错误：${e.message}`)));
    ws.on('close', () => done(null));
  });
}
