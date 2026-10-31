/** v3 验证：规则表 + 场景开关（不打分累加，避免权重脆弱） */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/_replay/bot.db', { readOnly: true });
const rows = db.prepare('SELECT qq,text,json FROM perceptions ORDER BY id ASC').all();
const parsed = [];
for (const r of rows) {
  try {
    parsed.push({ qq: r.qq, text: r.text || '', p: JSON.parse(r.json) });
  } catch {}
}

function decideV3({ perception, scene = null, goal = '', recentActs = [] }) {
  const { intent, emotion, continuity, jump, certainty } = perception;
  const lastTwo = recentActs.slice(-2);
  const deflectedRecently = lastTwo.includes('deflect');

  // ① 正确性硬约束
  if (intent === '提问' || intent === '求建议') return { act: 'answer', strength: 0.9, why: '他在问' };
  if (intent === '倾诉' || emotion === '难过' || emotion === '焦虑')
    return { act: 'engage', strength: 0.9, why: '先接情绪' };

  // ② 场景开关：她手上有事，且他不是在问 → 说点自己的
  if (scene?.pending?.length && (intent === '分享' || intent === '敷衍')) {
    return { act: 'advance', strength: 0.7, why: '她手上有事可讲' };
  }

  // ③ 话题耗尽 → 岔开（不连岔）
  if (jump === 'exhausted' && !deflectedRecently) {
    return { act: 'deflect', strength: 0.6, why: '话题聊到底了' };
  }

  // ④ 接不上 → 岔开（高置信才做）
  if (continuity < 0.2 && certainty >= 0.6 && !deflectedRecently) {
    return { act: 'deflect', strength: 0.5, why: '接不上' };
  }

  // ⑤ 敷衍且她刚说完自己的 → 顺着
  if (intent === '敷衍' && lastTwo.includes('advance')) {
    return { act: 'sticky', strength: 0.4, why: '他敷衍，别硬聊' };
  }

  return { act: 'answer', strength: 0.5, why: '默认接住' };
}

function run(sceneFor) {
  const dist = {};
  let n = 0;
  for (const item of parsed) {
    const hist = [];
    const r = decideV3({ perception: item.p, scene: sceneFor(item), recentActs: hist });
    dist[r.act] = (dist[r.act] || 0) + 1;
    n++;
  }
  return { dist, n };
}

const ACTS = ['answer', 'engage', 'advance', 'deflect', 'sticky'];
const none = run(() => null);
const pending = run(() => ({ location: '家', doing: '在厨房煮面', pending: [{ text: '锅里的水快开了' }] }));

const show = (name, r) => {
  console.log(`  ${name.padEnd(10)} ` + ACTS.map((a) => `${a} ${(((r.dist[a] || 0) / r.n) * 100).toFixed(1)}%`).join('  '));
};

console.log(`样本 ${none.n} 条\n`);
show('无场景', none);
show('有 pending', pending);
console.log(
  `\nadvance：${(((none.dist.advance || 0) / none.n) * 100).toFixed(1)}% → ${(((pending.dist.advance || 0) / pending.n) * 100).toFixed(1)}%`,
);
db.close();
