/**
 * 表情包决策（两端共用一套语义）：
 *   发送端：这一轮该不该发、发哪一类
 *   接收端：他发的图属于哪一类（用同一张映射表，所以"镜像"才自然）
 */

/** 情绪 → 分类（带权重） */
export const EMOTION_TO_CAT = {
  开心: [['开心', 0.7], ['鼓励', 0.3]],
  好笑: [['好笑', 0.8], ['开心', 0.2]],
  无语: [['无语', 1]],
  撒娇: [['撒娇', 0.7], ['亲密', 0.3]],
  累困: [['累困', 1]],
  生气: [['生气', 0.6], ['无语', 0.4]],
  难过: [['难过', 0.6], ['亲密', 0.4]],
  疑惑: [['疑惑', 1]],
  鼓励: [['鼓励', 1]],
  亲密: [['亲密', 1]],
  // 别名：感知层可能给别的写法
  温馨: [['亲密', 0.6], ['开心', 0.4]],
  害羞: [['撒娇', 0.7], ['亲密', 0.3]],
  好奇: [['疑惑', 1]],
  疲惫: [['累困', 1]],
  激动: [['开心', 0.6], ['鼓励', 0.4]],
  平静: [['无语', 0.4], ['开心', 0.3], ['疑惑', 0.3]],
};

/** 这些情绪配图很自然 */
const POSITIVE = new Set(['开心', '好笑', '无语', '撒娇', '累困', '鼓励', '亲密']);
/** 这些情绪别用图糊弄 */
const NEGATIVE = new Set(['难过', '生气', '焦虑']);

/** 严肃话题：一张图都不发 */
const SERIOUS_RE = /(生病|医院|发烧|感冒|住院|手术|分手|离婚|失业|辞退|裁员|去世|走了|葬礼|自杀|抑郁|崩溃|吵架|哭了|难受|恶心|疼)/;

/** 按权重挑一个分类 */
export function pickCategoryByEmotion(emotion) {
  const list = EMOTION_TO_CAT[emotion];
  if (!list?.length) return null;
  const r = Math.random();
  let acc = 0;
  for (const [cat, w] of list) {
    acc += w;
    if (r <= acc) return cat;
  }
  return list[list.length - 1][0];
}

/**
 * 发送端决策
 * @param {object} p
 *   perception  感知结果（emotion/intent/topic）
 *   act         裁决（answer/engage/advance/deflect/ask-media）
 *   text        这轮要发的文字
 *   hasImage    对方这条是不是图（镜像）
 *   hour        当前小时
 *   recentIds   最近发过的表情包 id（判断连发）
 *   sentToday   今天已发张数
 *   config      配置
 * @returns {{p:number, category:string|null, pure:boolean, reasons:string[]}}
 */
export function planSticker({ perception, act, text = '', hasImage = false, hour = 12, recentIds = [], sentToday = 0, config = {} }) {
  const reasons = [];
  const base = Number(config.stickerBaseP ?? 0.15);
  let p = base;
  reasons.push(`基础 ${base}`);

  const emotion = perception?.emotion || '平静';

  // 严肃话题：直接不发
  if (SERIOUS_RE.test(`${text} ${perception?.topicDetail || ''}`)) {
    return { p: 0, category: null, pure: false, reasons: ['严肃话题，不发图'] };
  }

  // 情绪
  if (POSITIVE.has(emotion)) {
    p += 0.25;
    reasons.push(`${emotion} +0.25`);
  } else if (NEGATIVE.has(emotion)) {
    p -= 0.3;
    reasons.push(`${emotion} -0.30`);
  }

  // 对方发了图 → 镜像
  if (hasImage) {
    p += 0.35;
    reasons.push('他也发了图 +0.35');
  }

  // 裁决
  if (act === 'engage') {
    p -= 0.2;
    reasons.push('他在倾诉 -0.20');
  } else if (act === 'advance') {
    p += 0.1;
    reasons.push('没什么可接 +0.10');
  } else if (act === 'ask-media') {
    p = 0;
    return { p: 0, category: null, pure: false, reasons: ['没看懂图，先问'] };
  }

  // 回复很短（图能补情绪）
  const len = String(text || '').replace(/\s/g, '').length;
  if (len > 0 && len <= 10) {
    p += 0.15;
    reasons.push('回复很短 +0.15');
  }

  // 连续发过
  if (recentIds.length >= 2) {
    p -= 0.5;
    reasons.push('连续两轮发过 -0.50');
  }

  // 深夜
  if (hour >= 0 && hour < 7) {
    p -= 0.4;
    reasons.push('深夜 -0.40');
  }

  // 配额
  const max = Number(config.stickerMaxPerDay ?? 25);
  if (sentToday >= max) {
    return { p: 0, category: null, pure: false, reasons: [`今天已发 ${sentToday} 张，到配额`] };
  }

  p = Math.max(0, Math.min(0.9, p));
  const category = pickCategoryByEmotion(emotion);
  if (!category) reasons.push('情绪不明确，交给关键词兜底');

  // 纯图：短回复 + 强情绪
  const strong = POSITIVE.has(emotion);
  const pure = strong && len <= 12 && Math.random() < Number(config.stickerPureP ?? 0.25);

  return { p, category, pure, reasons };
}
