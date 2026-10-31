/**
 * 命令行试聊：不走 QQ，直接和大脑对话，用来调人设、看回复质量、算成本。
 *
 * 用法：
 *   node --env-file=.env scripts/try-chat.mjs 在吗
 *   node --env-file=.env scripts/try-chat.mjs --mode=short 在干嘛      # 指定策略
 *   node --env-file=.env scripts/try-chat.mjs --mood=30 好烦           # 指定心情
 *
 * 连着跑会保留上下文（data/_try.db），想清空就删那个文件。
 */
import process from 'node:process';
import { config } from '../src/config.mjs';
import { loadPersona } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { generateReply } from '../src/brain.mjs';
import { splitIntoBursts } from '../src/reply.mjs';
import { planSchedule } from '../src/pacing.mjs';
import { pickStrategy, MODES } from '../src/strategy.mjs';
import { loadStickers, extractStickerTags, findSticker } from '../src/sticker.mjs';
import { createLogger } from '../src/logger.mjs';

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='))?.slice(7);
const moodArg = Number(args.find((a) => a.startsWith('--mood='))?.slice(7));
const imageArgs = args.filter((a) => a.startsWith('--image=')).map((a) => a.slice(8));
const text = args.filter((a) => !a.startsWith('--')).join(' ') || '在吗';

const mood = Number.isFinite(moodArg) ? moodArg : 60;
const strategy = modeArg
  ? { id: modeArg, hint: MODES.find((m) => m.id === modeArg)?.hint ?? '', extraDelayMs: 0 }
  : pickStrategy({ mood, incoming: text });

const persona = loadPersona(config.persona);
const stickers = loadStickers('stickers');
const memory = new Memory('data/_try.db');
memory.ensureUser('try', '试聊');

memory.addMessage('try', 'user', text);
console.log(`\n你：${text}`);
console.log(`（策略：${strategy.id}${strategy.hint ? ' · ' + strategy.hint.replace(/【.*?】/, '') : ''}）`);

const r = await generateReply({
  persona,
  memory,
  qq: 'try',
  text,
  images: imageArgs,
  extraHint: strategy.hint,
  stickers,
  log: createLogger(process.env.LOG_LEVEL || 'warn'),
});

memory.addMessage('try', 'assistant', r.text);
memory.close();

const { text: cleanText, tags } = extractStickerTags(r.text);
if (tags.length) console.log('  [表情包]', tags.join(','), '->', findSticker(stickers, tags[0])?.tag ?? '未找到');
const bursts = splitIntoBursts(cleanText, { maxSegments: config.splitMax });
const plan = planSchedule(text.length, bursts, config);
console.log(`\n她（${bursts.length} 条气泡，约 ${(plan.totalMs / 1000).toFixed(1)}s）：`);
plan.steps.forEach((s) => console.log(`  ${s.index}. [${(s.sentAtMs / 1000).toFixed(1)}s] ${s.text}`));
console.log(`\n[${r.usage.prompt_tokens} in / ${r.usage.completion_tokens} out · ¥${r.usage.cost.toFixed(4)}]`);
