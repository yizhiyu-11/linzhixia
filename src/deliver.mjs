/** 发送一段回复：切气泡 → 打字延迟 → 逐条发。回复和主动消息共用这一条路径。 */
import { splitIntoBursts } from './reply.mjs';
import { typingDelay, burstGap } from './pacing.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opts
 * @param {string[]} [opts.segments] 已经分好的气泡（不再过切分器）
 * @returns {Promise<string[]>} 实际发出去的气泡
 */
export async function deliver({ bot, qq, text, segments, aggressive = false, config, leadDelayMs = 0 }) {
  const bursts = segments?.length
    ? segments.filter(Boolean)
    : config.splitReply
      ? splitIntoBursts(text, { maxSegments: config.splitMax, aggressive })
      : [text];
  if (!bursts.length) return [];

  if (leadDelayMs > 0) await sleep(leadDelayMs);

  for (let i = 0; i < bursts.length; i++) {
    if (i > 0) await sleep(burstGap(config));
    await sleep(typingDelay(bursts[i], config));
    await bot.sendPrivate(qq, bursts[i]);
  }
  return bursts;
}
