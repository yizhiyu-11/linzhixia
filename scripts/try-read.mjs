/**
 * 试"读空气"：走和正式链路一样的逻辑（读情绪 → 选姿态 → 生成），
 * 但只在终端打印，不发 QQ。
 *
 * node --env-file=.env scripts/try-read.mjs "今天累死了"
 */
import process from 'node:process';
import { config } from '../src/config.mjs';
import { loadPersona } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { generateReply } from '../src/brain.mjs';
import { splitIntoBursts, tidyPunctuation } from '../src/reply.mjs';
import { loadStickers, classifyCategory } from '../src/sticker.mjs';
import { pickStrategy, driftMood } from '../src/strategy.mjs';
import { readUser, replyGoal, readLine, decideReply } from '../src/read.mjs';
import { createLogger } from '../src/logger.mjs';

const text = process.argv.slice(2).join(' ') || '今天累死了';
const persona = loadPersona(config.persona);
const stickers = loadStickers('stickers');
const memory = new Memory(`data/_read-${Date.now()}.db`);
memory.ensureUser('r', '试读');

const mood = 60;
const read = readUser(text, { hour: new Date().getHours() });
const goal = replyGoal(read);
const strategy = pickStrategy({ mood, incoming: text, prefer: goal.prefer || [], avoid: goal.avoid || [] });

console.log(`\n你：${text}`);
console.log(`🧠 情绪=${read.emotion}  意图=${read.intent}  置信=${read.confidence}${read.signals.length ? '  信号=' + read.signals.join('/') : ''}`);
console.log(`🎭 姿态=${strategy.id}`);
console.log(`📌 目标：${goal.goal || '（无特别要求）'}`);

const decision = decideReply(read, { typoSilence: config.typoSilence, ambiguSilence: config.ambiguSilence });
console.log(`🤐 决定：${decision.reply ? (decision.mode === 'normal' ? '正常回' : decision.mode + ' — ' + decision.hint) : '不回（' + decision.reason + '）'}`);
if (!decision.reply) process.exit(0);

const r = await generateReply({
  persona,
  memory,
  qq: 'r',
  text,
  images: [],
  extraHint: [strategy.hint, readLine(read), goal.goal, decision.hint].filter(Boolean).join('\n\n'),
  stickers,
  log: createLogger('warn'),
});

memory.addMessage('r', 'user', text);
memory.addMessage('r', 'assistant', r.text);
memory.close();

const bursts = splitIntoBursts(r.text, { maxSegments: config.splitMax }).map(tidyPunctuation);
console.log(`\n她（${bursts.length} 条）：`);
bursts.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
