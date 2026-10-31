/**
 * 跨轮句式检查：她现在只查最近 4 条，聊到 20 轮会开始"同一个味道"。
 *
 * 两个信号：
 *   ① 开头重复：前 3 个字在最近 20 条里出现 3 次以上
 *   ② 整体相似：4-gram Jaccard > 0.55
 *
 * 只做"提醒"，不硬拦；连续两轮还中才重生成一次。
 */

const norm = (s) => String(s || '').replace(/[\s，。！？、~…（）()]/g, '');

function ngrams(s, n = 4) {
  const t = norm(s);
  const size = Math.max(1, Math.min(n, t.length));
  const out = new Set();
  for (let i = 0; i + size <= t.length; i++) out.add(t.slice(i, i + size));
  return out;
}

function similarity(a, b) {
  const A = ngrams(a);
  const B = ngrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 取开头：去掉标点后的前 3 个字 */
export function opening(text, n = 3) {
  return norm(text).slice(0, n);
}

/**
 * @param {string[]} replies 她最近的回复（时间正序）
 * @param {object} opts { repeatTimes, simMax }
 * @returns {{hit:boolean, kind?:string, opening?:string, count?:number, sim?:number, against?:string, hint?:string}}
 */
export function analyzeStyle(replies, opts = {}) {
  const repeatTimes = opts.repeatTimes ?? 3;
  const simMax = opts.simMax ?? 0.55;
  const list = (replies || []).filter(Boolean).slice(-20);
  if (list.length < 6) return { hit: false };

  // ① 开头重复
  const counts = new Map();
  for (const r of list) {
    const o = opening(r);
    if (o.length < 2) continue;
    counts.set(o, (counts.get(o) || 0) + 1);
  }
  let topOpen = null;
  let topCount = 0;
  for (const [o, c] of counts) {
    if (c > topCount) {
      topCount = c;
      topOpen = o;
    }
  }
  if (topOpen && topCount >= repeatTimes) {
    return {
      hit: true,
      kind: 'opening',
      opening: topOpen,
      count: topCount,
      hint: `你最近有 ${topCount} 条都是「${topOpen}…」开头，这轮换个开头说。`,
    };
  }

  // ② 整体相似
  let best = 0;
  let against = null;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const s = similarity(list[i], list[j]);
      if (s > best) {
        best = s;
        against = list[i];
      }
    }
  }
  if (best >= simMax) {
    return {
      hit: true,
      kind: 'similar',
      sim: Number(best.toFixed(2)),
      against,
      hint: `你最近说过「${String(against).slice(0, 16)}」这类话，这轮别用相似的说法。`,
    };
  }

  return { hit: false };
}

/** 新回复是否踩了同一个开头 */
export function repeatsOpening(reply, style) {
  if (!style?.hit) return false;
  if (style.kind === 'opening') return opening(reply) === style.opening;
  return similarity(reply, style.against) >= 0.5;
}
