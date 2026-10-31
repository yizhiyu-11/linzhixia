/**
 * 配置中心：把 config.json 管起来。
 *
 * 设计要点：
 *  · 模块化 —— 每个模块一组字段，字段自带 label/type/min/max/help 等元信息，
 *    前端完全按这份 schema 渲染，加参数只需要在这里加一行。
 *  · 热更新 —— 改完直接 Object.assign 到内存里的 config，下一轮对话就生效。
 *  · 密钥不进这里 —— API Key 永远只从 .env 读，这里不碰。
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, CONFIG_FILE } from '../src/config.mjs';

/** 字段类型：number | range | boolean | select | text | list */
export const MODULES = {
  access: {
    title: '访问权限',
    icon: '🔐',
    desc: '谁能触发她。改完立即生效，不用重启。',
    fields: [
      {
        key: 'whitelistEnabled',
        label: '启用白名单',
        type: 'boolean',
        help: '开=只有下面名单里的 QQ 能跟她聊；关=任何加了她好友的人都能触发（小号风险高，别关）。',
      },
      {
        key: 'allowedQqs',
        label: '白名单',
        type: 'list',
        help: '允许跟她聊天的 QQ 号。输入后回车或点「添加」，点标签上的 × 移除。建议 3-5 个。',
      },
    ],
  },

  persona: {
    title: '人设',
    icon: '🎭',
    desc: '她是谁、怎么说话。改完下一轮对话生效。',
    fields: [
      {
        key: 'persona',
        label: '人设文件',
        type: 'select',
        options: ['default', 'friend', 'tsundere'],
        help: '对应 personas/ 目录下的同名 .json。default=林知夏（温柔粘人）、friend=周叙（毒舌朋友）、tsundere=沈野（傲娇）。',
      },
    ],
  },

  pacing: {
    title: '对话节奏',
    icon: '⏱',
    desc: '她回消息的快慢和分段方式。这几个参数最影响"像不像真人"。',
    fields: [
      {
        key: 'thinkMinMs',
        label: '思考延迟·下限',
        type: 'number',
        min: 0,
        max: 20000,
        step: 100,
        unit: 'ms',
        help: '收到消息到"开始打字"之间的最短等待。太短会显得秒回，不像在思考。',
      },
      {
        key: 'thinkMaxMs',
        label: '思考延迟·上限',
        type: 'number',
        min: 0,
        max: 30000,
        step: 100,
        unit: 'ms',
        help: '最长等多久才开始打字。对方说的话越长，实际延迟会在这个区间里偏移。',
      },
      {
        key: 'thinkSlowChance',
        label: '分心概率',
        type: 'range',
        min: 0,
        max: 0.6,
        step: 0.02,
        unit: '',
        help: '每轮有多大概率"先去干点别的再回来"：走慢档（thinkMaxMs ~ 慢档上限）。0.18 = 五次里有一次明显慢。真人不是条条秒回。',
      },
      {
        key: 'thinkSlowMaxMs',
        label: '分心档·上限',
        type: 'number',
        min: 4000,
        max: 30000,
        step: 500,
        unit: 'ms',
        help: '分心时最长拖多久才回。设成 9000 = 最多 9 秒。',
      },      {
        key: 'typingMsPerChar',
        label: '打字速度',
        type: 'range',
        min: 0,
        max: 400,
        step: 10,
        unit: 'ms/字',
        help: '每个字模拟多少毫秒。150 ≈ 每秒 6.7 字，接近手机打字；调小=手更快。',
      },
      {
        key: 'typingMinMs',
        label: '单条打字·下限',
        type: 'number',
        min: 0,
        max: 10000,
        step: 100,
        unit: 'ms',
        help: '再短的消息也要"抬手"一下的时间，避免零延迟。',
      },
      {
        key: 'typingMaxMs',
        label: '单条打字·上限',
        type: 'number',
        min: 500,
        max: 30000,
        step: 500,
        unit: 'ms',
        help: '再长的消息也不超过这个时间，防止让人干等。',
      },
      {
        key: 'splitReply',
        label: '拆成多条发',
        type: 'boolean',
        help: '开=一段话拆成几个气泡逐条发（更像真人）；关=整段一次发完。',
      },
      {
        key: 'splitMax',
        label: '单轮最多几条',
        type: 'number',
        min: 1,
        max: 8,
        step: 1,
        unit: '条',
        help: '拆气泡的上限。太多会像刷屏，建议 3-4。',
      },
      {
        key: 'splitPauseMinMs',
        label: '气泡间隔·下限',
        type: 'number',
        min: 0,
        max: 10000,
        step: 100,
        unit: 'ms',
        help: '两条消息之间的最短停顿。真人打完一条会想一下再说下一句。',
      },
      {
        key: 'splitPauseMaxMs',
        label: '气泡间隔·上限',
        type: 'number',
        min: 0,
        max: 15000,
        step: 100,
        unit: 'ms',
        help: '两条消息之间最长停顿。',
      },
    ],
  },

  proactive: {
    title: '主动消息',
    icon: '📤',
    desc: '她多久主动找你一次、什么时段能找你。',
    fields: [
      {
        key: 'proactiveEnabled',
        label: '启用主动消息',
        type: 'boolean',
        help: '关掉后她只在你说话时回应。',
      },
      {
        key: 'proactiveMaxPerDay',
        label: '每天最多几条',
        type: 'number',
        min: 0,
        max: 10,
        step: 1,
        unit: '条',
        help: '包括所有类型的主动开口。',
      },
      {
        key: 'proactiveMinIdleMin',
        label: '你多久没说话才发',
        type: 'number',
        min: 10,
        max: 720,
        step: 10,
        unit: '分钟',
        help: '太短会显得催，太长就变成冷场。',
      },
      {
        key: 'proactiveMinGapMin',
        label: '两次主动的间隔',
        type: 'number',
        min: 30,
        max: 720,
        step: 10,
        unit: '分钟',
        help: '上次主动没得到回复时，实际间隔会自动翻倍（最多 12 小时）。',
      },
      {
        key: 'proactiveChance',
        label: '到点后真的开口的概率',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        unit: '',
        help: '每次检查都有一次掷骰子，调低会更"随缘"。',
      },
      {
        key: 'proactiveStartHour',
        label: '早上几点开始',
        type: 'number',
        min: 0,
        max: 23,
        step: 1,
        unit: '点',
        help: '',
      },
      {
        key: 'proactiveEndHour',
        label: '晚上几点以后不发',
        type: 'number',
        min: 0,
        max: 24,
        step: 1,
        unit: '点',
        help: '半夜找你会很怪，建议 23。',
      },
    ],
  },

  memory: {
    title: '记忆参数',
    icon: '🧩',
    desc: '带多少轮原文、多久压一次摘要。',
    fields: [
      {
        key: 'historyTurns',
        label: '带多少轮原文',
        type: 'number',
        min: 2,
        max: 30,
        step: 1,
        unit: '轮',
        help: '太多会稀释重点、也更贵；8 轮通常够。',
      },
      {
        key: 'summaryEvery',
        label: '每多少条压一次摘要',
        type: 'number',
        min: 10,
        max: 100,
        step: 2,
        unit: '条',
        help: '越频繁记得越细，但调用更多。',
      },
      {
        key: 'perceive',
        label: '感知层',
        type: 'boolean',
        help: '关掉后退回纯规则判断，只省一次调用，但"读空气"会明显变笨。',
      },
      {
        key: 'styleGuard',
        label: '句式固化检查',
        type: 'boolean',
        help: '最近 20 条里同一个开头反复出现时，提醒她换个说法。',
      },
    ],
  },

  model: {
    title: '模型',
    icon: '⚙️',
    desc: '用哪个模型、多大胆。改完下一轮生效。',
    fields: [
      {
        key: 'model',
        label: '模型',
        type: 'select',
        options: ['deepseek-chat', 'deepseek-reasoner'],
        help: 'chat 快且便宜；reasoner 会想更久、更贵，日常聊天不划算。',
      },
      {
        key: 'temperature',
        label: '发散程度',
        type: 'range',
        min: 0.2,
        max: 1.6,
        step: 0.05,
        unit: '',
        help: '调高更跳、更容易说错；1.0-1.3 是聊天手感比较好的区间。',
      },
      {
        key: 'maxTokens',
        label: '单条回复上限',
        type: 'number',
        min: 100,
        max: 2000,
        step: 50,
        unit: 'token',
        help: '太大她可能一口气说很长。',
      },
    ],
  },

  safety: {
    title: '安全',
    icon: '🛡',
    desc: '风控和话题降级。一般不用动。',
    fields: [
      {
        key: 'ignoreCommands',
        label: '忽略命令式消息',
        type: 'boolean',
        help: '有人发 #ls、/help 这类指令时不回（会被当成聊天内容，回得很怪）。',
      },
      {
        key: 'safetyRefuse',
        label: '拦截违规话题',
        type: 'boolean',
        help: '涉毒/违法类问题直接不接，避免账号风险。',
      },
      {
        key: 'safetyCare',
        label: '自伤话题转关心',
        type: 'boolean',
        help: '检测到自伤倾向时，改成关心语气而不是照常聊天。',
      },
      {
        key: 'riskThreshold',
        label: '连续发送失败几次熔断',
        type: 'number',
        min: 1,
        max: 10,
        step: 1,
        unit: '次',
        help: '连续失败到这个次数就停一会儿，别把号往枪口上送。',
      },
      {
        key: 'riskPauseMin',
        label: '熔断停多久',
        type: 'number',
        min: 1,
        max: 120,
        step: 1,
        unit: '分钟',
        help: '',
      },
    ],
  },

  act: {
    title: '裁决层',
    icon: '🎯',
    desc: '决定这一轮该接住、先接情绪、还是岔开。阈值都是"越低越保守"。',
    fields: [
      {
        key: 'actLayer',
        label: '启用裁决层',
        type: 'boolean',
        help: '关掉后她按权重随机选姿态（旧的 v1 行为）。出问题时可以先关掉对比。',
      },
      {
        key: 'actDeflectBelow',
        label: '岔开 · 连续度阈值',
        type: 'range',
        min: 0,
        max: 0.6,
        step: 0.05,
        unit: '',
        help: '这句话和上一轮的连续度低于此值时才考虑岔开。调高 = 更容易岔开（更容易"自说自话"）。',
      },
      {
        key: 'actEngageConfidence',
        label: '敷衍判定 · 置信度',
        type: 'range',
        min: 0.3,
        max: 0.9,
        step: 0.05,
        unit: '',
        help: '要认定"他在敷衍"需要多高置信度。调高 = 更少走"别硬聊"这条路。',
      },
      {
        key: 'actMediaAskBelow',
        label: '图片 · 直接问阈值',
        type: 'range',
        min: 0,
        max: 0.8,
        step: 0.05,
        unit: '',
        help: '看图的置信度低于此值，就不猜了，直接问"这图啥意思"。',
      },
      {
        key: 'actMediaEngageBelow',
        label: '图片 · 接情绪阈值',
        type: 'range',
        min: 0.2,
        max: 1,
        step: 0.05,
        unit: '',
        help: '置信度在这两个值之间时，先接情绪、不硬解读。',
      },
      {
        key: 'styleGuard',
        label: '句式固化检查',
        type: 'boolean',
        help: '开启后，最近 20 条里同一个开头出现多次，会提醒她换个说法。',
      },
      {
        key: 'styleOpenRepeat',
        label: '开头重复几次算固化',
        type: 'number',
        min: 2,
        max: 8,
        step: 1,
        unit: '次',
        help: '同一个开头（前 3 个字）出现这么多次，就提醒她换。3 = 三次算固化。',
      },
      {
        key: 'styleSimMax',
        label: '整体相似阈值',
        type: 'range',
        min: 0.3,
        max: 0.9,
        step: 0.05,
        unit: '',
        help: '最近 20 条里两两相似度超过这个值就认为说法重复。调低=更严格。',
      },
      {
        key: 'actRepeatImageLimit',
        label: '刷图判定 · 第几次',
        type: 'number',
        min: 2,
        max: 10,
        step: 1,
        unit: '次',
        help: '同一张图 10 分钟内发到第几次开始敷衍。设 3 = 第 3 次起不再认真接。',
      },
    ],
  },

  voice: {
    title: '语音',
    icon: '🎤',
    desc: '她能不能发语音、多常发、用什么嗓子。',
    fields: [
      {
        key: 'voiceEnabled',
        label: '启用语音',
        type: 'boolean',
        help: '关闭后她只发文字。对方明确要语音时也不会发。',
      },
      {
        key: 'voiceRate',
        label: '??',
        type: 'range',
        min: 0.5,
        max: 2,
        step: 0.05,
        help: 'qwen-audio ????????1.0 = ???0.9 ???????????1.1 ????',
      },
      {
        key: 'voiceUseTags',
        label: '用情感标签（推荐）',
        type: 'boolean',
        help: '开 = 在文本前插 [mischievously] 这种官方标签，让模型自己演；关 = 改用自然语言指令。标签实测比指令更像真的。',
      },
      {
        key: 'voiceRateByEmotion',
        label: '??????',
        type: 'boolean',
        help: '? = ?????0.88???????1.12???????0.92??? = ???????????',
      },
      {
        key: 'voiceChanceStrong',
        label: '情绪明显时转语音概率',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        help: '撒娇/生气/难过/开心这几类情绪，而且句子不超过「最长字数」时，用这个概率发语音。0.35 = 三次里有一次。',
      },
      {
        key: 'voiceMaxChars',
        label: '语音最长字数',
        type: 'number',
        min: 5,
        max: 100,
        help: '超过这个长度就不发语音（念起来太长，对方也没耐心听）。30 字约 8-10 秒。',
      },
      {
        key: 'voiceCapDay',
        label: '每天语音上限',
        type: 'number',
        min: 0,
        max: 200,
        help: '一天最多发几条语音。超过就只发文字。',
      },
      {
        key: 'voiceMinGapMin',
        label: '两条语音最短间隔（分钟）',
        type: 'number',
        min: 0,
        max: 240,
        help: '避免连着发语音，很烦人。',
      },
      {
        key: 'voiceChance',
        label: '普通回复转语音概率',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: '每轮回复有多大概率直接变成语音。0.12 = 大约每 8 条回复有 1 条是语音。',
      },
      {
        key: 'voiceName',
        label: '音色',
        type: 'select',
        options: [
          'Chelsie',
          'Cherry',
          'Serena',
          'Jada',
          'Sunny',
          'Katerina',
          'Jennifer',
          'Mia',
          'Ethan',
          'Dylan',
          'Ryan',
        ],
        help: '阿里云百炼 qwen3-tts 的音色。Chelsie 偏知性，Cherry 偏甜，Serena 偏温柔；Ethan/Dylan/Ryan 是男声。',
      },
      {
        key: 'voiceEngine',
        label: '引擎策略',
        type: 'select',
        options: ['qwen-audio', 'auto', 'minimax', 'bailian', 'edge', 'sapi'],
        help: 'auto=百炼优先，失败退 Edge，再退 Windows 本地；minimax=MiniMax（有情绪，¥3.5/万字符）；bailian=qwen3-tts（最便宜，¥0.11/万字符）；sapi=本地离线。',
      },
      {
        key: 'qwenVoice',
        label: 'qwen-audio 音色',
        type: 'select',
        options: [
          'longanlingxin_v3.1',
          'qiaoxiaojiao_v3.1',
          'anxiaolan_v3.1',
          'longanlingxi_v3.1',
          'longyuan_v3.1',
          'wenhuaiqing_v3.1',
          'xieshurou_v3.1',
        ],
        help: '引擎选 qwen-audio 时生效。lingxin=知心温暖、qiaojiao=俏丽可爱、anxiaolan=清甜、lingxi=可爱甜美、longyuan=温暖治愈。',
      },
      {
        key: 'qwenVoiceCustom',
        label: '自定义音色 ID（可选）',
        type: 'text',
        help: '用「声音设计」或「声音复刻」生成的自定义音色 ID（形如 qwen-audio-3.1-tts-flash-xxxx）。填了就忽略上面两个音色，全部用它。',
      },
      {
        key: 'qwenVoiceAlt',
        label: 'qwen-audio 俏皮音色',
        type: 'select',
        options: ['qiaoxiaojiao_v3.1', 'longanlingxi_v3.1', 'anxiaolan_v3.1', 'longanlingxin_v3.1'],
        help: '撒娇、调侃、开心这三种情绪时自动换成这个音色，平时用上面那个。',
      },
      {
        key: 'minimaxVoice',
        label: 'MiniMax 音色',
        type: 'select',
        options: ['female-shaonv', 'female-tianmei', 'female-yujie', 'female-chengshu', 'male-qn-qingse'],
        help: '只在引擎选 minimax 时生效。shaonv=少女、tianmei=甜美、yujie=御姐、chengshu=成熟、qn-qingse=青年男声。',
      },      {
        key: 'voiceSapi',
        label: '本地兜底音色',
        type: 'text',
        help: 'Windows 自带语音的名字，一般不用改。当前机器上可用的是 Microsoft Huihui Desktop（中文女声）。',
      },
    ],
  },

  stickers: {
    title: '表情包',
    icon: '🖼',
    desc: '她发表情包的频率和方式。表情库在 stickers/ 目录，数量看后台「表情库」页。',
    fields: [
      {
        key: 'stickerEnabled',
        label: '启用表情包',
        type: 'boolean',
        help: '关闭后完全不发表情包，只看文字。',
      },
      {
        key: 'stickerFallbackChance',
        label: '兜底发表情包概率',
        type: 'range',
        min: 0,
        max: 0.3,
        step: 0.01,
        unit: '',
        help: '模型很少主动要求发表情包，这个概率是"没要求时也强行发一张"的兜底。0.08 = 大约每 12 轮一张。',
      },      {
        key: 'stickerPureChance',
        label: '只发图不说话概率',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        unit: '',
        help: '决定了发表情包时，有多大概率一个字都不打、纯甩一张图。0.2 = 五次里有一次。这是最像真人的瞬间。',
      },
    ],
  },
};

