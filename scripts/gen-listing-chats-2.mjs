/**
 * 追加素材：D1 的情绪款 + D3 的主动消息候选
 * 输出：docs/商业/截图/详情对话-补充.json
 */
import fs from 'node:fs';
import { config } from '../src/config.mjs';
import { createLogger } from '../src/logger.mjs';
import { Memory } from '../src/memory.mjs';
import { loadPersona } from '../src/persona.mjs';
import { generateReply, generateProactive } from '../src/brain.mjs';
import { getScene } from '../src/scene.mjs';

const log = createLogger('warn');
const dbPath = 'data/listing-chat2.db';
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) fs.rmSync(f, { force: true });

const memory = new Memory(dbPath);
const persona = loadPersona(config.persona);
const qq = 'listing2';

const say = async (text) => {
  memory.addMessage(qq, 'user', text);
  const scene = getScene(memory, qq);
  const r = await generateReply({ persona, memory, qq, text, scene, log });
  const reply = String(r.text || '').trim();
  memory.addMessage(qq, 'assistant', reply, {});
  return reply;
};

const pairs = [];
const prompts = ['我今天被领导骂了', '你哄我一下', '我睡不着'];
for (const p of prompts) {
  const her = await say(p);
  pairs.push({ me: p, her });
  console.log(`  他：${p}\n  她：${her}\n`);
}

// D3 候选
const scene = getScene(memory, qq);
const reasons = [
  { type: 'miss', hint: '单纯想到他（角度：想找人说话但只想到他）' },
  { type: 'night', hint: '晚上准备睡了（角度：说困了但不想睡）' },
  { type: 'share', hint: '分享刚看到/听到的（角度：听到一首歌）' },
];
const pros = [];
for (const r of reasons) {
  const out = await generateProactive({ persona, memory, qq, log, reason: r, scene, avoid: pros.map((x) => x.text) });
  const t = String(out.text || '').trim();
  pros.push({ reason: r.type, text: t });
  console.log('  主动[' + r.type + ']：', t);
}

fs.writeFileSync(
  'docs/商业/截图/详情对话-补充.json',
  JSON.stringify({ pairs, pros, scene }, null, 2),
  'utf8',
);
memory.close();
