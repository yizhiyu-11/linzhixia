/**
 * 备份：数据库 + 配置 + 密钥 + 人设 + 表情索引，写到 D 盘中文目录。
 *
 * node scripts/backup.mjs [--type 日备|周备|手动] [--full]
 *   --full 连表情库图片一起备（周备默认）
 *
 * D 盘不可用时自动回落到 E:\ai-gf\backup。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve('.');
const args = process.argv.slice(2);
const argType = (() => {
  const i = args.indexOf('--type');
  return i >= 0 ? args[i + 1] : '手动';
})();
const FULL = args.includes('--full') || argType === '周备';

const TYPE = ['日备', '周备', '手动', '启动'].includes(argType) ? argType : '手动';

// ── 选备份根目录 ──────────────────────────────────────────
const PRIMARY = process.env.BACKUP_DIR || 'D:\\林知夏备份';
let BASE = PRIMARY;
try {
  fs.mkdirSync(PRIMARY, { recursive: true });
  fs.accessSync(PRIMARY, fs.constants.W_OK);
} catch (e) {
  BASE = path.join(ROOT, 'backup');
  fs.mkdirSync(BASE, { recursive: true });
  console.log(`[backup] D 盘不可用（${e.code || e.message}），改用 ${BASE}`);
}

// ── 目录名 ────────────────────────────────────────────────
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const week = (() => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400_000 + 1) / 7);
})();
const stamp =
  TYPE === '周备'
    ? `${now.getFullYear()}-W${pad(week)}-${TYPE}`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}-${TYPE}`;

const DIR = path.join(BASE, stamp);
if (fs.existsSync(DIR)) {
  console.log(`[backup] 本次已有同名备份：${stamp}`);
  process.exit(0);
}
fs.mkdirSync(DIR, { recursive: true });

const manifest = [];
const add = (name, detail) => manifest.push(`${name}\t${detail}`);

// ── 1. 数据库：VACUUM INTO（一致快照）────────────────────
let dbRows = {};
{
  const src = path.join(ROOT, 'data', 'bot.db');
  const dest = path.join(DIR, 'bot.db');
  if (fs.existsSync(src)) {
    const db = new DatabaseSync(src);
    try {
      db.exec(`VACUUM INTO '${dest.replace(/\\/g, '/').replace(/'/g, "''")}'`);
      for (const t of ['messages', 'facts', 'summaries', 'turns', 'media_seen', 'sticker_stats', 'users']) {
        try {
          dbRows[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
        } catch {
          dbRows[t] = '-';
        }
      }
    } finally {
      db.close();
    }
    // 校验快照
    const chk = new DatabaseSync(dest);
    let integrity = 'unknown';
    try {
      integrity = Object.values(chk.prepare('PRAGMA integrity_check').get())[0];
    } finally {
      chk.close();
    }
    const size = fs.statSync(dest).size;
    if (integrity !== 'ok') throw new Error(`备份库完整性检查失败：${integrity}`);
    add('bot.db', `${Math.round(size / 1024)}KB  integrity=ok`);
  } else {
    add('bot.db', '源库不存在，跳过');
  }
}

// ── 2. 配置 / 密钥 / 人设 ────────────────────────────────
for (const [rel, label] of [
  ['config.json', 'config.json'],
  ['.env', '.env（含密钥）'],
]) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(DIR, path.basename(rel)));
  add(label, `${Math.round(fs.statSync(src).size / 1024)}KB`);
}

{
  const src = path.join(ROOT, 'personas');
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(DIR, 'personas'), { recursive: true });
    const n = fs.readdirSync(path.join(DIR, 'personas')).length;
    add('personas/', `${n} 个文件`);
  }
}

// ── 3. 表情库 ─────────────────────────────────────────────
{
  const idx = path.join(ROOT, 'stickers', 'index.json');
  if (fs.existsSync(idx)) {
    fs.copyFileSync(idx, path.join(DIR, 'stickers-index.json'));
    const count = JSON.parse(fs.readFileSync(idx, 'utf8')).stickers?.length || 0;
    add('stickers-index.json', `${count} 条`);
  }
  if (FULL) {
    const src = path.join(ROOT, 'stickers');
    const dest = path.join(DIR, 'stickers');
    fs.cpSync(src, dest, {
      recursive: true,
      filter: (p) => !p.endsWith('index.json') && !p.includes('\\_'),
    });
    const n = fs.readdirSync(dest, { recursive: true }).length;
    add('stickers/', `全量 ${n} 项`);
  }
}

// ── 3.5 代码（只在全量备份时）────────────────────────────
if (FULL) {
  for (const rel of ['src', 'server', 'scripts', 'web/src']) {
    const s = path.join(ROOT, rel);
    if (!fs.existsSync(s)) continue;
    fs.cpSync(s, path.join(DIR, rel), { recursive: true });
    add(rel + '/', '代码');
  }
}

// ── 4. MANIFEST + 校验和 ─────────────────────────────────
{
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, 'bot.db'))).digest('hex').slice(0, 16);
  const lines = [
    `备份时间：${now.toLocaleString('zh-CN')}`,
    `类型：${TYPE}${FULL ? '（含表情库图片）' : ''}`,
    `来源：${ROOT}`,
    `目标：${DIR}`,
    '',
    '── 内容 ──',
    ...manifest,
    '',
    '── 数据库行数 ──',
    ...Object.entries(dbRows).map(([k, v]) => `${k}\t${v}`),
    '',
    `bot.db sha256（前16位）：${sha}`,
    `node：${process.version}`,
  ];
  fs.writeFileSync(path.join(DIR, 'MANIFEST.txt'), lines.join('\n'), 'utf8');
}

// ── 5. 清理（只清这个目录下自己建的）────────────────────
const KEEP = { 日备: 7, 周备: 4, 手动: 10, 启动: 5 };
const removed = [];
for (const [type, keep] of Object.entries(KEEP)) {
  const dirs = fs
    .readdirSync(BASE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith(`-${type}`) && !e.name.startsWith('_'))
    .map((e) => ({ name: e.name, at: fs.statSync(path.join(BASE, e.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const old of dirs.slice(keep)) {
    try {
      fs.rmSync(path.join(BASE, old.name), { recursive: true, force: true });
      removed.push(old.name);
    } catch {
      /* 占用就下次再删 */
    }
  }
}

console.log(`✓ ${TYPE}备份完成：${DIR}`);
console.log(`  数据库 ${JSON.stringify(dbRows)}`);
for (const m of manifest) console.log('  · ' + m);
if (removed.length) console.log(`  清理旧备份 ${removed.length} 个：${removed.join(', ')}`);
