/**
 * 试生成一条"主动开口"的消息（不会发出去，只看她说什么）。
 * 用法：node --env-file=.env scripts/try-proactive.mjs
 */
import { config } from '../src/config.mjs';
import { loadPersona } from '../src/persona.mjs';
import { Memory } from '../src/memory.mjs';
import { generateProactive } from '../src/brain.mjs';
import { splitIntoBursts } from '../src/reply.mjs';
import { createLogger } from '../src/logger.mjs';

const persona = loadPersona(config.persona);
const memory = new Memory('data/_try.db');
memory.ensureUser('try', '试聊');

const { text, usage } = await generateProactive({ persona, memory, qq: 'try', log: createLogger('warn') });
const bursts = splitIntoBursts(text, { maxSegments: config.splitMax });

console.log('\n她主动发来（' + bursts.length + ' 条）：');
bursts.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
console.log(`\n[${usage.prompt_tokens} in / ${usage.completion_tokens} out · ¥${usage.cost.toFixed(4)}]`);
memory.close();
