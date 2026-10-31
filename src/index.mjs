/**
 * 入口：连 QQ → 收消息 → 想一下 → 回过去。
 * M1 目标：能聊。拟真节奏、关系状态、摘要记忆在 M2/M3 加。
 */
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { config, assertConfig } from './config.mjs';
import { createLogger } from './logger.mjs';
import { friendlyText } from './errors.mjs';
import { loadPersona, listPersonas } from './persona.mjs';
import { Memory } from './memory.mjs';
import { OneBot } from './onebot.mjs';
import { generateReply, expandBurst, chat } from './brain.mjs';
import { looksRepeated, isRepPolice, isSuspectComment, isExactRepeat, userMentionsRepeat } from './repeat.mjs';
import { readUser, readUserSmart, replyGoal, readLine, decideReply, judgeMetaTalk } from './read.mjs';
import { perceive, perceiveLine, perceiveHint } from './perceive.mjs';
import { decideAct, actToStrategy, actHint } from './act.mjs';
import { getScene, sceneBlock, findConflict, learnScene } from './scene.mjs';
import { loadImage } from './image.mjs';
import { analyzeStyle, repeatsOpening } from './style-check.mjs';
import { understandMedia, mediaLine, mediaHint, mediaAct } from './media.mjs';
import { maybeSummarize } from './summarize.mjs';
import { splitIntoBursts } from './reply.mjs';
import { affectHint, rememberEvent, stateOf as affectStateOf } from './affect.mjs';
import { updateUAffect, hintOf as uaffectHintOf, uaffectLine, readUAffect } from './uaffect.mjs';
import { recall, recallBlock } from './recall.mjs';
import { extractFacts as maybeExtractFacts } from './facts.mjs';
import { thinkDelay } from './pacing.mjs';
import { deliver } from './deliver.mjs';
import { startProactive, runProactiveOnce } from './proactive.mjs';
import { startWebConsole } from '../server/http.mjs';
import { saveRawConfig } from '../server/store.mjs';
import { synthesize, pruneVoiceFiles, closeVoice, emotionFor } from './voice.mjs';
import {
  loadStickers,
  extractStickerTags,
  findSticker,
  classifyCategory,
  pickByCategory,
  randomSticker,
  buildStickerHashIndex,
} from './sticker.mjs';
import { planSticker } from './sticker-plan.mjs';
import { shouldVoice } from './voice-plan.mjs';
import { applyProviders } from './providers.mjs';

// 载入 providers.json，覆盖 .env 里的模型配置
applyProviders(config);

// 开发模式：不连 QQ，只跑后台和测试台，避免和线上抢消息
const DEV_NO_QQ = process.env.ONEBOT_DISABLED === '1';
import { readProfile, actThresholds, relationHint as profileRelationHint } from './profile.mjs';
import * as stickerStore from './sticker-store.mjs';
import { facesToText, faceEmotion } from './face.mjs';
import { pickStrategy, driftMood } from './strategy.mjs';
import { RiskBreaker, isCommandLike } from './safety.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 单实例锁：同一个 data/bot.lock 只允许一个进程。
 * 之前踩过的坑——连着起两次，两个进程抢同一个 SQLite，日志互相覆盖，
 * 而且其中一个还拿着旧的 API Key，于是"有时回正常、有时回兜底"。
 */
const LOCK = process.env.BOT_LOCK ? path.resolve(process.env.BOT_LOCK) : path.resolve('data', 'bot.lock');

function acquireLock() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0); // 探活：进程还在就直接退出
        console.error(`✗ 已有实例在运行（PID ${pid}）。要重启先跑 stop.cmd`);
        process.exit(1);
      } catch {
        // 进程已死，锁是残留的，继续接管
      }
    }
  } catch {
    // 没有锁文件，正常
  }
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK, 'utf8').trim()) === process.pid) fs.rmSync(LOCK, { force: true });
  } catch {
    /* 没关系 */
  }
}

