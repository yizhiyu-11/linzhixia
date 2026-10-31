/**
 * 生成升级包（只含程序代码与脚本，约 1-2MB）。
 *
 *   node scripts/build-upgrade.mjs                 版本号取自 VERSION
 *   node scripts/build-upgrade.mjs --note "修了什么"  写进 manifest
 *   node scripts/build-upgrade.mjs --version 1.2.0
 *
 * 产物：dist/林知夏-升级包-v<版本>.zip
 * 结构：
 *   升级.cmd  升级.ps1  manifest.json
 *   app/src  app/server  app/web/dist  app/personas  app/stickers  app/scripts
 *   *.cmd 兼容脚本  compat.json  操作说明.*  使用说明.txt
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'E:/ai-gf';
const DIST = path.join(ROOT, 'dist');

const argv = process.argv.slice(2);
const getArg = (name, def = '') => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};

const baseVersion = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const version = getArg('--version', baseVersion);
const note = getArg('--note', '程序更新');
const NAME = `林知夏-升级包-v${version}`;
const OUT = path.join(DIST, NAME);

const INCLUDE_DIRS = ['src', 'server', 'web/dist', 'personas', 'stickers'];
const INCLUDE_FILES = [
  'scripts/doctor.mjs',
  'scripts/maintain.mjs',
  'scripts/test-onebot.mjs',
  'package.json',
];
const INSTALLER_FILES = [
  '一键安装.cmd',
  '启动.cmd',
  '停止.cmd',
  'stop.ps1',
  'launch.ps1',
  '打开后台.cmd',
  '打开聊天.cmd',
  '打开说明书.cmd',
  '测试连接.cmd',
  '诊断.cmd',
  'diagnose.ps1',
  '修复兼容性.cmd',
  'repair.ps1',
  '自检.cmd',
  '自检.ps1',
  '卸载.cmd',
  '卸载.ps1',
  'wizard.ps1',
  'install.ps1',
  'compat.json',
  '使用说明.txt',
  '操作说明.html',
  '操作说明.txt',
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

console.log(`\n=== 打包升级包 v${version} ===`);
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const files = [];
const put = (from, rel) => {
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
  if (fs.statSync(to).isFile()) {
    files.push({ path: rel.replace(/\\/g, '/'), sha256: sha256(to), size: fs.statSync(to).size });
  } else {
    for (const f of fs.readdirSync(to, { recursive: true })) {
      const p = path.join(to, f);
      if (fs.statSync(p).isFile()) files.push({ path: path.join(rel, f).replace(/\\/g, '/'), sha256: sha256(p), size: fs.statSync(p).size });
    }
  }
};

// app 代码
for (const d of INCLUDE_DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) continue;
  put(src, path.join('_patch', 'app', d));
}
for (const f of INCLUDE_FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) continue;
  put(src, path.join('_patch', 'app', f));
}

// 版本文件
const verFile = path.join(OUT, '_patch', 'app', 'version.json');
fs.mkdirSync(path.dirname(verFile), { recursive: true });
fs.writeFileSync(verFile, JSON.stringify({ version, builtAt: new Date().toISOString(), note }, null, 2), 'utf8');

// 顶层脚本与文档
for (const f of INSTALLER_FILES) {
  const src = path.join(ROOT, 'installer', f);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(OUT, f), { force: true });
  files.push({ path: f, sha256: sha256(path.join(OUT, f)), size: fs.statSync(path.join(OUT, f)).size });
}

// 升级入口
for (const f of ['升级.cmd', '升级.ps1']) {
  const src = path.join(ROOT, 'installer', f);
  if (!fs.existsSync(src)) {
    console.warn(`  ! 缺少 ${f}`);
    continue;
  }
  fs.cpSync(src, path.join(OUT, f), { force: true });
}

// manifest
const manifest = {
  kind: 'upgrade',
  version,
  note,
  createdAt: new Date().toISOString(),
  requiresBase: '1.0.0',
  fileCount: files.length,
  files,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2);
console.log(`  文件数：${files.length}`);
console.log(`  未压缩：${totalMB} MB`);

const zip = path.join(DIST, `${NAME}.zip`);
if (fs.existsSync(zip)) fs.rmSync(zip, { force: true });
execFileSync('tar', ['-a', '-cf', zip, '-C', DIST, NAME], { stdio: 'inherit' });
console.log(`  zip：${(fs.statSync(zip).size / 1024 / 1024).toFixed(2)} MB → ${zip}`);
console.log('完成。\n');
