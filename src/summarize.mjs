/**
 * 历史压缩：把"很久以前的对话"压成几行摘要，只把最近几轮原文留在上下文里。
 *
 * 为什么必须做：上下文越长，模型越容易把自己前面的话当"风格"继续模仿，
 * 而且 token 成本线性上涨。压缩之后，长期记忆还在，但不会污染语气。
 */
import { config } from './config.mjs';

const SUMMARY_PROMPT = `你在整理一段聊天记录，供以后回忆用。只输出 3~5 行，每行一句，不要编号，不要评价，不要编造。
优先记：
- 具体发生过的事（去哪、见了谁、改了什么）
- 对方的偏好和状态（口味、作息、工作压力）
- 你们之间的约定或梗（答应了什么、开了什么玩笑）
- 情绪走向（哪天不开心、因为什么）
不要记：寒暄、表情包、重复的话。`;

/**
 * 看看要不要做一次摘要。
 * @returns {Promise<string|null>} 新摘要（没做就返回 null）
 */
export async function maybeSummarize({ memory, qq, chatFn, log }) {
  const every = config.summaryEvery;
  const lastId = Number(memory.getState(qq, 'lastSummaryMsgId', 0));
  const rows = memory.messagesSince(qq, lastId, every * 3);
  if (rows.length < every) return null;

  const text = rows.map((r) => `${r.role === 'user' ? '对方' : '我'}：${r.content}`).join('\n');
  const sys = SUMMARY_PROMPT;
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: text.slice(0, 6000) },
  ];

  try {
    const r = await chatFn(messages, 'summary');
    const summary = String(r.text || '').trim();
    if (!summary) return null;

    const period = new Date().toISOString().slice(0, 10);
    memory.addSummary(qq, 1, period, summary);
    memory.setState(qq, 'lastSummaryMsgId', rows[rows.length - 1].id);

    // 只留最近 6 条摘要，更早的合并成一条（简单的滚动压缩）
    const all = memory.getSummaries(qq, 20);
    if (all.length > 6) {
      const merged = all.slice(0, all.length - 6).map((s) => s.content).join('\n');
      memory.replaceSummaries(qq, 1, [merged, ...all.slice(-6).map((s) => s.content)]);
    }

    log?.info(`📝 生成了摘要（覆盖 ${rows.length} 条消息）`);
    return summary;
  } catch (e) {
    log?.warn(`摘要失败：${e.message}`);
    return null;
  }
}

/** 拼成给 prompt 用的文本块（没有就返回空串） */
export function summaryBlock(memory, qq) {
  const list = memory.getSummaries(qq, 6);
  if (!list.length) return '';
  const bullets = [];
  for (const s of list) {
    for (const line of String(s.content).split('\n')) {
      const t = line.trim().replace(/^[-•·]\s*/, '');
      if (t) bullets.push(`- ${t}`);
    }
  }
  if (!bullets.length) return '';
  return ['【之前聊过的事（摘要，可能不全）】', ...bullets].join('\n');
}
