/**
 * 一条命令发版：版本号 +1 → 出完整包 → 出升级包
 *
 *   node scripts/release.mjs                    补丁位 +1 后发版
 *   node scripts/release.mjs --minor            次版本 +1
 *   node scripts/release.mjs --note "修了什么"   写进升级包 manifest
 *   node scripts/release.mjs --no-bump          不发版本号，用当前 VERSION
 *
 * 产物：
 *   dist\林知夏-本地版-v<版本>.zip    完整包（给新客户）
 *   dist\林知夏-升级包-v<版本>.zip    升级包（给老客户）
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const NODE = process.execPath;
const DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const getArg = (n, d = '') => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};

const note = getArg('--note', '程序更新');
const noBump = argv.includes('--no-bump');

console.log('\n=== 发版 ===');
if (!noBump) {
  const bumpArgs = [];
  if (argv.includes('--minor')) bumpArgs.push('--minor');
  else if (argv.includes('--major')) bumpArgs.push('--major');
  const set = getArg('--set');
  if (set) bumpArgs.push('--set', set);
  execFileSync(NODE, [path.join(ROOT, 'scripts', 'bump.mjs'), ...bumpArgs], { stdio: 'inherit' });
}
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
console.log(`  版本：v${version}`);

console.log('\n[1/2] 完整包');
execFileSync(NODE, [path.join(ROOT, 'scripts', 'build-installer.mjs'), '--zip'], { stdio: 'inherit' });

console.log('\n[2/2] 升级包');
execFileSync(NODE, [path.join(ROOT, 'scripts', 'build-upgrade.mjs'), '--version', version, '--note', note], {
  stdio: 'inherit',
});

const pick = (re) => fs.readdirSync(DIST).filter((f) => re.test(f) && f.endsWith('.zip'));
const full = pick(new RegExp(`^林知夏-本地版-v${version.replace(/\./g, '\\.')}\\.zip$`));
const up = pick(new RegExp(`^林知夏-升级包-v${version.replace(/\./g, '\\.')}\\.zip$`));
const meta = (f) => {
  const p = path.join(DIST, f);
  if (!fs.existsSync(p)) return null;
  return {
    file: f,
    mb: (fs.statSync(p).size / 1024 / 1024).toFixed(2),
    sha: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  };
};

console.log('\n=== 产物 ===');
for (const f of [...full, ...up]) {
  const m = meta(f);
  if (m) console.log(`  ${m.file}  ${m.mb} MB\n    SHA256 ${m.sha}`);
}
console.log(`\n发版完成：v${version}\n`);
