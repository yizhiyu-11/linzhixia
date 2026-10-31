/**
 * 判定（第二层：模型判定）。
 * 给每一条"输入 → 回复"打分，只判这一条好不好，不跟前几条比。
 *
 * node --env-file=.env scripts/judge-run-llm.mjs test/runs/run-baseline-001.jsonl
 *   [--limit 50] [--out xxx.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config } from '../src/config.mjs';
import { chat } from '../src/brain.mjs';
import { createLogger } from '../src/logger.mjs';
import { Memory } from '../src/memory.mjs';

const args = process.argv.slice(2);
const RUN = path.resolve(args[0] || '');
if (!RUN || !fs.existsSync(RUN)) {
  console.error('用法: node --env-file=.env scripts/judge-run-llm.mjs <run.jsonl> [--limit N]');
  process.exit(1);
}
const getArg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const LIMIT = Number(getArg('limit', 0)) || Infinity;
const IDS = getArg('ids', '') ? new Set(getArg('ids', '').split(',').map(Number)) : null;
const OUT = path.resolve(getArg('out', RUN.replace(/\.jsonl$/, '.llm.json')));

const rows = fs.readFileSync(RUN, 'utf8').trim().split('\n').map(JSON.parse);
const logger = createLogger('warn');
const memory = new Memory('data/_judge.db');
memory.ensureUser('judge');

// 判定用的提示词。锚点是关键：没有锚点，分数会漂。
const SYS = `你是聊天质量评审。只判断"她这条回复"对"他那句话"好不好。

核心问题只有一个：**她有没有真的回应他说的事？**
不是"这句话说得漂不漂亮"，而是"他抛出这个话头，她接住了吗"。

输出 JSON（不要解释、不要代码块）：
{"判断":"好|一般|差","硬失败":"无|H1|H2|H3|H4|H5","理由":"不超过15字"}

【判断】——直接给结论，别用平均分推\n好 = 接住他的内容、情绪也对、像真人说话，你会想继续聊\n一般 = 没崩，但不接细节/有点空/话题偏了\n差 = 答非所问、冒犯、敷衍到不想聊\n\n三个参考维度（只用来支撑你的判断，不用输出）：\n【承接】——最重要的一维
5 = 明确接住他那句话里的具体内容（提到同一个东西/同一件事）
3 = 大方向相关，但没接具体内容
1 = 她主要在说自己的事、自己的状态，没有回应他 → 同时必须判 H3

【情绪】
5 = 语气和他的情绪对得上（他低落你就软，他吐槽你就站他那边）
3 = 中性，不冒犯
1 = 反向（他难过她在怼、他求助她在嫌弃）

【信息】
5 = 有具体内容或推进话题
3 = 有回应但空
1 = 纯语气词

【自然】
5 = 像真人打字（短、有口癖、不完整）
3 = 略书面但能接受
1 = 客服腔/小说腔

硬失败（只判最严重的一个，没有填"无"）：
H1 = 在点评他说话的方式（说他复读、学自己、发重了、刷屏、催）
H2 = 与她刚说过的状态矛盾（刚说在家，这条说在公司）
H3 = 没有回应他的话头，主要在讲自己的事 —— 最常见的失败，别漏判
H4 = 凭空编造具体事实（时间、金额、地点、人名）
H5 = 空回复 / 只有标点 / 完全没有信息

参考案例（人工标定的口径，照这个尺度判）：
- 他说「这破PPT改第八版了」，她回「我煮的面都糊了他还在改」→ 差 / H3（他的事被抢成她的事）
- 他说「我还没准备好」，她回「先别急 一口吃不成胖子」→ 好（接住了焦虑并安抚）
- 他说「这两个选哪个好」，她回「选哪两个你倒先说啊」→ 一般（反问，没给选择）
- 他说「上号」，她回「欸上来就上号 / 我面刚下锅 / 游戏早卸了」→ 一般（接住了，但掺了自己的事）
- 他说「我是不是想多了」，她回「有这工夫瞎想不如过来吃面」→ 差（没回应他的不安，直接岔开）
判定纪律：
- 默认档是「一般」，不是「好」。给「好」需要同时满足：接住他的具体内容 + 情绪对 + 像真人。
- 她的回复主要在讲自己（面糊了、在忙、在等外卖）→ 判「差」+ H3，即使语句很自然。
- 只反问「你说清楚」、只回一句自己的状态 → 判「一般」。
- 宁可判严一点，不要因为"读起来顺"就给好。
- 先问"他这句话的核心信息是什么"，再看她的回复有没有碰到它。
- 她的回复再自然、再有画面感，只要没碰到他的信息，承接就是 1~2，并判 H3。
- 反问"你说清楚"可以接受，但只能算 3 分，不算好。
- 只有接住内容、且情绪也对，才配 5 分。`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const items = (IDS ? rows.filter((r) => IDS.has(Number(r.sample_id))) : rows).slice(0, LIMIT);
const out = [];
console.log(`[judge] ${items.length} 条 → ${OUT}`);

for (let i = 0; i < items.length; i++) {
  const r = items[i];
  const reply = (r.replies || []).map((x) => x.text).filter(Boolean).join(' / ');
  const imageOnly = (r.replies || []).some((x) => x.image) && !reply;
  if (r.skipped || /💤 这条不回/.test(r.log || '')) {
    out.push({ sample_id: r.sample_id, category: r.category, input: r.text, reply: '', skipped: true, 承接: null, 情绪: null, 信息: null, 自然: null, 硬失败: '无', 理由: '按设计不回' });
    continue;
  }

  const userMsg =
    `他说：${r.text}\n` +
    (imageOnly ? '（她只回了一张表情包，没有文字）' : `她回：${reply || '（什么都没回）'}`);

  try {
    const res = await chat(
      [
        { role: 'system', content: SYS },
        { role: 'user', content: userMsg },
      ],
      { qq: 'judge', memory, log: logger, tag: 'judge' },
    );
    const raw = String(res.text || '').replace(/```json|```/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    const o = m ? JSON.parse(m[0]) : {};
    out.push({
      sample_id: r.sample_id,
      category: r.category,
      input: r.text,
      reply,
      skipped: false,
      判断: ['好', '一般', '差'].includes(o.判断) ? o.判断 : null,
      承接: Number(o.承接) || null,
      情绪: Number(o.情绪) || null,
      信息: Number(o.信息) || null,
      自然: Number(o.自然) || null,
      硬失败: String(o.硬失败 || '无'),
      理由: String(o.理由 || '').slice(0, 20),
    });
  } catch (e) {
    out.push({ sample_id: r.sample_id, category: r.category, input: r.text, reply, skipped: false, error: e.message, 硬失败: 'H5' });
  }

  if ((i + 1) % 20 === 0) console.log(`[judge] ${i + 1}/${items.length}`);
  await sleep(120);
}

// ── 汇总 ───────────────────────────────────────────────────
const scored = out.filter((x) => !x.skipped && !x.error);
const avg = (k) => (scored.length ? +(scored.reduce((a, b) => a + (b[k] || 0), 0) / scored.length).toFixed(2) : 0);
const hard = scored.filter((x) => x.硬失败 && x.硬失败 !== '无');
const byType = {};
for (const x of hard) byType[x.硬失败] = (byType[x.硬失败] || 0) + 1;
const byCat = {};
for (const x of out) {
  if (x.skipped) continue;
  const c = byCat[x.category] || { n: 0, hard: 0, sum: 0 };
  c.n++;
  if (x.硬失败 && x.硬失败 !== '无') c.hard++;
  c.sum += (x.承接 || 0) + (x.情绪 || 0) + (x.信息 || 0) + (x.自然 || 0);
  byCat[x.category] = c;
}

const summary = {
  run: path.basename(RUN),
  n: out.length,
  scored: scored.length,
  skipped: out.filter((x) => x.skipped).length,
  avg: { 承接: avg('承接'), 情绪: avg('情绪'), 信息: avg('信息'), 自然: avg('自然') },
  hardFailRate: scored.length ? +((hard.length / scored.length) * 100).toFixed(1) : 0,
  hardByType: byType,
};

fs.writeFileSync(OUT, JSON.stringify({ summary, items: out }, null, 2), 'utf8');
console.log('\n=== 汇总 ===');
console.log(`  评分 ${scored.length} 条，按设计不回 ${summary.skipped} 条`);
console.log(`  均分：承接 ${summary.avg.承接} 情绪 ${summary.avg.情绪} 信息 ${summary.avg.信息} 自然 ${summary.avg.自然}`);
console.log(`  硬失败率 ${summary.hardFailRate}%`, JSON.stringify(byType));
console.log(`  输出：${OUT}`);
