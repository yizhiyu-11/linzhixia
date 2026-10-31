/**
 * 图像理解（表情包 / 照片 / 截图，一套逻辑）。
 *
 * 流程：先读字 → 再描述画面 → 结合上下文推断意图 → 给 2-3 个候选 + 置信度。
 * 关键不是"猜得准"，而是"不确定时知道自己不确定"。
 *
 * 只在消息带图时调用（文字消息零成本）。
 */

const SCHEMA = `只输出 JSON，不要解释、不要代码块：
{
  "kind": "sticker|photo|screenshot|other",
  "text_in_image": "图里的文字，没有就空字符串",
  "visual": "客观描述，十五字以内，不下结论",
  "candidates": [
    { "emotion": "开心|难过|生气|焦虑|撒娇|无语|平静", "intent": "表达情绪|调侃我|附和我|敷衍我|求安慰|向我撒娇|分享|求夸|求助|报备|询问", "meaning": "十五字以内", "p": 0.0 }
  ],
  "relation": "tone|content|answer",
  "confidence": 0.0,
  "need_clarify": false
}`;

const RULES = `规则：
1. 先看字：图里有文字就先读出来（表情包的"无语""裂开"、聊天截图、菜单、路牌）。文字往往直接说明含义。
2. visual 只做客观描述：画的是什么、什么动作、什么色调。**不要在这里下结论**。
3. candidates 给 2~3 个，p 相加接近 1，按可能性从高到低。
4. 判断重点：
   - emotion：这张图**本身**传递的情绪（看图说话，比如笑脸=开心、皱眉=生气）
   - intent：他用这张图**想干什么**，必须从发送者角度看：
     · 单纯分享情绪 → 表达情绪
     · 拿你开玩笑 → 调侃我
     · 顺着你的话点头 → 附和我
     · 不想聊了随便应付 → 敷衍我
     · 想被关心 → 求安慰
     · 冲你撒娇 → 向我撒娇
     · 照片：分享 / 求夸 / 求助 / 报备 / 询问
   - 注意：**不要用"共情"**——那是收图的人该做的事，不是他发图的目的。
   - 截图（screenshot）：他在**询问**什么，或让你看什么
5. relation 判断这张图的角色：
   - tone：表情包/小图，用来表达语气（配合他打的字）
   - content：照片/截图，本身就是内容
   - answer：他在回答你上一句（比如你问"怎么了"，他发一张图）
6. 结合上下文：他说的话、你刚才说了什么、当前话题。**图不是孤立的**。
7. 拿不准就把 confidence 压低（<0.35）并 need_clarify=true。**不要为了显得聪明去硬猜**。`;

/**
 * @param {object} p { dataUrl, text, recent, chatFn, log }
 * @returns {Promise<null | {kind,text_in_image,visual,candidates,confidence,need_clarify}>}
 */
export async function understandMedia({ dataUrl, text = '', recent = [], context = null, chatFn, log }) {
  const history = recent
    .slice(-2)
    .map((m) => `${m.role === 'user' ? '对方' : '我'}：${String(m.content).slice(0, 40)}`)
    .join('\n');

  const ctxLines = [];
  if (context?.prevAssistant) ctxLines.push(`你上一句说：${String(context.prevAssistant).slice(0, 60)}`);
  if (context?.topic) ctxLines.push(`当前话题：${context.topic}${context.topicDetail ? `（${context.topicDetail}）` : ''}`);
  if (context?.emotion) ctxLines.push(`他现在的情绪：${context.emotion}`);

  const userContent = [
    {
      type: 'text',
      text: [
        history ? `最近两句：\n${history}` : '',
        ctxLines.join('\n'),
        `对方这条消息的文字：${text || '（没有文字，只发了图）'}`,
        '请判断这张图是什么、他想表达什么，以及这张图是在"表达语气"、"分享内容"还是"回答你上一句"。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];

  try {
    const r = await chatFn(
      [
        { role: 'system', content: `你是图像理解助手，只负责看懂图片，不负责回话。\n${SCHEMA}\n\n${RULES}` },
        { role: 'user', content: userContent },
      ],
      'media',
    );
    const raw = String(r.text || '').replace(/```json|```/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('没有 JSON：' + raw.slice(0, 60));
    const o = JSON.parse(m[0]);

    const kinds = ['sticker', 'photo', 'screenshot', 'other'];
    const cands = Array.isArray(o.candidates) ? o.candidates : [];
    const cleaned = cands
      .map((c) => ({
        emotion: String(c.emotion || '').slice(0, 6),
        intent: String(c.intent || '').slice(0, 8),
        meaning: String(c.meaning || '').slice(0, 24),
        p: Math.max(0, Math.min(1, Number(c.p) || 0)),
      }))
      .filter((c) => c.intent)
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);

    return {
      kind: kinds.includes(o.kind) ? o.kind : 'other',
      relation: ['tone', 'content', 'answer'].includes(o.relation) ? o.relation : 'tone',
      text_in_image: String(o.text_in_image || '').slice(0, 40),
      visual: String(o.visual || '').slice(0, 30),
      candidates: cleaned,
      confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
      need_clarify: Boolean(o.need_clarify) || cleaned.length === 0,
    };
  } catch (e) {
    log?.warn(`看图失败：${e.message}`);
    return null;
  }
}

/** 给日志/后台看的一行 */
export function mediaLine(m) {
  if (!m) return '';
  const top = m.candidates[0];
  const head = `🖼 ${m.kind}${m.text_in_image ? `「${m.text_in_image}」` : ''} ${m.visual}`;
  if (!top) return `${head} → 无法判断`;
  return `${head} → ${top.emotion || '-'}/${top.intent}(${m.confidence})`;
}

/** 塞进 prompt 的一段 */
export function mediaHint(m) {
  if (!m) return '';
  const top = m.candidates[0];
  const lines = [`【他这张图】${m.visual}${m.text_in_image ? `，图上的字是「${m.text_in_image}」` : ''}`];
  if (top && m.confidence >= 0.35) {
    lines.push(`看着像「${top.meaning}」（他${top.intent}${top.emotion ? `，图里是${top.emotion}` : ''}）。`);
  } else {
    lines.push('你没太看懂这张图什么意思，别硬猜。');
  }
  if (m.repeatCount >= 3) {
    lines.push(`这张他已经发过 ${m.repeatCount} 次了，可以顺口来一句「你又发这张」。`);
  }
  if (m.relation === 'tone') lines.push('这张图是当语气用的，按情绪接就行，不用描述图。');
  if (m.relation === 'content') lines.push('这张图本身就是内容，说画面里的具体东西。');
  if (m.relation === 'answer') lines.push('他是在用这张图回答你上一句，别当成新话题。');
  return lines.join('\n');
}

/**
 * 置信度决定行为：
 *   ≥0.6  按最高概率回应
 *   0.35~0.6 接住情绪，不硬解读
 *   <0.35 直接问一句（不唐突）
 */
export function mediaAct(m, opts = {}) {
  if (!m) return null;
  const askBelow = Number.isFinite(opts.askBelow) ? opts.askBelow : 0.35;
  const engageBelow = Number.isFinite(opts.engageBelow) ? opts.engageBelow : 0.6;
  if (m.need_clarify || m.confidence < askBelow) return 'ask-media';
  if (m.confidence < engageBelow) return 'engage';
  return null;
}
