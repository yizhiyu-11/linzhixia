/**
 * 主动消息：验证"必须指向他"这条 prompt 改动的效果（真调一次模型）
 *   node --env-file=.env.dev scripts/test-proactive-target.mjs
 */
import fs from 'node:fs';
import { config } from '../src/config.mjs';
import { createLogger } from '../src/logger.mjs';
import { Memory } from '../src/memory.mjs';
import { loadPersona } from '../src/persona.mjs';
import { generateProactive } from '../src/brain.mjs';
import { getScene } from '../src/scene.mjs';
import { hasTarget } from '../src/proactive-check.mjs';

const log = createLogger('warn');
const dbPath = 'data/_test-proactive.db';
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) fs.rmSync(f, { force: true });

const memory = new Memory(dbPath);
const persona = loadPersona(config.persona);
const qq = 'test';
memory.ensureUser(qq, '测试');

const scene = getScene(memory, qq);
const reasons = [
  { type: 'miss', hint: '单纯想到他（角度：发呆时想起）' },
  { type: 'complain', hint: '吐槽天气（角度：下雨了）' },
  { type: 'tease', hint: '故意挑衅（角度：路上·在走过去）' },
];

let pass = 0;
for (const reason of reasons) {
  const r = await generateProactive({ persona, memory, qq, log, reason, scene, avoid: [] });
  const text = String(r.text || '').trim().replace(/\s+/g, ' ');
  const ok = hasTarget(text);
  if (ok) pass++;
  console.log(`  ${ok ? '✓' : '✗'} [${reason.type}] ${text}`);
}
console.log(`\n${pass}/${reasons.length} 条指向他`);
memory.close();
fs.rmSync(dbPath, { force: true });
process.exit(pass === reasons.length ? 0 : 1);
