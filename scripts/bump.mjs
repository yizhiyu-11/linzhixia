/**
 * 版本号自增
 *
 *   node scripts/bump.mjs              补丁位 +1（1.1.0 → 1.1.1）
 *   node scripts/bump.mjs --minor      次版本 +1（1.1.0 → 1.2.0，补丁归零）
 *   node scripts/bump.mjs --major      主版本 +1（1.1.0 → 2.0.0）
 *   node scripts/bump.mjs --set 1.3.2  直接指定
 *   node scripts/bump.mjs --dry        只看会变成什么
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const FILE = path.join(ROOT, 'VERSION');
const argv = process.argv.slice(2);
const getArg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : '';
};

const cur = fs.readFileSync(FILE, 'utf8').trim();
const m = cur.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!m) {
  console.error(`VERSION 格式不对：${cur}（应为 1.2.3）`);
  process.exit(1);
}

let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
const set = getArg('--set');

if (set) {
  if (!/^\d+\.\d+\.\d+$/.test(set)) {
    console.error(`--set 格式不对：${set}`);
    process.exit(1);
  }
  [major, minor, patch] = set.split('.').map(Number);
} else if (argv.includes('--major')) {
  major++;
  minor = 0;
  patch = 0;
} else if (argv.includes('--minor')) {
  minor++;
  patch = 0;
} else {
  patch++;
}

const next = `${major}.${minor}.${patch}`;

if (argv.includes('--dry')) {
  console.log(`  ${cur} → ${next}（试运行，未写入）`);
  process.exit(0);
}

fs.writeFileSync(FILE, next + '\n', 'utf8');
console.log(`  ${cur} → ${next}`);