function readDoc() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function writeDoc(doc) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(doc, null, 2), 'utf8');
}

/** 当前值（从内存里的 config 读，保证和运行时一致） */
export function saveRawConfig(section, obj) {
  const doc = readDoc();
  doc[section] = { ...(doc[section] || {}), ...obj };
  writeDoc(doc);
  Object.assign(config, obj);
  return { ok: true, section, values: obj };
}

export function moduleValues(id) {
  const mod = MODULES[id];
  if (!mod) return null;
  const out = {};
  for (const f of mod.fields) out[f.key] = config[f.key];
  return out;
}

export function allModules() {
  return Object.entries(MODULES).map(([id, m]) => ({
    id,
    title: m.title,
    icon: m.icon,
    desc: m.desc,
    fields: m.fields,
    values: moduleValues(id),
  }));
}

function coerce(field, raw) {
  const { type } = field;
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new Error(`「${field.label}」需要布尔值`);
  }
  if (type === 'number' || type === 'range') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`「${field.label}」需要数字`);
    let v = n;
    if (typeof field.min === 'number') v = Math.max(field.min, v);
    if (typeof field.max === 'number') v = Math.min(field.max, v);
    return v;
  }
  if (type === 'list') {
    const arr = Array.isArray(raw) ? raw : String(raw).split(/[,，\s]+/);
    return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
  }
  if (type === 'select') {
    const s = String(raw);
    if (!field.options.includes(s)) throw new Error(`「${field.label}」只能选：${field.options.join(' / ')}`);
    return s;
  }
  return String(raw ?? '').trim();
}

/**
 * 保存某个模块的部分字段。
 * @returns {{ ok: true, values: object } | { ok: false, error: string }}
 */
export function saveModule(id, patch) {
  const mod = MODULES[id];
  if (!mod) return { ok: false, error: `没有这个模块：${id}` };
  if (!patch || typeof patch !== 'object') return { ok: false, error: '请求体必须是对象' };

  const next = {};
  for (const field of mod.fields) {
    if (!(field.key in patch)) continue;
    try {
      next[field.key] = coerce(field, patch[field.key]);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (!Object.keys(next).length) return { ok: false, error: '没有可保存的字段' };

  // 写文件（保留其他模块的内容）
  const doc = readDoc();
  doc[id] = { ...(doc[id] || {}), ...next };
  try {
    writeDoc(doc);
  } catch (e) {
    return { ok: false, error: `写 config.json 失败：${e.message}` };
  }

  // 热更新到内存
  Object.assign(config, next);
  return { ok: true, values: moduleValues(id) };
}
