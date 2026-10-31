/**
 * 干净地停掉机器人。
 *
 *   node scripts/stop.mjs            只停机器人（保留 NapCat/QQ）
 *   node scripts/stop.mjs --all      连 NapCat 一起停（QQ 也会退出）
 *   node scripts/stop.mjs --force    等 2 秒没退就强杀
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const ALL = process.argv.includes('--all');
const FORCE = process.argv.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const findBots = () => {
  const r = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'src[\\\\/]index\\.mjs' } | Select-Object -ExpandProperty ProcessId",
    ],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  );
  return (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
};

const kill = async (pid, name) => {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    try {
      process.kill(pid, 0);
    } catch {
      console.log(`  ✓ 已停 ${name}（pid ${pid}）`);
      return true;
    }
  }
  if (!FORCE) {
    console.log(`  ! ${name}（pid ${pid}）没在 3 秒内退出，加 --force 可强杀`);
    return false;
  }
  try {
    process.kill(pid, 'SIGKILL');
    console.log(`  ✓ 强杀 ${name}（pid ${pid}）`);
    return true;
  } catch {
    return false;
  }
};

const bots = findBots();
if (!bots.length) {
  console.log('机器人没在跑。');
} else {
  for (const pid of bots) await kill(pid, '机器人');
}

const lockFile = path.join(ROOT, 'data', 'bot.lock');
if (fs.existsSync(lockFile)) {
  fs.rmSync(lockFile, { force: true });
  console.log('  已清掉 data/bot.lock');
}

if (ALL) {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', "Get-Process -Name NapCatWinBootMain -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  );
  const pids = (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(`  ✓ 已停 NapCat（pid ${pid}）`);
    } catch {
      /* ignore */
    }
  }
  console.log('  注意：NapCat 停了，QQ 一般也会跟着退，下次启动要重新快速登录');
}

console.log('完成。');
