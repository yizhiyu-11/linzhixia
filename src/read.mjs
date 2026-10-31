/**
 * 读空气：先判断"他这句话是什么情绪、想干什么"，再决定"这轮该怎么接"。
 *
 * 原则：只输出"倾向"，不输出话术。真正怎么说还是模型自己决定，
 * 否则就会退化成"检测到你在难过 → 输出抱抱"的模板。
 *
 * 纯规则，不调模型，零成本、零延迟。
 */

export const EMOTIONS = ['开心', '难过', '生气', '焦虑', '撒娇', '平静'];
export const INTENTS = ['倾诉', '求建议', '分享', '试探', '提问', '敷衍'];

const RULES = [
  {
    emotion: '生气',
    re: /(生气|烦死|气死|滚|有病|凭什么|无语|受不了|恶心|离谱|过分)/,
    w: 3,
  },
  {
    emotion: '难过',
    re: /(难过|难受|想哭|委屈|崩了|没意思|累死|撑不住|心累|郁闷|失落|孤独|加班|熬夜|通宵)/,
    w: 2,
  },
  {
    emotion: '焦虑',
    re: /(怎么办|来不及|deadline|怕|慌|紧张|焦虑|不敢|担心|压力)/,
    w: 3,
  },
  {
    emotion: '撒娇',
    re: /(想你|抱抱|亲亲|陪我|贴贴|么么|不理(我|你)|冷淡|哼|要你)/,
    w: 2,
  },
  {
    emotion: '开心',
    re: /(哈哈|笑死|太好了|爽|成了|开心|棒|厉害|升职|涨薪|赢了)/,
    w: 2,
  },
];

/**
 * @param {string} text 对方这条消息
 * @param {object} ctx { hour, idleMin, burst } burst = 他连着发了几条
 * @returns {{emotion:string, intent:string, confidence:number, signals:string[]}}
 */
export function readUser(text, ctx = {}) {
  const t = String(text || '').trim();
  const len = t.replace(/\s/g, '').length;
  const exclaim = (t.match(/[!！]/g) || []).length;
  const question = /[?？]/.test(t);
  const ellipsis = /(\.{3,}|…)/.test(t);
  const signals = [];

  // ── 情绪 ─────────────────────────────
  let emotion = '平静';
  let best = 0;
  for (const r of RULES) {
    if (r.re.test(t) && r.w > best) {
      best = r.w;
      emotion = r.emotion;
    }
  }
  // 纯标点信号：连串感叹号往往是在急/气；省略号多半是犹豫或低落
  if (exclaim >= 2 && best < 3) {
    emotion = '生气';
    best = 2;
    signals.push('多个感叹号');
  }
  if (ellipsis && emotion === '平静') {
    emotion = '难过';
    best = 1;
    signals.push('省略号');
  }
  // 深夜的负面话，情绪权重更高（人夜里更容易低落）
  const hour = ctx.hour ?? new Date().getHours();
  if ((hour >= 23 || hour <= 4) && (emotion === '难过' || emotion === '焦虑')) {
    best += 1;
    signals.push('深夜');
  }

  // ── 意图 ─────────────────────────────
  let intent = '分享';
  if (len <= 3 && !question && best < 2) {
    intent = '敷衍';
  } else if (/(怎么办|该不该|你觉得|要不要|怎么才能|有没有必要)/.test(t)) {
    intent = '求建议';
  } else if (/(你是不是|你还|为什么不|是不是不|到底|你是不是不)/.test(t)) {
    intent = '试探';
  } else if (question) {
    intent = '提问';
  } else if (best >= 2 && (emotion === '难过' || emotion === '生气' || emotion === '焦虑')) {
    intent = '倾诉';
  } else if (len >= 12 && best === 0) {
    intent = '分享';
  }

  const confidence = Math.min(0.95, 0.35 + best * 0.15 + (len > 6 ? 0.1 : 0) + (signals.length ? 0.05 : 0));
  const typo = looksTypo(t);
  if (typo) signals.push('疑似打错字');
  return { emotion, intent, confidence: Number(confidence.toFixed(2)), signals, typo, length: len };
}

/**
 * 根据"他怎么了"给出这一轮的接法。
 * @returns {{ goal: string, prefer?: string[], avoid?: string[] }}
 */
