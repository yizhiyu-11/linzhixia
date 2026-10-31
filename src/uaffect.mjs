/**
 * 用户情绪模型（UAffect）：把"这一句"累积成"他这个人现在的状态"。
 *
 * 为什么要有这一层（docs/技术/情绪模型设计.md §12）：
 *   感知层每轮独立判断，实测翻转率 35.4%；只有类别、没有强度和趋势；
 *   判不准就不判（难过/生气 0%）。所以再加一层，把零散的句子级判断
 *   加上行为信号，滑成一个人的状态。
 *
 * 输出只给下游三个数：
 *   empathy        该共情到什么程度
 *   caution        收敛程度（别开玩笑、别贫）
 *   allowProactive 他状态差的时候别去打扰他
 *
 * 状态存在 memory 的 state 表（键 uaffect），与 affect.mjs 同构。
 * 纯函数 + 一层存取，没有模型调用。
 */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** 语气类别 →（愉悦度, 激活度）先验；强度由感知层给 */
export const TONE_VA = {
  开心: { v: 0.6, a: 0.6 },
  撒娇: { v: 0.4, a: 0.45 },
  平静: { v: 0.05, a: 0.3 },
  焦虑: { v: -0.35, a: 0.7 },
  生气: { v: -0.6, a: 0.8 },
  难过: { v: -0.55, a: 0.25 },
};

/** 12 小时没说话：他已经不是刚才那个人了，状态作废 */
export const STALE_MS = 12 * 3600_000;

/** 置信度低于这个值什么都不做（设计 §12.7 边界） */
export const MIN_CONFIDENCE = 0.4;

/** 连续这么多轮负面，就该当他"不太好"了 */
export const RISK_RUN = 3;

/** 一上来什么都不知道时的初值 */
export function emptyState(now = Date.now()) {
  return { v: 0, a: 0.35, confidence: 0.15, trend: 0, updatedAt: now, meta: { shortRun: 0, negRun: 0, n: 0 } };
}

/** 兼容旧值 / 脏数据 */
export function normalizeState(prev) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const meta = p.meta && typeof p.meta === 'object' ? p.meta : {};
  return {
    v: Number.isFinite(p.v) ? clamp(p.v, -1, 1) : 0,
    a: Number.isFinite(p.a) ? clamp(p.a, 0, 1) : 0.35,
    confidence: Number.isFinite(p.confidence) ? clamp(p.confidence, 0, 1) : 0.2,
    trend: Number.isFinite(p.trend) ? clamp(p.trend, -1, 1) : 0,
    updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
    meta: {
      shortRun: Math.max(0, Number(meta.shortRun) || 0),
      negRun: Math.max(0, Number(meta.negRun) || 0),
      n: Math.max(0, Number(meta.n) || 0),
    },
  };
}

/**
 * 一轮更新（纯函数）。
 *
 * @param {object|null} prev 上一状态
 * @param {object} sig 这一轮的信号
 * @param {object|null} sig.tone { label, intensity } 感知层给的句子级语气
 * @param {number} sig.msgLen 这条多长（字）
 * @param {number} sig.gapMin 距他上一条多久（分钟；-1 表示没有上一条）
 * @param {number} sig.hour 本地小时
 * @param {number} sig.now 时间戳
 * @returns {object} 新状态（含 meta）
 */
export function compute(prev, sig = {}) {
  const now = Number.isFinite(sig.now) ? sig.now : Date.now();
  const p = normalizeState(prev);
  const meta = { ...p.meta };
  let { v, a, confidence, trend } = p;

  // 太久没说话：承认估不准，回到中性偏保守
  // 全新用户（从没记录）比"冷了一阵"更没底：0.15 vs 0.3
  const fresh = !p.updatedAt;
  if (fresh || now - p.updatedAt > STALE_MS) {
    v *= 0.4;
    a = lerp(a, 0.35, 0.6);
    confidence = fresh ? 0.15 : 0.3;
    trend = 0;
    meta.shortRun = 0;
    meta.negRun = 0;
  }
  const baseV = v; // 趋势要跟"衰减后的底"比，不能跟 12 小时前比

  // ① 句子级语气：按强度加权滑动
  const tone = sig.tone && TONE_VA[sig.tone.label] ? sig.tone : null;
  const intensity = tone ? clamp(Number(tone.intensity) || 0, 0, 1) : 0;
  if (tone && intensity >= 0.2) {
    const prior = TONE_VA[tone.label];
    const w = intensity * 0.6;
    v = lerp(v, prior.v, w);
    a = lerp(a, prior.a, w * 0.8);
    confidence += 0.06 + intensity * 0.1;
  } else {
    confidence += 0.03; // 没有明确语气，也算多看了一眼
  }

  // ② 行为信号：连着几条只有几个字 → 可能是不想聊
  //    注意：回放显示这条预测力很弱（AUC 0.216，方向甚至相反），权重压到很小
  if (Number.isFinite(sig.msgLen)) {
    meta.shortRun = sig.msgLen < 5 ? meta.shortRun + 1 : 0;
  }
  if (meta.shortRun >= 2) {
    v = lerp(v, -0.3, Math.min(0.05 * (meta.shortRun - 1), 0.15));
  }

  // 回得慢：更难判断；隔太久：当时的情绪已经淡了
  if (Number.isFinite(sig.gapMin)) {
    if (sig.gapMin > 30) confidence -= 0.12;
    if (sig.gapMin > 180) {
      v = lerp(v, 0, 0.25);
      trend *= 0.5;
    }
  }

  // 深夜：激活度本来就低
  const hour = Number.isFinite(sig.hour) ? sig.hour : new Date(now).getHours();
  if (hour >= 23 || hour < 6) a = lerp(a, 0.25, 0.3);

  // ③ 收尾：趋势、置信度、负面连击
  const delta = v - baseV;
  trend = clamp(0.5 * trend + 0.5 * delta, -1, 1);

  // 置信度要随时间衰减：半小时前看出来的，现在没那么有底
  const minsSince = p.updatedAt ? (now - p.updatedAt) / 60_000 : 0;
  if (minsSince > 5) confidence -= Math.min(0.3, (minsSince / 60) * 0.05);
  confidence = clamp(confidence, 0, 0.85); // 封顶：永远保留一点不确定
  meta.n += 1;
  meta.negRun = v <= -0.2 ? meta.negRun + 1 : 0;

  return { v: clamp(v, -1, 1), a: clamp(a, 0, 1), confidence, trend, updatedAt: now, meta };
}

