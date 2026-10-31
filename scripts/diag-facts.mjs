import { Memory } from '../src/memory.mjs';
import { chat } from '../src/brain.mjs';
import { createLogger } from '../src/logger.mjs';
import { extractFacts } from '../src/facts.mjs';

const m = new Memory('data/bot.db');
const log = createLogger('info');
const qq = '10000002';

const maxId = m.db.prepare('SELECT MAX(id) m FROM messages').get().m;
console.log('最新消息 id:', maxId, ' 当前 lastFactMsgId:', m.getState(qq, 'lastFactMsgId', '(无)'));
m.setState(qq, 'lastFactMsgId', Math.max(0, maxId - 40));

const rows = m.messagesSince(qq, Math.max(0, maxId - 40), 48);
console.log('这次喂给模型的条数:', rows.length);
console.log('样例:', rows.slice(0, 6).map((r) => `${r.role}:${String(r.content).slice(0, 18)}`).join(' | '));

const out = await extractFacts({ memory: m, qq, chatFn: (msgs, tag) => chat(msgs, { qq, memory: m, log, tag }), log });
console.log('\n提取结果:', out ? out.length + ' 条' : 'null');
for (const f of m.getFacts(qq)) console.log('  ' + f.key + ' = ' + f.value + ' (' + f.confidence + ')');
m.close();