async function main() {
  assertConfig();
  acquireLock();
  const log = createLogger(config.logLevel);

  const persona = loadPersona(config.persona);
  const personaCache = new Map();
  /** 每个用户可以有自己的：state.persona，没有就用全局默认 */
  const personaFor = (qq) => {
    const id = String(memory.getState(qq, 'persona', '') || config.persona || 'default');
    if (!personaCache.has(id)) {
      try {
        personaCache.set(id, loadPersona(id));
      } catch (e) {
        log.warn(`人设 ${id} 加载失败，回落默认：${e.message}`);
        personaCache.set(id, loadPersona('default'));
      }
    }
    return personaCache.get(id);
  };
  log.info(`人设：${persona.name}（${persona.role}）`);

  let stickers = loadStickers('stickers');
  // 他发的图如果就是她库里的，靠 hash 直接认出来（零成本）
  let stickerByHash = buildStickerHashIndex(stickers);
  if (stickers.length) {
    const cats = [...new Set(stickers.map((s) => s.category))];
    log.info(`表情包：${stickers.length} 张，${cats.length} 类（${cats.join(' / ')}）`);
    if (stickerByHash.size) log.debug(`表情包指纹：${stickerByHash.size} 张可被直接识别`);
  }

  /** 库里加/删之后热更新，不用重启 */
  const reloadStickers = () => {
    stickers = loadStickers('stickers');
    stickerByHash = buildStickerHashIndex(stickers);
    log.info(`表情库已重载：${stickers.length} 条（指纹 ${stickerByHash.size}）`);
    return stickers.length;
  };

  // 把"实际生效"的配置打出来：config.json 会覆盖 .env，出问题时一眼能看出谁赢了
  log.info(
    `启动配置：语音=${config.voiceEnabled ? '开' : '关'}（${config.voiceEngine}/${config.voiceName}，${config.voiceChance}）` +
      ` 节奏=${config.thinkMinMs}-${config.thinkMaxMs}ms 打字=${config.typingMsPerChar}ms/字 历史=${config.historyTurns}轮`,
  );
  const recentStickers = new Map(); // 每个用户最近发过的表情包 id，避免连着发同一张
  const voiceLog = new Map(); // 每个用户最近发语音的时间戳，用来限流

  const memory = new Memory(config.dbPath);
  const pruned = memory.pruneMessages(7);
  if (pruned) log.info(`清理了 ${pruned} 条 7 天前的原始消息（长期事实不受影响）`);
  const voicePruned = await pruneVoiceFiles('data/voice', 40).catch(() => 0);
  if (voicePruned) log.info(`清理了 ${voicePruned} 个旧语音文件`);

  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log });
  const breaker = new RiskBreaker({
    threshold: config.riskThreshold,
    pauseMs: config.riskPauseMin * 60_000,
    log,
  });
  const busy = new Set(); // 同一个人的上一条还没回完，别并发
  const pending = new Map(); // 回复期间他连发的消息，排在这里，回头合并成一条处理
  const actHistory = new Map(); // 每个用户最近几轮做了哪些 act，防止连续岔开
  const mediaCache = new Map(); // 图片 hash → 理解结果，防止同一张图反复调模型
  const stats = { startedAt: Date.now(), in: 0, out: 0, voice: 0, stickers: 0, errors: 0 };
  let myQq = '';

  bot.on('ready', (info) => {
    if (info?.user_id) myQq = String(info.user_id);
    const who = config.whitelistEnabled
      ? config.allowedQqs.join(', ') || '（空，谁都触发不了）'
      : '（白名单已关，所有人都能触发）';
    log.info(`就绪，等待消息。白名单：${who}`);
  });

  bot.on('message', async (msg) => {
    // M1 只处理私聊
    if (msg.messageType !== 'private') {
      log.debug(`忽略群消息：群 ${msg.groupId}`);
      return;
    }
    if (config.whitelistEnabled && !config.allowedQqs.includes(msg.userId)) {
      log.debug(`忽略非白名单：${msg.userId}`);
      return;
    }
    // 命令式消息（#ls、/help 之类）不送进大模型：她只会回一句"这符号我看不懂了"
    if (config.ignoreCommands && isCommandLike(msg.text)) {
      log.info(`忽略命令式消息：${msg.text}`);
      return;
    }
    if (busy.has(msg.userId)) {
      const arr = pending.get(msg.userId) || [];
      arr.push(msg); // 存整条：合并时要把图/表情一起带上
      pending.set(msg.userId, arr);
      log.info(`⏳ 上一条还在回，先排队（已有 ${arr.length} 条）`);
      return;
    }
    if (breaker.paused) {
      log.warn(`风控熔断中，还有 ${Math.round(breaker.remainingMs / 1000)} 秒`);
      return;
    }

    busy.add(msg.userId);
    try {
      stats.in += 1;
      // QQ 小黄脸（系统表情）：不是图片，但语义明确，拼进文本让感知层看见
      if (msg.faces?.length) msg.text = `${msg.text || ''}${facesToText(msg.faces)}`.trim();
      // 上一张表情包发出后他有没有回话 → 记表现分（快/慢/没回）
      try {
        const pend = JSON.parse(memory.getState(msg.userId, 'pendingSticker', 'null') || 'null');
        if (pend?.id) {
          const gap = Date.now() - (pend.at || 0);
          const kind = gap <= 2 * 60_000 ? 'fast' : gap <= 10 * 60_000 ? 'slow' : 'no_reply';
          memory.stickerFeedback(pend.id, kind);
          memory.setState(msg.userId, 'pendingSticker', 'null');
          log.debug('表情包反馈：' + pend.id + ' → ' + kind + '（' + Math.round(gap / 1000) + 's）');
        }
      } catch {
        /* 忽略 */
      }
      memory.ensureUser(msg.userId, msg.nickname);
      // 他隔了多久才回：用户情绪模型的输入之一（必须写在"记这条"之前）
      const prevUserAt = memory.lastUserMessageAt(msg.userId);
      const replyGapMin = prevUserAt ? (Date.now() - prevUserAt) / 60_000 : -1;
      memory.addMessage(msg.userId, 'user', msg.text, { images: msg.images.length });
      log.info(`← ${msg.nickname || msg.userId}：${msg.text || `[图片×${msg.images.length}]`}`);

      const started = Date.now();
      const persona = personaFor(msg.userId); // 这个用户专属的人设
      log.debug(`🎭 人设：${persona.name}`);
      const guards = [];
      const mood = Number(memory.getState(msg.userId, 'mood', 60));
      const scene = getScene(memory, msg.userId, persona);

      // 场景里"刚做完的事"带评价 → 点燃她的情绪（延续性从这里来）
      for (const d of scene.doneNow || []) {
        const impact = Number(d.appraisal?.goalCongruence);
        if (Number.isFinite(impact) && Math.abs(impact) >= 0.3) {
          rememberEvent(memory, msg.userId, { text: d.text, impact, kind: 'scene' });
          log.info(`💗 场景事件点燃情绪：${d.text}（${impact}）`);
        }
      }

      // 图片理解：先查"是不是她自己库里的图"（零成本），再决定要不要调模型
      let media = null;
      let mediaRepeat = 0;
      let mediaFromLibrary = false;
      let imgFullHash = ''; // 图片指纹（记录“他发过这张”用，放 try 外面）
      let imgBuf = null; // 原始字节（收藏进库要用）
      if (msg.images.length) {
        try {
          const { dataUrl, buf } = await loadImage(msg.images[0], config.imageMaxBytes);
          imgBuf = buf;
          const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
          const now = Date.now();
          const fullHash = createHash('sha1').update(buf).digest('hex');
          imgFullHash = fullHash;
          const libHit = stickerByHash.get(fullHash);
          const seenBefore = memory.getMediaSeen(msg.userId, fullHash);
          const rec = mediaCache.get(hash);

          if (rec && now - rec.at < 10 * 60_000) {
            rec.count += 1;
            rec.at = now;
            media = rec.media;
            mediaRepeat = rec.count;
            log.info(`🖼 同一张图第 ${rec.count} 次（走缓存，不再调模型）`);
          } else if (seenBefore?.desc) {
            // 他以前发过这张：不用再花钱看
            media = {
              kind: seenBefore.kind || 'sticker',
              relation: 'tone',
              text_in_image: '',
              visual: seenBefore.desc,
              from_history: true,
              repeatCount: seenBefore.count,
              candidates: [
                { emotion: '平静', intent: '表达情绪', meaning: seenBefore.desc, p: 0.85 },
              ],
              confidence: 0.85,
              need_clarify: false,
              category: seenBefore.category || '',
            };
            mediaCache.set(hash, { media, at: now, count: 1 });
            log.info(
              `🖼 这张他发过 ${seenBefore.count} 次（${seenBefore.desc}），走记忆不调模型` +
                (seenBefore.count >= 3 ? ' ← 提醒她"你又发这张"' : ''),
            );
          } else if (libHit) {
            // 他发的就是她库里的表情包：直接知道是什么，一次调用都不用
            media = {
              kind: 'sticker',
              relation: 'tone',
              text_in_image: '',
              visual: libHit.desc,
              from_library: true,
              candidates: [
                { emotion: faceEmotion([]) || '平静', intent: '表达情绪', meaning: libHit.desc, p: 0.9 },
              ],
              confidence: 0.9,
              need_clarify: false,
              category: libHit.category,
            };
            mediaCache.set(hash, { media, at: now, count: 1 });
            log.info(`🖼 他发的是库里的图（${libHit.category}/${libHit.desc}），不调模型`);
          } else {
            media = await understandMedia({
              dataUrl,
              text: msg.text,
              recent: memory.recentMessages(msg.userId, 2),
              context: {
                prevAssistant: String(memory.recentMessages(msg.userId, 2).find((m) => m.role === 'assistant')?.content || '').slice(0, 60),
                topic: memory.getState(msg.userId, 'lastTopic', ''),
              },
              chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
              log,
            });
            mediaCache.set(hash, { media, at: now, count: 1 });
            if (media) {
              log.info(mediaLine(media));
              try {
                memory.recordMediaSeen(msg.userId, fullHash, {
                  kind: media.kind,
                  desc: media.visual || media.candidates?.[0]?.meaning || '',
                  category: media.category || media.candidates?.[0]?.emotion || '',
                });
              } catch {
                /* 忽略 */
              }
            }
          }
        } catch (e) {
          log.warn(`图片处理失败：${e.message}`);
        }

        // 不管走缓存/记忆/新理解，都记一次"他发过这张"
        if (media) {
          try {
            const rec = memory.recordMediaSeen(msg.userId, imgFullHash, {
              kind: media.kind,
              desc: media.visual || media.candidates?.[0]?.meaning || '',
              category: media.category || media.candidates?.[0]?.emotion || '',
            });
            if (rec.count >= 3) {
              media.repeatCount = rec.count;
              log.info(`🖼 这张他已经发了 ${rec.count} 次`);
            }
          } catch {
            /* 忽略 */
          }
        }
      }

      // QQ 收藏：发图时带「存/收藏/收下/入库」就把这张收进表情库
      if (imgBuf && /(存|收藏|收下|入库)/.test(msg.text || '')) {
        try {
          const guessed = media?.category || media?.candidates?.[0]?.emotion || '';
          const saved = await stickerStore.addSticker({
            buf: imgBuf,
            name: 'qq',
            category: guessed,
            desc: media?.visual || media?.candidates?.[0]?.meaning || '',
          });
          if (saved.ok) {
            reloadStickers();
            await bot.sendPrivate(msg.userId, `存好了，归到「${saved.sticker.category}」（${saved.sticker.desc || '没描述'}）`);
            log.info(`📥 QQ 收藏入库：${saved.sticker.category}/${saved.sticker.id}`);
          } else {
            await bot.sendPrivate(msg.userId, saved.duplicate ? '这张库里已经有了' : `存不了：${saved.error}`);
          }
        } catch (e) {
          log.warn(`收藏失败：${e.message}`);
        }
        return;
      }

      // 先读他的情绪和意图，再决定姿态
      // M1：感知层优先（一次结构化调用，读局面）；失败或关掉时退回规则
      const ruleRead = readUser(msg.text, { hour: new Date().getHours() });
      let read = ruleRead;
      let perc = null;
      const shortNoImg = String(msg.text || '').trim().length <= 2 && msg.images.length === 0;
      if (config.perceive && !shortNoImg) {
        const activity = memory.getState(msg.userId, 'activity', '');
        perc = await perceive({
          text: msg.text,
          recent: memory.recentMessages(msg.userId, 3),
          hasImage: msg.images.length > 0,
          activity,
          prevTopic: memory.getState(msg.userId, 'lastTopic', ''),
          chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
          log,
        });
        if (perc) {
          read = {
            ...ruleRead,
            emotion: perc.emotion,
            intent: perc.intent,
            confidence: perc.certainty,
            source: 'perceive',
            topic: perc.topic,
            continuity: perc.continuity,
            jump: perc.jump,
          };
          memory.addPerception(msg.userId, msg.text, perc);
          memory.setState(msg.userId, 'lastTopic', perc.topic);
        } else {
          // 降级：沿用上一轮感知的语气，别让她突然"变傻"
          const lastP = memory.lastPerception(msg.userId);
          perc = lastP
            ? { ...lastP, certainty: 0.35, note: '感知失败，沿用上一轮', degraded: true }
            : null;
          if (perc) {
            log.warn(`感知失败，沿用上一轮：${perc.tone?.label || perc.emotion}`);
            read = {
              ...ruleRead,
              emotion: perc.emotion,
              intent: ruleRead.intent,
              confidence: 0.35,
              source: 'perceive-degraded',
              topic: perc.topic,
              continuity: 0.5,
              jump: 'none',
            };
          } else {
            read = await readUserSmart({
              text: msg.text,
              recent: memory.recentMessages(msg.userId, 2),
              chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
              log,
              enabled: config.readLlm,
              minConfidence: config.readLlmMinConf,
            });
          }
        }
      } else {
        // 短消息（"嗯""哦""？"）走规则，省一次调用；但语气沿用上一轮
        const lastP = config.perceive ? memory.lastPerception(msg.userId) : null;
        if (lastP) perc = { ...lastP, certainty: 0.3, note: '短消息，沿用上一轮' };
        read = await readUserSmart({
          text: msg.text,
          recent: memory.recentMessages(msg.userId, 2),
          chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
          log,
          enabled: config.readLlm,
          minConfidence: config.readLlmMinConf,
        });
      }
      const goal = replyGoal(read);
      const moodHint = affectHint(memory, msg.userId, { pace: scene && scene.pace });
      const recallHint = recallBlock(
        recall({
          text: msg.text,
          facts: memory.getFacts(msg.userId),
          messages: memory.recentMessages(msg.userId, 12),
          episodes: memory.recentEpisodes(msg.userId, 30),
        }),
        { query: msg.text },
      );
      // 用户情绪模型：把语气 + 行为信号累积成"他现在怎么样"（每轮都更新，不看生成结果）
      const he = config.uaffect
        ? updateUAffect(memory, msg.userId, {
            tone: perc?.tone || null,
            msgLen: String(msg.text || '').length,
            gapMin: replyGapMin,
            hour: new Date(started).getHours(),
            now: started,
          })
        : null;
      const heHint = he ? uaffectHintOf(he) : '';
      // 感知置信度低时更保守：不给抬杠、优先正常接话
      const lowConf = Boolean(perc) && perc.certainty < 0.5;

      // 裁决层：先决定"这轮该做什么"，再据此选姿态（关掉时退回旧的权重随机）
      let act = null;
      let actStrategy = null;
      if (config.actLayer) {
        act = decideAct({
          perception: perc,
          recentActs: actHistory.get(msg.userId) || [],
          mood,
          thresholds: actThresholds(readProfile(memory, msg.userId), config),
          scene,
        });
        // 图片优先：刷同一张图就别认真接；看不懂就问；中等置信度先接情绪
        if (mediaRepeat >= config.actRepeatImageLimit) {
          act = { act: 'advance', why: `他在刷同一张图（第 ${mediaRepeat} 次）` };
        } else if (media) {
          const mAct = mediaAct(media, {
            askBelow: config.actMediaAskBelow,
            engageBelow: config.actMediaEngageBelow,
          });
          if (mAct) act = { act: mAct, why: `看图：${media.candidates[0]?.meaning || '不确定'}` };
        }
        actStrategy = actToStrategy(act.act);
        const hist = [...(actHistory.get(msg.userId) || []), act.act].slice(-3);
        actHistory.set(msg.userId, hist);
      }

      const prefer = actStrategy
        ? [actStrategy]
        : lowConf
          ? ['normal', ...(goal.prefer || [])]
          : goal.prefer || [];
      const avoid = lowConf ? [...new Set([...(goal.avoid || []), 'tease'])] : goal.avoid || [];
      const strategy = pickStrategy({
        mood,
        incoming: msg.text,
        prefer,
        avoid,
      });
      if (act) log.info(`🎯 ${act.act}「${act.why}」→ 姿态 ${strategy.id}`);
      else if (lowConf) log.debug(`感知置信度 ${perc.certainty}，姿态收紧（不给抬杠）`);
      // 这条到底回不回：手滑、没看懂，都可能干脆不理
      const decision = decideReply(read, {
        typoSilence: config.typoSilence,
        ambiguSilence: config.ambiguSilence,
      });
      if (!decision.reply) {
        const streak = Number(memory.getState(msg.userId, 'skipStreak', 0));
        if (streak < 2) {
          memory.setState(msg.userId, 'skipStreak', streak + 1);
          log.info(`💤 这条不回（${decision.reason}）`);
          memory.addTurn({
            qq: msg.userId,
            at: started,
            input: msg.text || '',
            perception: perc,
            act: 'silent',
            actWhy: decision.reason || '',
            scene,
            media,
            hint: '',
            reply: '',
            latencyMs: Date.now() - started,
            cost: 0,
            guards: ['skip'],
          });

          return;
        }
        log.info('已经连着没回两次了，这条还是回一下');
      }
      memory.setState(msg.userId, 'skipStreak', 0);

      // 问卷里的"关系"设定 → 一句提示（按这个用户自己的档案）
      const relationHint = profileRelationHint(readProfile(memory, msg.userId));

      const readHint = [relationHint, perceiveHint(perc), readLine(read), goal.goal, decision.hint]
        .filter(Boolean)
        .join('\n');
      // 感知结果打到 info：出问题时能直接看"她到底读到了什么"
      if (perc) log.info(perceiveLine(perc));
      log.debug(
        `🧠 ${perc ? '感知' : '规则'}：${read.emotion}/${read.intent}(${read.confidence})` +
          `  规则对照=${ruleRead.emotion}/${ruleRead.intent}  姿态=${strategy.id}`,
      );
      if (he) log.debug(uaffectLine(he));

      // 跨轮句式：最近 20 条里有没有开头/说法固化
      const style = config.styleGuard
        ? analyzeStyle(memory.recentAssistant(msg.userId, 20), {
            repeatTimes: config.styleOpenRepeat,
            simMax: config.styleSimMax,
          })
        : null;
      if (style?.hit) log.info(`🔂 句式固化：${style.hint}`);

      const usedHint = [actHint(act?.act, act?.strength), mediaHint(media), strategy.hint, readHint, style?.hint]
        .filter(Boolean)
        .join('\n\n');

      // 生成 → 跟她最近说过的话比对，太像就重生成一次
      let { text: rawText, usage } = await generateReply({
        persona,
        memory,
        qq: msg.userId,
        text: msg.text,
        images: msg.images,
        extraHint: [usedHint, moodHint, recallHint, heHint].filter(Boolean).join('\n'),
        stickers,
        scene,
        log,
      });

      const rep = looksRepeated(rawText, memory.recentAssistant(msg.userId, 4));
      if (rep.repeated) {
        guards.push('repeat');
        log.info(`🔁 与「${String(rep.against).slice(0, 12)}」太像（相似度 ${rep.sim}，公共 ${rep.common} 字），换一版`);
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: `${strategy.hint ? strategy.hint + '\n' : ''}【换个说法】你上一版回得太像之前说过的话了。换角度、换句式，别再说同一个意思。`,
            stickers,
            scene,
            log,
          });
          rawText = again.text;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`重生成失败，沿用第一版：${e.message}`);
        }
      }

      // ── 只保留两道"轻"闸（A+B 策略）────────────────────────
      // 词表硬拦 + 固定兜底句已经证明是打地鼠：每堵一个说法就冒出三个新的，
      // 兜底句本身还变成了新的复读。现在改成：
      //   1) 看起来可疑 → 让模型自己判断一次（B）
      //   2) 判"是" → 换个方向重说，不塞固定句子
      //   3) 只保留"和她最近说过的完全一样"这一条硬指标
      const metaTalk = userMentionsRepeat(msg.text || '');
      let judgedBad = false;

      if (!metaTalk && isSuspectComment(rawText)) {
        judgedBad = await judgeMetaTalk({
          text: rawText,
          chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
          log,
        });
      }

      if (judgedBad) {
        guards.push('rep-judge');
        log.info('🤖 判定为"点评对方说话方式"，换个方向重说');
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: '【换个方向】别评论他怎么说，说你这边一件具体的小事，一句话。',
            stickers,
            scene,
            log,
          });
          rawText = again.text;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`换方向重生成失败，沿用第一版：${e.message}`);
        }

        // 重生成完必须再查一遍：实测 12:51 那次，换完还是"你又发两遍"
        if (isRepPolice(rawText) && !metaTalk) {
          log.info('🤖 换完还在点评，再换一次');
          try {
            const again2 = await generateReply({
              persona,
              memory,
              qq: msg.userId,
              text: msg.text,
              images: msg.images,
              extraHint: '【完全换开】别提他怎么说话、别评价他。就说你此刻在做的一件具体的事，六到十五个字。',
              stickers,
              scene,
              log,
            });
            rawText = again2.text;
            usage = {
              prompt_tokens: usage.prompt_tokens + again2.usage.prompt_tokens,
              completion_tokens: usage.completion_tokens + again2.usage.completion_tokens,
              cost: usage.cost + again2.usage.cost,
            };
          } catch (e) {
            log.warn(`第二次换方向失败：${e.message}`);
          }
        }
      }

      // 唯一的硬指标：和她最近说过的某句完全一样（4 字以上）→ 再换一次
      const recentLines = memory.recentAssistant(msg.userId, 10);
      const normLen = (s) => String(s || '').replace(/[\s，。！？、~…]/g, '').length;
      if (normLen(rawText) >= 4 && isExactRepeat(rawText, recentLines)) {
        guards.push('exact-repeat');
        log.info('♻️ 和之前某句完全一样，换一句');
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: '【换一句】别和刚才说过的一样，换个说法或者换个点。',
            stickers,
            scene,
            log,
          });
          rawText = again.text;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`换一句失败，沿用第一版：${e.message}`);
        }
      }

      // 句式检查：又用了同一个开头/相似说法 → 换一次
      if (style?.hit && repeatsOpening(rawText, style)) {
        guards.push('style-repeat');
        log.info('🔂 又踩同一个句式，换一版');
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: `【换个开头】你最近常说「${style.opening || '类似的话'}」这类开头，这轮务必换个说法。`,
            stickers,
            scene,
            log,
          });
          rawText = again.text;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`句式重生成失败：${e.message}`);
        }
      }

      // 场景一致性：她说自己在别的地方 → 重生成一次（这是"便利店变沙发"的根治）
      const conflict = findConflict(scene, rawText);
      if (conflict) {
        guards.push('scene-conflict');
        log.info(`🏠 场景矛盾（她${conflict.claimed}，实际${conflict.actual}），重生成`);
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: `【注意场景】你现在在${scene.location}，${scene.doing}。不要把自己说成在别的地方。`,
            stickers,
            scene,
            log,
          });
          rawText = again.text;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`场景重生成失败：${e.message}`);
        }
      }
      learnScene(memory, msg.userId, rawText);

      // 抠掉 [fig:标签]，剩下的才是要说的话
      let { text: cleanText, tags: stickerTags } = extractStickerTags(rawText);
      let text = cleanText || '……';

      // 他发了一长段，她只回一个字（"嗯" "哦"）——太敷衍，重生成一次
      const hanLen = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length;
      const needMin = (msg.text || '').length >= 30 ? 6 : 2;
      if (hanLen < needMin && (msg.text || '').length >= 12) {
        guards.push('too-short');
        log.info(`🔧 回复只有 ${hanLen} 个字，太敷衍，重生成`);
        try {
          const again = await generateReply({
            persona,
            memory,
            qq: msg.userId,
            text: msg.text,
            images: msg.images,
            extraHint: `${strategy.hint ? strategy.hint + '\n' : ''}【多回几个字】他刚说了一长段，别用一个字应付。挑一个点接，8~20 个字。`,
            stickers,
            scene,
            log,
          });
          const r2 = extractStickerTags(again.text);
          text = r2.text || text;
          stickerTags = r2.tags;
          usage = {
            prompt_tokens: usage.prompt_tokens + again.usage.prompt_tokens,
            completion_tokens: usage.completion_tokens + again.usage.completion_tokens,
            cost: usage.cost + again.usage.cost,
          };
        } catch (e) {
          log.warn(`重生成失败，沿用第一版：${e.message}`);
        }
      }

      const elapsed = Date.now() - started;

      // burst 策略：补足 2~4 条独立短消息（多次调用逼出"想到一句发一句"）
      let segments;
      if (strategy.id === 'burst') {
        const expanded = await expandBurst({
          persona,
          memory,
          qq: msg.userId,
          text: msg.text,
          firstReply: text,
          log,
        });
        segments = expanded.segments;
      }

      // 节奏：先"看到+想一下"（忙的时候额外拖一会儿），再逐条打字发送
      const think = thinkDelay(msg.text.length, config) + strategy.extraDelayMs;

      // 语音：她偶尔直接发语音；对方明确要语音时一定发
      const wantsVoice = /(发|来|给)(一?条|个)?(语音|声音)|语音(说|回)|说句话/.test(msg.text || '');
      const voiceHistory = voiceLog.get(msg.userId) || [];
      const useVoice =
        config.voiceEnabled &&
        (wantsVoice ||
          shouldVoice({
            text: rawText,
            emotion: emotionFor(text),
            hour: new Date().getHours(),
            recent: voiceHistory,
            cfg: config,
          }));
      if (useVoice) {
        voiceHistory.push(Date.now());
        voiceLog.set(msg.userId, voiceHistory.slice(-50));
      }

      let bursts;
      let sentAsVoice = false;
      if (useVoice) {
        try {
          await sleep(think);
          // 语音用"带标点的原文"合成：逗号句号会让 TTS 自然停顿，念起来才有顿挫。
          // 前面发文字时才把标点洗掉——这两件事的目的正好相反。
          const ttsText = rawText
            .replace(/[\[【(（]\s*fig\s*[:：][^\]】)）]+[\]】)）]/gi, '')
            .replace(/[（(][^）)]{0,12}[）)]/g, '')
            .replace(/\n+/g, '，')
            .replace(/\s+/g, ' ')
            .trim();
          const v = await synthesize(ttsText || text, {
            voice: config.voiceName,
            qwenVoice: config.qwenVoice,
            qwenVoiceCustom: config.qwenVoiceCustom,
            voiceRate: config.voiceRate,
            voiceRateByEmotion: config.voiceRateByEmotion,
            voiceUseTags: config.voiceUseTags,
            qwenVoiceAlt: config.qwenVoiceAlt,
            sapiVoice: config.voiceSapi,
            engine: config.voiceEngine,
            bailianKey: config.bailianKey,
            bailianBase: config.bailianBase,
            emotion: emotionFor(text),
            minimaxVoice: config.minimaxVoice,
          });
          await bot.sendRecord(msg.userId, v.filePath);
          sentAsVoice = true;
          stats.voice += 1;
          bursts = [text];
          log.info(`🎤 语音（${v.engine}，${Math.round(v.bytes / 1024)} KB）`);
        } catch (e) {
          log.warn(`语音合成失败，改用文字：${e.message}`);
        }
      }

      // ── 先决定这一轮要不要发表情包 ──────────────────────────
      // 动图发得慢：按冷却控制，默认 12 分钟最多一张
      const lastGifAt = Number(memory.getState(msg.userId, 'lastStickerGifAt', 0));
      const allowAnimated = Date.now() - lastGifAt >= config.stickerGifMinGapMin * 60_000;
      let stickerToSend = null;
      let stickerPlan = null;
      if (stickerTags.length) {
        // 她自己在回复里点了名，优先听她的
        stickerToSend = findSticker(stickers, stickerTags[0]);
        if (!stickerToSend) log.debug(`未知表情包：${stickerTags[0]}`);
      } else if (config.stickerEnabled) {
        // 决策器：情绪 + 场景 + 配额（不再按权重随机）
        const today = new Date().toISOString().slice(0, 10);
        const day = memory.getState(msg.userId, 'stickerDay', '');
        const sentToday = day === today ? Number(memory.getState(msg.userId, 'stickerCountToday', 0)) : 0;
        const recent = recentStickers.get(msg.userId) || [];
        stickerPlan = planSticker({
          perception: perc,
          act: act?.act,
          text,
          hasImage: msg.images.length > 0,
          hour: new Date().getHours(),
          recentIds: recent,
          sentToday,
          config,
        });
        log.debug(`表情包决策 p=${stickerPlan.p.toFixed(2)}（${stickerPlan.reasons.join(' / ')}）`);
        if (Math.random() < stickerPlan.p) {
          const cat = stickerPlan.category || classifyCategory(`${text} ${msg.text}`);
          stickerToSend =
            (cat && pickByCategory(stickers, cat, recent, { allowAnimated, scores: memory.stickerScores() })) ||
            randomSticker(stickers.filter((s) => !s.animated || allowAnimated), recent);
          if (stickerToSend) {
            log.info(`🎴 发表情包（p=${stickerPlan.p.toFixed(2)}，${cat || '随机'}）`);
          }
        }
      }

      // 小概率只发图不说话，更像真人（由决策器给）
      const pureSticker =
        Boolean(stickerToSend) && stickerToSend.type !== 'text' && Boolean(stickerPlan?.pure);

      if (!sentAsVoice && !pureSticker) {
        bursts = await deliver({
          bot,
          qq: msg.userId,
          text,
          segments,
          config,
          aggressive: strategy.id === 'burst',
          leadDelayMs: think,
        });
      } else {
        bursts = pureSticker ? [] : bursts;
      }
      log.debug(`节奏：先等 ${think}ms，共 ${(bursts || []).length} 条`);

      if (stickerToSend) {
        await sleep(pureSticker ? think : 400 + Math.random() * 600);
        try {
          if (stickerToSend.type === 'text') {
            // 颜文字：当一条普通消息发，不走图片通道
            await bot.sendPrivate(msg.userId, stickerToSend.text);
            stats.stickers += 1;
            stats.out += 1;
            log.info(`ᵕ 表情文字：${stickerToSend.text}（${stickerToSend.desc}）`);
          } else {
            await bot.sendImage(msg.userId, stickerToSend.file);
            stats.stickers += 1;
            if (stickerToSend.animated) memory.setState(msg.userId, 'lastStickerGifAt', Date.now());
            log.info(
              `🖼 表情包：${stickerToSend.category}/${stickerToSend.id}` +
                `${stickerToSend.animated ? '（动图）' : ''}${pureSticker ? '（只发图）' : ''}`,
            );
          }
          // 记最近发过的，避免连着发同一张
          const recent = recentStickers.get(msg.userId) || [];
          recentStickers.set(msg.userId, [stickerToSend.id, ...recent].slice(0, 6));
          // 记表现：等他回话，用来算这张图的"受欢迎度"
          try {
            memory.stickerSent(stickerToSend.id, stickerToSend.category);
            memory.setState(msg.userId, 'pendingSticker', JSON.stringify({ id: stickerToSend.id, at: Date.now() }));
          } catch {
            /* 忽略 */
          }
          // 配额计数
          const today2 = new Date().toISOString().slice(0, 10);
          const prevDay = memory.getState(msg.userId, 'stickerDay', '');
          const prevCount = prevDay === today2 ? Number(memory.getState(msg.userId, 'stickerCountToday', 0)) : 0;
          memory.setState(msg.userId, 'stickerDay', today2);
          memory.setState(msg.userId, 'stickerCountToday', prevCount + 1);
        } catch (e) {
          log.warn(`表情包发送失败：${e.message}`);
        }
      }

      stats.out += (bursts || []).length;
      memory.addMessage(msg.userId, 'assistant', text);
      if (perc && perc.event && perc.event.kind !== 'none' && Math.abs(perc.event.impact) >= 0.25) {
        rememberEvent(memory, msg.userId, { text: msg.text, impact: perc.event.impact, kind: perc.event.kind });
      }

      // 记一条情节记忆：他说了什么、在哪儿、当时什么情绪
      if (perc && perc.event && perc.event.kind !== 'none' && String(msg.text || '').length >= 6) {
        const imp =
          perc.event.kind === 'blame' || perc.event.kind === 'reject'
            ? 5
            : perc.tone && perc.tone.intensity >= 0.6
              ? 4
              : 3;
        memory.addEpisode(msg.userId, {
          text: msg.text,
          kind: perc.event.kind,
          place: scene ? scene.location : '',
          mood: perc.event.impact,
          importance: imp,
        });
      }
      memory.setState(msg.userId, 'mood', driftMood(mood).toFixed(1));
      // 顺手抽一次事实（每 16 条消息，异步不阻塞）
      void maybeExtractFacts({
        memory,
        qq: msg.userId,
        chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
        log,
      }).catch(() => {});

      // 顺手检查要不要压缩历史（不阻塞回复）
      void maybeSummarize({
        memory,
        qq: msg.userId,
        chatFn: (messages, tag) => chat(messages, { qq: msg.userId, memory, log, tag }),
        log,
      }).catch(() => {});
      breaker.recordSuccess();
      const preview = bursts.join(' ／ ');
      log.info(
        `→ ${msg.nickname || msg.userId}［${strategy.id}］（${bursts.length} 条）：${preview.slice(0, 50)}${preview.length > 50 ? '…' : ''} ` +
          `(${elapsed}ms, ¥${usage.cost.toFixed(4)})`,
      );
      memory.addTurn({
        qq: msg.userId,
        at: started,
        input: msg.text || (msg.images.length ? '[图片]' : ''),
        perception: perc,
        act: act?.act || strategy.id,
        actWhy: act?.why || '',
        scene,
        media,
        hint: usedHint,
        reply: bursts.join(' / '),
        latencyMs: Date.now() - started,
        cost: usage.cost,
        guards,
      });
    } catch (err) {
      breaker.recordFailure(err);
      // 兜底：别让对话断在半空
      try {
        await bot.sendPrivate(msg.userId, '……等我一下，我这边好像卡住了。');
        breaker.recordSuccess();
      } catch (e2) {
        log.error(`兜底回复也失败了：${e2.message}`);
      }
    } finally {
      busy.delete(msg.userId);
      const queued = pending.get(msg.userId);
      if (queued?.length) {
        pending.delete(msg.userId);
        const merged = queued.map((m) => m.text || '').filter(Boolean).join(' ');
        const mergedImages = queued.flatMap((m) => m.images || []);
        const mergedFaces = queued.flatMap((m) => m.faces || []);
        log.info(`📥 把排队中的 ${queued.length} 条合成一条再回：${merged.slice(0, 30)}`);
        setTimeout(() => {
          bot.emit('message', { ...msg, message_id: null, text: merged, images: mergedImages, faces: mergedFaces });
        }, 400);
      }
    }
  });

  if (DEV_NO_QQ) {
    log.info('开发模式：不连 QQ（ONEBOT_DISABLED=1），只开管理后台和测试台');
  } else {
    bot.start();
  }

  const stopProactive = DEV_NO_QQ ? () => {} : startProactive({ bot, memory, persona, config, log });

  // ── 管理后台（M1）──────────────────────────────────────────
  if ((process.env.WEB_CONSOLE ?? '1') !== '0') {
    const port = Number(process.env.WEB_PORT) || 3870;
    startWebConsole({
      port,
      getRuntime: () => ({
        online: bot.ready,
        qq: myQq,
        uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
        messagesIn: stats.in,
        messagesOut: stats.out,
        voiceSent: stats.voice,
        stickersSent: stats.stickers,
        costToday: Number(memory.todayCost().toFixed(4)),
        persona: persona.name,
        env: config.botEnv,
        devNoQq: DEV_NO_QQ,
      }),
      actions: {
        // 试听：合成但不发 QQ，直接把音频回给浏览器
        testVoice: async (body) => {
          const text = String(body.text || '欸，你听得到我说话吗？').slice(0, 80);
          const v = await synthesize(text, {
            voice: body.voice || config.voiceName,
            engine: body.engine || config.voiceEngine,
            bailianKey: config.bailianKey,
            bailianBase: config.bailianBase,
            sapiVoice: config.voiceSapi,
          });
          const ext = v.filePath.endsWith('.mp3') ? 'mpeg' : 'wav';
          const b64 = fs.readFileSync(v.filePath).toString('base64');
          return { engine: v.engine, bytes: v.bytes, audio: `data:audio/${ext};base64,${b64}` };
        },
        // 对话回放：列表 + 单条详情
        usage: (hours) => memory.usageSince(Date.now() - hours * 3600_000),
        defaultQq: () => config.allowedQqs?.[0] || '',

        // ── 人设预览：只调一次模型，不碰任何用户记忆 ──────────
        previewPersona: async (body) => {
          const id = String(body?.persona || config.persona);
          const text = String(body?.text || '在吗').slice(0, 120);
          const persona = loadPersona(id);
          const tmp = new Memory('data/preview.db');
          const qq = 'preview-' + Date.now();
          tmp.ensureUser(qq, '预览');
          try {
            const { text: reply, usage } = await generateReply({
              persona,
              memory: tmp,
              qq,
              text,
              images: [],
              extraHint: '【这是后台预览，随便聊聊就行】',
              stickers: [],
              scene: null,
              log,
            });
            return { ok: true, reply, cost: usage?.cost || 0, persona: persona.name };
          } finally {
            tmp.clearUserMessages(qq);
            tmp.close();
          }
        },

        // ── 测试台：独立库，不污染任何真实用户 ────────────────
        sandboxTurn: async (body) => {
          const text = String(body?.text || '').trim().slice(0, 500);
          if (!text) return { ok: false, error: '说点什么' };
          const sdb = new Memory('data/sandbox.db');
          const qq = 'sandbox';
          const started = Date.now();
          try {
            sdb.ensureUser(qq, '测试台');
            const prevUserAt = sdb.lastUserMessageAt(qq);
            const replyGapMin = prevUserAt ? (started - prevUserAt) / 60_000 : -1;
            sdb.addMessage(qq, 'user', text);

            const personaId = String(body?.persona || '');
            let persona;
            try {
              persona = loadPersona(personaId || config.persona);
            } catch {
              persona = loadPersona(config.persona);
            }

            let perc = null;
            if (config.perceive) {
              perc = await perceive({
                text,
                recent: sdb.recentMessages(qq, 3),
                hasImage: false,
                activity: sdb.getState(qq, 'activity', ''),
                prevTopic: sdb.getState(qq, 'lastTopic', ''),
                chatFn: (messages, tag) => chat(messages, { qq, memory: sdb, log, tag }),
                log,
              });
            }
            const scene = getScene(sdb, qq, persona);
            const act = decideAct({
              perception: perc,
              recentActs: [],
              mood: Number(sdb.getState(qq, 'mood', 60)),
              thresholds: { deflectBelow: config.actDeflectBelow, engageConfidence: config.actEngageConfidence },
              scene,
            });

            const hint = [actHint(act?.act, act?.strength), perceiveHint(perc)].filter(Boolean).join('\n\n');
            const he = config.uaffect
              ? updateUAffect(sdb, qq, {
                  tone: perc?.tone || null,
                  msgLen: text.length,
                  gapMin: replyGapMin,
                  hour: new Date(started).getHours(),
                  now: started,
                })
              : null;
            const heHint = he ? uaffectHintOf(he) : '';
            if (he) log.debug(uaffectLine(he));
            const { text: reply, usage } = await generateReply({
              persona,
              memory: sdb,
              qq,
              text,
              images: [],
              extraHint: [hint, affectHint(sdb, qq), heHint].filter(Boolean).join('\n'),
              stickers: [],
              scene,
              log,
            });
            // 测试台也按生产的方式切 |||，否则看到的是没切开的原文
            const segs = splitIntoBursts(reply, { maxSegments: 4 });
            const shown = segs.length > 1 ? segs.join('\n') : reply;
            sdb.addMessage(qq, 'assistant', shown);
            if (perc) sdb.addPerception(qq, text, perc);
            sdb.addTurn({
              qq,
              input: text,
              perception: perc,
              act: act?.act || 'answer',
              actWhy: act?.why || '',
              scene,
              hint,
              reply,
              latencyMs: Date.now() - started,
              cost: usage?.cost || 0,
              guards: ['sandbox'],
            });
            return {
              ok: true,
              reply,
              persona: persona.name,
              perception: perc,
              act,
              scene,
              he,
              cost: usage?.cost || 0,
              latencyMs: Date.now() - started,
            };
          } catch (e) {
            log.warn(`测试台出错：${e.message}`);
            return { ok: false, error: friendlyText(e) };
          } finally {
            sdb.close();
          }
        },

        sandboxReset: () => {
          const sdb = new Memory('data/sandbox.db');
          try {
            sdb.clearUserMessages('sandbox');
            return { ok: true };
          } finally {
            sdb.close();
          }
        },

        sandboxHistory: () => {
          const sdb = new Memory('data/sandbox.db');
          try {
            const rows = sdb.selectMessages?.('sandbox', 40) || [];
            const turns = sdb.listTurns ? sdb.listTurns(1, 'sandbox') : [];
            let lastTurn = null;
            if (turns.length && sdb.getTurn) {
              const t = sdb.getTurn(turns[0].id);
              lastTurn = {
                perception: t.perception,
                act: { act: t.act, why: t.act_why },
                scene: t.scene,
                cost: t.cost,
                latencyMs: t.latency_ms,
              };
            }
            return { ok: true, messages: rows, lastTurn };
          } finally {
            sdb.close();
          }
        },
        listPersonas: () => listPersonas(),
        globalPersona: () => config.persona,
        listUsers: () =>
          memory.listUsers().map((u) => ({
            ...u,
            persona: String(memory.getState(u.qq, 'persona', '') || ''),
          })),
        setUserPersona: (body) => {
          const qq = String(body?.qq || '');
          const personaId = String(body?.persona || '');
          if (!qq) return { ok: false, error: '缺少 qq' };
          if (personaId && !listPersonas().some((p) => p.id === personaId)) {
            return { ok: false, error: `没有这个人设：${personaId}` };
          }
          memory.setState(qq, 'persona', personaId); // 空字符串 = 跟全局默认
          personaCache.delete(personaId);
          return { ok: true, qq, persona: personaId };
        },
        stickersInfo: () => ({
          ...stickerStore.listStickers(),
          scores: memory.topStickers(20),
        }),
        uploadSticker: async (body) => {
          const raw = String(body?.dataUrl || '');
          const m = raw.match(/^data:[^;]+;base64,(.*)$/);
          if (!m) return { ok: false, error: '不是 base64 图片' };
          const buf = Buffer.from(m[1], 'base64');
          const r = await stickerStore.addSticker({
            buf,
            name: body?.name || 'upload',
            category: body?.category || '',
            desc: body?.desc || '',
          });
          if (r.ok) reloadStickers();
          return r;
        },
        updateSticker: (body) => {
          const r = stickerStore.updateSticker(body?.id, { category: body?.category, desc: body?.desc });
          if (r.ok) reloadStickers();
          return r;
        },
        deleteSticker: (body) => {
          const r = stickerStore.deleteSticker(body?.id);
          if (r.ok) reloadStickers();
          return r;
        },
        // 后台按钮：body = { qq? }，不传就用第一个白名单号
        triggerProactive: async (body) => {
          const qq = String(body?.qq || config.allowedQqs?.[0] || '');
          if (!qq) return { error: '没有可发的 QQ' };
          const r = await runProactiveOnce({ bot, memory, persona, config, log, qq, force: true });
          return r || { error: '没发出去' };
        },
        getProfile: (qq) => {
          let profile = null;
          try {
            profile = JSON.parse(memory.getState(qq, 'profile', 'null') || 'null');
          } catch {
            profile = null;
          }
          return {
            qq,
            profile,
            facts: memory.getFacts(qq),
            config: {
              actDeflectBelow: config.actDeflectBelow,
              proactiveMaxPerDay: config.proactiveMaxPerDay,
              proactiveMinGapMin: config.proactiveMinGapMin,
            },
          };
        },
        saveProfile: (qq, form) => {
          const fact = (k, v) => {
            const val = String(v || '').trim();
            if (val) memory.setFact(qq, k, val.slice(0, 40), 0.85);
          };
          fact('nickname', form.nickname);
          fact('birthday', form.birthday);
          fact('job', form.job);
          if (form.wake || form.sleep) fact('schedule', `${form.wake || '?'}起，${form.sleep || '?'}睡`);
          fact('likes', form.likes);
          fact('dislikes', form.dislikes);
          if (Array.isArray(form.taboo) && form.taboo.length) fact('taboo', form.taboo.join('、'));

          // 三档 → 两个参数（只记在档案里，按人算，不写全局 config）
          memory.setState(qq, 'profile', JSON.stringify({ ...form, filledAt: Date.now() }));
          return { ok: true, facts: memory.getFacts(qq) };
        },
        // 时间线：某段时间里的场景变化、她的情绪曲线、发生过的对话
        timelineData: (qq, fromMs) => {
          const from = Number(fromMs) || Date.now() - 12 * 3600_000;
          const now = Date.now();
          let events = [];
          try {
            events = JSON.parse(memory.getState(qq, 'affectEvents', '[]')) || [];
          } catch {
            events = [];
          }
          const step = 10 * 60_000;
          const affect = [];
          for (let t = from; t <= now; t += step) {
            const st = affectStateOf(events, t);
            affect.push({ t, v: Math.round(st.v * 100) / 100, a: Math.round(st.a * 100) / 100 });
          }
          return {
            from,
            to: now,
            scenes: memory.sceneLog(qq, from, now),
            affect,
            events: (memory.turnsSince(qq, from, 300) || []).map((x) => ({
              t: x.at,
              turnId: x.id,
              input: x.input,
              act: x.act,
              reply: String(x.reply || '').slice(0, 120),
            })),
          };
        },
        memorySnapshot: (qq) => ({
          qq,
          facts: memory.getFacts(qq),
          summaries: memory.listSummaries(qq, 30),
          episodes: memory.recentEpisodes(qq, 20),
          he: (() => {
            try {
              const { readUAffect } = uaffectMod;
              return readUAffect(memory, qq);
            } catch {
              return null;
            }
          })(),
          scene: (() => {
            try {
              return JSON.parse(memory.getState(qq, 'scene', 'null'));
            } catch {
              return null;
            }
          })(),
        }),
        updateFact: (qq, key, value) => {
          memory.setFact(qq, key, value, 1);
          return { ok: true };
        },
        deleteFact: (qq, key) => ({ ok: true, removed: memory.deleteFact(qq, key) }),
        deleteSummary: (id) => ({ ok: true, removed: memory.deleteSummary(id) }),
        listTurns: (limit, qq) => memory.listTurns(limit, qq),
        getTurn: (id) => memory.getTurn(id),
        // 试发一张表情包到指定 QQ
        testSticker: async (body) => {
          const st = findSticker(stickers, body.id || body.category || '开心');
          if (!st) return { ok: false, error: '没找到这张表情包' };
          const qq = body.qq || config.allowedQqs[0];
          await bot.sendImage(qq, st.file);
          return { ok: true, sent: `${st.category}/${st.id}`, to: qq };
        },
      },
    });
  }

  // TTS 预热：首次请求常常要多等十几秒（冷启动），开机先跑一次，别让她第一句话卡住
  if (config.voiceEnabled) {
    log.debug('TTS 预热：开始');
    // 冷启动第一次可能要十几秒，给预热单独放宽超时；失败再补一次，别让开机日志带个 WARN
    const warm = (attempt = 1) =>
      synthesize('嗯', {
        voice: config.voiceName,
        engine: config.voiceEngine,
        bailianKey: config.bailianKey,
        bailianBase: config.bailianBase,
        sapiVoice: config.voiceSapi,
        timeoutMs: 25_000,
      })
        .then((v) =>
          log.info(`TTS 预热完成（${v.engine}，${Math.round(v.bytes / 1024)} KB${attempt > 1 ? '，第 ' + attempt + ' 次' : ''}）`),
        )
        .catch((e) => {
          if (attempt < 2) {
            log.warn(`TTS 预热超时，3 秒后重试（${e.message}）`);
            setTimeout(() => warm(attempt + 1), 3_000);
          } else {
            log.warn(`TTS 预热失败：${e.message}（不影响正常使用，首次发语音会慢一点）`);
          }
        });
    warm();
  }

  const shutdown = () => {
    log.info('正在退出…');
    stopProactive();
    closeVoice();
    bot.stop();
    memory.close();
    releaseLock();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', releaseLock);
}

main().catch((e) => {
  console.error('启动失败：', e);
  process.exit(1);
});