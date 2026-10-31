/**
 * 回复策略：解决"人机感"的核心。
 *
 * 观察到的模板化表现：每条都是「一句吐槽 + 空行 + 一句反问」，永远两段、
 * 永远以问题结尾。真人不是这样的——有时候只回一个字，有时候不接你的话
 * 只顾说自己的事，有时候在忙就敷衍两句。
 *
 * 所以每轮先掷骰子决定"这一轮怎么回"，再把对应的指令塞进 prompt。
 */

const rand = (a, b) => a + Math.random() * (b - a);

/** 六种回应姿态。base 是基础权重，lowMoodBonus 是心情差时加的权重 */
export const MODES = [
  {
    id: 'normal',
    base: 28,
    lowMoodBonus: 0,
    hint: '',
  },
  {
    id: 'burst',
    base: 16,
    lowMoodBonus: 0,
    hint: '【这一轮】连着发两三条，用 ||| 分开，每条只带一个新信息，别一句话把话说完。',
  },
  {
    id: 'sticker',
    base: 14,
    lowMoodBonus: 0,
    hint: '【这一轮】回复的最后单独加一行 [fig:标签] 配个表情包，标签从清单里挑最搭的。',
  },  {
    id: 'short',
    base: 14,
    lowMoodBonus: 14,
    hint: '【这一轮】只回一句，十二个字以内，别提问。',
  },
  {
    id: 'no_ask',
    base: 16,
    lowMoodBonus: 4,
    hint: '【这一轮】可以接话，但结尾不要提问，也不要说"你呢"。',
  },
  {
    id: 'self',
    base: 10,
    lowMoodBonus: 2,
    hint: '【这一轮】别理他说的事，直接讲你自己正在干的或刚想到的事，第一句里不许出现"你"。',
  },
  {
    id: 'tease',
    base: 7,
    lowMoodBonus: 5,
    hint: '【这一轮】用吐槽或抬杠回应，带点情绪，不正面回答。',
  },
  {
    id: 'busy',
    base: 6,
    lowMoodBonus: 10,
    hint: '【这一轮】你在忙别的事，回得很敷衍，只有几个字。',
    delay: [6000, 15000],
  },
];

const BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

/**
 * @param {object} opts { mood: 0-100, incoming: string }
 * @returns {{ id: string, hint: string, extraDelayMs: number }}
 */
export function pickStrategy({ mood = 60, incoming = '', prefer = [], avoid = [] } = {}) {
  const low = mood < 40;
  // 先按"读空气"的结果收窄可选姿态，再在剩下的里面按权重掷骰子
  let pool = MODES.filter((m) => !avoid.includes(m.id));
  if (prefer.length) {
    const hit = pool.filter((m) => prefer.includes(m.id));
    if (hit.length) pool = hit;
  }
  if (!pool.length) pool = MODES;
  const weights = pool.map((m) => ({ m, w: m.base + (low ? m.lowMoodBonus : 0) }));
  const total = weights.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * total;
  let picked = weights[weights.length - 1].m;
  for (const x of weights) {
    roll -= x.w;
    if (roll <= 0) {
      picked = x.m;
      break;
    }
  }

  // 对方发了一大段话时，"只回一句"就不太合适，抬到 normal
  if (incoming.length > 40 && (picked.id === 'short' || picked.id === 'busy')) {
    picked = BY_ID.normal;
  }

  const delay = picked.delay ? Math.round(rand(picked.delay[0], picked.delay[1])) : 0;
  return { id: picked.id, hint: picked.hint, extraDelayMs: delay };
}

/** 心情漂移：每轮小幅波动，缓慢回落到 60 */
export function driftMood(mood) {
  const pull = (60 - mood) * 0.08;
  const noise = rand(-4, 3);
  return Math.max(15, Math.min(95, mood + pull + noise));
}
