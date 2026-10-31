/**
 * 把一段回复切成"气泡"——真人不会一次发一大段带换行的话，
 * 而是一条一条地发。但也不能永远两条：短话就该一条发完。
 *
 * 策略（按顺序）：
 *   1. 有换行 → 换行处必分（作者主动断的）
 *   2. 整体很短（≤ SHORT_WHOLE）→ 一条发完，不切
 *   3. 否则按句切，再随机把相邻的短句并回去（避免"一句一条"的机械感）
 *   4. 超过 maxSegments → 尾巴并进最后一条
 */

const SENTENCE_RE = /[^。！？!?…~\n]+[。！？!?…~]*/g;
const MIN_MERGE_CHARS = 6; // 太碎的片段并到相邻句子
const SHORT_WHOLE = 20; // 整体这么短就一条发完
const MERGE_PAIR_MAX = 26; // 随机合并时，合并后不超过这么长
const MERGE_CHANCE = 0.4; // 相邻两条合并的概率
const COMMA_SPLIT_MIN = 16; // 激进模式下，超过这个长度就在逗号处再切一刀

/** 清掉模型爱加但聊天里不该出现的东西 */
function clean(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, '') // 代码块（人设聊天不该有，防意外）
    .replace(/（[^）]{0,12}）/g, '') // （笑）（过了几秒）这类旁白——最像 AI 的破绽
    .replace(/\([^)]{0,12}\)/g, '')
    .replace(/[*_`#>]+/g, '') // markdown 符号
    .replace(/\\[nrt]/g, ' ') // 模型把换行写成了字面量 "\n"，别让它露出来
    .replace(/\\/g, '') // 零散的反斜杠：聊天里不该出现
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') // 控制字符
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 聊天里很少有人给一句话加句号，去掉它更像人 */
function dropTrailingPeriod(s) {
  return s.replace(/。\s*$/, '').trim();
}

/**
 * @param {string} text 模型原始输出
 * @param {object} opts { maxSegments }
 * @returns {string[]} 每条对应一个 QQ 气泡
 */
export function splitIntoBursts(text, opts = {}) {
  const maxSegments = opts.maxSegments ?? 3;
  const aggressive = opts.aggressive === true; // burst 策略：尽量拆碎，别合并

  const cleaned = clean(text);
  if (!cleaned) return [];

  // 1) 按换行 + 句子切开。换行一般只算"软断句"（模型爱敲回车），
  //    但激进模式下换行就是硬断——那本来就是两条。
  const parts = [];
  cleaned.split(/\n+/).forEach((line, lineIndex) => {
    line.split(/\s*\|\|\|\s*/).forEach((chunk, barIndex) => {
      const pieces = (chunk.match(SENTENCE_RE) || [chunk]).map((s) => s.trim()).filter(Boolean);
      pieces.forEach((t, i) => {
        const hard = barIndex > 0 && i === 0 ? true : aggressive && lineIndex > 0 && i === 0;
        parts.push({ text: t, hard });
      });
    });
  });

  // 激进模式：长句在逗号处再切一刀（"明年5月就定了啊，现在才十月" → 两条）
  let expanded = parts;
  if (aggressive) {
    expanded = [];
    for (const p of parts) {
      if (p.text.length > COMMA_SPLIT_MIN && p.text.includes('，')) {
        const bits = p.text.split(/(?<=，)/).map((s) => s.trim()).filter(Boolean);
        bits.forEach((b, i) => expanded.push({ text: b, hard: i > 0 }));
      } else expanded.push(p);
    }
  }

  // 2) 整体很短、也没有换行 → 一条发完（激进模式不合并）
  const totalLen = expanded.reduce((s, p) => s + p.text.length, 0);
  if (!aggressive && expanded.length > 1 && totalLen <= SHORT_WHOLE && !expanded.some((p) => p.hard)) {
    return [dropTrailingPeriod(expanded.map((p) => p.text).join(''))];
  }

  // 3) 太碎的并到前一条（跨换行、硬断句不合并）
  const merged = [];
  for (const p of expanded) {
    const prev = merged[merged.length - 1];
    const tooShort = p.text.length < MIN_MERGE_CHARS || (prev && prev.text.length < MIN_MERGE_CHARS);
    if (prev && tooShort && !p.hard) prev.text += p.text;
    else merged.push({ ...p });
  }

  // 4) 随机把相邻两条并回去，打破"一句一条"的机械感（激进模式不合并）
  const out = [];
  for (const p of merged) {
    const prev = out[out.length - 1];
    const canMerge =
      !aggressive && prev && !p.hard && prev.text.length + p.text.length <= MERGE_PAIR_MAX;
    if (canMerge && Math.random() < MERGE_CHANCE) prev.text += p.text;
    else out.push({ ...p });
  }

  // 5) 超过上限：多出来的并到最后一条
  let texts = out.map((p) => p.text);
  if (texts.length > maxSegments) {
    const head = texts.slice(0, maxSegments - 1);
    const tail = texts.slice(maxSegments - 1).join('');
    head.push(tail);
    texts = head;
  }

  // 标点清洗必须放在"切完气泡"之后：
  // 否则句号先被删掉，句子就粘成一坨，切分器认不出边界。
  return texts.map(dropTrailingPeriod).map(tidyPunctuation).filter(Boolean);
}

/** 聊天里不用的标点：逗号顿号变空格，句号删掉（保留问号感叹号省略号） */
export function tidyPunctuation(s) {
  return String(s || '')
    .replace(/[，、]/g, ' ')
    .replace(/。/g, '')
    .replace(/\s+([？!?…~])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}