/** 配置：全部来自 .env（用 node --env-file 加载），集中校验一次，别在各处读 process.env */
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  // QQ / OneBot
  wsUrl: process.env.ONEBOT_WS_URL || 'ws://127.0.0.1:3001',
  wsToken: process.env.ONEBOT_TOKEN || '',
  whitelistEnabled: (process.env.WHITELIST ?? '1') !== '0',
  allowedQqs: list(process.env.ALLOWED_QQS),
  ownerQq: (process.env.OWNER_QQ || '').trim(),

  // 模型
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  temperature: num(process.env.DEEPSEEK_TEMPERATURE, 1.2),

  // 行为
  persona: process.env.PERSONA || 'default',
  historyTurns: num(process.env.HISTORY_TURNS, 8),
  summaryEvery: num(process.env.SUMMARY_EVERY, 24),
  perceive: (process.env.PERCEIVE ?? '1') !== '0',
  actLayer: (process.env.ACT_LAYER ?? '1') !== '0',
  uaffect: (process.env.UAFFECT ?? '1') !== '0',
  actDeflectBelow: num(process.env.ACT_DEFLECT_BELOW, 0.2),
  actEngageConfidence: num(process.env.ACT_ENGAGE_CONF, 0.5),
  actMediaAskBelow: num(process.env.ACT_MEDIA_ASK_BELOW, 0.35),
  actMediaEngageBelow: num(process.env.ACT_MEDIA_ENGAGE_BELOW, 0.6),
  actRepeatImageLimit: num(process.env.ACT_REPEAT_IMAGE_LIMIT, 3),
  stickerGifMinGapMin: num(process.env.STICKER_GIF_MIN_GAP_MIN, 12),
  stickerBaseP: num(process.env.STICKER_BASE_P, 0.15),
  stickerMaxPerDay: num(process.env.STICKER_MAX_PER_DAY, 25),
  stickerPureP: num(process.env.STICKER_PURE_P, 0.25),
  styleGuard: (process.env.STYLE_GUARD ?? '1') !== '0',
  styleOpenRepeat: num(process.env.STYLE_OPEN_REPEAT, 3),
  styleSimMax: num(process.env.STYLE_SIM_MAX, 0.55),
  readLlm: (process.env.READ_LLM ?? '1') !== '0',
  readLlmMinConf: num(process.env.READ_LLM_MIN_CONF, 0.6),
  typoSilence: num(process.env.TYPO_SILENCE, 0.32),
  ambiguSilence: num(process.env.AMBIG_SILENCE, 0.22),
  maxTokens: num(process.env.MAX_TOKENS, 500),
  typingMsPerChar: num(process.env.TYPING_MS_PER_CHAR, 150),
  typingMinMs: num(process.env.TYPING_MIN_MS, 900),
  typingMaxMs: num(process.env.TYPING_MAX_MS, 7000),

  // 节奏：思考延迟（收到 → 开始打字）
  thinkMinMs: num(process.env.THINK_MIN_MS, 1500),
  thinkMaxMs: num(process.env.THINK_MAX_MS, 3800),
  thinkSlowChance: num(process.env.THINK_SLOW_CHANCE, 0.18),
  thinkSlowMaxMs: num(process.env.THINK_SLOW_MAX_MS, 9000),

  // 分段发送：把一段话拆成几个气泡
  splitReply: (process.env.SPLIT_REPLY ?? '1') !== '0',
  splitMax: num(process.env.SPLIT_MAX, 3),
  splitPauseMinMs: num(process.env.SPLIT_PAUSE_MIN_MS, 700),
  splitPauseMaxMs: num(process.env.SPLIT_PAUSE_MAX_MS, 2400),  // 语音
  voiceEnabled: (process.env.VOICE ?? '1') !== '0',
  voiceChance: num(process.env.VOICE_CHANCE, 0.12),
  voiceName: process.env.VOICE_NAME || 'zh-CN-XiaoxiaoNeural',
  // qwen-audio 引擎专用：默认温柔音 + 俏皮音（撒娇/调侃/开心时自动切过去）
  voiceRate: num(process.env.VOICE_RATE, 1),
  voiceRateByEmotion: (process.env.VOICE_RATE_BY_EMOTION ?? '1') !== '0',
  voiceUseTags: (process.env.VOICE_USE_TAGS ?? '1') !== '0',
  voiceChanceStrong: num(process.env.VOICE_CHANCE_STRONG, 0.35),
  voiceMaxChars: num(process.env.VOICE_MAX_CHARS, 30),
  voiceCapDay: num(process.env.VOICE_CAP_DAY, 25),
  voiceMinGapMin: num(process.env.VOICE_MIN_GAP_MIN, 10),
  qwenVoice: process.env.VOICE_QWEN || 'longanlingxin_v3.1',
  qwenVoiceAlt: process.env.VOICE_QWEN_ALT || 'qiaoxiaojiao_v3.1',
  qwenVoiceCustom: process.env.VOICE_QWEN_CUSTOM || '',
  botEnv: process.env.BOT_ENV || 'prod',
  voiceSapi: process.env.VOICE_SAPI || 'Microsoft Huihui Desktop',
  voiceEngine: process.env.VOICE_ENGINE || 'auto', // auto | bailian | minimax | edge | sapi
  minimaxVoice: process.env.MINIMAX_VOICE || 'female-shaonv',
  bailianKey: process.env.DASHSCOPE_API_KEY || '',
  bailianBase: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com',


  // 主动开口
  proactiveEnabled: (process.env.PROACTIVE ?? '1') !== '0',
  proactiveTickMs: num(process.env.PROACTIVE_TICK_MIN, 5) * 60_000,
  proactiveMinIdleMin: num(process.env.PROACTIVE_MIN_IDLE_MIN, 90),
  proactiveMinGapMin: num(process.env.PROACTIVE_MIN_GAP_MIN, 180),
  proactiveMaxPerDay: num(process.env.PROACTIVE_MAX_PER_DAY, 3),
  proactiveChance: num(process.env.PROACTIVE_CHANCE, 0.3),
  proactiveStartHour: num(process.env.PROACTIVE_START_HOUR, 9),
  proactiveEndHour: num(process.env.PROACTIVE_END_HOUR, 23),
  ignoreCommands: (process.env.IGNORE_COMMANDS ?? '1') !== '0',
  safetyRefuse: (process.env.SAFETY_REFUSE ?? '1') !== '0',
  safetyCare: (process.env.SAFETY_CARE ?? '1') !== '0',
  riskThreshold: num(process.env.RISK_THRESHOLD, 3),
  riskPauseMin: num(process.env.RISK_PAUSE_MIN, 10),

  // 存储（相对项目根目录）
  // 识图：单张图上限（字节）
  imageMaxBytes: num(process.env.IMAGE_MAX_MB, 5) * 1024 * 1024,

  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve('data', 'bot.db'),

  logLevel: process.env.LOG_LEVEL || 'info',

  // 计价（元 / 百万 token）。DeepSeek 现价会变，这里只用于估算，别当账单。
  price: { input: 2, output: 8 },
};

