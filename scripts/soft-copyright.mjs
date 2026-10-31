/**
 * 生成软著申请用的源程序文档。
 *
 *   node scripts/soft-copyright.mjs
 *
 * 输出 docs/软著/源程序.txt：
 *   前 30 页 + 后 30 页，每页 50 行，带页眉（软件名 + 版本 + 页码）
 *   同时输出 docs/软著/源程序清单.md（包含哪些文件、各多少行）
 *
 * 规则参考中国版权保护中心：源程序前 30 页、后 30 页，每页不少于 50 行（末页除外）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const OUT_DIR = path.join(ROOT, 'docs', '软著');
const SOFT_NAME = '林知夏AI角色对话系统';
const SOFT_VER = 'V1.0';
const LINES_PER_PAGE = 50;
const PAGES_EACH_SIDE = 30;

// 只提交自己写的代码；不含 node_modules、表情包、第三方库
const INCLUDE_DIRS = ['src', 'server', 'web/src', 'scripts'];
const EXCLUDE = [
  /node_modules/,
  /\bdata\//,
  /\bbackup\//,
  /\bstickers/,
  /soft-copyright/,
];
const EXT = new Set(['.mjs', '.js', '.jsx', '.css', '.ps1']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (EXT.has(path.extname(name).toLowerCase())) out.push(rel);
  }
  return out;
}

const files = INCLUDE_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();

const body = [];
const manifest = [];
for (const rel of files) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  // 去掉纯空行过多的情况，但保留原样（软著只要求行数）
  manifest.push({ file: rel, lines: lines.length });
  body.push(`// ===== ${rel} =====`);
  for (const l of lines) body.push(l);
  body.push('');
}

const total = body.length;
const head = body.slice(0, LINES_PER_PAGE * PAGES_EACH_SIDE);
const tail = body.slice(-LINES_PER_PAGE * PAGES_EACH_SIDE);
const isShort = total <= LINES_PER_PAGE * PAGES_EACH_SIDE * 2;
const selected = isShort ? body : [...head, ...tail];

fs.mkdirSync(OUT_DIR, { recursive: true });

// 分页，每页 50 行，带页眉；页间用换页符 \f
const pages = [];
for (let i = 0; i < selected.length; i += LINES_PER_PAGE) {
  pages.push(selected.slice(i, i + LINES_PER_PAGE));
}

const out = [];
pages.forEach((page, idx) => {
  const pageNo = idx + 1;
  out.push(`${SOFT_NAME} ${SOFT_VER}    第 ${pageNo} 页 / 共 ${pages.length} 页`);
  out.push('');
  for (const line of page) out.push(line.replace(/\t/g, '    '));
  out.push('\f');
});

const outFile = path.join(OUT_DIR, '源程序.txt');
fs.writeFileSync(outFile, out.join('\n'), 'utf8');

const manifestFile = path.join(OUT_DIR, '源程序清单.md');
const mf = [
  `# 源程序清单（${SOFT_NAME} ${SOFT_VER}）`,
  '',
  `- 代码总行数：${total} 行`,
  `- 提交页数：${pages.length} 页（每页 ${LINES_PER_PAGE} 行）`,
  `- 提交方式：${isShort ? '代码不足 60 页，全部提交' : '前 30 页 + 后 30 页'}`,
  '',
  '| 文件 | 行数 |',
  '|---|---|',
  ...manifest.map((m) => `| \`${m.file}\` | ${m.lines} |`),
  '',
  `合计 ${manifest.length} 个文件，${manifest.reduce((s, m) => s + m.lines, 0)} 行。`,
];
fs.writeFileSync(manifestFile, mf.join('\n'), 'utf8');

console.log(JSON.stringify({
  ok: true,
  totalLines: total,
  files: files.length,
  pages: pages.length,
  mode: isShort ? 'all' : 'head+tail',
  outFile,
  manifestFile,
}, null, 2));