export function replyGoal(read) {
  const { emotion, intent } = read;

  if (read.typo) {
    return {
      goal: '他这像是手滑或打错字了。别当正经话接——随口问一句"打错了？"，或者拿这个笑他一下，一句话就够。',
      prefer: ['short', 'tease'],
      avoid: ['burst', 'normal', 'no_ask'],
    };
  }
  if (intent === '敷衍') {
    return {
      goal: '他这句没什么内容。别硬聊，短回一句，或者自己起个新话题（说你在干嘛）。',
      prefer: ['short', 'self'],
      avoid: ['burst', 'normal', 'tease', 'no_ask'],
    };
  }
  if (intent === '试探') {
    return {
      goal: '他在试探你的态度。先安抚，别解释、别讲道理、别说"你想多了"。',
      prefer: ['normal', 'no_ask'],
      avoid: ['tease', 'short'],
    };
  }
  if (intent === '求建议') {
    return {
      goal: '他想要一个具体做法。只说一个，别列清单，别讲原理，别加"你可以考虑"。',
      prefer: ['normal', 'no_ask'],
      avoid: ['short', 'tease', 'self', 'busy'],
    };
  }
  if (intent === '倾诉') {
    if (emotion === '生气') {
      return {
        goal: '他在气头上。站他这边，跟着骂两句，别分析对错、别劝他冷静。',
        prefer: ['normal', 'tease'],
        avoid: ['short', 'busy'],
      };
    }
    if (emotion === '焦虑') {
      return {
        goal: '他慌。先让他落地（"先别急"），再说一件最小的事，别铺开讲。',
        prefer: ['normal', 'no_ask'],
        avoid: ['short', 'tease'],
      };
    }
    return {
      goal: '他是在发泄，不在求方案。先接住情绪，别问"怎么了/为什么"，别给建议。',
      prefer: ['normal', 'no_ask'],
      avoid: ['tease', 'short', 'self', 'busy'],
    };
  }
  if (intent === '提问') {
    return { goal: '他在问事，直接回答，别绕，别反问。', avoid: [] };
  }
  if (emotion === '开心') {
    return { goal: '他在分享好事。把反应放大一点，跟着高兴，别转话题、别泼冷水。' };
  }
  if (emotion === '撒娇') {
    return { goal: '他在撒娇。顺着哄，别一本正经。' };
  }
  return { goal: '' };
}

/** 把读到的状态拼成一句塞进 prompt 的话 */
export function readLine(read) {
  const { emotion, intent, confidence, signals } = read;
  if (confidence < 0.4) return '';
  return `【对方现在】情绪：${emotion}；意图：${intent}${signals.length ? `（信号：${signals.join('、')}）` : ''}`;
}

// ── 小模型兜底：规则读不准的时候才调用 ────────────────────────
// 触发条件：置信度低、或者句子里有反讽信号。一次约 120 token（¥0.0003）。

const IRONY_HINT = /(可真|真是|呵呵|行吧|随你|你说的都对|厉害啊|随便你|666|您可真)/;

const LLM_RULES = `你是聊天语气分析器。读懂"对方这句话"的真实情绪和意图。
只输出 JSON，不要解释：
{"emotion":"开心|难过|生气|焦虑|撒娇|平静","intent":"倾诉|求建议|分享|试探|提问|敷衍","note":"不超过12字的判断依据"}

要点：
- 反讽/阴阳怪气（"你可真行""呵呵""行吧你说得都对"）：emotion 取真实情绪，通常是生气或撒娇。
- 只回"在干嘛""嗯""哦""？"：intent = 敷衍（对方没想深聊）。
- "你是不是…""你还…""为什么对我这样"：intent = 试探。
- "怎么办""该不该""要不要"：intent = 求建议。
- 长句 + 抱怨 + 没有问号：intent = 倾诉。
- 报喜、分享经历：intent = 分享。`;

/**
 * @param {object} p { text, recent, chatFn, log }
 * @returns {Promise<{emotion:string,intent:string,confidence:number,signals:string[],source:string,note?:string}>}
 */
export async function readUserLLM({ text, recent = [], chatFn, log }) {
  const history = recent.slice(-3).map((m) => `${m.role === 'user' ? '对方' : '我'}：${m.content}`).join('\n');
  const messages = [
    { role: 'system', content: LLM_RULES },
    { role: 'user', content: (history ? `最近几句：\n${history}\n\n` : '') + `对方这句话：${text}` },
  ];
  try {
    const r = await chatFn(messages, 'read');
    const obj = JSON.parse(String(r.text).replace(/```json|```/g, '').trim());
    const emotion = EMOTIONS.includes(obj.emotion) ? obj.emotion : '平静';
    const intent = INTENTS.includes(obj.intent) ? obj.intent : '分享';
    return {
      emotion,
      intent,
      confidence: 0.8,
      signals: ['小模型'],
      source: 'llm',
      note: String(obj.note || '').slice(0, 20),
    };
  } catch (e) {
    log?.warn(`读空气小模型失败：${e.message}`);
    return null;
  }
}

