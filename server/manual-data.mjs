/**
 * 手册数据：参数表直接从 MODULES 读，保证和代码同步。
 * 同时被 scripts/manual.mjs（生成 markdown）和 /api/manual（后台页面）使用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODULES, moduleValues } from './store.mjs';

const ROOT = path.resolve('.');

/** .env 说明（人工策展；加新变量时记得补一行） */
export const ENV_DOC = {
  DEEPSEEK_API_KEY: ['DeepSeek API Key', '必填。模型调用的钥匙', 'sk-...'],
  DEEPSEEK_BASE_URL: ['模型接口地址', '一般不用改；换中转站时改这里', 'https://api.deepseek.com'],
  DEEPSEEK_MODEL: ['模型名', 'deepseek-chat（快）/ deepseek-reasoner（慢但会想）', 'deepseek-chat'],
  DEEPSEEK_TEMPERATURE: ['温度', '越高越发散；聊天建议 0.9-1.1', '1.0'],
  MAX_TOKENS: ['单次回复上限', '太大会变话痨，太小会截断', '400'],
  ONEBOT_WS_URL: ['OneBot 地址', 'NapCat 的 WebSocket 地址', 'ws://127.0.0.1:3001'],
  ONEBOT_TOKEN: ['OneBot Token', '要和 NapCat 里配的一致', '空'],
  ALLOWED_QQS: ['白名单', '逗号分隔的 QQ 号', '（填你自己的 QQ）'],
  IGNORE_COMMANDS: ['忽略命令式消息', '1=不回 #ls /help 这类指令（默认）；0=照常当聊天回', '1'],
  OWNER_QQ: ['主人 QQ', '主动消息、语音测试发给谁', '（同白名单第一个）'],
  PERSONA: ['人设文件', '对应 personas/<名字>.json', 'default'],
  HISTORY_TURNS: ['上下文轮数', '带多少轮历史给模型', '8'],
  VOICE: ['语音开关', '1 = 会发语音消息', '0'],
  VOICE_ENGINE: ['语音引擎', 'auto / bailian / minimax / edge / sapi', 'auto'],
  VOICE_NAME: ['语音音色', '百炼 voice 名（Cherry/Chelsie…）', 'Chelsie'],
  VOICE_CHANCE: ['语音概率', '每条回复发语音的概率', '0.12'],
  VOICE_SAPI: ['本地兜底音色', 'engine=sapi 时用', 'Microsoft Huihui Desktop'],
  MINIMAX_VOICE: ['MiniMax 音色', 'engine=minimax 时用', 'female-shaonv'],
  SPLIT_REPLY: ['分段回复', '把长回复拆成几条发', '1'],
  SPLIT_MAX: ['最多分几段', '拆太多会显得碎', '3'],
  SPLIT_PAUSE_MIN_MS: ['气泡间隔·下限', '两条消息最短停顿', '700'],
  SPLIT_PAUSE_MAX_MS: ['气泡间隔·上限', '两条消息最长停顿', '2400'],
  TYPING_MS_PER_CHAR: ['打字速度', '毫秒/字，越大越慢', '170'],
  TYPING_MIN_MS: ['单条打字·下限', '再短的消息也停一下', '900'],
  TYPING_MAX_MS: ['单条打字·上限', '再长也不超过这个时间', '7000'],
  THINK_MIN_MS: ['思考下限', '回之前的停顿', '1200'],
  THINK_MAX_MS: ['思考上限', '同上', '4000'],
  PROACTIVE: ['主动消息', '1 = 会主动找你', '1'],
  PROACTIVE_CHANCE: ['主动概率', '每次检查出手的概率', '0.25'],
  PROACTIVE_MAX_PER_DAY: ['每天上限', '超过就不再主动', '3'],
  PROACTIVE_MIN_GAP_MIN: ['最短间隔', '两条主动消息至少隔多少分钟', '180'],
  PROACTIVE_MIN_IDLE_MIN: ['空闲多久才主动', '对方多久没说话才考虑', '90'],
  PROACTIVE_START_HOUR: ['允许时段·起', '几点之后可以主动', '9'],
  PROACTIVE_END_HOUR: ['允许时段·止', '几点之后不再主动', '23'],
  PROACTIVE_TICK_MIN: ['检查频率', '每多少分钟检查一次', '5'],
  READ_LLM: ['二次读空气', '用模型判断"这话该不该接"', '1'],
  READ_LLM_MIN_CONF: ['读空气置信度下限', '低于这个值就不出手', '0.6'],
  AMBIG_SILENCE: ['没看懂就不回的概率', '0.22 = 22% 的看不懂直接不回', '0.22'],
  TYPO_SILENCE: ['手滑就不管的概率', '0.32 = 32% 的错字当没看见', '0.32'],
  LOG_LEVEL: ['日志级别', 'info / warn / debug', 'info'],
  WEB_CONSOLE: ['管理后台', '1 = 启动时开控制台', '1'],
  WEB_PORT: ['后台端口', '被占用时改这里', '3870'],
  DB_PATH: ['数据库路径', '换库时改', 'data/bot.db'],
  BOT_LOCK: ['单实例锁', '1 = 防重复启动', '1'],
  IMAGE_MAX_MB: ['图片大小上限', '超过就不处理', '8'],
  SILICONFLOW_API_KEY: ['硅基流动 Key', '试 CosyVoice2 用，暂未接入', 'sk-...'],
  DASHSCOPE_API_KEY: ['阿里 Key', '百炼语音（qwen3-tts）用', 'sk-...'],
};

