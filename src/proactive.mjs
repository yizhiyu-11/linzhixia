/**
 * 主动开口（v3）：先找"开口的理由"，再从几个角度里挑一个，最后去重。
 *
 * 为什么改：
 *   线上 20 条主动里，"欸" 开头 7 条；内容反复出现洗澡/吹头/咖啡/多肉/你睡了吗。
 *   原因有三：
 *     1) 理由类型只有 6 种，hint 文案固定 → 模型每次都写同一类事
 *     2) 生成时把最近 6 条消息（含自己以前的主动）喂进去 → 照着抄自己的句式
 *     3) 生成后没有任何"和最近重复就重写"的检查
 *   所以这里加：角度（angle）、严禁最近类型、生成后去重。
 */
import { generateProactive } from './brain.mjs';
import { deliver } from './deliver.mjs';
import { getScene } from './scene.mjs';
import { readProfile, proactiveLimits } from './profile.mjs';
import { readUAffect } from './uaffect.mjs';
import { isHeadDup, isTooShort, isNearDup, hasTarget } from './proactive-check.mjs';

/** 每种理由给 3-5 个角度，避免千篇一律 */
const TYPES = {
  morning: {
    label: '早上说一句',
    angles: ['抱怨起太早', '说昨晚的梦', '说早餐吃了什么', '催他起床', '说今天的安排', '说窗外天气'],
  },
  lunch: {
    label: '中午聊吃的',
    angles: ['说在等外卖', '吐槽食堂', '问吃了没', '说想吃某样东西', '说同事的饭很香'],
  },
  dinner: {
    label: '下班/晚饭',
    angles: ['说下班路上', '说在做饭', '说想吃什么', '说今天累不累', '说路过一家店'],
  },
  night: {
    label: '晚上准备睡了',
    angles: ['说困了但不想睡', '说刚洗完澡', '说手机快没电', '说明天的打算', '说有点睡不着'],
  },
  event: { label: '说你手头正在发生的事', angles: [''] },
  miss: {
    label: '单纯想到他',
    angles: ['突然想到他', '看到像他的东西', '听到一首歌', '发呆时想起', '想找人说话但只想到他'],
  },
  share: {
    label: '分享刚看到/听到的',
    angles: ['看到一只猫', '听到楼下吵架', '看到一个好笑的东西', '刷到一条奇怪的视频', '闻到别人的饭香'],
  },
  complain: {
    label: '吐槽',
    angles: ['吐槽天气', '吐槽工作', '吐槽身体不舒服', '吐槽排队', '吐槽手机卡'],
  },
  tease: {
    label: '逗他一句',
    angles: ['翻旧账', '假装生气', '故意挑衅', '说反话', '给他起外号'],
  },
};

const ALL_TYPES = Object.keys(TYPES);