/** 轴 → 一句话状态（只给日志和提示词用，不做判断） */
export function labelOf({ v, a }) {
  if (v <= -0.35 && a >= 0.55) return '烦躁';
  if (v <= -0.3) return '低落';
  if (v >= 0.35 && a >= 0.55) return '兴奋';
  if (v >= 0.25) return '不错';
  return '平静';
}

/**
 * 状态 → 给下游的三个数 + 一份可解释的快照。
 * 置信度不够时一律不做动作（宁可当没看出来，也别瞎共情）。
 */
export function judge(state) {
  const st = normalizeState(state);
  const blind = st.confidence < MIN_CONFIDENCE;
  const risk =
    !blind && st.meta.negRun >= RISK_RUN && (st.meta.shortRun >= 2 || st.trend <= -0.02);

  const empathy = blind ? 0 : clamp(-st.v * 2, 0, 1) * clamp(st.confidence / 0.6, 0, 1);
  // 高唤醒只在"负面"时才算该收敛；他高兴又激动不该被压住
  const angerArousal = st.v < 0 ? Math.max(0, st.a - 0.55) * 0.9 : 0;
  const caution = blind
    ? 0
    : clamp(-st.v * 1.4 + angerArousal + (risk ? 0.2 : 0), 0, 1);

  // 他状态差的时候别主动打扰；拿不准的时候（blind）照常
  const allowProactive = !(risk || st.v <= -0.4 || (st.v <= -0.25 && st.confidence >= 0.5));

  return {
    he: {
      v: r3(st.v),
      a: r3(st.a),
      confidence: r3(st.confidence),
      trend: r3(st.trend),
      state: blind ? '不明' : labelOf(st),
    },
    empathy: r3(empathy),
    caution: r3(caution),
    allowProactive,
    risk,
    blind,
  };
}

/** 给 prompt 的一句话：说他"现在怎么样"，不说数字 */
export function hintOf(d) {
  if (!d || d.blind) return '';
  const lines = [];
  if (d.risk) {
    lines.push('【他的状态】他连着几轮都不太对劲，别再追问，句子放短，先稳住他。');
  } else if (d.he.v <= -0.35) {
    lines.push('【他的状态】他这会儿不太好，别开玩笑、也别急着给建议，先接住他这句（话短一点）。');
  } else if (d.he.v <= -0.15) {
    lines.push('【他的状态】他好像有点情绪，语气放软，别抬杠。');
  } else if (d.he.v >= 0.4) {
    lines.push('【他的状态】他心情不错，可以顺着聊，稍微松一点。');
  }
  if (d.caution >= 0.6 && d.he.v > -0.35) lines.push('这会儿别逗他。');
  return lines.join('\n');
}

/** 一行影子日志：每轮都能回看"她当时以为他怎么了" */
export function uaffectLine(d, snapshot = null) {
  if (!d) return '';
  const s = snapshot || d.he;
  const stale = snapshot?.stale ? '（已过期）' : '';
  return (
    `💗 他 v=${s.v} a=${s.a} 置信=${s.confidence} 趋势=${s.trend} ${s.state}${stale}` +
    ` 共情=${d.empathy} 收敛=${d.caution}${d.allowProactive ? '' : ' 别主动'}`
  );
}

/* ── 存取 ─────────────────────────────────────────────── */

const KEY = 'uaffect';

export function loadState(memory, qq) {
  try {
    const raw = memory.getState(qq, KEY, 'null');
    if (!raw || raw === 'null') return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(memory, qq, state) {
  memory.setState(qq, KEY, JSON.stringify(state));
}

/**
 * 每轮调一次：读旧状态 → 更新 → 落库 → 返回判断。
 * @returns {{he:object, empathy:number, caution:number, allowProactive:boolean, risk:boolean, blind:boolean}}
 */
export function updateUAffect(memory, qq, sig = {}) {
  const next = compute(loadState(memory, qq), sig);
  saveState(memory, qq, next);
  return judge(next);
}

/**
 * 只读（主动消息、后台用）：过期就当没看出来。
 * @returns {{he:object, empathy:number, caution:number, allowProactive:boolean, risk:boolean, blind:boolean, stale:boolean}}
 */
export function readUAffect(memory, qq, now = Date.now()) {
  const st = loadState(memory, qq);
  if (!st || !st.updatedAt || now - st.updatedAt > STALE_MS) {
    return {
      he: { v: 0, a: 0.35, confidence: 0, trend: 0, state: '不明' },
      empathy: 0,
      caution: 0,
      allowProactive: true,
      risk: false,
      blind: true,
      stale: true,
    };
  }
  return { ...judge(st), stale: false };
}

/** 便捷：直接拿提示词 */
export function uaffectHint(memory, qq) {
  return hintOf(readUAffect(memory, qq));
}
