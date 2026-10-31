/**
 * 裁决层（M2）：把"读到的局面"变成"这轮该做什么"。
 *
 * 原则：保守。只有在证据很强时才推翻默认行为（默认=接住他说的内容）。
 * 目的不是让她更会聊，而是让她别答非所问。
 */

export const ACTS = {
  answer: '接住他说的内容',
  engage: '先接情绪，不给方案',
  advance: '别硬聊，说点自己的或换个角度',
  deflect: '岔开，别再耗这个话题',
  sticky: '贴着他的追问往下说',
};

/**
 * @param {object} p
 * @param {object|null} p.perception 感知结果
 * @param {string[]} p.recentActs 最近两轮的 act
 * @param {number} p.mood 心情 0-100
 * @returns {{ act: string, why: string }}
 */
function decideActBase({ perception, recentActs = [], mood = 60, thresholds = {}, scene = null }) {
  const deflectBelow = Number.isFinite(thresholds.deflectBelow) ? thresholds.deflectBelow : 0.2;
  const engageConf = Number.isFinite(thresholds.engageConfidence) ? thresholds.engageConfidence : 0.5;
  if (!perception) return { act: 'answer', why: '没有感知，按接住处理' };

  const { intent, emotion, continuity, jump, certainty } = perception;
  const lastTwo = recentActs.slice(-2);
  const deflectedRecently = lastTwo.includes('deflect');

  // 1) 提问 / 求建议：一定要答
  if (intent === '提问' || intent === '求建议') {
    return { act: 'answer', why: `他在${intent}，先答` };
  }

  // 2) 倾诉：先接情绪
  if (intent === '倾诉') {
    return { act: 'engage', why: `他在倾诉（${emotion}），先接住情绪` };
  }

  // 2.5) 场景开关：她手上有具体的事，且他不是在提问 → 说点自己的
  if (
    scene &&
    (scene.hasSeed || (scene.seeds && scene.seeds.length)) &&
    (intent === '分享' || intent === '敷衍') &&
    !recentActs.slice(-2).includes('advance')
  ) {
    return { act: 'advance', why: '她手上有事可说' };
  }

  // 3) 敷衍：别硬聊
  if (intent === '敷衍' && certainty >= engageConf) {
    return { act: 'advance', why: '他这句没内容，别硬接' };
  }

  // 4) 话题耗尽：可以岔开（但不要连着岔）
  if (jump === 'exhausted' && !deflectedRecently) {
    return { act: 'deflect', why: '这个话题聊到底了' };
  }

  // 5) 接不上：只有在情绪不脆弱、且没刚岔过时才岔开
  if (continuity < deflectBelow && !deflectedRecently && emotion !== '难过' && emotion !== '焦虑') {
    return { act: 'deflect', why: `接不上（连续度 ${continuity}），岔开` };
  }

  // 6) 情绪脆弱时，宁可接住
  if (emotion === '难过' || emotion === '焦虑') {
    return { act: 'engage', why: `他${emotion}，先稳住` };
  }

  return { act: 'answer', why: '默认接住' };
}

/**
 * act → 现有策略。保留一点随机，避免每轮都一个味道。
 */
export function actToStrategy(act) {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  switch (act) {
    case 'engage':
      return pick(['normal', 'normal', 'short']);
    case 'advance':
      return pick(['self', 'short', 'self']);
    case 'deflect':
      return pick(['self', 'self', 'short']);
    case 'sticky':
      return pick(['normal', 'no_ask']);
    case 'ask-media':
      return pick(['short', 'short', 'no_ask']);
    case 'answer':
    default:
      return pick(['normal', 'normal', 'no_ask']);
  }
}

/** act 给 prompt 的一句话指令；strength 高就说得坚决，低就允许带过 */
export function actHint(act, strength = null) {
  const base = hintBase(act);
  if (!base) return '';
  if (strength !== null && strength >= 0.7) return `${base}（这轮就这么说，别绕）`;
  if (strength !== null && strength <= 0.4) return `${base}（可有可无，别硬接）`;
  return base;
}

function hintBase(act) {
  switch (act) {
    case 'engage':
      return '【这一轮】他需要被接住，不要给建议、不要分析，先顺着他的情绪说一句。';
    case 'advance':
      return '【这一轮】他这句没什么内容，别硬接，说一点你自己这边的事或者换个角度。';
    case 'deflect':
      return '【这一轮】这个话题已经聊得差不多了，自然岔开——说你正在做的一件具体小事。';
    case 'sticky':
      return '【这一轮】顺着他的问题往下说，别反问。';
    case 'ask-media':
      return '【这一轮】你没看懂这张图什么意思，直接问一句（"这图啥意思""没看懂"），别装懂、别硬编。';
    default:
      return '';
  }
}

/** 每种 act 的默认强度 0-1：越高越"非这么说不可"，越低越可以带过 */
const STRENGTH = { engage: 0.9, answer: 0.5, advance: 0.7, deflect: 0.55, sticky: 0.5, 'ask-media': 0.8 };

/** 把强度并进提示词：高 → "这轮就这么说"，低 → "可有可无" */
export function decideAct(args) {
  const r = decideActBase(args);
  const strength = STRENGTH[r.act] ?? 0.5;
  return { ...r, strength };
}
