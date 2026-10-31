/**
 * 打包「本地版」一键安装包。
 *
 *   node scripts/build-installer.mjs            # 组装到 dist\林知夏-本地版-v1.0
 *   node scripts/build-installer.mjs --zip      # 组装后再压缩成 zip
 *
 * 结构：
 *   林知夏-本地版-v1.0/
 *     一键安装.cmd  打开聊天.cmd  打开后台.cmd  停止.cmd  使用说明.txt
 *     install.ps1
 *     runtime/node.exe
 *     app/  (src server web/dist personas stickers scripts package.json node_modules .env.example data logs)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/ai-gf';
const VERSION = 'v' + fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const NAME = `林知夏-本地版-${VERSION}`;
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, NAME);
const NODE_SRC = 'C:/Users/you/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe';
const NODE_RUNTIME = NODE_SRC;

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
};
const sizeMB = (p) => {
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => {
      const f = path.join(d, e.name);
      return s + (e.isDirectory() ? walk(f) : fs.statSync(f).size);
    }, 0);
  return (walk(p) / 1024 / 1024).toFixed(1);
};

console.log(`\n=== 打包 ${NAME} ===`);
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. runtime
console.log('  复制 Node 运行时…');
copy(NODE_SRC, path.join(OUT, 'runtime', 'node.exe'));

// 2. app 代码
console.log('  复制程序代码…');
const APP = path.join(OUT, 'app');
copy(path.join(ROOT, 'src'), path.join(APP, 'src'));
copy(path.join(ROOT, 'server'), path.join(APP, 'server'));
copy(path.join(ROOT, 'personas'), path.join(APP, 'personas'));
copy(path.join(ROOT, 'stickers'), path.join(APP, 'stickers'));
copy(path.join(ROOT, 'web', 'dist'), path.join(APP, 'web', 'dist'));

// 只带客户用得上的脚本（不带开发/商业相关的）
console.log('  复制必要脚本…');
for (const f of ['doctor.mjs', 'maintain.mjs']) {
  copy(path.join(ROOT, 'scripts', f), path.join(APP, 'scripts', f));
}

copy(path.join(ROOT, 'installer', 'test-onebot.mjs'), path.join(APP, 'scripts', 'test-onebot.mjs'));

// 客户版 package.json：只保留运行时依赖（emoji 是开发依赖，74MB，不装）
fs.writeFileSync(
  path.join(APP, 'package.json'),
  JSON.stringify(
    {
      name: 'linzhixia-local',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { 'msedge-tts': '^2.1.0', sharp: '^0.35.5', ws: '^8.18.0' },
    },
    null,
    2,
  ),
  'utf8',
);

// 3. 安装运行时依赖（pnpm hoisted：真实目录，不用 junction，客户机上才不会失效）
console.log('  安装运行时依赖（约 25MB）…');
const PNPM = 'C:/Users/you/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs';
try {
  execFileSync(NODE_RUNTIME, [PNPM, 'install', '--prod', '--config.node-linker=hoisted', '--registry=https://registry.npmmirror.com'], {
    cwd: APP,
    stdio: 'inherit',
  });
} catch {
  // pnpm 10 会因"忽略构建脚本"返回非零码，但包其实装好了；以结果为准
}
for (const must of ['ws', 'sharp', 'msedge-tts']) {
  if (!fs.existsSync(path.join(APP, 'node_modules', must))) {
    throw new Error(`依赖缺失：${must}`);
  }
}

// 4. 空数据目录
fs.mkdirSync(path.join(APP, 'data'), { recursive: true });


// 5. 客户版 .env 模板
const envTpl = [
  '# 林知夏 本地版配置（安装程序会覆盖 API Key 与端口）',
  'DEEPSEEK_API_KEY=',
  'DEEPSEEK_BASE_URL=https://api.deepseek.com',
  'DEEPSEEK_MODEL=deepseek-chat',
  'DEEPSEEK_TEMPERATURE=1.1',
  'MAX_TOKENS=500',
  'PERSONA=default',
  'HISTORY_TURNS=8',
  'WEB_PORT=3870',
  '# 下面这些由安装程序按你的回答填写',
  'ONEBOT_DISABLED=0',
  'ONEBOT_WS_URL=ws://127.0.0.1:3001',
  'ONEBOT_TOKEN=',
  'ALLOWED_QQS=',
  'OWNER_QQ=',
  'PROACTIVE=0',
  'VOICE=0',
  'BOT_ENV=local',
  'LOG_LEVEL=info',
].join('\n');
fs.writeFileSync(path.join(APP, '.env.example'), envTpl, 'utf8');

// 版本文件（升级包靠它判断新旧）
const ver = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
fs.writeFileSync(
  path.join(APP, 'version.json'),
  JSON.stringify({ version: ver, builtAt: new Date().toISOString() }, null, 2),
  'utf8',
);

// 6. 安装器文件
console.log('  复制安装器…');
for (const f of ['一键安装.cmd', '启动.cmd', '停止.cmd', 'stop.ps1', '打开聊天.cmd', '打开后台.cmd', '测试连接.cmd', '诊断.cmd', 'diagnose.ps1', 'wizard.ps1', 'install.ps1', 'repair.ps1', 'launch.ps1', 'compat.json', '修复兼容性.cmd', '打开说明书.cmd', '自检.cmd', '自检.ps1', '卸载.cmd', '卸载.ps1', '升级.cmd', '升级.ps1', '操作说明.html', '操作说明.txt', '使用说明.txt']) {
  copy(path.join(ROOT, 'installer', f), path.join(OUT, f));
}

// 7. 所有 .ps1 必须是 UTF-8 with BOM（PowerShell 5.1 否则按 ANSI 读，中文会乱码甚至语法错误）
console.log('  处理脚本编码（全部 .ps1 加 BOM）…');
const bom = Buffer.from([0xef, 0xbb, 0xbf]);
const fixBom = (file) => {
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  if (buf[0] !== 0xef) fs.writeFileSync(file, Buffer.concat([bom, buf]));
};
for (const name of fs.readdirSync(OUT)) {
  if (name.toLowerCase().endsWith('.ps1')) fixBom(path.join(OUT, name));
}
if (fs.existsSync(path.join(APP, 'scripts'))) {
  for (const name of fs.readdirSync(path.join(APP, 'scripts'))) {
    if (name.toLowerCase().endsWith('.ps1')) fixBom(path.join(APP, 'scripts', name));
  }
}

// 8. 清理不该给客户的东西
const junk = ['.env', 'data/bot.db', 'data/bot.db-wal', 'data/bot.db-shm', 'data/web-token', 'data/sandbox.db'];
for (const j of junk) {
  const p = path.join(APP, j);
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

console.log(`\n  体积：${sizeMB(OUT)} MB`);
console.log(`  位置：${OUT}`);

if (process.argv.includes('--zip')) {
  const zip = path.join(DIST, `${NAME}.zip`);
  if (fs.existsSync(zip)) fs.rmSync(zip, { force: true });
  console.log('\n  压缩中（可能要一两分钟）…');
  execFileSync('tar', ['-a', '-cf', zip, '-C', DIST, NAME], { stdio: 'inherit' });
  console.log(`  zip：${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB → ${zip}`);
}
console.log('\n完成。\n');
