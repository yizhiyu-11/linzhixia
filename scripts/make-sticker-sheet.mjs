/**
 * 把 stickers2 分类拼成"选图卡"，方便在 QQ 里一眼看全套。
 * 输出：data/sticker-sheet-1.png / -2.png
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const idx = JSON.parse(fs.readFileSync('E:/ai-gf/stickers2/index.json', 'utf8'));
const cats = [...new Set(idx.map((x) => x.category))];

const build = (group, out, title) => {
  const rows = group.map((cat) => ({
    cat,
    items: idx.filter((x) => x.category === cat),
  }));
  const cols = Math.max(...rows.map((r) => r.items.length));
  const cell = 76;
  const labelW = 96;
  const headH = 46;
  const rowH = cell + 18;
  const W = labelW + cols * cell + 20;
  const H = headH + rows.length * rowH + 16;

  const ps = `
Add-Type -AssemblyName System.Drawing
$W = ${W}; $H = ${H}
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::FromArgb(24, 26, 32))
$titleFont = New-Object System.Drawing.Font('Microsoft YaHei', 16, [System.Drawing.FontStyle]::Bold)
$catFont = New-Object System.Drawing.Font('Microsoft YaHei', 11)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 238, 245))
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 156, 168))
$g.DrawString('${title}', $titleFont, $brush, 12, 12)
${rows
  .map((r, i) => {
    const y = headH + i * rowH;
    const cells = r.items
      .map((it, j) => {
        const x = labelW + j * cell;
        return `$img${i}_${j} = [System.Drawing.Image]::FromFile('${it.file.replace(/\//g, '\\')}')
$g.DrawImage($img${i}_${j}, ${x}, ${y}, ${cell - 12}, ${cell - 12})
$img${i}_${j}.Dispose()`;
      })
      .join('\n');
    return `$g.DrawString('${r.cat}', $catFont, $brush, 12, ${y + 20})
${cells}`;
  })
  .join('\n')}
$bmp.Save('${out.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;

  // PowerShell 5.1 读 UTF-8 需要 BOM，否则中文全是乱码导致解析失败
  fs.writeFileSync('E:/ai-gf/data/_sheet.ps1', '\uFEFF' + ps, 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'E:/ai-gf/data/_sheet.ps1'], { stdio: 'inherit' });
  fs.rmSync('E:/ai-gf/data/_sheet.ps1', { force: true });
  console.log('✓', out);
};

build(cats.slice(0, 5), 'E:/ai-gf/data/sticker-sheet-1.png', '表情包候选（一）上：开心/好笑/无语/生气/难过');
build(cats.slice(5), 'E:/ai-gf/data/sticker-sheet-2.png', '表情包候选（二）下：撒娇/累困/疑惑/鼓励/亲密');