/**
 * 混合读法：规则便宜，先跑；读不准才叫小模型。
 */
export async function readUserSmart({ text, recent = [], chatFn, log, enabled = true, minConfidence = 0.6 }) {
  const rule = readUser(text);
  const ambiguous =
    rule.confidence < minConfidence ||
    IRONY_HINT.test(String(text || '')) ||
    String(text || '').replace(/\s/g, '').length <= 2;

  if (!enabled || !chatFn || !ambiguous) return { ...rule, source: 'rules' };

  const llm = await readUserLLM({ text, recent, chatFn, log });
  return llm || { ...rule, source: 'rules' };
}

/**
 * 手滑 / 打错字检测。
 * 真人看到一串乱码，不会当正经话接——会问一句、或者笑他一下。
 */
export function looksTypo(text) {
  const s = String(text || '').trim();
  if (!s) return false;

  // 纯数字串（验证码、手滑按数字键）
  if (/^\d{4,}$/.test(s)) return true;
  // 纯拉丁字母（拼音没上屏、英文乱敲），排除常见的真词
  if (/^[a-zA-Z]{3,12}$/.test(s) && !/^(hi|ok|okay|hello|hey|lol|hhh+|www|no|yes)$/i.test(s)) return true;
  // 中文句子里夹着一长串字母，多半是输入法没切
  if (/[\u4e00-\u9fa5]/.test(s) && /[a-zA-Z]{4,}/.test(s)) return true;
  // 同一个字符连打（aaaa / 哈哈哈哈哈哈哈哈）
  if (/(.)\1{4,}/.test(s) && !/^[哈h呵]+$/i.test(s)) return true;
  // 键盘乱按的特征组合
  if (/^(asdf|qwer|zxcv|sdfg|wert|dfgh)/i.test(s)) return true;

  return false;
}

/**
 * 这一条到底回不回、怎么回。
 *
 * 真人不是每条都接话：手滑了可能懒得理，没看懂可能先不动，也可能只回个"？"。
 * 这里把"不回"变成一个正常选项，而不是异常。
 *
 * @returns {{reply:boolean, mode:string, hint?:string, reason?:string}}
 */
export function decideReply(read, opts = {}) {
  const typoSilence = opts.typoSilence ?? 0.32; // 手滑时直接不看的概率
  const ambiguSilence = opts.ambiguSilence ?? 0.22; // 没看懂时先不回的概率
  const r = Math.random();

  // 手滑 / 打错字
  if (read.typo) {
    if (r < typoSilence) {
      return { reply: false, mode: 'ignore', reason: '像是手滑，懒得问' };
    }
    if (r < typoSilence + 0.45) {
      return {
        reply: true,
        mode: 'ask',
        hint: '他这条像是打错字。只回两三个字表示没看懂（"？""打错了？"），别解释、别猜。',
      };
    }
    return {
      reply: true,
      mode: 'joke',
      hint: '他这条像是手滑了。拿这个开个玩笑，一句话，别当真。',
    };
  }

  // 只有"很短又读不准"才算歧义；正常长度的陈述句不要瞎问
  if (read.confidence < 0.55 && (read.length ?? 99) <= 3 && ['提问', '分享', '试探'].includes(read.intent)) {
    if (r < ambiguSilence) {
      return { reply: false, mode: 'ignore', reason: '没看懂，先不回' };
    }
    if (r < ambiguSilence + 0.45) {
      return {
        reply: true,
        mode: 'clarify',
        hint: '你没太看懂他在说什么。直接问一句（"你刚说啥""哪句"），别猜、别展开。',
      };
    }
  }

  return { reply: true, mode: 'normal' };
}

/**
 * 让模型自己判断：这句话是不是在点评对方"说话的方式"。
 * 只用在小模型认为"可疑"的时候，比正则可靠得多。
 */
export async function judgeMetaTalk({ text, chatFn, log }) {
  const messages = [
    {
      role: 'system',
      content:
        '判断这句话是不是在评论对方"说话的方式"——比如指出对方重复、学自己说话、卡住、刷屏、催得急。' +
        '只输出 JSON：{"meta":true} 或 {"meta":false}，不要解释。',
    },
    { role: 'user', content: String(text || '').slice(0, 200) },
  ];
  try {
    const r = await chatFn(messages, 'judge');
    const raw = String(r.text || '').replace(/```json|```/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return false;
    return JSON.parse(m[0]).meta === true;
  } catch (e) {
    log?.warn(`判定失败（按不拦处理）：${e.message}`);
    return false;
  }
}