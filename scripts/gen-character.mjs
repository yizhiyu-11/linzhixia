/**
 * 用百炼「通义万相」文生图，生成原创鲸鱼娘（借设定，不照抄）。
 *
 *   node scripts/gen-character.mjs "提示词" [输出名] [尺寸]
 *
 * 依赖 .env 里的 DASHSCOPE_API_KEY。
 * 流程：提交异步任务 → 轮询 → 下载图片到 docs/商业/角色/
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) {
  console.error('缺少 DASHSCOPE_API_KEY');
  process.exit(1);
}

const API = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const MODEL = process.env.WANX_MODEL || 'wanx2.1-t2i-turbo';
const prompt = process.argv[2];
const name = process.argv[3] || '角色-测试';
const size = process.argv[4] || '1024*1024';

if (!prompt) {
  console.error('用法: node scripts/gen-character.mjs "提示词" [输出名] [尺寸]');
  process.exit(1);
}

const OUT = path.join('docs', '商业', '角色');
fs.mkdirSync(OUT, { recursive: true });

const NEGATIVE = [
  'lowres', 'bad anatomy', 'bad hands', 'extra fingers', 'text', 'watermark', 'signature',
  'nsfw', 'cleavage', 'revealing clothes', 'scary',
  'sailor collar', 'maid outfit', 'frills', 'lace', 'multiple girls',
].join(',');

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'X-DashScope-Async': 'enable',
};

const submit = await fetch(API, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: MODEL,
    input: { prompt, negative_prompt: NEGATIVE },
    parameters: { size, n: 1, prompt_extend: true },
  }),
});

const submitted = await submit.json();
if (!submitted?.output?.task_id) {
  console.error('提交失败：', JSON.stringify(submitted).slice(0, 500));
  process.exit(1);
}
const taskId = submitted.output.task_id;
console.log(`任务已提交：${taskId}（${MODEL}）`);

const taskUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
let imageUrl = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const r = await fetch(taskUrl, { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  const status = j?.output?.task_status;
  if (status === 'SUCCEEDED') {
    imageUrl = j.output.results?.[0]?.url;
    break;
  }
  if (status === 'FAILED') {
    console.error('生成失败：', JSON.stringify(j).slice(0, 500));
    process.exit(1);
  }
  process.stdout.write('.');
}

if (!imageUrl) {
  console.error('\n超时未完成');
  process.exit(1);
}

const img = await fetch(imageUrl);
const buf = Buffer.from(await img.arrayBuffer());
const file = path.join(OUT, `${name}.png`);
fs.writeFileSync(file, buf);
console.log(`\n✓ ${file}  ${Math.round(buf.length / 1024)} KB`);
