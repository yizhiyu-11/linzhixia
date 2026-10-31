/**
 * 感知层（M1）：说话之前，先把"局面"读一遍。
 *
 * 只输出结构化判断，不生成回复。一次调用拿到：
 *   用户情绪 / 意图 / 确定度
 *   话题（固定 12 类，可比较）+ 一句话描述
 *   和上一轮的连续性 / 该不该跳话题
 *   对方有没有发表情包、表情包的情绪
 *
 * 读不准时返回 null，调用方退回规则判断（read.mjs），不影响主流程。
 */

/** 固定话题集：必须可比较，否则"是不是同一件事"没法用程序判断 */
export const TOPICS = [
  '吃饭',
  '工作',
  '通勤',
  '约见',
  '情绪',
  '健康',
  '睡眠',
  '娱乐',
  '购物',
  '家庭',
  '学习',
  '天气',
  '其他',
];

const SCHEMA_HINT = `只输出 JSON，不要解释、不要代码块：
{
  "emotion": "开心|难过|生气|焦虑|撒娇|平静",
  "tone_intensity": 0.0,
  "event": { "kind": "praise|ignore|blame|comfort|ask|tease|reject|share|none", "toward": "her|him|other", "impact": -0.0 },
  "intent": "倾诉|求建议|分享|试探|提问|敷衍",
  "certainty": 0.0,
  "topic": "${TOPICS.slice(0, -1).join('|')}|其他",
  "topic_detail": "八个字以内，这轮具体在聊什么",
  "continuity": 0.0,
  "jump": "none|exhausted|emotion|new_topic",
  "meme_mood": "none|开心|好笑|无语|生气|难过|撒娇|累困|疑惑|鼓励|亲密",
  "note": "十个字以内，判断依据"
}`;

const RULES = `要点：
- 反讽、阴阳怪气（"你可真行""呵呵""行吧你说的都对"）：emotion 取真实情绪，通常生气或撒娇。
- 只回"嗯""哦""？"：intent 敷衍。
- "你是不是…""你还…""为什么对我这样"：intent 试探。
- "怎么办""该不该"：intent 求建议。
- 长句 + 抱怨 + 没问号：intent 倾诉。
- 报喜、讲自己的经历：intent 分享。

【语气软化词】——最容易判错的一条：
emm、欸、呀、哈、嘛、啦、哦、咯 只是软化语气，不改变情绪本身。
  "今天运气爆炸呀"   = 开心（不是生气）
  "有点委屈呀"       = 难过或撒娇（不是生气）
  "emm，我还没准备好" = 焦虑（不是平静）
只有出现明确的负面词（烦、气、滚、凭什么、受不了）才判生气。

【强度 tone_intensity】0~1，按语气词和用词分量估：
  0.2 轻描淡写（"有点"、"还行"、"随便"）
  0.5 明确（"烦死了"、"好开心"）
  0.8 强烈（"受不了"、"气炸"、"我太开心了"、连发感叹号）
  判不准就填 0.4。

【他对她做了什么 event】——只读这一条消息里的动作，不要推测：
  praise  夸她/说她好
  ignore  敷衍、不回、只发表情包
  blame   怪她、凶她、说她不好
  comfort 安慰她、让她别难过
  ask     问她的事、关心她
  tease   逗她、开她玩笑
  reject  拒绝她、说不想、说不要
  share   讲他自己的事
  none    看不出来
  toward：her（冲她）/ him（他自己的事）/ other
  impact：-1（很伤人）~ +1（很暖），看不出填 0
  **不确定就填 none，不要硬猜。**

【话题】必须从列表里选一个，不要自创：
  吃饭 工作 通勤 约见 情绪 健康 睡眠 娱乐 购物 家庭 学习 天气 其他
topic_detail 写具体内容（八个字内），比如 topic=娱乐 / topic_detail=约上号。
**话题优先延续**：如果这轮还在聊同一件事（哪怕换了说法、补了细节），必须沿用上一轮的话题类别，不要换。
**少用「其他」**：只有实在归不进任何一类才用「其他」。犹豫时选最接近的类别，或者沿用上一轮。
  「等我一分钟」在打游戏的语境里 = 娱乐，不是其他
  「你说呢」在闹别扭的语境里 = 情绪，不是其他
只有明显换到别的事，才换类别。

【连续性与跳跃】
- continuity：这轮和上一轮是不是同一件事。完全接得上 0.8~1.0，同一大类 0.4~0.6，换事了 0.1~0.3。
- jump：话题已经聊了两个来回还没新信息 → exhausted；对方情绪突然变了 → emotion；明显换话题 → new_topic；否则 none。
- 对方发了表情包/图片：把图里的情绪填进 meme_mood，没图填 none。`;

/**
 * @param {object} p { text, recent, hasImage, activity, chatFn, log }
 * @returns {Promise<null | {emotion,intent,certainty,topic,topicDetail,continuity,jump,meme_mood,note}>}
 */
