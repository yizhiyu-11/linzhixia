/**
 * 把 installer\操作说明.md 转成两份客户版：
 *   installer\操作说明.html  （浏览器打开，带目录和样式）
 *   installer\操作说明.txt   （记事本打开，UTF-8 带 BOM）
 *
 *   node scripts/build-docs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const SRC = path.join(ROOT, 'installer', '操作说明.md');
const md = fs.readFileSync(SRC, 'utf8');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 行内：**粗体**、`代码`、[文字](链接) */
function inline(text) {
  let out = esc(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

const lines = md.split(/\r?\n/);
const html = [];
const toc = [];
let i = 0;
let inCode = false;
let listType = null;
let skippingTitle = true;

const closeList = () => {
  if (listType) {
    html.push(listType === 'ul' ? '</ul>' : '</ol>');
    listType = null;
  }
};

while (i < lines.length) {
  const line = lines[i];

  // 代码块
  if (line.trim().startsWith('```')) {
    if (!inCode) {
      closeList();
      html.push('<pre><code>');
      inCode = true;
    } else {
      html.push('</code></pre>');
      inCode = false;
    }
    i++;
    continue;
  }
  if (inCode) {
    html.push(esc(line));
    i++;
    continue;
  }

  // 空行
  if (!line.trim()) {
    closeList();
    i++;
    continue;
  }

  // 表格
  if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
    closeList();
    const header = line.split('|').slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
      i++;
    }
    html.push('<table><thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>');
    for (const r of rows) {
      html.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    }
    html.push('</tbody></table>');
    continue;
  }

  // 跳过文档开头 H1 区块（页面 header 已有）
  if (skippingTitle) {
    if (line.trim() === '---') skippingTitle = false;
    i++;
    continue;
  }

  // 标题
  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    closeList();
    const level = h[1].length;
    const text = h[2].trim();
    // 正文里的"目录"整节跳过（页头 nav 已替代）
    if (level === 2 && text.replace(/^\d+\.\s*/, '').trim() === '目录') {
      i++;
      while (i < lines.length && !/^##\s+/.test(lines[i])) i++;
      continue;
    }
    const id = 'h-' + toc.length;
    if (level === 2) {
      const clean = text.replace(/^\d+\.\s*/, '').trim();
      toc.push({ id, text: clean });
    }
    html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
    i++;
    continue;
  }

  // 分隔线
  if (/^---+$/.test(line.trim())) {
    closeList();
    html.push('<hr>');
    i++;
    continue;
  }

  // 引用 / 标注框：> [!TYPE] 标题
  if (line.trim().startsWith('>')) {
    closeList();
    const buf = [];
    while (i < lines.length && lines[i].trim().startsWith('>')) {
      buf.push(lines[i].replace(/^\s*>\s?/, ''));
      i++;
    }
    const head = buf[0] || '';
    const m = head.match(/^\[!(\w+)\]\s*(.*)$/);
    if (m) {
      const type = m[1].toLowerCase();
      const title = m[2].trim();
      const body = buf.slice(1).filter((x) => x.trim());
      html.push(
        `<div class="callout callout-${type}">` +
          `<div class="callout-title">${inline(title)}</div>` +
          `<div class="callout-body">${body.map((b) => inline(b)).join('<br>')}</div>` +
          `</div>`,
      );
    } else {
      html.push('<blockquote>' + buf.map((b) => inline(b)).join('<br>') + '</blockquote>');
    }
    continue;
  }

  // 有序列表
  if (/^\d+\.\s+/.test(line.trim())) {
    if (listType !== 'ol') {
      closeList();
      html.push('<ol>');
      listType = 'ol';
    }
    html.push('<li>' + inline(line.trim().replace(/^\d+\.\s+/, '')) + '</li>');
    i++;
    continue;
  }

  // 无序列表
  if (/^[-*]\s+/.test(line.trim())) {
    if (listType !== 'ul') {
      closeList();
      html.push('<ul>');
      listType = 'ul';
    }
    html.push('<li>' + inline(line.trim().replace(/^[-*]\s+/, '')) + '</li>');
    i++;
    continue;
  }

  // 普通段落
  closeList();
  html.push('<p>' + inline(line.trim()) + '</p>');
  i++;
}
closeList();

