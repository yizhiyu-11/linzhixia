/**
 * 日常维护：日志轮转 + 备份轮转 + 临时文件清理。
 *
 * 用法：node scripts/maintain.mjs [--dry]
 * 启动脚本会在启动 bot 前调用一次。
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve('.');
const LOGS = path.join(ROOT, 'logs');
const BACKUP = path.join(ROOT, 'backup');

const KEEP_LOG_DAYS = 7;
const KEEP_BACKUPS = 10;
const KEEP_SOAK_DAYS = 7;
const KEEP_VOICE = Number(process.env.KEEP_VOICE || 20); // data/voice 保留最近多少个

fs.mkdirSync(LOGS, { recursive: true });

const actions = [];
const failed = [];
/** 安全执行：失败不中断（日志文件可能被占用） */
const safe = (label, fn) => {
  try {
    fn();
    actions.push(label);
  } catch (e) {
    failed.push(`${label}（${e.code || e.message}）`);
  }
};
const day = (d) => new Date(d).toISOString().slice(0, 10);
const sizeKB = (p) => {
  try {
    return Math.round(fs.statSync(p).size / 1024);
  } catch {
    return 0;
  }
};

// ── 1. 日志轮转：把根目录的 bot.out.log / bot.err.log 归档到 logs/ ──
for (const name of ['bot.out.log', 'bot.err.log', 'napcat.out.log']) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) continue;
  const kb = sizeKB(src);
  if (kb <= 0) {
    if (!DRY) {
      try {
        fs.rmSync(src, { force: true });
      } catch {
        /* 正被占用，跳过 */
      }
    }
    continue;
  }
  const stamp = new Date(fs.statSync(src).mtime).toISOString().slice(0, 10);
  const dest = path.join(LOGS, `${name.replace(/\.log$/, '')}-${stamp}.log`);
  if (DRY) {
    actions.push(`日志轮转 ${name}（${kb}KB）→ logs/${path.basename(dest)}`);
  } else {
    // 同名已存在就追加
    safe(`日志轮转 ${name}（${kb}KB）→ logs/${path.basename(dest)}`, () => {
      if (fs.existsSync(dest)) {
        fs.appendFileSync(dest, fs.readFileSync(src));
        fs.rmSync(src, { force: true });
      } else {
        fs.renameSync(src, dest);
      }
    });
  }
}

// ── 2. 日志清理：只留最近 7 天 ──
const cutoffLog = Date.now() - KEEP_LOG_DAYS * 86400_000;
for (const f of fs.readdirSync(LOGS)) {
  const p = path.join(LOGS, f);
  if (!fs.statSync(p).isFile()) continue;
  if (fs.statSync(p).mtimeMs >= cutoffLog) continue;
  if (DRY) actions.push(`删旧日志 ${f}`);
  else safe(`删旧日志 ${f}`, () => fs.rmSync(p, { force: true }));
}

