/**
 * 把 stickers2/ 的候选库正式换到 stickers/（会先备份旧库）
 * node scripts/swap-stickers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const OLD = 'E:/ai-gf/stickers';
const NEW = 'E:/ai-gf/stickers2';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const BAK = `E:/ai-gf/backup/stickers-v1-${stamp}`;

const idx = JSON.parse(fs.readFileSync(path.join(NEW, 'index.json'), 'utf8'));
if (!idx.length) {
  console.error('候选库是空的，先跑 build-stickers-v2.mjs');
  process.exit(1);
}

// 1) 备份旧库
fs.mkdirSync(BAK, { recursive: true });
fs.cpSync(OLD, BAK, { recursive: true });
console.log('已备份旧库 →', BAK);

// 2) 清空旧的分类图（保留可能的自绘目录）
for (const name of fs.readdirSync(OLD)) {
  const p = path.join(OLD, name);
  if (name === 'index.json' || name === 'self' || name === '自绘') continue;
  if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
  else fs.rmSync(p, { force: true });
}

// 3) 拷新图
const stickers = [];
for (const s of idx) {
  const destDir = path.join(OLD, s.category);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${s.id}.png`);
  fs.copyFileSync(path.join(NEW, s.category, `${s.id}.png`), dest);
  stickers.push({
    id: s.id,
    category: s.category,
    desc: s.desc,
    emoji: s.emoji || '',
    file: `${s.category}/${s.id}.png`,
  });
}

// 4) 写索引（保持旧格式 { stickers: [...] }）
fs.writeFileSync(path.join(OLD, 'index.json'), JSON.stringify({ stickers }, null, 2), 'utf8');

// 5) 自检：能不能被 loadStickers 读出来
const { loadStickers } = await import('../src/sticker.mjs');
const loaded = loadStickers(OLD);
console.log(`✓ 新库 ${loaded.length} 张（索引 ${stickers.length} 条）`);
const byCat = {};
for (const s of loaded) byCat[s.category] = (byCat[s.category] || 0) + 1;
console.log('  ' + Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join('  '));
if (loaded.length !== stickers.length) {
  console.error('✗ 有图没读到（检查文件名/路径）');
  process.exit(1);
}
