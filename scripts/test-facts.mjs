/** 事实抽取的离线单测：用桩 chatFn，不调模型 */
import { extractFacts, FACT_KEYS } from '../src/facts.mjs';
import { Memory } from '../src/memory.mjs';
import fs from 'node:fs';

const dbPath = 'data/_test-facts.db';
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) fs.rmSync(f, { force: true });
const memory = new Memory(dbPath);
const qq = 'test';

// 造 12 条消息
for (let i = 0; i < 12; i++) memory.addMessage(qq, i % 2 ? 'assistant' : 'user', `第${i}句`);

const stub = async () => ({
  text: JSON.stringify([
    { key: 'health', value: '膝盖下雨就疼', confidence: 0.65 },
    { key: 'recent', value: '在改一版稿子', confidence: 0.6 },
    { key: 'nickname', value: '陈子鹏', confidence: 0.9 },
    { key: 'bogus', value: '自创的键', confidence: 0.9 }, // 应该被过滤
    { key: 'food', value: '不吃香菜', confidence: 0.3 }, // 置信度太低，应被过滤
  ]),
});

const out = await extractFacts({ memory, qq, chatFn: stub, log: null });
console.log('  抽出：', JSON.stringify(out));

const stored = memory.getFacts(qq);
const keys = stored.map((f) => f.key).sort();
console.log('  入库：', JSON.stringify(keys));

const expect = ['health', 'nickname', 'recent'];
const ok1 = JSON.stringify(keys) === JSON.stringify(expect);
const ok2 = !keys.includes('bogus') && !keys.includes('food');
const ok3 = stored.length === 3;

console.log(`  ${ok1 ? '✓' : '✗'} 入库内容正确（${keys.join(',')}）`);
console.log(`  ${ok2 ? '✓' : '✗'} 过滤掉自创键与低置信度`);
console.log(`  ${ok3 ? '✓' : '✗'} 数量 3`);

memory.close();
fs.rmSync(dbPath, { force: true });
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