// ── 3. 备份轮转：backup/ 下最多 10 份 ──
if (fs.existsSync(BACKUP)) {
  const dirs = fs
    .readdirSync(BACKUP, { withFileTypes: true })
    // 下划线开头的是测试/临时目录，永不参与轮转
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => ({ name: e.name, at: fs.statSync(path.join(BACKUP, e.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);

  for (const old of dirs.slice(KEEP_BACKUPS)) {
    const p = path.join(BACKUP, old.name);
    if (DRY) actions.push(`删旧备份 ${old.name}`);
    else safe(`删旧备份 ${old.name}`, () => fs.rmSync(p, { recursive: true, force: true }));
  }

  // backup 根目录里的 json 快照，同样只留 10 份
  const files = fs
    .readdirSync(BACKUP, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => ({ name: e.name, at: fs.statSync(path.join(BACKUP, e.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  const jsonFiles = files.filter((f) => !f.name.startsWith('_'));
  for (const old of jsonFiles.slice(KEEP_BACKUPS)) {
    const p = path.join(BACKUP, old.name);
    if (DRY) actions.push(`删旧快照 ${old.name}`);
    else safe(`删旧快照 ${old.name}`, () => fs.rmSync(p, { force: true }));
  }
}

// ── 4. 临时文件：测试库 / 旧的 soak 日志 ──
const tmpFiles = fs
  .readdirSync(ROOT)
  .filter((f) => /^(_|tmp-).*\.(db|db-wal|db-shm|json|png|mjs|lock|txt)$/i.test(f))
  // 补丁脚本和 lock 可以马上删；测试库留一小时，防止正在跑
  .filter((f) => {
    const st = fs.statSync(path.join(ROOT, f));
    return /^_patch/.test(f) || /\.lock$/i.test(f) || st.mtimeMs < Date.now() - 3600_000;
  });
for (const f of tmpFiles) {
  const p = path.join(ROOT, f);
  if (DRY) actions.push(`删临时文件 ${f}`);
  else safe(`删临时文件 ${f}`, () => fs.rmSync(p, { force: true }));
}
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) {
  const p = path.join(ROOT, 'data', f);
  if (!fs.statSync(p).isFile()) continue;
  if (!/^_.*\.(db|db-wal|db-shm|json|mjs|png|lock|txt)$/i.test(f)) continue;
  const ageMs = Date.now() - fs.statSync(p).mtimeMs;
  // 补丁脚本 / lock 5 分钟就删；测试库留 10 分钟，防止正在跑
  const oldEnough = /^_patch/.test(f) || /\.lock$/i.test(f) ? ageMs > 5 * 60_000 : ageMs > 10 * 60_000;
  if (oldEnough) {
    if (DRY) actions.push(`删临时文件 data/${f}`);
    else safe(`删临时文件 data/${f}`, () => fs.rmSync(p, { force: true }));
  }
}
if (fs.existsSync(path.join(ROOT, 'data'))) {
  for (const f of fs.readdirSync(path.join(ROOT, 'data'))) {
    if (!/^soak-.*\.log$/i.test(f)) continue;
    const p = path.join(ROOT, 'data', f);
    if (fs.statSync(p).mtimeMs >= Date.now() - KEEP_SOAK_DAYS * 86400_000) continue;
    if (DRY) actions.push(`删旧跑批日志 data/${f}`);
    else safe(`删旧跑批日志 data/${f}`, () => fs.rmSync(p, { force: true }));
  }
}

// ── 4.5 语音文件：data/voice 只留最近 20 个，测试目录整块清 ──
try {
  const voiceDir = path.join(ROOT, 'data', 'voice');
  if (fs.existsSync(voiceDir)) {
    const files = fs
      .readdirSync(voiceDir)
      .filter((f) => /\.(wav|mp3|silk|amr)$/i.test(f))
      .map((f) => ({ f, at: fs.statSync(path.join(voiceDir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const old of files.slice(KEEP_VOICE)) {
      const p = path.join(voiceDir, old.f);
      if (DRY) actions.push(`删旧语音 ${old.f}`);
      else safe(`删旧语音 ${old.f}`, () => fs.rmSync(p, { force: true }));
    }
  }

  // 实验残留：data/tts-* 整个目录（昨天的调参产物），只删一天前的
  const dataDir = path.join(ROOT, 'data');
  if (fs.existsSync(dataDir)) {
    for (const e of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !/^tts-/i.test(e.name)) continue;
      const p = path.join(dataDir, e.name);
      if (fs.statSync(p).mtimeMs >= Date.now() - 86400_000) continue;
      if (DRY) actions.push(`删测试音频目录 data/${e.name}`);
      else safe(`删测试音频目录 data/${e.name}`, () => fs.rmSync(p, { recursive: true, force: true }));
    }
  }
} catch (e) {
  actions.push(`语音清理跳过：${e.message}`);
}

// ── 5. 每日备份（一天只跑一次）──────────────────────────
try {
  const BACKUP_DIR = process.env.BACKUP_DIR || 'D:\\林知夏备份';
  const BASE = fs.existsSync(BACKUP_DIR) ? BACKUP_DIR : path.join(ROOT, 'backup');
  const today = new Date().toISOString().slice(0, 10);
  const done = fs.existsSync(BASE) && fs.readdirSync(BASE).some((n) => n.startsWith(today) && n.endsWith('-日备'));
  if (!done && fs.existsSync(path.join(ROOT, 'scripts', 'backup.mjs'))) {
    if (DRY) actions.push('今日备份（未执行）');
    else {
      const { execFileSync } = await import('node:child_process');
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'backup.mjs'), '--type', '日备'], { stdio: 'ignore' });
      actions.push('今日备份 → ' + BASE);
    }
  }
} catch (e) {
  failed.push('每日备份（' + e.message + '）');
}

// ── 汇总 ──
if (!actions.length) {
  console.log('[maintain] 没有需要清理的东西');
} else {
  console.log(`[maintain] ${DRY ? '（演练，未真的删）' : ''}共 ${actions.length} 项：`);
  for (const a of actions.slice(0, 20)) console.log('  · ' + a);
  if (actions.length > 20) console.log(`  · …还有 ${actions.length - 20} 项`);
}
// 失败项单独报，哪怕没有任何成功动作
if (failed.length) {
  console.log(`[maintain] ${failed.length} 项跳过（多半是文件被占用）：`);
  for (const f of failed.slice(0, 5)) console.log('  · ' + f);
}
