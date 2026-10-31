/** 记忆检索：按当前这句话，从事实/最近消息里召回 1-3 条相关记忆（纯规则，不调模型） */

const STOP = /[\s，。！？、~～…「」"'']/g;
const norm = (s) => String(s || '').replace(STOP, '');

/** 关键词：2-4 字的片段，去掉虚词 */
const PHRASES = ['膝盖', '腿', '腰', '胃', '头疼', '失眠', '加班', '领导', '稿子', '面试', '搬家', '生日', '猫', '狗', '香菜', '辣', '咖啡', '奶茶', '洗澡', '下雨'];

export function keywords(text) {
  const t = norm(text);
  const hits = new Set();
  for (const p of PHRASES) if (t.includes(p)) hits.add(p);
  // 没命中预设词时，取 2 字连续片段里最像名词的（简单做法：取前 4 个字）
  if (!hits.size && t.length >= 2) hits.add(t.slice(0, Math.min(4, t.length)));
  return [...hits];
}

/**
 * @param {{text: string, facts?: Array, messages?: Array, episodes?: Array}} p
 * @returns {Array<{kind, text, score}>}
 */
export function recall({ text, facts = [], messages = [], episodes = [] }) {
  const ks = keywords(text);
  const out = [];

  // 情节记忆：带时间/地点/情绪，权重给高一点（"上周三你说腿疼"就是这类）
  for (const ep of episodes.slice(0, 40)) {
    const c = String(ep.text || '');
    let score = 0;
    for (const k of ks) if (norm(c).includes(k)) score += 0.55;
    if (!score) continue;
    const days = Math.max(0, Math.round((Date.now() - Number(ep.at || Date.now())) / 86400_000));
    const when = days === 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`;
    score += Math.min(0.25, (Number(ep.importance) || 3) * 0.04); // 重要的事更容易想起来
    out.push({ kind: 'episode', text: `${when}${ep.place ? '·' + ep.place : ''}：${c}`, score: Math.min(1, score) });
  }

  for (const f of facts) {
    const content = String(f.value || '');
    let score = 0;
    for (const k of ks) if (norm(content).includes(k)) score += 0.6;
    if (score > 0) out.push({ kind: 'fact', text: `${f.key}：${content}`, score: Math.min(1, score) });
  }

  // 最近消息里提到同一关键词的（只要对方的）
  for (const m of messages.slice(-12)) {
    if (m.role !== 'user') continue;
    const c = String(m.content || '');
    let score = 0;
    for (const k of ks) if (norm(c).includes(k)) score += 0.5;
    if (score > 0) out.push({ kind: 'said', text: c.slice(0, 30), score: Math.min(0.9, score) });
  }

  // 去重 + 排序 + 最多 3 条
  const seen = new Set();
  return out
    .filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** 他在问"以前的事"吗（元记忆要用） */
const ASK_PAST = /(记得|上次|之前|那次|以前|说过|答应)/;

/**
 * 拼进 prompt 的一段（没有就返回空串）
 * 元记忆：想不起来时明确告诉她"别编细节"，比硬编一个时间地点好得多
 */
export function recallBlock(items, { query = '' } = {}) {
  const asking = ASK_PAST.test(String(query || ''));
  if (!items?.length) {
    return asking
      ? '【记忆】这件事你想不起来了。别编具体的时间、地点、数字，可以说"我记不太清了""是不是……"，或者把话头递回给他。'
      : '';
  }
  const lines = ['【你记得的相关事】', ...items.map((x) => `- ${x.text}`)];
  if (asking && (items[0].score ?? 1) < 0.6) {
    lines.push('（只记得大概，细节别说得太肯定）');
  }
  return lines.join('\n');
}
