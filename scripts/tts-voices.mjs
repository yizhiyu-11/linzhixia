/**
 * 音色海选：同一句 + 同一条指令，只换嗓子。
 *
 *   node --env-file=.env scripts/tts-voices.mjs          只生成
 *   node --env-file=.env scripts/tts-voices.mjs --send   生成并发 QQ
 */
import fs from 'node:fs';
import path from 'node:path';
import { synth } from '../src/tts-dashscope.mjs';
import { config } from '../src/config.mjs';

const OWNER = process.env.OWNER_QQ || config.allowedQqs?.[0] || '';
const OUT = path.resolve('data/tts-voices');
fs.mkdirSync(OUT, { recursive: true });

const MODEL = 'qwen-audio-3.1-tts-flash';
const TEXT = '你终于回我了';
const INSTRUCTION = '用撒娇的语气说，语速慢一点，尾音往上扬';

// 从官方音色列表里挑的：年龄接近、声线偏软/清甜/温暖
const CANDIDATES = [
  { id: '01', voice: 'longanlingxi_v3.1', name: '龙安灵希', trait: '可爱甜美 · 25岁' },
  { id: '02', voice: 'longanxiaoxin_v3.1', name: '龙安小昕', trait: '亲切活泼 · 22岁' },
  { id: '03', voice: 'anxiaolan_v3.1', name: '安小岚', trait: '清甜纯净' },
  { id: '04', voice: 'qiaoxiaojiao_v3.1', name: '乔小娇', trait: '俏丽可爱' },
  { id: '05', voice: 'longanlingxin_v3.1', name: '龙安灵心', trait: '知心温暖 · 25岁' },
  { id: '06', voice: 'longyuan_v3.1', name: '龙媛', trait: '温暖治愈' },
  { id: '07', voice: 'wenhuaiqing_v3.1', name: '温怀清', trait: '清亮柔和' },
  { id: '08', voice: 'xieshurou_v3.1', name: '谢舒柔', trait: '柔和知性' },
];

const results = [];
for (const c of CANDIDATES) {
  try {
    const { buf, ms } = await synth({ model: MODEL, voice: c.voice, text: TEXT, instruction: INSTRUCTION, format: 'wav' });
    const file = path.join(OUT, `${c.id}-${c.voice}.wav`);
    fs.writeFileSync(file, buf);
    console.log(`  ✓ ${c.id} ${c.name}（${c.trait}） ${Math.round(buf.length / 1024)}KB ${ms}ms`);
    results.push({ ...c, file });
  } catch (e) {
    console.log(`  ✗ ${c.id} ${c.name}：${e.message.slice(0, 120)}`);
  }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results.map((r) => ({ id: r.id, voice: r.voice, name: r.name, trait: r.trait, file: path.basename(r.file) })), null, 2), 'utf8');
console.log(`\n共 ${results.length} 个 → ${OUT}`);

if (process.argv.includes('--send') && OWNER && results.length) {
  const { OneBot } = await import('../src/onebot.mjs');
  const { createLogger } = await import('../src/logger.mjs');
  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });
  bot.start();
  for (let i = 0; i < 80 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await bot.sendPrivate(OWNER, `音色海选：同一句「${TEXT}」，同一条撒娇指令，只换嗓子。`);
  await sleep(600);
  for (const r of results) {
    await bot.sendPrivate(OWNER, `${r.id} ${r.name}　${r.trait}`);
    await sleep(400);
    try {
      await bot.sendRecord(OWNER, r.file);
      await sleep(700);
    } catch (e) {
      console.log(`  发送失败 ${r.id}：${e.message}`);
    }
  }
  bot.stop();
  console.log('已发到 QQ');
}