// ── config.json 覆盖层 ─────────────────────────────────────────
// 后台管理的参数写在这里；密钥永远只从 .env 读，不进 config.json。
// 结构是 { 模块名: { 参数名: 值 } }，参数名和 config 的键一一对应。
export const CONFIG_FILE = process.env.CONFIG_FILE ? path.resolve(process.env.CONFIG_FILE) : path.resolve('config.json');

function flattenSections(doc) {
  const flat = {};
  for (const [section, values] of Object.entries(doc || {})) {
    if (!values || typeof values !== 'object') continue;
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== null) flat[k] = v;
    }
  }
  return flat;
}

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const doc = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
    Object.assign(config, flattenSections(doc));
  }
} catch (e) {
  console.warn(`! config.json 读取失败，改用 .env 默认值：${e.message}`);
}

/** 启动前的硬校验：缺了就早点报错，别等到第一条消息才炸 */
export function assertConfig() {
  const fatal = [];
  const warn = [];
  if (!config.apiKey) warn.push('DEEPSEEK_API_KEY 未设置——能连上 QQ，但每条消息都会走兜底回复');
  if (config.allowedQqs.length === 0) warn.push('ALLOWED_QQS 为空：任何加了这个号的人都能触发她');
  if (!/^wss?:\/\//.test(config.wsUrl)) fatal.push(`ONEBOT_WS_URL 不是 ws:// 或 wss://：${config.wsUrl}`);

  for (const w of warn) console.warn('! ' + w);
  if (fatal.length) {
    for (const f of fatal) console.error('✗ ' + f);
    process.exit(1);
  }
}
