/**
 * 打包部署包：把当前 git HEAD 打成一个 zip，供云服务器解压。
 *
 *   node scripts/pack-deploy.mjs
 *
 * 产物：backup/deploy/ai-gf-<短哈希>-<时间>.zip + 同名 .json 元信息
 * 特点：用 git archive，自动排除 .gitignore 里的所有东西（data/、.env、node_modules…）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('.');
const GIT = fs.existsSync('E:/git/cmd/git.exe') ? 'E:/git/cmd/git.exe' : 'git';
const OUT_DIR = path.join(ROOT, 'backup', 'deploy');

const git = (...args) => execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' }).trim();

const hash = git('rev-parse', '--short', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;
const subject = git('log', '-1', '--pretty=%s');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);

fs.mkdirSync(OUT_DIR, { recursive: true });
const zipName = `ai-gf-${hash}${dirty ? '-dirty' : ''}-${stamp}.zip`;
const zipPath = path.join(OUT_DIR, zipName);

git('archive', '--format=zip', `-o`, zipPath, 'HEAD');

const meta = {
  version: hash,
  branch,
  dirty,
  subject,
  packedAt: new Date().toISOString(),
  sizeMB: Number((fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)),
  files: Number(git('ls-files').split('\n').length),
};
fs.writeFileSync(zipPath.replace(/\.zip$/, '.json'), JSON.stringify(meta, null, 2), 'utf8');

console.log('打包完成');
console.log(`  文件：${path.relative(ROOT, zipPath)}`);
console.log(`  版本：${hash}${dirty ? '（有未提交改动，建议先 commit）' : ''}  ${branch}`);
console.log(`  内容：${subject}`);
console.log(`  大小：${meta.sizeMB} MB，${meta.files} 个文件`);
console.log('');
console.log('下一步：把 zip 弄到云服务器，然后运行');
console.log('  node scripts/apply-deploy.mjs <zip 路径>');

if (dirty) {
  console.log('');
  console.log('⚠ 工作区有未提交的改动，部署包里不含这些改动。先提交再打包更安全。');
}