/** 根据时间 + 场景挑一个开口理由 */
export function pickReason({ hour, scene, recentTypes = [] }) {
  const slots = [];
  if (hour >= 6 && hour < 10) slots.push('morning');
  if (hour >= 11 && hour < 13) slots.push('lunch');
  if (hour >= 17 && hour < 20) slots.push('dinner');
  if (hour >= 21 && hour < 24) slots.push('night');
  if (scene?.pending?.length) slots.push('event');
  // 随时可用的几类
  slots.push('miss', 'share', 'complain', 'tease');

  const now = Date.now();
  const recent = (recentTypes || []).filter((t) => now - (t.at || 0) < 48 * 3600_000);
  const usedTypes = new Set(recent.map((t) => t.type));
  // 最近 3 条用过的类型，优先级降到最低（不管 48 小时）
  const lastThree = new Set((recentTypes || []).slice(-3).map((t) => t.type));

  // 打分：没在 48h 内用过 +2；不在最近 3 条 +1；event（有具体事）+2
  // 上一次是 event 的话，这次别再讲手头那点事（否则会连着三四条同一个话题）
  const lastType = (recentTypes || []).slice(-1)[0]?.type || '';

  const scored = slots.map((type) => {
    let score = 0;
    if (!usedTypes.has(type)) score += 2;
    if (!lastThree.has(type)) score += 1;
    if (type === 'event') {
      // 按最近 12 条里用过几次衰减：用多了就不再加分，避免连着刷手头那点事
      const eventUses = (recentTypes || []).slice(-12).filter((t) => t.type === 'event').length;
      score += Math.max(0, 2 - eventUses);
      if (lastType === 'event') score -= 4;
    }
    if (type === lastType) score -= 2;
    if (type === 'miss' || type === 'tease') score += 0.5;
    return { type, score: score + Math.random() * 1.2 };
  });
  scored.sort((a, b) => b.score - a.score);
  const type = scored[0].type;

  const angles = TYPES[type].angles.filter(Boolean);
  const angle = angles.length ? angles[Math.floor(Math.random() * angles.length)] : '';

  const hint =
    type === 'event'
      ? `${TYPES.event.label}：${scene.pending[0].text}`
      : angle
        ? `${TYPES[type].label}（角度：${angle}）`
        : TYPES[type].label;

  return { type, hint, angle };
}

/** 上次主动之后他有没有回过话 → 没回就指数退避 */
export function effectiveGapMin(memory, qq, config) {
  const lastP = Number(memory.getState(qq, 'lastProactive', 0));
  if (!lastP) return 0;
  const streak = Math.min(3, Number(memory.getState(qq, 'proactiveNoReply', 0)));
  const gap = config.proactiveMinGapMin * Math.pow(2, Math.max(0, streak));
  return Math.min(12 * 60, gap);
}

/** 每次跑之前更新"上次主动他回没回"的连击数 */
export function updateNoReplyStreak(memory, qq) {
  const lastP = Number(memory.getState(qq, 'lastProactive', 0));
  if (!lastP) return 0;
  const lastUser = memory.lastUserMessageAt(qq);
  const replied = lastUser && lastUser > lastP;
  const streak = replied ? 0 : Math.min(3, Number(memory.getState(qq, 'proactiveNoReply', 0)) + 1);
  memory.setState(qq, 'proactiveNoReply', streak);
  return streak;
}

/** 取最近几条主动消息的正文，用来防重复 */
function recentProactiveTexts(memory, qq, n = 8) {
  if (typeof memory.recentProactive === 'function') return memory.recentProactive(qq, n);
  return [];
}



/**
 * 执行一次主动（scheduler 和后台测试按钮共用）
 * @returns {Promise<{text:string, type:string, cost:number}|null>}
 */