const readEnv = () => {
  const p = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
};

const isSecret = (k, v) => /(_KEY|_TOKEN|_SECRET)$/i.test(k) && (v || '').length >= 16;

const mask = (k, v) => {
  if (!isSecret(k, v)) return v || '';
  return v.slice(0, 4) + '…' + v.slice(-2);
};

const fmtRange = (f) => {
  if (f.type === 'boolean') return '开 / 关';
  if (f.type === 'select') return (f.options || []).join(' / ');
  if (f.type === 'list') return '列表';
  if (f.type === 'text') return '文本';
  if (f.min !== undefined || f.max !== undefined) {
    const unit = f.unit ? ` ${f.unit}` : '';
    return `${f.min ?? '−∞'} – ${f.max ?? '+∞'}${unit}`;
  }
  return '数字';
};

const fmtValue = (f, v) => {
  if (v === undefined || v === null) return '—';
  if (f.type === 'boolean') return v ? '开' : '关';
  if (Array.isArray(v)) return v.length ? v.join('、') : '（空）';
  return String(v);
};

export const PRESETS = [
  {
    title: '更像真人',
    note: '代价：回复更慢，偶尔会让你等 5 秒以上。',
    items: [
      ['pacing.thinkMinMs', '1800', ''],
      ['pacing.thinkMaxMs', '5200', ''],
      ['pacing.thinkSlowChance', '0.25', ''],
      ['pacing.typingMsPerChar', '180', ''],
      ['pacing.splitMax', '4', ''],
      ['pacing.splitPauseMinMs', '1100', ''],
      ['pacing.splitPauseMaxMs', '3200', ''],
      ['act.actEngageConfidence', '0.45', '更低 = 更愿意接话'],
    ],
  },
  {
    title: '更安静（她不太打扰你）',
    note: '她基本不会主动找你，聊天时也更常岔开话题。',
    items: [
      ['proactive.proactiveMaxPerDay', '1', ''],
      ['proactive.proactiveMinGapMin', '360', ''],
      ['proactive.proactiveChance', '0.12', ''],
      ['act.actDeflectBelow', '0.35', '更高 = 更常岔开话题'],
      ['safety.riskThreshold', '0.55', '更高 = 更容易闭嘴'],
    ],
  },
  {
    title: '省钱（少调用模型）',
    note: '关掉裁决层会降到"看到就回"，人味会掉一截，只建议月底没钱时用。',
    items: [
      ['act.actLayer', 'off', '关掉裁决层，少一次调用'],
      ['memory.perceive', 'off', '关掉感知层'],
      ['act.styleGuard', 'off', '关掉句式检查'],
      ['model.maxTokens', '260', ''],
      ['memory.historyTurns', '6', ''],
      ['voice.voiceEnabled', 'off', '语音是最贵的'],
    ],
  },
];

