/**
 * 大脑：拼上下文 → 调模型 → 记用量。
 * 两个入口：generateReply（回对方）和 generateProactive（自己开口）。
 */
import { config } from './config.mjs';
import { buildSystemPrompt } from './persona.mjs';
import { classify, safetyHint } from './safety.mjs';
import { splitIntoBursts } from './reply.mjs';
import { loadImage } from './image.mjs';
import { stickerCatalogText } from './sticker.mjs';
import { currentActivity, idleMinutes } from './life.mjs';
import { summaryBlock } from './summarize.mjs';
import { isRepPolice } from './repeat.mjs';
import { sceneBlock } from './scene.mjs';
import { FACT_KEYS } from './facts.mjs';

const TIMEOUT_MS = 45_000;

const IMAGE_HINT = [
  '【这一轮】对方发来了图片，你看得见图里的内容。',
  '如果这是表情包 / 梗图：重点是它的**情绪和梗**，不是画面细节。读懂他想表达什么（在阴阳你、撒娇、无语、炫耀……），用你自己的方式接住。',
  '如果是照片 / 截图：抓住他关心的那个点说，别做图像识别式的复述。',
  '禁止说"我看到一张图片""这是一张图""图片里写着"这种话，也不要用括号描述图片。',
].join('\n');

const IMAGE_FAIL_HINT = [
  '【这一轮】对方发了一张图片，但你这边没加载出来。',
  '用你自己的语气让他再发一次，或者先聊别的。绝对不要编造图里的内容。',
].join('\n');

/** 统一的模型调用：超时、报错、用量都在这处理 */
export async function chat(messages, { qq, memory, log, tag = 'reply', jsonMode = false }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`模型返回 ${res.status}：${body.slice(0, 300)}`);
    }
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('模型返回空内容');

  const usage = data.usage || {};
  const prompt_tokens = usage.prompt_tokens ?? 0;
  const completion_tokens = usage.completion_tokens ?? 0;
  const cost = (prompt_tokens * config.price.input + completion_tokens * config.price.output) / 1e6;
  memory?.recordUsage?.(qq, config.model, prompt_tokens, completion_tokens, cost, tag);

  log?.debug(`[${tag}] tokens in=${prompt_tokens} out=${completion_tokens} cost=¥${cost.toFixed(4)}`);
  return { text: reply, usage: { prompt_tokens, completion_tokens, cost } };
}

/** 回一条消息 */
export async function generateReply({ persona, memory, qq, text, images = [], extraHint = '', stickers = [], scene = null, log }) {
  let level = classify(text);
  // 后台开关：关掉对应项就退回 normal
  if (level === 'refuse' && config.safetyRefuse === false) level = 'normal';
  if (level === 'care' && config.safetyCare === false) level = 'normal';
  const facts = memory.getFacts(qq).map((f) => ({ key: FACT_KEYS[f.key] || f.key, value: f.value }));

  // 先把图片读成 data URL（失败就跳过，别让整条消息挂掉）
  const sources = Array.isArray(images) ? images : [];
  const dataUrls = [];
  for (const src of sources.slice(0, 3)) {
    try {
      const { dataUrl } = await loadImage(src, config.imageMaxBytes);
      dataUrls.push(dataUrl);
    } catch (e) {
      log?.warn(`图片读取失败：${e.message}`);
    }
  }

  const sawImage = dataUrls.length > 0;

  // 生活上下文：她最近说过什么（防自我重复）、这会儿在干嘛、隔了多久才回
  const recentSelf = memory
    .recentMessages(qq, 10)
    .filter((m) => m.role === 'assistant' && !isRepPolice(m.content))
    .slice(-3)
    .map((m) => m.content);
  const summary = summaryBlock(memory, qq);
  const act = currentActivity(memory, qq);
  const idle = idleMinutes(memory, qq);

  const lifeHints = [];
  if (recentSelf.length) {
    lifeHints.push(
      `【你自己刚才说的（这是你说的话，不是他说的；别拿它当他重复）】${recentSelf.join(' ／ ')}\n—— 当作反面例子：换个句式、换个话题切入，别接着这个路子说下去。`,
    );
  }
  // 有场景状态就用它（含地点/在做的事/手头的事），否则退回旧的"在干嘛"
  if (scene) lifeHints.push(sceneBlock(scene));
  else
    lifeHints.push(
      `【你现在在干嘛】${act.text}${act.minutes > 0 ? `（已经 ${act.minutes} 分钟左右）` : '（刚开始）'}`,
    );
  if (idle !== null && idle >= 30) {
    lifeHints.push(`【距上次说话】${idle} 分钟了。语气可以随意点，不用假装一直在等他。`);
  }

  const hints = [
    safetyHint(level),
    extraHint,
    sawImage ? IMAGE_HINT : sources.length ? IMAGE_FAIL_HINT : '',
    ...lifeHints,
  ]
    .filter(Boolean)
    .join('\n\n');

  const system = buildSystemPrompt(persona, {
    facts,
    relation: null, // M3：读关系状态
    now: new Date(),
    hint: hints,
    stickers,
    stickerCatalog: stickers.length ? stickerCatalogText(stickers).split('\n') : [],
    summary,
  });

  // 有图 → 多模态内容数组；没图 → 纯文本
  let userContent = text;
  if (sawImage) {
    const parts = [];
    if (text) parts.push({ type: 'text', text });
    for (const url of dataUrls) parts.push({ type: 'image_url', image_url: { url } });
    userContent = parts;
  } else if (sources.length) {
    userContent = text || '（对方发来一张图片，但没加载出来）';
  }

  // 上下文里剔掉"点评对方说话方式"的旧回复：
  // 这类句子一旦进了历史，模型会当成自己的口头禅无限复制。
  const history = memory
    .recentMessages(qq, config.historyTurns)
    .filter((m) => !(m.role === 'assistant' && isRepPolice(m.content)));

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userContent },
  ];

  const r = await chat(messages, { qq, memory, log, tag: `reply/${level}${sawImage ? '+img' : ''}` });
  return { ...r, level, sawImage };
}


