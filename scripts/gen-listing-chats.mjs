/**
 * 为闲鱼详情图生成全新的对话素材（不碰线上库）。
 * 输出：docs/商业/截图/详情对话.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { createLogger } from '../src/logger.mjs';
import { Memory } from '../src/memory.mjs';
import { loadPersona } from '../src/persona.mjs';
import { generateReply, generateProactive } from '../src/brain.mjs';
import { getScene } from '../src/scene.mjs';

const log = createLogger('warn');
const dbPath = 'data/listing-chat.db';
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) fs.rmSync(f, { force: true });

const memory = new Memory(dbPath);
const persona = loadPersona(config.persona);
const qq = 'listing';

const say = async (text) => {
  memory.addMessage(qq, 'user', text);
  const scene = getScene(memory, qq);
  const r = await generateReply({ persona, memory, qq, text, scene, log });
  const reply = String(r.text || '').trim();
  memory.addMessage(qq, 'assistant', reply, {});
  return reply;
};

const out = { d1: [], d2: [], d3: null, persona: persona.name };

// ── D1 她怎么说话：抬杠 + 累 + 撒娇
console.log('D1 …');
out.d1.push({ role: 'me', text: '你是不是有点矮啊' });
out.d1.push({ role: 'her', text: await say('你是不是有点矮啊') });

out.d1.push({ role: 'me', text: '今天好累 不想动' });
out.d1.push({ role: 'her', text: await say('今天好累 不想动') });

out.d1.push({ role: 'me', text: '你在干嘛' });
out.d1.push({ role: 'her', text: await say('你在干嘛') });

// ── D2 记得住：先说膝盖疼，隔几句再问
console.log('D2 …');
out.d2.push({ role: 'me', text: '最近老下雨 我膝盖有点疼' });
out.d2.push({ role: 'her', text: await say('最近老下雨 我膝盖有点疼') });

out.d2.push({ role: 'me', text: '晚上吃的泡面' });
out.d2.push({ role: 'her', text: await say('晚上吃的泡面') });

out.d2.push({ role: 'me', text: '你还记得我上次说哪儿不舒服吗' });
out.d2.push({ role: 'her', text: await say('你还记得我上次说哪儿不舒服吗') });

// ── D3 主动消息
console.log('D3 …');
const scene = getScene(memory, qq);
const pro = await generateProactive({
  persona,
  memory,
  qq,
  log,
  reason: { type: 'miss', hint: '单纯想到他（角度：发呆时想起）' },
  scene,
  avoid: [],
});
out.d3 = { text: String(pro.text || '').trim(), scene };

fs.mkdirSync('docs/商业/截图', { recursive: true });
fs.writeFileSync('docs/商业/截图/详情对话.json', JSON.stringify(out, null, 2), 'utf8');

console.log('\n=== D1 ===');
out.d1.forEach((m) => console.log(`  ${m.role === 'me' ? '他' : '她'}：${m.text}`));
console.log('\n=== D2 ===');
out.d2.forEach((m) => console.log(`  ${m.role === 'me' ? '他' : '她'}：${m.text}`));
console.log('\n=== D3 ===');
console.log('  她：', out.d3.text, '｜场景：', out.d3.scene.location, out.d3.scene.doing);

memory.close();
