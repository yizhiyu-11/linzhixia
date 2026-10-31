/**
 * 用户情绪模型（uaffect）单测。
 * 跑法：node scripts/test-uaffect.mjs
 */
import {
  compute,
  judge,
  hintOf,
  emptyState,
  updateUAffect,
  readUAffect,
  loadState,
  STALE_MS,
  MIN_CONFIDENCE,
} from '../src/uaffect.mjs';

let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? `（${extra}）` : ''}`);
  }
}

function fakeMemory() {
  const store = new Map();
  return {
    getState(qq, key, fallback = null) {
      const k = `${qq}:${key}`;
      return store.has(k) ? store.get(k) : fallback;
    },
    setState(qq, key, value) {
      store.set(`${qq}:${key}`, String(value));
    },
    _store: store,
  };
}

/** 连续跑 n 轮同样的信号 */
function run(n, sig, prev = null) {
  let st = prev;
  for (let i = 0; i < n; i += 1) st = compute(st, { now: 1_760_000_000_000 + i * 60_000, ...sig });
  return st;
}

console.log('\n语气 → 状态');

{
  const happy = compute(null, { tone: { label: '开心', intensity: 0.8 }, msgLen: 12, now: 1 });
  const angry = compute(null, { tone: { label: '生气', intensity: 0.8 }, msgLen: 12, now: 1 });
  ok('开心 0.8：v 明显为正', happy.v > 0.2, `v=${happy.v}`);
  ok('开心 0.8：激活度上升', happy.a > 0.4, `a=${happy.a}`);
  ok('生气 0.8：v 明显为负', angry.v < -0.2, `v=${angry.v}`);
  ok('生气 0.8：激活度高于平静', angry.a > 0.5, `a=${angry.a}`);

  const twoAngry = run(2, { tone: { label: '生气', intensity: 0.9 }, msgLen: 10 });
  const twoSad = run(2, { tone: { label: '难过', intensity: 0.9 }, msgLen: 10 });
  ok('同强度下，生气的收敛度高于难过', judge(twoAngry).caution > judge(twoSad).caution);
}

console.log('\n置信度边界');

{
  const blind = judge(emptyState());
  ok('初值置信度不足，不做动作', blind.blind === true && blind.empathy === 0 && blind.caution === 0);
  ok('初值仍然允许主动', blind.allowProactive === true);

  const one = compute(null, { tone: { label: '生气', intensity: 0.9 }, msgLen: 10, now: 1 });
  ok('只看一条不共情（证据不够）', judge(one).blind === true && judge(one).empathy === 0, `conf=${one.confidence}`);

  const two = run(2, { tone: { label: '生气', intensity: 0.9 }, msgLen: 10 });
  const d = judge(two);
  ok('连续两条负面：开始共情', d.blind === false && d.empathy > 0.3, `empathy=${d.empathy}`);
  ok('置信度到位', two.confidence >= MIN_CONFIDENCE, `conf=${two.confidence}`);
}

console.log('\n敷衍 / 短回复');

{
  const st = run(5, { tone: { label: '平静', intensity: 0.4 }, msgLen: 3 });
  const d = judge(st);
  ok('连续 5 条短回复：v 略下滑（回放显示信号很弱，2026-10-30 调低权重）', st.v <= -0.03, `v=${st.v}`);
  ok('连续 5 条短回复：置信度累积', st.confidence >= 0.6, `conf=${st.confidence}`);
  ok('连续 5 条短回复：不强制禁止主动（信号弱）', typeof d.allowProactive === 'boolean');
  ok('短回复也算有共情基础', d.empathy > 0, `empathy=${d.empathy}`);
}

console.log('\n风险升级');

{
  const st = run(3, { tone: { label: '生气', intensity: 0.8 }, msgLen: 3 });
  const d = judge(st);
  ok('连续 3 轮负面 + 短：判定为风险', d.risk === true, `negRun=${st.meta.negRun} shortRun=${st.meta.shortRun}`);
  ok('风险时收敛度拉满', d.caution >= 0.8, `caution=${d.caution}`);
  ok('风险时不要主动', d.allowProactive === false);
}

console.log('\n纠错（不记仇）');

{
  const bad = run(3, { tone: { label: '生气', intensity: 0.8 }, msgLen: 3 });
  const fixed = compute(bad, { tone: { label: '开心', intensity: 0.9 }, msgLen: 20, now: 1_760_000_180_000 });
  const d = judge(fixed);
  ok('他下一句明显开心，估计值立刻回升', fixed.v > 0, `v=${fixed.v}`);
  ok('风险解除', d.risk === false);
  ok('不再收敛', d.caution < 0.2, `caution=${d.caution}`);
  ok('可以主动了', d.allowProactive === true);
}

console.log('\n时间衰减');

{
  const old = {
    v: -0.8,
    a: 0.7,
    confidence: 0.9,
    trend: -0.3,
    updatedAt: 1_760_000_000_000 - STALE_MS - 60_000,
    meta: { shortRun: 3, negRun: 3, n: 9 },
  };
  const st = compute(old, { tone: { label: '平静', intensity: 0.4 }, msgLen: 10, now: 1_760_000_000_000 });
  ok('超过 12 小时：旧情绪大幅回落', Math.abs(st.v) <= 0.35, `v=${st.v}`);
  ok('超过 12 小时：置信度重置', st.confidence <= 0.45, `conf=${st.confidence}`);
  ok('超过 12 小时：连击清零', st.meta.negRun <= 1 && st.meta.shortRun === 0, `negRun=${st.meta.negRun}`);

  const trendAfter = st.trend;
  ok('衰减不会把趋势算成暴跌', trendAfter > -0.2, `trend=${trendAfter}`);
}

console.log('\n可读状态（只读）');

{
  const memory = fakeMemory();
  const stale = readUAffect(memory, 'u1');
  ok('没有记录：当没看出来', stale.stale === true && stale.blind === true);
  ok('没有记录：不拦主动消息', stale.allowProactive === true);

  updateUAffect(memory, 'u1', { tone: { label: '生气', intensity: 0.9 }, msgLen: 10, now: 1_760_000_000_000 });
  updateUAffect(memory, 'u1', { tone: { label: '生气', intensity: 0.9 }, msgLen: 10, now: 1_760_000_030_000 });
  const fresh = readUAffect(memory, 'u1', 1_760_000_060_000);
  ok('新鲜状态：可读', fresh.stale === false && fresh.blind === false, `conf=${fresh.he.confidence}`);

  const expired = readUAffect(memory, 'u1', 1_760_000_030_000 + STALE_MS + 1);
  ok('过期状态：当没看出来', expired.stale === true && expired.blind === true);
}

console.log('\n落库');

{
  const memory = fakeMemory();
  updateUAffect(memory, 'u2', { tone: { label: '难过', intensity: 0.7 }, msgLen: 8, gapMin: 3, now: 1 });
  const d2 = updateUAffect(memory, 'u2', { tone: { label: '难过', intensity: 0.7 }, msgLen: 8, gapMin: 3, now: 2 });
  const st = loadState(memory, 'u2');
  ok('状态写进了 state 表', Boolean(st) && st.meta.n === 2, `n=${st?.meta?.n}`);
  ok('judge 输出字段齐全', ['v', 'a', 'confidence', 'trend', 'state'].every((k) => k in d2.he));
  ok('返回三个下游数字', typeof d2.empathy === 'number' && typeof d2.caution === 'number' && typeof d2.allowProactive === 'boolean');
}

console.log('\n提示词');

{
  const blindHint = hintOf(judge(emptyState()));
  ok('拿不准时不给提示（不瞎共情）', blindHint === '');

  const sad = judge(run(2, { tone: { label: '难过', intensity: 0.8 }, msgLen: 10 }));
  const sadHint = hintOf(sad);
  ok('明显负面时给提示', sadHint.includes('他的状态'));
  ok('提示里说"别开玩笑"', sadHint.includes('别开玩笑'), sadHint);

  const okHint = hintOf(judge(run(2, { tone: { label: '开心', intensity: 0.8 }, msgLen: 10 })));
  ok('他心情好时不插手', okHint === '' || okHint.includes('心情不错'), okHint);
}

console.log('\n时段与趋势');

{
  const night = compute(null, { tone: { label: '生气', intensity: 0.8 }, msgLen: 10, hour: 2, now: 1 });
  const day = compute(null, { tone: { label: '生气', intensity: 0.8 }, msgLen: 10, hour: 14, now: 1 });
  ok('深夜激活度更低', night.a < day.a, `夜=${night.a} 日=${day.a}`);

  const st = run(2, { tone: { label: '生气', intensity: 0.7 }, msgLen: 10 });
  ok('连续变差时趋势为负', st.trend < 0, `trend=${st.trend}`);
}

const total = pass + fail;
console.log(`\n${pass}/${total} 通过`);
process.exit(fail === 0 ? 0 : 1);
