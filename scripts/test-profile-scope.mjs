/**
 * 验证「关于你」按人生效：只影响这个人，不改全局配置。
 * node --env-file=.env scripts/test-profile-scope.mjs
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { actThresholds, proactiveLimits, readProfile, relationHint } from '../src/profile.mjs';
import { config } from '../src/config.mjs';

const token = fs.readFileSync('data/web-token', 'utf8').trim();
const BASE = 'http://127.0.0.1:3870';
const call = async (p, opts = {}) => {
  const r = await fetch(`${BASE}${p}${p.includes('?') ? '&' : '?'}token=${token}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json' },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const A = '10000003'; // 测试对象
const B = '10000002'; // 对照

let pass = 0;
let fail = 0;
const ok = (n, d = '') => {
  pass++;
  console.log(`  ✓ ${n}${d ? '  — ' + d : ''}`);
};
const bad = (n, d = '') => {
  fail++;
  console.log(`  ✗ ${n}${d ? '  — ' + d : ''}`);
};

const globalBefore = { ...config };

console.log('=== 1. 给 A 填档案 ===');
{
  const form = {
    nickname: '测试档案名',
    birthday: '1 月 1 日',
    job: '测试职业',
    wake: '6-7点',
    sleep: '22-23点',
    likes: '测试喜欢',
    dislikes: '测试讨厌',
    taboo: ['体重'],
    closeness: '独立',
    proactive: '少',
    relation: '朋友',
  };
  const r = await call(`/api/profile?qq=${A}`, { method: 'POST', body: JSON.stringify(form) });
  r.status === 200 ? ok('保存成功', `${r.body.facts?.length || 0} 条事实`) : bad('保存失败', JSON.stringify(r.body).slice(0, 120));
}

console.log('\n=== 2. 只写进 A，不串到 B ===');
{
  const a = await call(`/api/profile?qq=${A}`);
  const b = await call(`/api/profile?qq=${B}`);
  const aHas = (a.body.facts || []).some((f) => f.value === '测试档案名');
  const bHas = (b.body.facts || []).some((f) => f.value === '测试档案名');
  aHas ? ok('A 有这条档案') : bad('A 没有');
  bHas ? bad('B 被污染了') : ok('B 没被污染');
  a.body.profile?.closeness === '独立' ? ok('A 的粘人度=独立') : bad('A 档案没存', JSON.stringify(a.body.profile));
}

console.log('\n=== 3. 全局配置没被改 ===');
{
  const after = await call('/api/state');
  const act = after.body.modules.find((m) => m.id === 'act');
  const pro = after.body.modules.find((m) => m.id === 'proactive');
  const deflect = act?.values?.actDeflectBelow;
  const perDay = pro?.values?.proactiveMaxPerDay;
  deflect === 0.2 ? ok('actDeflectBelow 仍是 0.2') : bad('全局被改', String(deflect));
  perDay === 3 ? ok('proactiveMaxPerDay 仍是 3') : bad('全局被改', String(perDay));
}

console.log('\n=== 4. 按人计算的行为参数 ===');
{
  const db = new DatabaseSync('data/bot.db');
  const fake = { getState: (qq, k, d) => db.prepare('SELECT value FROM state WHERE qq = ? AND key = ?').get(qq, k)?.value ?? d };
  const profA = readProfile(fake, A);
  const profB = readProfile(fake, B);
  db.close();

  const ta = actThresholds(profA, globalBefore);
  const tb = actThresholds(profB, globalBefore);
  ta.deflectBelow === 0.3 ? ok('A 的岔开阈值 = 0.3（独立）') : bad('A 阈值不对', String(ta.deflectBelow));
  tb.deflectBelow === globalBefore.actDeflectBelow ? ok('B 用全局默认', String(tb.deflectBelow)) : bad('B 阈值不对');

  const la = proactiveLimits(profA, globalBefore);
  const lb = proactiveLimits(profB, globalBefore);
  la.maxPerDay === 1 ? ok('A 每天最多 1 条') : bad('A 上限不对', JSON.stringify(la));
  lb.maxPerDay === globalBefore.proactiveMaxPerDay ? ok('B 用全局上限', String(lb.maxPerDay)) : bad('B 上限不对');

  relationHint(profA)?.includes('朋友') ? ok('A 的关系提示 = 朋友') : bad('关系提示缺失');
  relationHint(profB) === '' ? ok('B 没有额外关系提示') : bad('B 不该有关系提示');
}

console.log('\n=== 5. 清理测试数据 ===');
{
  const keys = ['nickname', 'birthday', 'job', 'schedule', 'likes', 'dislikes', 'taboo'];
  for (const k of keys) {
    await call(`/api/memory/fact/${encodeURIComponent(k)}?qq=${A}`, { method: 'DELETE' });
  }
  const db = new DatabaseSync('data/bot.db');
  db.prepare("DELETE FROM state WHERE qq = ? AND key = 'profile'").run(A);
  db.close();
  const a = await call(`/api/profile?qq=${A}`);
  (a.body.facts || []).length === 0 && !a.body.profile
    ? ok('测试数据已清掉')
    : bad('还有残留', JSON.stringify({ facts: a.body.facts?.length, profile: !!a.body.profile }));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
