/**
 * 从备份恢复。
 *
 * node scripts/restore.mjs                 → 列出可用备份
 * node scripts/restore.mjs <名字> [--yes]  → 恢复（会先停 bot，并把当前库另存）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve('.');
const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\林知夏备份';
const BASE = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT, 'backup');
const args = process.argv.slice(2).filter((a) => a !== '--yes');
const YES = process.argv.includes('--yes');
const name = args[0];

const list = () =>
  fs
    .readdirSync(BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const p = path.join(BASE, e.name);
      const size = fs.readdirSync(p, { recursive: true }).length;
      return { name: e.name, at: fs.statSync(p).mtimeMs, files: size };
    })
    .sort((a, b) => b.at - a.at);

if (!name) {
  console.log(`备份目录：${BASE}\n`);
  const rows = list();
  if (!rows.length) console.log('（还没有备份）');
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${r.name}   ${new Date(r.at).toLocaleString('zh-CN')}   ${r.files} 个文件`);
  }
  console.log('\n恢复：node scripts/restore.mjs <名字> --yes');
  process.exit(0);
}

// ── 定位备份 ─────────────────────────────────────────────
const dir = path.isAbsolute(name) ? name : fs.existsSync(name) ? path.resolve(name) : path.join(BASE, name);
if (!fs.existsSync(dir)) {
  console.error(`找不到备份：${dir}`);
  process.exit(1);
}

// ── 校验 ─────────────────────────────────────────────────
const dbFile = path.join(dir, 'bot.db');
if (!fs.existsSync(dbFile)) {
  console.error('这个备份里没有 bot.db，拒绝恢复');
  process.exit(1);
}
{
  const db = new DatabaseSync(dbFile);
  let integrity = 'unknown';
  try {
    integrity = Object.values(db.prepare('PRAGMA integrity_check').get())[0];
  } finally {
    db.close();
  }
  if (integrity !== 'ok') {
    console.error(`备份库损坏（integrity=${integrity}），拒绝恢复`);
    process.exit(1);
  }
  console.log(`✓ 备份完整：${path.basename(dir)}`);
}

if (fs.existsSync(path.join(dir, 'MANIFEST.txt'))) {
  console.log(fs.readFileSync(path.join(dir, 'MANIFEST.txt'), 'utf8'));
}

if (!YES) {
  console.log('\n这会覆盖当前 data/bot.db。确认请在命令后加 --yes');
  process.exit(0);
}

// ── 停 bot ───────────────────────────────────────────────
const lock = path.join(ROOT, 'data', 'bot.lock');
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, 'utf8').trim());
  if (pid) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
      console.log(`已停掉 bot（pid ${pid}）`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      console.log('bot 似乎没在运行（或停不掉），继续');
    }
  }
}

// ── 当前库另存一份（防救错）──────────────────────────────
const cur = path.join(ROOT, 'data', 'bot.db');
if (fs.existsSync(cur)) {
  const rescue = path.join(ROOT, 'backup');
  fs.mkdirSync(rescue, { recursive: true });
  const dest = path.join(rescue, `_restore前的库-${Date.now()}.db`);
  fs.copyFileSync(cur, dest);
  console.log(`当前库已另存：${dest}`);
}

// ── 覆盖 ─────────────────────────────────────────────────
fs.copyFileSync(dbFile, cur);
fs.rmSync(path.join(ROOT, 'data', 'bot.db-wal'), { force: true });
fs.rmSync(path.join(ROOT, 'data', 'bot.db-shm'), { force: true });
for (const f of ['config.json', '.env']) {
  const src = path.join(dir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(ROOT, f));
    console.log(`已恢复 ${f}`);
  }
}
if (fs.existsSync(path.join(dir, 'personas'))) {
  fs.cpSync(path.join(dir, 'personas'), path.join(ROOT, 'personas'), { recursive: true });
  console.log('已恢复 personas/');
}
if (fs.existsSync(path.join(dir, 'stickers-index.json'))) {
  fs.copyFileSync(path.join(dir, 'stickers-index.json'), path.join(ROOT, 'stickers', 'index.json'));
  console.log('已恢复表情库索引（图片按原文件，不会回滚）');
}
if (fs.existsSync(path.join(dir, 'stickers'))) {
  fs.cpSync(path.join(dir, 'stickers'), path.join(ROOT, 'stickers'), { recursive: true });
  console.log('已恢复表情库图片');
}

// ── 自检 ─────────────────────────────────────────────────
{
  const db = new DatabaseSync(cur);
  try {
    const n = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
    const t = db.prepare('SELECT COUNT(*) c FROM turns').get().c;
    console.log(`✓ 恢复完成：messages ${n} 条，turns ${t} 条`);
  } finally {
    db.close();
  }
}
console.log('\n下一步：运行 启动机器人.cmd，然后在后台看一眼「对话回放」是否正常。');
