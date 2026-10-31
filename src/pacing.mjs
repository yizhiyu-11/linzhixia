/**
 * 节奏控制：真人回消息不是瞬时的，是「看到 → 想一下 → 打字 → 发」。
 * 这里把这三段延迟拆开算，各自带随机抖动，避免每次都一样长。
 */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 思考延迟：从"收到消息"到"开始打字"。
 * 对方说的越多，需要读的时间越长；但封顶，不能真让人等半分钟。
 */
export function thinkDelay(incomingLen, cfg) {
  const readTime = clamp(incomingLen * 30, 0, 2000); // 对方说得越多，读得越久（最多 2 秒）

  // 分心档：真人不是每次都秒回，有时候先去干点别的
  const slowChance = cfg.thinkSlowChance ?? 0.18;
  if (Math.random() < slowChance) {
    const lo = cfg.thinkMaxMs;
    const hi = Math.max(lo + 800, cfg.thinkSlowMaxMs ?? 9000);
    return Math.round(rand(lo, hi));
  }

  return Math.round(rand(cfg.thinkMinMs, cfg.thinkMaxMs) + readTime);
}

/**
 * 打字延迟：按字数估，但设下限（再短的话也要"抬手"一下）。
 * 150ms/字 ≈ 每秒 6.7 个字，接近手机打字的真实速度。
 */
export function typingDelay(text, cfg) {
  if (cfg.typingMsPerChar <= 0) return 0;
  const raw = text.length * cfg.typingMsPerChar;
  const jittered = clamp(raw, cfg.typingMinMs, cfg.typingMaxMs) * rand(0.85, 1.15);
  return Math.round(jittered);
}

/** 气泡之间的停顿：分开的两条不是一个字一个字敲出来的，中间有呼吸 */
export function burstGap(cfg) {
  return Math.round(rand(cfg.splitPauseMinMs, cfg.splitPauseMaxMs));
}

/** 只用于日志：把整条回复的延迟排一下，方便调参 */
export function planSchedule(incomingLen, bursts, cfg) {
  const steps = [];
  let total = 0;
  bursts.forEach((b, i) => {
    const gap = i === 0 ? 0 : burstGap(cfg);
    const think = i === 0 ? thinkDelay(incomingLen, cfg) : 0;
    const typing = typingDelay(b, cfg);
    total += gap + think + typing;
    steps.push({
      index: i + 1,
      text: b,
      think,
      gap,
      typing,
      sentAtMs: total,
    });
  });
  return { steps, totalMs: total };
}
