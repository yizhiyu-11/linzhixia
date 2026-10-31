/**
 * 修复 .cmd 里 %NODE% 没加引号的问题（路径含空格会被拆开）。
 * 只改「命令位置」的 %NODE%，不动 set "NODE=%NODE%" 这类赋值。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const files = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith('.cmd'));

let changed = 0;
for (const name of files) {
  const p = path.join(ROOT, name);
  const buf = fs.readFileSync(p);
  const txt = buf.toString('utf8');

  // 行首（可有空白）的 %NODE% 后面跟空格 → 加引号
  const next = txt.replace(/^([ \t]*)%NODE% /gm, '$1"%NODE%" ');

  if (next !== txt) {
    fs.writeFileSync(p, Buffer.from(next, 'utf8')); // 保持 UTF-8 无 BOM
    changed++;
    console.log('  修 ' + name);
  }
}
console.log(`\n共修改 ${changed} 个文件`);
