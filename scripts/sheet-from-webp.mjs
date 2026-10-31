/**
 * 把 webp 表情包转 png，并拼成"选图卡"供人工挑选。
 *
 * node scripts/sheet-from-webp.mjs <源目录> <起始序号> <数量> <输出图>
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [srcDir, startArg, countArg, outArg] = process.argv.slice(2);
const START = Number(startArg) || 0;
const COUNT = Number(countArg) || 48;
const OUT = outArg || 'E:/ai-gf/data/webp-sheet.png';

const files = fs
  .readdirSync(srcDir, { recursive: true })
  .filter((f) => /\.webp$/i.test(String(f)))
  .map((f) => path.join(srcDir, String(f)))
  .sort()
  .slice(START, START + COUNT);

if (!files.length) {
  console.error('没有找到 webp');
  process.exit(1);
}

const CELL = 110;
const COLS = 8;
const ROWS = Math.ceil(files.length / COLS);
const W = COLS * CELL;
const H = ROWS * (CELL + 16) + 10;

const tiles = [];
for (const f of files) {
  const buf = await sharp(f).resize(CELL - 16, CELL - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  tiles.push({ f, buf });
}

const composites = [];
tiles.forEach((t, i) => {
  const x = (i % COLS) * CELL + 8;
  const y = Math.floor(i / COLS) * (CELL + 16) + 8;
  composites.push({ input: t.buf, left: x, top: y });
});

// 编号标签用 SVG 叠加
const labels = tiles
  .map((t, i) => {
    const x = (i % COLS) * CELL + 8;
    const y = Math.floor(i / COLS) * (CELL + 16) + CELL - 6;
    return `<text x="${x}" y="${y}" font-family="Consolas" font-size="12" fill="#9aa0aa">${START + i}</text>`;
  })
  .join('');

const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: { r: 22, g: 24, b: 30, alpha: 1 } } })
  .composite([...composites, { input: svg, left: 0, top: 0 }])
  .png()
  .toFile(OUT);

console.log(`✓ ${files.length} 张 → ${OUT}`);
console.log('  文件名清单：');
tiles.forEach((t, i) => console.log(`  ${START + i}  ${path.basename(t.f)}`));