/**
 * 把一条回复扩成"连发几条"：先按激进切分，再按需补 1~2 条独立短消息。
 * 只给 burst 策略用——模型不会自觉用 |||，所以用多次调用来逼出"想到一句发一句"。
 */
export async function expandBurst({ persona, memory, qq, text, firstReply, target = 3, log }) {
  const segments = splitIntoBursts(firstReply, { maxSegments: 4, aggressive: true });
  const facts = memory.getFacts(qq).map((f) => ({ key: f.key, value: f.value }));
  let guard = 0;

  while (segments.length < target && guard < 2) {
    guard += 1;
    const system =
      buildSystemPrompt(persona, { facts, relation: null, now: new Date(), hint: '' }) +
      '\n\n【这一轮】接着再补一条很短的消息，三到十二个字，只说一个新的点，别重复上面说过的，也别总结。';

    const messages = [
      { role: 'system', content: system },
      ...memory.recentMessages(qq, 6),
      { role: 'user', content: text },
      ...segments.map((s) => ({ role: 'assistant', content: s })),
      { role: 'user', content: '（接着再说一句，很短）' },
    ];

    try {
      const r = await chat(messages, { qq, memory, log, tag: 'burst+' });
      const line = splitIntoBursts(r.text, { maxSegments: 1, aggressive: true })[0];
      if (!line) break;
      if (segments.some((s) => s === line)) break; // 学会重复了，就停
      segments.push(line);
    } catch (e) {
      log?.warn(`补发失败：${e.message}`);
      break;
    }
  }

  return { segments };
}

/** 自己开口：没有对方的新消息，主动发一条 */
export async function generateProactive({ persona, memory, qq, log, reason = null, scene = null, avoid = [] }) {
  const facts = memory.getFacts(qq).map((f) => ({ key: f.key, value: f.value }));
  const hour = new Date().getHours();

  // 最近几条自己的主动：明确列出来，禁止重复开头和内容
  const avoidList = (avoid || []).slice(-6);
  const avoidBlock = avoidList.length
    ? [
        '【你最近已经主动说过这些】',
        ...avoidList.map((t, i) => `  ${i + 1}. ${String(t).replace(/\s+/g, ' ').slice(0, 30)}`),
        '不要和它们用同样的开头（尤其不要再用「欸」「喂」「刚」「哦」起头），也不要把同样的事再说一遍。',
      ].join('\n')
    : '';

  const system = buildSystemPrompt(persona, {
    facts,
    relation: null,
    now: new Date(),
    hint: [
      '【这一轮是你主动开口】',
      `现在是 ${hour} 点。你们已经几个小时没说话了。`,
      reason?.hint ? `【这次开口的理由】${reason.hint}` : '',
      scene ? sceneBlock(scene, { withPending: reason?.type === 'event' }) : '',
      '发一条 6~20 字的消息：说这件事、或者你在干嘛、突然想到他。',
      '【硬要求】这一句必须"指向他"：问他一件事、说到他、让他帮忙、或者想他。',
      '反例（不要这样）：只说自己在干什么，不带上他。比如"地板有点凉""我这车怎么还没到站"。',
      '正例：说到他（"你那边下雨了没"）、问他（"上次那件衣服你选的哪件"）、想他（"刚看到个东西想起你"）。',
      '开头要具体（说东西/说动作/说感受），不要用「欸」「喂」「哦」「刚」这种口头起手式。',
      '不要问"在吗"，不要解释为什么突然找他，不要一次发很多条。',
      avoidBlock,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  // 历史里去掉她自己以前发过的主动，避免照着抄自己的句式
  const history = memory
    .recentMessages(qq, 6)
    .filter((m) => !(m.role === 'assistant' && avoidList.some((a) => String(a).trim() === String(m.content).trim())));

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: '（安静了一会儿，你想跟他说句话）' },
  ];

  return chat(messages, { qq, memory, log, tag: 'proactive' });
}