export async function runProactiveOnce({ bot, memory, persona, config, log, qq, force = false }) {
  const now = new Date();
  const hour = now.getHours();
  updateNoReplyStreak(memory, qq);

  // 这个用户自己的频率上限（档案优先，没填用全局）
  const limits = proactiveLimits(readProfile(memory, qq), config);

  if (!force) {
    if (hour < config.proactiveStartHour || hour >= config.proactiveEndHour) return null;

    const last = memory.lastUserMessageAt(qq);
    if (last && now.getTime() - last < config.proactiveMinIdleMin * 60_000) return null;

    const lastP = Number(memory.getState(qq, 'lastProactive', 0));
    const gapMin = effectiveGapMin(memory, qq, { ...config, proactiveMinGapMin: limits.minGapMin });
    if (lastP && now.getTime() - lastP < gapMin * 60_000) return null;

    if (memory.countProactiveToday(qq) >= limits.maxPerDay) return null;
    if (Math.random() > config.proactiveChance) return null;
  }

  // 选理由
  let recentTypes = [];
  try {
    recentTypes = JSON.parse(memory.getState(qq, 'proactiveTypes', '[]'));
  } catch {
    recentTypes = [];
  }
  const scene = getScene(memory, qq, persona);
  // 可聊度门槛：忙的时候不发（chat 由场景层给：上班 0.2、通勤 0.6、睡前 0.9）
  if (Number.isFinite(scene.chat) && Math.random() > scene.chat) {
    log.info(`主动[${qq}] 这会儿不方便聊（chat=${scene.chat}），跳过`);
    return null;
  }

  // 他状态差的时候别打扰（用户情绪模型；拿不准时不拦）
  const he = readUAffect(memory, qq);
  if (!he.allowProactive) {
    log.info(`主动[${qq}] 他这会儿状态不好（${he.he.state}，共情 ${he.empathy}），先不发`);
    return null;
  }

  const reason = pickReason({ hour, scene, recentTypes });
  const avoid = recentProactiveTexts(memory, qq, 8);

  log.info(`主动[${qq}] 理由：${reason.type}${reason.angle ? '/' + reason.angle : ''}（${scene.location}·${scene.doing}）`);

  let result = await generateProactive({ persona, memory, qq, log, reason, scene, avoid });
  let text = result.text;

  // 去重 + 指向性：开头重复、太短、或纯自述就重写一次
  const bad = () => isHeadDup(text, avoid) || isTooShort(text) || isNearDup(text, avoid) || !hasTarget(text);
  if (bad()) {
    const why = !hasTarget(text) ? '没指向他' : '开头重复或太短';
    log.info(`主动[${qq}] ${why}（${text.slice(0, 12)}），重写一次`);
    const retry = await generateProactive({
      persona,
      memory,
      qq,
      log,
      reason: {
        ...reason,
        hint: `${reason.hint}（这一句必须带上他：问他、说到他、或者想他。不要只说自己）`,
      },
      scene,
      avoid,
    });
    if (retry.text && !isTooShort(retry.text) && !isHeadDup(retry.text, avoid) && !isNearDup(retry.text, avoid)) {
      result = retry;
      text = retry.text;
    }
  }

  // 重写完还是纯自述：宁可不发，也别发一句像自言自语的话
  if (!hasTarget(text)) {
    log.info(`主动[${qq}] 两次都没指向他，这次不发：${text.slice(0, 12)}`);
    return null;
  }

  await deliver({ bot, qq, text, config });

  memory.addMessage(qq, 'assistant', text, { proactive: true });
  memory.setState(qq, 'lastProactive', Date.now());
  memory.setState(
    qq,
    'proactiveTypes',
    JSON.stringify([...recentTypes, { type: reason.type, angle: reason.angle || '', at: Date.now() }].slice(-12)),
  );
  return { text, type: reason.type, cost: result.usage?.cost || 0 };
}

/**
 * @returns {() => void} 停止函数
 */
export function startProactive({ bot, memory, persona, config, log }) {
  if (!config.proactiveEnabled) {
    log.info('主动消息：关闭');
    return () => {};
  }

  const tick = async () => {
    if (!bot.ready) return;
    for (const qq of config.allowedQqs) {
      try {
        const r = await runProactiveOnce({ bot, memory, persona, config, log, qq });
        if (r) log.info(`主动[${qq}] → ${r.text.slice(0, 40)}（¥${r.cost.toFixed(4)}）`);
      } catch (e) {
        log.warn(`主动[${qq}] 失败：${e.message}`);
      }
    }
  };

  // 启动后先等 2 分钟，别刚上线就冒出来
  const first = setTimeout(() => void tick(), 120_000);
  const timer = setInterval(() => void tick(), config.proactiveTickMs);

  log.info(
    `主动消息：开（每 ${Math.round(config.proactiveTickMs / 60000)} 分钟检查一次，` +
      `空闲 ≥${config.proactiveMinIdleMin} 分钟，间隔 ≥${config.proactiveMinGapMin} 分钟，每天 ≤${config.proactiveMaxPerDay} 条，理由+角度制）`,
  );

  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
