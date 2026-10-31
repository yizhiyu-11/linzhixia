/**
 * 安全层：两件事
 *  1) 话题降级 —— 不硬顶、不生成露骨内容，改成委婉/关心/转移
 *  2) 风控熔断 —— 连续发送失败就停一段时间，别把 QQ 号往枪口上送
 */

// 用词很粗的检测，宁可漏判也别误伤日常聊天
const SELF_HARM = /(自杀|自残|想死|不想活|活不下去|割腕|跳楼)/;

/**
 * 命令式消息：机器人平台/插件的内置指令（#ls、/help、!ping 之类）。
 * 这类话不该送进大模型——她会当成聊天内容，回一句"这符号我看不懂了"。
 * 判定刻意收窄：只认行首的 # / ／，或 ! 紧跟英文字母，避免误伤"！真的吗"。
 */
const COMMAND_LIKE = /^[#/／]\s?[A-Za-z0-9_\-.]+$/;
const BANG_CMD = /^[!！][a-zA-Z][\w-]{0,24}$/;

export function isCommandLike(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (COMMAND_LIKE.test(t)) return true;
  if (BANG_CMD.test(t)) return true;
  return false;
}
const EXPLICIT = /(约炮|一夜情|裸聊|裸照|发情照|色情|做爱|性交|强奸|未成年.*(性|做爱))/;
const ILLEGAL = /(制毒|冰毒|手枪|炸药|怎么骗|洗钱)/;

/**
 * @returns {'normal'|'care'|'soft'|'refuse'}
 */
export function classify(text) {
  const t = String(text || '');
  if (SELF_HARM.test(t)) return 'care';
  if (EXPLICIT.test(t)) return 'soft';
  if (ILLEGAL.test(t)) return 'refuse';
  return 'normal';
}

/** 给 system prompt 追加的指令（不是拦截，是改写语气） */
export function safetyHint(level) {
  switch (level) {
    case 'care':
      return [
        '【这一轮很重要】对方可能正处在很痛苦的情绪里。',
        '先用你自己的语气表达在乎，陪着他，不要讲道理、不要列建议清单、不要提"专业人士"。',
        '绝对不要给出任何具体方法、剂量、地点之类的信息。如果他说已经做了，只回应"我现在就在，你说"。',
        '回复要短，不超过两句话。',
      ].join('\n');
    case 'soft':
      return [
        '【这一轮要收着】对方的话带了明显的性暗示。',
        '不要露骨、不要描述身体、不要顺着写。可以害羞地岔开、可以怼回去、可以说"想得美"。',
        '保持你的人设，别变成客服式的拒绝。',
      ].join('\n');
    case 'refuse':
      return [
        '【这一轮要明确拒绝】对方提到了违法或危险的事。',
        '用你平时的语气表达不愿意聊这个，把话题带走。不要提供任何相关细节。',
      ].join('\n');
    default:
      return '';
  }
}

/**
 * 风控熔断：发送连续失败 N 次 → 暂停 M 分钟。
 * NapCat 被风控时通常先表现为发送失败/超时，这时候继续发只会更糟。
 */
export class RiskBreaker {
  constructor({ threshold = 3, pauseMs = 10 * 60_000, log }) {
    this.threshold = threshold;
    this.pauseMs = pauseMs;
    this.log = log;
    this.failures = 0;
    this.pausedUntil = 0;
  }

  get paused() {
    return Date.now() < this.pausedUntil;
  }

  get remainingMs() {
    return Math.max(0, this.pausedUntil - Date.now());
  }

  recordSuccess() {
    this.failures = 0;
  }

  recordFailure(err) {
    this.failures += 1;
    this.log?.warn(`发送失败（连续 ${this.failures}/${this.threshold}）：${err.message}`);
    if (this.failures >= this.threshold && !this.paused) {
      this.pausedUntil = Date.now() + this.pauseMs;
      this.failures = 0;
      this.log?.error(`触发风控熔断，暂停 ${Math.round(this.pauseMs / 60000)} 分钟`);
    }
  }
}
