/** 情绪层最小版：事件注入 + 指数衰减 + 语气提示（纯函数，无 IO） */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** 三轴基线：愉悦 / 激活 / 精力 */
export const BASELINE = { v: 0.08, a: 0.35, e: 0.6 };

/** 事件级别的半衰期（分钟） */
export const HALF_LIFE = { minor: 45, medium: 150, major: 420 };

/** 事件规模由影响强度推：|impact| < .25 小事，< .6 中等，否则大事 */
export function sizeOf(impact) {
  const x = Math.abs(Number(impact) || 0);
  if (x >= 0.6) return 'major';
  if (x >= 0.25) return 'medium';
  return 'minor';
}

/** 注入一个事件，返回新的 events 数组 */
export function inject(events, { text, impact, at = Date.now(), kind = 'event' }) {
  const v = clamp(Number(impact) || 0, -1, 1);
  const size = sizeOf(v);
  const list = Array.isArray(events) ? events.slice(-20) : [];
  list.push({
    text: String(text || '').slice(0, 40),
    kind,
    v,
    a: v > 0 ? v * 0.6 : Math.abs(v) * 0.8,
    e: v > 0 ? Math.abs(v) * 0.1 : -Math.abs(v) * 0.3, // 好事不耗精力，坏事才耗
    halfLifeMin: HALF_LIFE[size],
    at,
  });
  return list;
}

/** 衰减后的三轴状态 */
export function stateOf(events, now = Date.now(), opts = {}) {
  // pace: busy ????????????quiet ??????????????
  const paceFactor = opts.pace === 'busy' ? 1.35 : opts.pace === 'quiet' ? 0.7 : 1;
  let v = BASELINE.v;
  let a = BASELINE.a;
  let e = BASELINE.e;
  for (const ev of events || []) {
    const mins = (Math.max(0, (now - ev.at) / 60_000)) * paceFactor;
    const dv = ev.v * Math.pow(0.5, mins / ev.halfLifeMin);
    const da = ev.a * Math.pow(0.5, mins / (ev.halfLifeMin * 0.45));
    const de = ev.e * Math.pow(0.5, mins / (ev.halfLifeMin * 0.8));
    v += dv;
    a += da;
    e += de;
  }
  // 多事件叠加会顶到饱和：激活度做个软压缩，最多到 0.9
  return { v: clamp(v, -1, 1), a: clamp(BASELINE.a + (a - BASELINE.a) * 0.55, 0, 0.9), e: clamp(e, 0, 1) };
}

/** 三轴 → 标签 */
export function labelOf({ v, a, e }) {
  if (e < 0.3 && v < 0.1) return '累';
  if (v <= -0.35 && a >= 0.55) return '生气';
  if (v <= -0.3 && a < 0.4) return '低落';
  if (v <= -0.1 && a >= 0.5) return '烦躁';
  if (v >= 0.25 && a >= 0.55) return '兴奋';
  if (v >= 0.35) return '开心';
  if (v >= 0.25) return '舒服';
  if (a >= 0.6 && v > -0.1) return '紧张';
  return '平静';
}

/** 给 prompt 的一句话（不写标签，写"怎么说"） */
export function toneHint(state) {
  const { v, a, e } = state;
  const label = labelOf(state);
  const map = {
    生气: '不太高兴，别装没事，但也不用把气撒他身上（短一点）',
    烦躁: '有点烦，耐心不多（别长篇）',
    低落: '情绪低，话会少，也容易自我否定',
    累: '很累，能少说就少说（别硬撑可爱）',
    兴奋: '心情很好，话多，会追问',
    开心: '心情不错，可以松一点',
    舒服: '挺放松的，愿意多聊两句',
    紧张: '有点坐立不安，说话会短',
    平静: '',
  };
  const line = map[label] || '';
  return line ? `【此刻状态】${line}` : '';
}

/* 下面三个是 state 表读写的薄封装：事件列表存 memory，读的时候现算衰减 */
const KEY = 'affectEvents';

export function rememberEvent(memory, qq, ev) {
  let list = [];
  try {
    list = JSON.parse(memory.getState(qq, KEY, '[]')) || [];
  } catch {
    list = [];
  }
  memory.setState(qq, KEY, JSON.stringify(inject(list, ev)));
}

export function affectState(memory, qq, opts = {}) {
  let list = [];
  try {
    list = JSON.parse(memory.getState(qq, KEY, '[]')) || [];
  } catch {
    list = [];
  }
  return stateOf(list, Date.now(), opts);
}

export function affectHint(memory, qq, opts = {}) {
  return toneHint(affectState(memory, qq, opts));
}
