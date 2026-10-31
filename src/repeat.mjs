/**
 * 重复检测：她很容易把自己上一轮的话当"风格"继续复制。
 * 这里用字符 n-gram + 最长公共子串做一个便宜的相似度判断，
 * 太像就让上层重新生成一次。
 */

function ngrams(s, n = 4) {
  const clean = String(s || '').replace(/\s/g, '');
  // 太短的句子按实际长度取 n，否则一个 n-gram 都没有，相似度恒为 0
  const size = Math.max(1, Math.min(n, clean.length));
  const out = new Set();
  for (let i = 0; i + size <= clean.length; i++) out.add(clean.slice(i, i + size));
  return out;
}

/** Jaccard 相似度（0~1） */
export function similarity(a, b) {
  const s1 = String(a || '').replace(/\s/g, '');
  const s2 = String(b || '').replace(/\s/g, '');
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  // 两边必须用同一个 n，否则短句和长句永远没有交集
  const n = Math.max(1, Math.min(4, s1.length, s2.length));
  const A = ngrams(s1, n);
  const B = ngrams(s2, n);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 最长公共子串长度（用来抓"开头一模一样"这种） */
export function longestCommon(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (!s1 || !s2) return 0;
  let best = 0;
  const prev = new Array(s2.length + 1).fill(0);
  for (let i = 1; i <= s1.length; i++) {
    let diag = 0;
    for (let j = 1; j <= s2.length; j++) {
      const tmp = prev[j];
      if (s1[i - 1] === s2[j - 1]) {
        prev[j] = diag + 1;
        if (prev[j] > best) best = prev[j];
      } else {
        prev[j] = 0;
      }
      diag = tmp;
    }
  }
  return best;
}

/**
 * @param {string} text 新生成的
 * @param {string[]} recent 她最近说过的
 * @param {object} opts { maxSimilarity, maxCommon }
 */
export function looksRepeated(text, recent, opts = {}) {
  const maxSimilarity = opts.maxSimilarity ?? 0.5;
  const maxCommon = opts.maxCommon ?? 7;
  const minEdit = opts.minEdit ?? 0.72;
  for (const old of recent || []) {
    const sim = similarity(text, old);
    const common = longestCommon(text, old);
    const edit = editSimilarity(text, old);
    if (edit >= minEdit || sim >= maxSimilarity || common >= maxCommon) {
      return {
        repeated: true,
        sim: Number(sim.toFixed(2)),
        edit: Number(edit.toFixed(2)),
        common,
        against: old,
      };
    }
  }
  return { repeated: false };
}

/** 编辑距离相似度：改一两个字也算"几乎一样"，比 n-gram 敏感 */
export function editSimilarity(a, b) {
  const s1 = String(a || '').replace(/\s/g, '');
  const s2 = String(b || '').replace(/\s/g, '');
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s1.length; i++) {
    const cur = [i];
    for (let j = 1; j <= s2.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s1[i - 1] === s2[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[s2.length] / Math.max(s1.length, s2.length);
}

/** 她"点评对方说话方式"的句式：不该出现在回复里，也不该留在上下文里 */
export const REP_POLICE =/(复读|卡带|(喊|说|问|提|讲|念|发|打|敲|输入|粘贴)了?(两|三|好几|几)遍|第(两|三)遍|重复|同样的话|刚说过|催我|是故意的吗|发重|重发|刷屏|学我)/;
export const isRepPolice = (text) => REP_POLICE.test(String(text || ''));

/** 和最近说过的话完全一样（去空白后比较） */
export function isExactRepeat(text, recent = []) {
  const norm = (s) => String(s || '').replace(/[\s，。！？、~…]/g, '');
  const t = norm(text);
  if (!t) return false;
  return recent.some((r) => norm(r) === t);
}

/** 对方自己就在聊"是不是在复读/学我说话"，这时她回答一句是合理的，不该被拦 */
export const userMentionsRepeat = (text) => {
  const t = String(text || '');
  return REP_POLICE.test(t) || /(学我说话|学你说话|嘴我|跟着我说|复述)/.test(t);
};

/**
 * 可疑触发词：比拦截词宽得多。
 * 作用是"这句话值得让模型判一下"，不是直接拦——避免"我看了两遍"被误杀。
 */
export const SUSPECT_RE = /(复读|卡带|(两|三|好几|几)遍|重复|同样的话|刚说过|学我|发重|刷屏|复制|粘贴|催我|是故意的吗)/;
export const isSuspectComment = (text) => SUSPECT_RE.test(String(text || ''));