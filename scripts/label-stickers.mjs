/**
 * 给表情包打标签（情绪分类 + 一句描述），用视觉模型自动跑，人工只需抽检。
 *
 * node --env-file=.env scripts/label-stickers.mjs <清单文件> <输出 json>
 * 清单文件每行：<源文件路径>\t<来源分组>
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat } from '../src/brain.mjs';
import { Memory } from '../src/memory.mjs';
import { createLogger } from '../src/logger.mjs';
import { loadImage } from '../src/image.mjs';

const CATS = ['开心', '好笑', '无语', '生气', '难过', '撒娇', '累困', '疑惑', '鼓励', '亲密'];

const SYS = `你是表情包分类器。看一张表情包，判断它最适合在什么情绪下发出。
只输出 JSON：{"category":"开心","desc":"八个字以内的描述","text":"图上的文字（没有就空）"}
category 只能从这些里选：${CATS.join(' / ')}
desc 要口语，像"笑到打滚""一脸无语"这种，不要分析。`;

const [listFile, outFile] = process.argv.slice(2);
const lines = fs
  .readFileSync(listFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [file, group = 'misc'] = l.split('\t');
    return { file, group };
  });

const mem = new Memory('data/_label.db');
mem.ensureUser('label');
const log = createLogger('warn');
const chatFn = (m, tag) => chat(m, { qq: 'label', memory: mem, log, tag });

const results = [];
let done = 0;
const CONCURRENCY = 4;

async function one(item) {
  const { dataUrl } = await loadImage(item.file, 8 * 1024 * 1024);
  const r = await chatFn(
    [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: [
          { type: 'text', text: '给这张表情包分类。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    'label',
  );
  const raw = String(r.text || '').replace(/```json|```/g, '');
  const m = raw.match(/\{[\s\S]*\}/);
  const o = m ? JSON.parse(m[0]) : {};
  return {
    file: item.file,
    group: item.group,
    category: CATS.includes(o.category) ? o.category : '迷惑',
    desc: String(o.desc || '').slice(0, 16),
    text: String(o.text || '').slice(0, 20),
    cost: r.usage?.cost || 0,
  };
}

const queue = [...lines];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const item = queue.shift();
    try {
      const r = await one(item);
      results.push(r);
      done++;
      console.log(`  [${done}/${lines.length}] ${r.category} · ${r.desc}  ${path.basename(r.file)}`);
    } catch (e) {
      done++;
      console.log(`  [${done}/${lines.length}] ✗ ${path.basename(item.file)}：${e.message}`);
    }
  }
});

await Promise.all(workers);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
const total = results.reduce((a, r) => a + (r.cost || 0), 0);
mem.close();
console.log(`\n完成 ${results.length} 张，花费约 ¥${total.toFixed(4)}`);
const byCat = {};
for (const r of results) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log('分类分布:', JSON.stringify(byCat));
