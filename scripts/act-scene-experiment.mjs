/** 场景接入的效果实验：同一批感知，分别在有/无 pending 场景下跑 v2 */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/_replay/bot.db', { readOnly: true });
const rows = db.prepare('SELECT qq,text,json FROM perceptions ORDER BY id ASC').all();
const parsed = [];
for (const r of rows) {
  try {
    parsed.push({ qq: r.qq, text: r.text || '', p: JSON.parse(r.json) });
  } catch {}
}

const ACTS = ['answer', 'engage', 'advance', 'deflect', 'sticky'];

function decideV2({ perception, scene = null, recentActs = [], mood = 60 }) {
  const { intent, emotion, continuity, jump, certainty } = perception;
  if (intent === '提问' || intent === '求建议') return 'answer';
  if (intent === '倾诉' || emotion === '难过' || emotion === '焦虑') return 'engage';

  const s = Object.fromEntries(ACTS.map((a) => [a, 0]));
  s.answer += 1.0;
  if (intent === '敷衍') s.advance += 2.5;
  if (emotion === '撒娇') s.engage += 1.2;
  if (continuity < 0.2) s.deflect += certainty >= 0.6 ? 1.2 : 0.4;
  if (continuity > 0.7 && intent !== '敷衍') s.sticky += 0.8;
  if (jump === 'exhausted') s.deflect += 1.2;
  if (scene?.pending?.length) {
    s.advance += 0.8;
    s.sticky -= 0.3;
  }
  if (scene && /发呆|躺着|刷手机/.test(scene.doing || '')) s.advance += 0.5;
  const last3 = recentActs.slice(-3);
  for (const a of ['advance', 'deflect', 'sticky', 'engage']) {
    const used = last3.filter((x) => x === a).length;
    if (used) s[a] -= 1.2 * used;
  }
  if (recentActs.slice(-2).includes('deflect')) s.deflect -= 3.0;
  if (certainty < 0.5) {
    s.deflect *= 0.6;
    s.advance *= 0.7;
  }
  return ACTS.map((a) => ({ a, v: s[a] })).sort((x, y) => y.v - x.v)[0].a;
}

function run(sceneFor) {
  const dist = {};
  let n = 0;
  for (const [qq] of Object.entries({})) void qq;
  for (const item of parsed) {
    const hist = [];
    const scene = sceneFor(item);
    const a = decideV2({ perception: item.p, scene, recentActs: hist });
    dist[a] = (dist[a] || 0) + 1;
    n++;
  }
  return { dist, n };
}

const none = run(() => null);
const pending = run(() => ({ location: '家', doing: '在厨房煮面', pending: [{ text: '锅里的水快开了' }] }));
const quiet = run(() => ({ location: '家', doing: '躺着刷手机', pending: [] }));

const show = (name, r) => {
  const parts = ACTS.map((a) => `${a} ${(((r.dist[a] || 0) / r.n) * 100).toFixed(1)}%`);
  console.log(`  ${name.padEnd(10)} ${parts.join('  ')}`);
};

console.log(`样本 ${none.n} 条，同一批感知、不同场景：\n`);
show('无场景', none);
show('有 pending', pending);
show('她在发呆', quiet);

const advNone = (none.dist.advance || 0) / none.n;
const advPend = (pending.dist.advance || 0) / pending.n;
console.log(`\nadvance 占比：${(advNone * 100).toFixed(1)}% → ${(advPend * 100).toFixed(1)}%（+${((advPend - advNone) * 100).toFixed(1)} 个百分点）`);
db.close();
