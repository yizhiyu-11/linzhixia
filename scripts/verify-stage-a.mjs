/**
 * 阶段 A 验证：不依赖服务器的部分
 *   node --env-file=.env.dev scripts/verify-stage-a.mjs
 */
import fs from 'node:fs';
import { Memory } from '../src/memory.mjs';
import { getScene, PENDING_TTL_HOURS } from '../src/scene.mjs';
import { extractFacts } from '../src/facts.mjs';
import { config } from '../src/config.mjs';
import { loadPersona } from '../src/persona.mjs';
import { chat } from '../src/brain.mjs';
import { createLogger } from '../src/logger.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`);
};

const dbPath = 'data/_verify.db';
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) fs.rmSync(f, { force: true });

// ── 1. 场景：pending 是否活得够久 ─────────────────────────
{
  const memory = new Memory(dbPath);
  const qq = 'u1';
  const now = Date.now();
  const scene = {
    location: '家',
    doing: '在厨房煮面',
    pending: [{ text: '锅里的水快开了', at: now - 80 * 60_000 }], // 待办 80 分钟前
    since: now - 10 * 60_000, // 场景 10 分钟前开始（一定没超最短 30 分钟，不会换场景）
  };
  memory.setState(qq, 'scene', JSON.stringify(scene));
  memory.setState(qq, 'sceneSince', now - 10 * 60_000);

  const s = getScene(memory, qq);
  const kept = Array.isArray(s.pending) && s.pending.length > 0;
  check('80 分钟的 pending 仍然存在（TTL 90）', kept && s.doing === '在厨房煮面', `场景=${s.doing} pending=${JSON.stringify(s.pending)}`);
  check('TTL 常量是 90 分钟量级', PENDING_TTL_HOURS === 1.5, `PENDING_TTL_HOURS=${PENDING_TTL_HOURS}`);
  memory.close();
}

// ── 2. 感知继承：lastPerception ──────────────────────────
{
  const memory = new Memory(dbPath);
  const qq = 'u2';
  memory.ensureUser(qq, '');
  check('没有历史时返回 null', memory.lastPerception(qq) === null);

  memory.addPerception(qq, '我有点累', { emotion: '平静', tone: { label: '平静', intensity: 0.3 }, intent: '分享' });
  const p = memory.lastPerception(qq);
  check('能读回上一条感知', p?.tone?.intensity === 0.3, JSON.stringify(p?.tone));

  // 模拟 7 小时前：直接改 created_at
  memory.db.prepare('UPDATE perceptions SET created_at = ?').run(Date.now() - 7 * 3600_000);
  check('超过 6 小时的感知不继承', memory.lastPerception(qq) === null);
  memory.close();
}

// ── 3. 场景池：每条都有 pending ──────────────────────────
{
  const src = fs.readFileSync('src/scene.mjs', 'utf8');
  const holds = [...src.matchAll(/pending: \[(.*?)\]/g)].map((m) => m[1]);
  const empty = holds.filter((p) => !p.trim()).length;
  check('场景池没有空 pending', empty === 0, `空 ${empty} / 共 ${holds.length}`);
}

// ── 4. 事实抽取：真调一次模型 ────────────────────────────
{
  const memory = new Memory(dbPath);
  const qq = 'u3';
  memory.ensureUser(qq, '');
  const convo = [
    ['user', '我这两天膝盖又疼了，一下雨就这样'],
    ['assistant', '又疼了？是不是上次说的那种酸'],
    ['user', '对，酸的那种'],
    ['assistant', '那你少爬楼'],
    ['user', '我叫陈子鹏，你记一下'],
    ['assistant', '记住了 陈子鹏'],
    ['user', '最近在改一版稿子，改到我烦'],
    ['assistant', '又是那版？'],
    ['user', '嗯 领导一句话就得重来'],
    ['assistant', '那先改 改完吃饭'],
    ['user', '我不吃香菜 别忘了'],
    ['assistant', '记着了 不放香菜'],
  ];
  for (const [role, content] of convo) memory.addMessage(qq, role, content);

  const log = createLogger('warn');
  const out = await extractFacts({
    memory,
    qq,
    chatFn: (messages, tag) => chat(messages, { qq, memory, log, tag }),
    log,
  });
  const stored = memory.getFacts(qq);
  const keys = stored.map((f) => f.key);
  check('真实模型能抽出事实', stored.length >= 1, JSON.stringify(stored.map((f) => `${f.key}=${f.value}`)));
  check('抽到了健康或忙碌类信息', keys.includes('health') || keys.includes('recent') || keys.includes('job'), keys.join(','));
  memory.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
fs.rmSync(dbPath, { force: true });
process.exit(pass === results.length ? 0 : 1);