export const SCRIPTS = [
  ['scripts/doctor.mjs', '启动前体检（12 项）', 'node --env-file=.env scripts\\doctor.mjs  [--json --fix --net --pre-start]'],
  ['scripts/boot.mjs', '启动编排：体检 → 拉 NapCat → 起 bot', 'node --env-file=.env scripts\\boot.mjs  [--check --no-open --wait=秒]'],
  ['scripts/stop.mjs', '干净地停机器人', 'node scripts\\stop.mjs  [--all --force]'],
  ['scripts/selftest.mjs', '功能自检（14 项）', 'node --env-file=.env scripts\\selftest.mjs'],
  ['scripts/health.mjs', '运行时体检（接口+库+进程）', 'node --env-file=.env scripts\\health.mjs'],
  ['scripts/audit.mjs', '全面审计（安全+数据）', 'node --env-file=.env scripts\\audit.mjs'],
  ['scripts/backup.mjs', '备份数据库', 'node --env-file=.env scripts\\backup.mjs --type 手动'],
  ['scripts/restore.mjs', '从备份恢复', 'node --env-file=.env scripts\\restore.mjs <备份文件>'],
  ['scripts/maintain.mjs', '日志轮转 + 临时文件清理', '启动时自动跑，也可手动'],
  ['scripts/test-startup.mjs', '启动链路场景测试', 'node --env-file=.env scripts\\test-startup.mjs'],
  ['scripts/manual.mjs', '重新生成本手册（markdown）', 'node --env-file=.env scripts\\manual.mjs'],
  ['scripts/tts-ab.mjs', '语音 A/B 对比', 'node --env-file=.env scripts\\tts-ab.mjs [--send]'],
];

export const TROUBLES = [
  ['双击启动，窗口一闪就没了', '以前结尾没有 pause', '现在会停住；命令行加 --no-pause 可直接看输出'],
  ['提示「已经在跑了」但 QQ 收发无反应', '半死状态：bot 活着，NapCat 断了', '现在会自动检测并重启；手动先结束 node.exe 再启动'],
  ['提示「QQ 掉登录了，需要登录」', '本机没有 QQ 登录态，NapCat 只能等扫码', '打开电脑版 QQ 登录你的机器人号，再启动'],
  ['提示「NapCat 没能把端口起来」', '注入失败 / QQ 版本变了', '看 E:\\napcat\\boot.log 末尾'],
  ['提示「数据库被锁」', '两个机器人实例同时在跑', '结束多余的 node.exe'],
  ['提示「管理后台端口被占」', '3870 被别的程序占了', '改 .env 的 WEB_PORT，或关掉占用程序'],
  ['提示「API key 无效 / 余额不足」', '.env 里的 key 有问题', '换 key / 充值，然后重启'],
  ['她不回消息', '白名单 / 拿不准就不回（AMBIG_SILENCE）', '看后台「对话回放」里这一轮的裁决'],
  ['语气变了', '人设文件被改 / 参数被调', '看后台「人设」和「裁决层」'],
];

export const EFFECT_RULES = [
  ['后台页面（config.json）', '下一次对话就生效（热更新）'],
  ['直接编辑 config.json', '重启后生效（不重启读的是内存里的旧值）'],
  ['.env', '必须重启'],
  ['personas/*.json', '下一次生成就生效'],
  ['stickers/index.json', '后台有「重新加载」按钮，或重启'],
];

/** 给前台 / markdown 用的完整数据 */
export function buildManual() {
  const modules = Object.entries(MODULES).map(([id, mod]) => {
    const values = moduleValues(id) || {};
    return {
      id,
      title: mod.title,
      icon: mod.icon,
      desc: mod.desc || '',
      fields: mod.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        help: (f.help || '').replace(/\n/g, ' '),
        range: fmtRange(f),
        value: fmtValue(f, values[f.key]),
      })),
    };
  });

  const rawEnv = readEnv();
  const env = Object.entries(rawEnv).map(([k, v]) => {
    const doc = ENV_DOC[k];
    return {
      key: k,
      title: doc ? doc[0] : '（未收录）',
      help: doc ? doc[1] : '见 src/config.mjs',
      value: mask(k, v),
      secret: isSecret(k, v),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    modules,
    env,
    presets: PRESETS,
    scripts: SCRIPTS,
    troubles: TROUBLES,
    effects: EFFECT_RULES,
    counts: {
      modules: modules.length,
      fields: modules.reduce((n, m) => n + m.fields.length, 0),
      env: env.length,
    },
  };
}
