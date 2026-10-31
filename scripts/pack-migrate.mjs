/**
 * 打迁移包：把「运行时状态」打包，供云服务器第一次落地时用。
 *
 *   node scripts/pack-migrate.mjs
 *
 * 包含：.env（密钥）、config.json（生产配置）、data/web-token、
 *       data/bot.db（记忆，用 VACUUM INTO 取一致性快照）
 * 不包含：代码（走 pack-deploy）、node_modules、日志
 *
 * ⚠ 这个包里有 API key 和全部聊天记录，别传网盘、别发群里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'backup', 'deploy');
fs.mkdirSync(OUT_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const stage = path.join(OUT_DIR, `_migrate_${stamp}`);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const copy = (rel, destName = path.basename(rel)) => {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    console.log(`  跳过（不存在）：${rel}`);
    return null;
  }
  const dest = path.join(stage, destName);
  fs.copyFileSync(src, dest);
  console.log(`  ✓ ${rel} → ${destName}（${(fs.statSync(dest).size / 1024).toFixed(0)} KB）`);
  return dest;
};

console.log('=== 收集 ===');
copy('.env');
copy('config.json');
copy('data/web-token');

// 数据库：VACUUM INTO 拿一致快照（机器人正在跑也安全）
console.log('  数据库快照…');
const dbSrc = path.join(ROOT, 'data', 'bot.db');
const dbDest = path.join(stage, 'bot.db');
let dbOk = false;
try {
  const db = new DatabaseSync(dbSrc);
  db.prepare('VACUUM INTO ?').run(dbDest);
  db.close();
  dbOk = true;
  const size = (fs.statSync(dbDest).size / 1024).toFixed(0);
  console.log(`  ✓ data/bot.db → bot.db（${size} KB，一致性快照）`);
} catch (e) {
  console.log(`  ✗ 数据库快照失败：${e.message}`);
}

// 说明文件
const readme = `迁移包说明
==========

这个压缩包是「运行时状态」，不是代码。
代码用 scripts\\pack-deploy.mjs 打的另一个包。

内容
----
.env            密钥（DEEPSEEK_API_KEY / DASHSCOPE_API_KEY 等）
config.json     生产配置（后台改过的参数都在这里）
web-token       管理后台的 token
bot.db          聊天记忆（VACUUM INTO 快照，可直接用）

怎么用（云服务器上）
--------------------
1. 先把代码包解开到 E:\\ai-gf（pack-deploy 打的那个 zip）
2. 把这个包里的文件按下面的位置放：
     .env          → E:\\ai-gf\\.env
     config.json   → E:\\ai-gf\\config.json
     web-token     → E:\\ai-gf\\data\\web-token
     bot.db        → E:\\ai-gf\\data\\bot.db
3. 装依赖：npm install --registry=https://registry.npmmirror.com
4. 启动：.\\启动机器人.cmd

注意
----
· 这个包含 API 密钥和全部聊天记录，别传网盘、别发群
· 放好之后把压缩包删掉
· data\\ 下还有别的库（sandbox.db / preview.db），都是测试数据，不用带
· 如果云上要重新登录 QQ，看 docs\\migrate-windows.md 的风控一节
`;
fs.writeFileSync(path.join(stage, '迁移说明.txt'), readme, 'utf8');

// 打 zip
const zipPath = path.join(OUT_DIR, `migrate-${stamp}.zip`);
console.log('\n=== 压缩 ===');
try {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${stage.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`],
    { stdio: 'inherit', timeout: 300000, windowsHide: true },
  );
  fs.rmSync(stage, { recursive: true, force: true });
} catch (e) {
  console.error('压缩失败：' + e.message);
  process.exit(1);
}

const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log('\n迁移包完成');
console.log(`  ${path.relative(ROOT, zipPath)}  ${mb} MB`);
console.log(`  数据库：${dbOk ? '✓ 已包含' : '✗ 失败'}`);
console.log('');
console.log('⚠ 里面有 API 密钥和全部聊天记录：用完删掉，别传网盘。');