const tocHtml = toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('\n');

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>林知夏 · 操作说明</title>
<style>
  :root { --ink:#1f2430; --sub:#6b7280; --line:#e5e9f2; --acc:#3b6ef6; --bg:#f7f9fc; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font: 15px/1.75 "Microsoft YaHei UI","Segoe UI",system-ui,sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 48px 28px 96px; }
  header { border-bottom: 2px solid var(--acc); padding-bottom: 18px; margin-bottom: 28px; }
  header h1 { margin: 0 0 6px; font-size: 30px; letter-spacing: .5px; }
  header p { margin: 0; color: var(--sub); font-size: 13px; }
  nav { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 24px; margin-bottom:32px; }
  nav b { display:block; font-size:13px; color:var(--sub); margin-bottom:8px; letter-spacing:1px; }
  nav ul { margin:0; padding-left:20px; columns:2; column-gap:32px; }
  nav li { margin:3px 0; }
  nav a { color: var(--ink); text-decoration:none; }
  nav a:hover { color: var(--acc); }
  h2 { font-size:22px; margin:44px 0 12px; padding-top:10px; border-top:1px solid var(--line); }
  h3 { font-size:17px; margin:26px 0 8px; color:#243; }
  h4 { font-size:15px; margin:20px 0 6px; }
  p { margin: 10px 0; }
  ul,ol { margin: 10px 0 10px 4px; padding-left: 22px; }
  li { margin: 4px 0; }
  code { background:#eef2f9; color:#22409a; padding:1px 5px; border-radius:4px; font-size:13px;
         font-family: Consolas,"Cascadia Mono",monospace; }
  pre { background:#0f172a; color:#94e9ff; padding:16px 18px; border-radius:12px; overflow:auto;
        font-size:13px; line-height:1.6; }
  pre code { background:none; color:inherit; padding:0; }
  table { border-collapse: collapse; width:100%; margin:14px 0; background:#fff;
          border:1px solid var(--line); border-radius:10px; overflow:hidden; font-size:14px; }
  th,td { border-bottom:1px solid var(--line); padding:9px 12px; text-align:left; vertical-align:top; }
  th { background:#f0f4fb; font-weight:600; white-space:nowrap; }
  tr:last-child td { border-bottom:none; }
  blockquote { margin:14px 0; padding:12px 16px; background:#fff7e6; border-left:4px solid #f0b429;
               border-radius:0 8px 8px 0; color:#6b4d00; }
  .callout { margin:20px 0; border-radius:12px; padding:16px 20px 14px; border:1px solid; }
  .callout-title { font-weight:800; font-size:15px; margin-bottom:8px; letter-spacing:.3px; }
  .callout-body { font-size:14px; line-height:1.8; }
  .callout-danger { background:#fff1f0; border-color:#ffb3ad; color:#8a1c12; }
  .callout-danger .callout-title { color:#c0392b; }
  .callout-important { background:#fff8e6; border-color:#ffd591; color:#7a4f00; }
  .callout-important .callout-title { color:#b26a00; }
  .callout-tip { background:#eefaf1; border-color:#a8e6bd; color:#1a5c33; }
  .callout-tip .callout-title { color:#1e7a44; }
  .callout-note { background:#eef4ff; border-color:#b8cdfc; color:#1c3a7a; }
  .callout-note .callout-title { color:#2a55b8; }
  hr { border:none; border-top:1px dashed var(--line); margin:28px 0; }
  a { color: var(--acc); }
  strong { font-weight: 700; }
  footer { margin-top:56px; padding-top:18px; border-top:1px solid var(--line); color:var(--sub); font-size:13px; }
  @media print { nav { display:none; } body { background:#fff; } .wrap { padding:0; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>林知夏 AI 角色对话系统</h1>
    <p>操作说明 · v1.0 本地版（接 QQ） · 适用 Windows 10 / 11</p>
  </header>
  <nav>
    <b>目录</b>
    <ul>${tocHtml}</ul>
  </nav>
  <main>
${html.join('\n')}
  </main>
  <footer>遇到问题：先看第 9 章，再跑「诊断.cmd」，把输出整段发给卖家。</footer>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'installer', '操作说明.html'), page, 'utf8');

// ---------- TXT 版 ----------
let txt = md
  .replace(/\[!DANGER\]\s*/g, '【严重】')
  .replace(/\[!IMPORTANT\]\s*/g, '【重要】')
  .replace(/\[!TIP\]\s*/g, '【提示】')
  .replace(/\[!NOTE\]\s*/g, '【注意】')
  .replace(/```[a-z]*\n/g, '')
  .replace(/```/g, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/^---+$/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
  .replace(/\|/g, ' ');
fs.writeFileSync(path.join(ROOT, 'installer', '操作说明.txt'), '\ufeff' + txt, 'utf8');

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
console.log('  操作说明.html  ' + kb(path.join(ROOT, 'installer', '操作说明.html')) + ' KB');
console.log('  操作说明.txt   ' + kb(path.join(ROOT, 'installer', '操作说明.txt')) + ' KB');
console.log('  章节数：' + toc.length);
