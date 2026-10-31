/**
 * 生成一份「可直接拉走」的备份 zip（服务器自动备份用）。
 *
 *   node scripts/backup-pack.mjs              # 正常备份
 *   node scripts/backup-pack.mjs --dry        # 只看会做什么
 *   node scripts/backup-pack.mjs --out DIR    # 指定输出目录
 *
 * 内容：bot.db（VACUUM INTO 快照）+ config.json + .env + web-token + providers.json
 * 每份带 manifest.json（sha256 + 数据库计数），恢复时可校验。
 * 保留：26 份周备份（半年）+ 6 份月备份。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'backup', 'auto');

const KEEP_WEEKLY = 26;
const KEEP_MONTHLY = 6;

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const isMonthly = now.getDate() === 1;
const name = isMonthly ? `lzx-m-${stamp.slice(0, 7)}.zip` : `lzx-${stamp}.zip`;
const zipPath = path.join(OUT_DIR, name);

const DB = path.join(ROOT, 'data', 'bot.db');
if (!fs.existsSync(DB)) {
  console.error(`找不到数据库：${DB}`);
  process.exit(1);
}

if (DRY) {
  console.log(`[dry] ${name}  ← 数据库 ${(fs.statSync(DB).size / 1024).toFixed(0)} KB，输出到 ${OUT_DIR}`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const tmp = path.join(OUT_DIR, `.tmp-${process.pid}-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });

try {
  const snap = path.join(tmp, 'bot.db');
  const db = new DatabaseSync(DB);
  let stats = {};
  try {
    db.exec(`VACUUM INTO '${snap.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    for (const t of ['messages', 'turns', 'facts', 'summaries', 'users', 'sticker_stats', 'media_seen']) {
      try {
        stats[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
      } catch {
        stats[t] = -1;
      }
    }
  } finally {
    db.close();
  }

  // 校验快照
  const chk = new DatabaseSync(snap, { readOnly: true });
  let integrity = 'unknown';
  try {
    integrity = Object.values(chk.prepare('PRAGMA integrity_check').get())[0];
  } finally {
    chk.close();
  }
  if (integrity !== 'ok') throw new Error(`快照完整性失败：${integrity}`);

  const files = ['bot.db'];
  for (const rel of ['config.json', '.env', 'data/web-token', 'data/providers.json']) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) {
      const base = path.basename(rel);
      fs.copyFileSync(src, path.join(tmp, base));
      files.push(base);
    }
  }

  const sha256 = {};
  for (const f of files) {
    sha256[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, f))).digest('hex');
  }

  fs.writeFileSync(
    path.join(tmp, 'manifest.json'),
    JSON.stringify({ createdAt: now.toISOString(), kind: isMonthly ? 'monthly' : 'weekly', files, sha256, stats, integrity }, null, 2),
    'utf8',
  );

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execFileSync('tar', ['-a', '-cf', zipPath, '-C', tmp, ...files, 'manifest.json'], { stdio: 'pipe' });

  const sizeKB = Math.round(fs.statSync(zipPath).size / 1024);
  const removed = prune(OUT_DIR);
  console.log(JSON.stringify({ ok: true, file: name, sizeKB, stats, integrity, removed }, null, 2));
} catch (e) {
  console.error('备份失败：' + e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function prune(dir) {
  const all = fs
    .readdirSync(dir)
    .filter((f) => /^lzx-(m-)?\d{4}-\d{2}(-\d{2})?\.zip$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const weekly = all.filter((x) => !x.f.startsWith('lzx-m-'));
  const monthly = all.filter((x) => x.f.startsWith('lzx-m-'));

  const removed = [];
  for (const x of weekly.slice(KEEP_WEEKLY)) {
    fs.unlinkSync(path.join(dir, x.f));
    removed.push(x.f);
  }
  for (const x of monthly.slice(KEEP_MONTHLY)) {
    fs.unlinkSync(path.join(dir, x.f));
    removed.push(x.f);
  }
  return removed;
}
