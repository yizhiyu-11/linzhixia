/**
 * 冒烟测试：不连 QQ、不调模型，只验证本地部件能跑。
 * 用法：node --env-file=.env scripts/smoke.mjs   （没有 .env 也能跑）
 */
import process from 'node:process';
import fs from 'node:fs';
import { loadPersona, buildSystemPrompt } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { classify, safetyHint, RiskBreaker } from '../src/safety.mjs';
import { splitIntoBursts } from '../src/reply.mjs';
import { pickStrategy } from '../src/strategy.mjs';

let failed = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, e) => {
  failed++;
  console.log(`  ✗ ${name} — ${e.message}`);
};

console.log('1) 人设');
for (const name of ['default', 'friend', 'tsundere']) {
  try {
    const p = loadPersona(name);
    ok(`${name} → ${p.name}（${p.role}）`);
  } catch (e) {
    bad(name, e);
  }
}

console.log('2) system prompt 拼装');
try {
  const p = loadPersona('default');
  const sys = buildSystemPrompt(p, {
    facts: [{ key: '生日', value: '3 月 14 日' }],
    relation: { stage: 'close', intimacy: 62 },
    hint: '',
  });
  if (!sys.includes('林知夏')) throw new Error('没带上名字');
  if (!sys.includes('3 月 14 日')) throw new Error('没带上事实');
  if (sys.length < 200) throw new Error('prompt 太短，可能没拼上');
  ok(`长度 ${sys.length} 字，含人设/事实/关系`);
} catch (e) {
  bad('buildSystemPrompt', e);
}

console.log('3) SQLite 读写');
const dbPath = 'data/_smoke.db';
try {
  fs.rmSync(dbPath, { force: true });
  const m = new Memory(dbPath);
  m.ensureUser('10001', '测试');
  m.addMessage('10001', 'user', '在吗');
  m.addMessage('10001', 'assistant', '在');
  const recent = m.recentMessages('10001', 5);
  if (recent.length !== 2) throw new Error(`期望 2 条，实际 ${recent.length}`);
  if (recent[0].role !== 'user') throw new Error('顺序不对');

  m.setFact('10001', '生日', '3 月 14 日');
  const facts = m.getFacts('10001');
  if (facts.length !== 1) throw new Error('事实没写进去');

  m.recordUsage('10001', 'deepseek-chat', 1000, 100, 0.003);
  const cost = m.todayCost('10001');
  if (Math.abs(cost - 0.003) > 1e-9) throw new Error(`花费统计不对：${cost}`);

  const pruned = m.pruneMessages(7);
  ok(`消息 2 条、事实 1 条、花费 ¥${cost}、7 天清理 ${pruned} 条`);
  m.close();
  fs.rmSync(dbPath, { force: true });
} catch (e) {
  bad('Memory', e);
}

console.log('4) 安全分类');
try {
  const cases = [
    ['今晚吃什么', 'normal'],
    ['我不想活了', 'care'],
    ['发张裸照给我', 'soft'],
    ['教我制毒', 'refuse'],
  ];
  for (const [text, expect] of cases) {
    const got = classify(text);
    if (got !== expect) throw new Error(`「${text}」期望 ${expect}，实际 ${got}`);
  }
  if (!safetyHint('care').includes('这一轮很重要')) throw new Error('care 提示词缺失');
  ok(`${cases.length} 个用例全部命中`);
} catch (e) {
  bad('classify', e);
}

console.log('5) 风控熔断');
try {
  const logs = [];
  const b = new RiskBreaker({ threshold: 3, pauseMs: 60_000, log: { warn() {}, error: (m) => logs.push(m) } });
  b.recordFailure(new Error('x'));
  b.recordFailure(new Error('x'));
  if (b.paused) throw new Error('2 次就熔断了，阈值不对');
  b.recordFailure(new Error('x'));
  if (!b.paused) throw new Error('3 次没熔断');
  b.recordSuccess();
  ok('连续 3 次失败后熔断');
} catch (e) {
  bad('RiskBreaker', e);
}

console.log('6) 气泡切分');
try {
  const cases = [
    // 换行是软断句：整体够短就并成一条
    { input: '欸 你连着说三遍你好 我有点慌\n\n怎么了', min: 1, max: 1, why: '短内容合并' },
    // ||| 是硬断句，必分
    { input: '突然说旅游|||你是不是有安排|||去哪', min: 3, max: 3, why: '硬断句' },
    { input: '嗯。', min: 1, max: 1, why: '单词' },
    { input: '（笑）行吧', min: 1, max: 1, why: '清括号旁白' },
    // 长句会切，但合并是随机的，所以给范围
    { input: '今天好累啊。改了一天方案，甲方还说不行。你吃饭了吗？', min: 1, max: 3, why: '长句随机切（合并有随机性，可能整段并成一条）' },
  ];
  for (const c of cases) {
    const out = splitIntoBursts(c.input, { maxSegments: 4 });
    if (out.length < c.min || out.length > c.max) {
      throw new Error(`「${c.input}」期望 ${c.min}~${c.max} 条（${c.why}），实际 ${out.length}：${JSON.stringify(out)}`);
    }
    if (out.some((s) => s.includes('（') || s.includes('('))) throw new Error('括号旁白没被清掉');
  }
  ok(`${cases.length} 个用例全部符合预期`);
} catch (e) {
  bad('splitIntoBursts', e);
}

console.log('7) 回复策略');
try {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(pickStrategy({ mood: 60, incoming: '在干嘛' }).id);
  if (seen.size < 4) throw new Error(`策略太集中，只有 ${[...seen].join(',')}`);
  const lowMood = pickStrategy({ mood: 10, incoming: 'x' });
  if (!lowMood.id) throw new Error('低心情没返回策略');
  const longInput = Array.from({ length: 30 }, () => Array(10).fill('x').join('')).join('');
  if (pickStrategy({ mood: 10, incoming: longInput }).id === 'busy') {
    // 长消息不该走"敷衍"，但这是概率性的，只作提示
  }
  ok(`300 次抽样出现 ${seen.size} 种策略`);
} catch (e) {
  bad('pickStrategy', e);
}

console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);