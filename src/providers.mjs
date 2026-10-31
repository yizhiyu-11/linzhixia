/**
 * 两个外部服务的可替换配置：文本模型（聊天）+ 语音合成。
 *
 * 存在 data/providers.json（不进 git），启动时覆盖 .env 里的默认值；
 * 保存后立即生效，不用重启。
 *
 * 注意：这里存的是明文 key（和 .env 一样），文件权限交给操作系统。
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('data', 'providers.json');

export const DEFAULT_PROVIDERS = {
  chat: {
    label: '文本模型（聊天）',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    key: '',
    note: '任何 OpenAI 兼容接口都行：填 baseUrl（到 /v1 之前即可）、模型名、key。',
  },
  voice: {
    label: '语音合成（TTS）',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'qwen-audio-3.1-tts-flash',
    key: '',
    note: '百炼的 qwen-audio / cosyvoice 用这个地址；换供应商要同时改模型名。',
  },
};

const isUrl = (s) => /^https?:\/\/[^\s]+$/i.test(String(s || '').trim());

/** 读文件里的覆盖项，和默认值合并 */
export function loadProviders() {
  const out = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (fs.existsSync(FILE)) {
    try {
      const doc = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''));
      for (const k of Object.keys(out)) {
        if (doc[k] && typeof doc[k] === 'object') {
          for (const f of ['name', 'baseUrl', 'model', 'key']) {
            if (typeof doc[k][f] === 'string' && doc[k][f] !== '') out[k][f] = doc[k][f];
          }
        }
      }
    } catch {
      /* 文件坏了就用默认 */
    }
  }
  return out;
}

/** 把 providers 应用到运行时 config（热更新） */
export function applyProviders(config, providers = loadProviders()) {
  const { chat, voice } = providers;
  if (chat.baseUrl) config.baseUrl = chat.baseUrl.replace(/\/+$/, '');
  if (chat.key) config.apiKey = chat.key;
  if (chat.model) config.model = chat.model;
  if (voice.baseUrl) config.bailianBase = voice.baseUrl.replace(/\/+$/, '');
  if (voice.key) config.bailianKey = voice.key;
  if (voice.model) config.voiceModel = voice.model;
  return providers;
}

/** 保存（部分更新也行），返回合并后的完整配置 */
export function saveProviders(patch = {}) {
  const cur = loadProviders();
  const next = JSON.parse(JSON.stringify(cur));

  for (const k of ['chat', 'voice']) {
    const p = patch[k];
    if (!p || typeof p !== 'object') continue;
    if (typeof p.baseUrl === 'string') {
      const v = p.baseUrl.trim();
      if (v && !isUrl(v)) throw new Error(`${cur[k].label} 的地址要以 http:// 或 https:// 开头`);
      next[k].baseUrl = v || next[k].baseUrl;
    }
    if (typeof p.model === 'string' && p.model.trim()) next[k].model = p.model.trim();
    if (typeof p.name === 'string' && p.name.trim()) next[k].name = p.name.trim();
    // key 单独处理：空字符串表示"不改"，null 表示"清除"
    if (p.key === null) next[k].key = '';
    else if (typeof p.key === 'string' && p.key.trim()) next[k].key = p.key.trim();
  }

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** 打码：只露头尾各 4 位 */
export function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '****';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/** 给前端看的版本：key 只给掩码；eff 是"实际生效的 key"（可能来自 .env） */
export function publicProviders(providers = loadProviders(), eff = {}) {
  const mask = maskKey;
  return {
    file: path.relative(process.cwd(), FILE),
    defaults: Object.fromEntries(Object.entries(DEFAULT_PROVIDERS).map(([k, v]) => [k, { name: v.name, baseUrl: v.baseUrl, model: v.model }])),
    chat: {
      ...providers.chat,
      key: mask(eff.chat || providers.chat.key),
      keySet: Boolean(eff.chat || providers.chat.key),
      keyFromEnv: !providers.chat.key && Boolean(eff.chat),
    },
    voice: {
      ...providers.voice,
      key: mask(eff.voice || providers.voice.key),
      keySet: Boolean(eff.voice || providers.voice.key),
      keyFromEnv: !providers.voice.key && Boolean(eff.voice),
    },
  };
}
