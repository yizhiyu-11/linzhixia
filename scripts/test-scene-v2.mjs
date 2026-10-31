/** 场景 v2 单测：时间旅行 + 不变式 */
import fs from 'node:fs';
import { Memory } from '../src/memory.mjs';
import { getScene, sceneBlock } from '../src/scene.mjs';

const db = 'data/_test-scene.db';
for (const f of [db, db + '-wal', db + '-shm']) fs.rmSync(f, { force: true });
const memory = new Memory(db);
const qq = 'u1';
memory.ensureUser(qq, '');

let pass = 0;
const total = 7;
const chk = (name, ok, detail = '') => {
  if (ok) pass++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ① 新建场景
const s1 = getScene(memory, qq);
chk('返回完整字段', Boolean(s1.location && s1.doing && Array.isArray(s1.items) && s1.since), `${s1.location}/${s1.doing}`);
chk('seeds 至少 1 条', s1.seeds.length >= 1, JSON.stringify(s1.seeds.map((x) => x.text)));
chk('pace 与 chat 合法', ['busy', 'normal', 'quiet'].includes(s1.pace) && s1.chat >= 0 && s1.chat <= 1, `${s1.pace}/${s1.chat}`);

// ② 时间旅行：把场景和事项往前挪 30 分钟 → 应进入 doing
const raw = JSON.parse(memory.getState(qq, 'scene', '{}'));
const items = (raw.items || []).map((it) => ({ ...it, at: Date.now() - 40 * 60_000, expectMin: 90 }));
memory.setState(qq, 'scene', JSON.stringify({ ...raw, items }));
memory.setState(qq, 'sceneSince', Date.now() - 10 * 60_000);
const s2 = getScene(memory, qq);
const phases = s2.items.map((i) => i.phase);
chk('事项进入 doing', phases.includes('doing'), phases.join(','));

// ③ 再往前挪 200 分钟 → 事项应过期或 done，且 seeds 仍可用
const items2 = (raw.items || []).map((it) => ({ ...it, at: Date.now() - 200 * 60_000, expectMin: 20 }));
memory.setState(qq, 'scene', JSON.stringify({ ...raw, items: items2 }));
memory.setState(qq, 'sceneSince', Date.now() - 10 * 60_000);
const s3 = getScene(memory, qq);
chk('过期事项被清掉', s3.items.every((i) => i.phase !== 'expired'), s3.items.map((i) => i.phase).join(','));
chk('seeds 仍不为空（兜底）', s3.seeds.length >= 1, JSON.stringify(s3.seeds.map((x) => x.text)));

// ④ 超过最长时长 → 换场景
memory.setState(qq, 'sceneSince', Date.now() - 200 * 60_000);
const s4 = getScene(memory, qq);
chk('超时后换场景', s4.minutes < 5, `minutes=${s4.minutes}`);

console.log(`\n${pass}/${total} 通过`);
console.log('\n=== 一次 sceneBlock ===');
console.log(sceneBlock(getScene(memory, qq)));
memory.close();
fs.rmSync(db, { force: true });
process.exit(pass === total ? 0 : 1);
