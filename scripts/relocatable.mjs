/**
 * 把写死的绝对路径改成"可搬迁"形式，方便迁到云服务器。
 *
 * 规则：
 *   .cmd 里的 E:\ai-gf  → %~dp0（脚本自己所在目录）
 *   .cmd 里的 node 绝对路径 → %NODE%（先探测，探测不到就用 PATH 里的 node）
 *   .mjs 里的 D:\林知夏备份 → process.env.BACKUP_DIR || 默认值
 *   .mjs 里的 D:\qq\QQ.exe → process.env.QQ_PATH || 默认值
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const OLD_NODE = 'C:\\Users\\you\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\node\\bin\\node.exe';

// ── 1. .cmd 文件：改成相对路径 ──
const cmdFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.cmd'));
let cmdCount = 0;

for (const name of cmdFiles) {
  const p = path.join(ROOT, name);
  // 用 latin1 读写，原样保留 GBK 字节
  let text = fs.readFileSync(p, 'latin1');
  const before = text;

  // 1.1 目录
  text = text.split('E:\\ai-gf\\').join('%~dp0');
  text = text.split('E:\\ai-gf').join('%~dp0');
  text = text.split('"%~dp0"').join('"%~dp0."');
  text = text.replace(/cd \/d "%~dp0\\?"/gi, 'cd /d "%~dp0."');
  text = text.replace(/cd \/d "%~dp0"/gi, 'cd /d "%~dp0."');

  // 1.2 node 路径 → 变量
  if (text.includes(OLD_NODE)) {
    text = text.split(`"${OLD_NODE}"`).join('%NODE%');
    text = text.split(OLD_NODE).join('%NODE%');
  }

  if (text !== before) {
    // 在 @echo off 之后插入 node 探测
    if (!text.includes('NODE=')) {
      const detect =
        'if exist "%ProgramFiles%\\nodejs\\node.exe" set "NODE=%ProgramFiles%\\nodejs\\node.exe"\r\n' +
        `if not defined NODE if exist "${OLD_NODE}" set "NODE=${OLD_NODE}"\r\n` +
        'if not defined NODE set "NODE=node"\r\n';
      text = text.replace(/(@echo off\r?\n)/i, `$1${detect}`);
    }
    fs.writeFileSync(p, text, 'latin1');
    cmdCount++;
    console.log(`  改 ${name}`);
  }
}

// ── 2. .mjs：备份目录 / QQ 路径改成环境变量 ──
const mjsPatches = [
  {
    file: 'scripts/backup.mjs',
    from: "const PRIMARY = 'D:\\\\林知夏备份';",
    to: "const PRIMARY = process.env.BACKUP_DIR || 'D:\\\\林知夏备份';",
  },
  {
    file: 'scripts/maintain.mjs',
    from: "const BASE = fs.existsSync('D:\\\\林知夏备份') ? 'D:\\\\林知夏备份' : path.join(ROOT, 'backup');",
    to: "const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\\\林知夏备份';\n  const BASE = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT, 'backup');",
  },
  {
    file: 'scripts/restore.mjs',
    from: "const BASE = fs.existsSync('D:\\\\林知夏备份') ? 'D:\\\\林知夏备份' : path.join(ROOT, 'backup');",
    to: "const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\\\林知夏备份';\nconst BASE = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT, 'backup');",
  },
  {
    file: 'scripts/audit.mjs',
    from: "const bak = fs.existsSync('D:\\\\林知夏备份') ? fs.readdirSync('D:\\\\林知夏备份') : [];",
    to: "const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\\\林知夏备份';\n  const bak = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];",
  },
  {
    file: 'scripts/boot.mjs',
    from: "if (!r) return 'D:\\\\qq\\\\QQ.exe';",
    to: "if (!r) return process.env.QQ_PATH || 'D:\\\\qq\\\\QQ.exe';",
  },
];

let mjsCount = 0;
for (const patch of mjsPatches) {
  const p = path.join(ROOT, patch.file);
  if (!fs.existsSync(p)) {
    console.log(`  跳过 ${patch.file}（不存在）`);
    continue;
  }
  let text = fs.readFileSync(p, 'utf8');
  if (!text.includes(patch.from)) {
    console.log(`  跳过 ${patch.file}（找不到目标）`);
    continue;
  }
  text = text.replace(patch.from, patch.to);
  fs.writeFileSync(p, text, 'utf8');
  mjsCount++;
  console.log(`  改 ${patch.file}`);
}

console.log(`\n.cmd 改了 ${cmdCount} 个，.mjs 改了 ${mjsCount} 个`);
