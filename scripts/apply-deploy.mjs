/**
 * 在云服务器上应用部署包。
 *
 *   node scripts/apply-deploy.mjs D:\deploy\ai-gf-abc1234-2026102614.zip
 *   node scripts/apply-deploy.mjs <zip> --dry    只检查不覆盖
 *
 * 做的事：
 *   1. 检查 zip 合法性、读元信息
 *   2. 把当前代码备份到 backup/deploy/prev-<时间>.zip（不含 data/ .env node_modules）
 *   3. 解压覆盖（绝不碰 data/、.env、config.json、node_modules）
 *   4. 提示重启
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('.');
const ARGS = process.argv.slice(2);
const zipArg = ARGS.find((a) => !a.startsWith('--'));
const DRY = ARGS.includes('--dry');

// 这些目录/文件永远不覆盖
const PROTECTED = new Set(['data', 'logs', 'backup', 'node_modules', '.git', '.env', '.env.dev', 'config.json', 'config.dev.json']);

if (!zipArg) {
  console.error('用法: node scripts/apply-deploy.mjs <部署包.zip> [--dry]');
  process.exit(2);
}
const zipPath = path.resolve(zipArg);
if (!fs.existsSync(zipPath)) {
  console.error('找不到部署包：' + zipPath);
  process.exit(2);
}

const metaPath = zipPath.replace(/\.zip$/, '.json');
let meta = null;
if (fs.existsSync(metaPath)) {
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    /* ignore */
  }
}

console.log('=== 部署包 ===');
console.log(`  文件：${path.basename(zipPath)}  ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`);
if (meta) {
  console.log(`  版本：${meta.version}  ${meta.branch}`);
  console.log(`  内容：${meta.subject}`);
  console.log(`  打包：${meta.packedAt}`);
}

// 1. 备份当前代码
const backupDir = path.join(ROOT, 'backup', 'deploy');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const prevZip = path.join(backupDir, `prev-${stamp}.zip`);

if (!DRY) {
  console.log('\n=== 备份当前代码 ===');
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path (Get-ChildItem -Path '${ROOT.replace(/'/g, "''")}' -Exclude @('data','logs','backup','node_modules','.git','.env','.env.dev','config.json','config.dev.json')) -DestinationPath '${prevZip.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit', timeout: 300000, windowsHide: true },
    );
    console.log(`  已备份：${path.relative(ROOT, prevZip)}`);
  } catch (e) {
    console.error('  备份失败，中止部署：' + e.message);
    process.exit(1);
  }
}

// 2. 解压到临时目录，再逐个覆盖（保护 data/ 等）
const tmp = path.join(ROOT, '_deploy_tmp');
if (!DRY) {
  console.log('\n=== 解压 ===');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`], {
      stdio: 'inherit',
      timeout: 300000,
      windowsHide: true,
    });
  } catch (e) {
    console.error('  解压失败：' + e.message);
    process.exit(1);
  }

  // 3. 覆盖（跳过受保护项）
  let copied = 0;
  const walk = (src, dest) => {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      const rel = path.relative(ROOT, d).split(path.sep)[0];
      if (PROTECTED.has(rel)) continue;
      if (e.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        walk(s, d);
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
        copied++;
      }
    }
  };
  walk(tmp, ROOT);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  覆盖了 ${copied} 个文件（data/ .env config.json 未动）`);
}

console.log('\n=== 下一步 ===');
console.log('  重启机器人：cd ' + ROOT + ' && 启动机器人.cmd --no-open --no-pause');
console.log('  验证：      node --env-file=.env scripts\\health.mjs');
if (!DRY) console.log(`  回滚：      用 ${path.relative(ROOT, prevZip)} 重新解压覆盖`);