export async function perceive({ text, recent = [], hasImage = false, activity = '', prevTopic = '', chatFn, log }) {
  const history = recent
    .slice(-3)
    .map((m) => `${m.role === 'user' ? '对方' : '我'}：${String(m.content).slice(0, 60)}`)
    .join('\n');

  const userPart = [
    history ? `最近几句：\n${history}` : '',
    `对方这句话：${text || '（只发了一张图/表情包）'}`,
    hasImage ? '（对方这条带了图片）' : '',
    activity ? `我这会儿在：${activity}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const r = await chatFn(
      [
        { role: 'system', content: `你是聊天局的观察员，只负责读懂局面，不负责回话。\n${SCHEMA_HINT}\n\n${RULES}` },
        { role: 'user', content: userPart },
      ],
      'perceive',
    );
    const raw = String(r.text || '').replace(/```json|```/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('没有 JSON：' + raw.slice(0, 60));
    const o = JSON.parse(m[0]);

    const clamp = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);
    const EVENT_KINDS = ['praise', 'ignore', 'blame', 'comfort', 'ask', 'tease', 'reject', 'share', 'none'];
    const ev = o.event && typeof o.event === 'object' ? o.event : {};
    const impact = Number(ev.impact);
    return {
      emotion: ['开心', '难过', '生气', '焦虑', '撒娇', '平静'].includes(o.emotion) ? o.emotion : '平静',
      // 句子级语气：类别 + 强度（0-1），供情绪层累积用
      tone: {
        label: ['开心', '难过', '生气', '焦虑', '撒娇', '平静'].includes(o.emotion) ? o.emotion : '平静',
        intensity: clamp(o.tone_intensity, 0.4),
      },
      // 他对她做了什么：情绪层的输入，不由感知层直接下结论
      event: {
        kind: EVENT_KINDS.includes(ev.kind) ? ev.kind : 'none',
        toward: ['her', 'him', 'other'].includes(ev.toward) ? ev.toward : 'other',
        impact: Number.isFinite(impact) ? Math.max(-1, Math.min(1, impact)) : 0,
      },
      intent: ['倾诉', '求建议', '分享', '试探', '提问', '敷衍'].includes(o.intent) ? o.intent : '分享',
      certainty: clamp(o.certainty, 0.6),
      // 话题必须是固定集里的；模型偶尔自创，就归到"其他"
      topic: TOPICS.includes(o.topic) ? o.topic : '其他',
      topicDetail: String(o.topic_detail || '').slice(0, 12),
      continuity: clamp(o.continuity, 0.5),
      jump: ['none', 'exhausted', 'emotion', 'new_topic'].includes(o.jump) ? o.jump : 'none',
      // 没发图就不许编表情包情绪（实测它会自己脑补）
      meme_mood: hasImage ? String(o.meme_mood || 'none') : 'none',
      note: String(o.note || '').slice(0, 20),
    };
  } catch (e) {
    log?.warn(`感知失败，退回规则：${e.message}`);
    return null;
  }
}

/** 拼成一行给日志/后台看 */
export function perceiveLine(p) {
  if (!p) return '';
  const tone = p.tone ? `${p.tone.label}${p.tone.intensity !== undefined ? '(' + p.tone.intensity + ')' : ''}` : p.emotion;
  const ev = p.event && p.event.kind && p.event.kind !== 'none' ? ` 事=${p.event.kind}${p.event.toward ? '/' + p.event.toward : ''}` : '';
  return (
    `👁 ${tone}/${p.intent}(${p.certainty}) 话题=${p.topic}${p.topicDetail ? '/' + p.topicDetail : ''} ` +
    `连续=${p.continuity} 跳=${p.jump}` +
    ev +
    `${p.meme_mood && p.meme_mood !== 'none' ? ' 图=' + p.meme_mood : ''}` +
    `${p.note ? ' 「' + p.note + '」' : ''}`
  );
}

/** 拼成塞进 prompt 的一段 */
export function perceiveHint(p) {
  if (!p) return '';
  const strong = p.tone && p.tone.intensity >= 0.7;
  const soft = p.tone && p.tone.intensity <= 0.25;
  const lines = [
    `【局面】他在${p.emotion}${strong ? '（很强）' : soft ? '（淡淡的）' : ''}，想${p.intent}${p.note ? `（${p.note}）` : ''}`,
  ];
  if (p.topic) lines.push(`当前话题：${p.topic}${p.topicDetail ? `（${p.topicDetail}）` : ''}，接续度 ${p.continuity}`);
  if (p.jump === 'exhausted') lines.push('这个话题已经聊得差不多了，可以自然岔开。');
  if (p.jump === 'new_topic') lines.push('他换了话题，跟着新的走。');
  if (p.meme_mood && p.meme_mood !== 'none') lines.push(`他那张表情包的情绪是「${p.meme_mood}」。`);
  return lines.join('\n');
}
