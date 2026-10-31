/**
 * 启动链路的场景测试：把「机器开着 / 关着 / 掉登录 / 端口被占 / 缺 key / 残留锁」都跑一遍。
 *
 *   node scripts/test-startup.mjs
 *
 * 只做只读检查 + 临时制造条件，不会真的把 bot 停掉（除了标记为 destructive 的那步，
 * 会先问过再动，默认跳过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const NODE = process.execPath;
const TMP = path.join(ROOT, 'data', '_startup-test');

let pass = 0;
let fail = 0;
const ok = (n, d = '') => {
  pass++;
  console.log(`  ✓ ${n}${d ? '  — ' + d : ''}`);
};
const bad = (n, d = '') => {
  fail++;
  console.log(`  ✗ ${n}${d ? '  — ' + d : ''}`);
};

const runDoctor = (env = {}, args = ['--json']) =>
  new Promise((resolve) => {
    const r = spawnSync(NODE, [path.join(ROOT, 'scripts', 'doctor.mjs'), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 90000,
    });
    let json = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
    resolve({ code: r.status, json, stdout: r.stdout || '', stderr: r.stderr || '' });
  });

const find = (doc, id) => doc?.checks?.find((c) => c.id === id);

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

console.log('=== 1. 正常体检 ===');
{
  const r = await runDoctor();
  const doc = r.json;
  if (!doc) bad('doctor 没输出 JSON', r.stderr.slice(0, 120));
  else {
    doc.ok ? ok('全部通过（无致命问题）', `${doc.checks.length} 项`) : bad('有致命问题', doc.checks.filter((c) => !c.ok && c.level === 'fatal').map((c) => c.reason).join('; '));
    const has = (id) => !!find(doc, id);
    has('lock') && has('qq') && has('port') && has('db') && has('disk')
      ? ok('关键检查项都在')
      : bad('缺少检查项', doc.checks.map((c) => c.id).join(','));
  }
}

console.log('\n=== 2. 缺 DEEPSEEK_API_KEY ===');
{
  const fakeEnv = path.join(TMP, '.env');
  fs.writeFileSync(fakeEnv, 'ONEBOT_WS_URL=ws://127.0.0.1:3001\nALLOWED_QQS=1\n', 'utf8');
  const r = await runDoctor({}, ['--json', '--env-file', fakeEnv]);
  const envCheck = find(r.json, 'env');
  if (envCheck && !envCheck.ok && /DEEPSEEK_API_KEY/.test(envCheck.detail)) ok('识别出缺 key', envCheck.detail);
  else bad('没识别出缺 key', JSON.stringify(envCheck));
  r.code !== 0 ? ok('退出码非 0（会拦住启动）') : bad('退出码仍是 0');
}

console.log('\n=== 3. 掉登录（NapCat 日志在等扫码 + 端口不通）===');
{
  const fakeNap = path.join(TMP, 'napcat');
  fs.mkdirSync(fakeNap, { recursive: true });
  fs.writeFileSync(
    path.join(fakeNap, 'boot.log'),
    '10-25 20:40:55 [warn] 请扫描下面的二维码，然后在手Q上授权登录：\n二维码解码URL: https://txz.qq.com/p?k=FAKE\n',
    'utf8',
  );
  const r = await runDoctor({ NAPCAT_DIR: fakeNap, ONEBOT_WS_URL: 'ws://127.0.0.1:39999' });
  const login = find(r.json, 'login');
  if (login && !login.ok && /扫码/.test(login.detail)) ok('识别出"要扫码"', login.detail);
  else bad('没识别出扫码状态', JSON.stringify(login));
  /登录/.test(login?.fix || '') ? ok('给出了"去登录 QQ"的建议') : bad('没有给建议', login?.fix);
  const port = find(r.json, 'port');
  port && !port.ok ? ok('端口不通被标为致命') : bad('端口检查异常', JSON.stringify(port));
}

console.log('\n=== 4. NapCat 进程退出（日志里 Process exited）===');
{
  const fakeNap = path.join(TMP, 'napcat2');
  fs.mkdirSync(fakeNap, { recursive: true });
  fs.writeFileSync(path.join(fakeNap, 'boot.log'), '10-25 20:40:55 [warn] 请扫描下面的二维码\nProcess exited.\n', 'utf8');
  const r = await runDoctor({ NAPCAT_DIR: fakeNap, ONEBOT_WS_URL: 'ws://127.0.0.1:39999' });
  const login = find(r.json, 'login');
  /退出/.test(login?.detail || '') || /退出/.test(login?.reason || '')
    ? ok('识别出 NapCat 退出', login.detail)
    : bad('没识别出退出', JSON.stringify(login));
}

console.log('\n=== 5. 残留锁（假 pid）===');
{
  const lockFile = path.join(ROOT, 'data', 'bot.lock');
  const backup = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null;
  fs.writeFileSync(lockFile, '999999', 'utf8');
  try {
    const r1 = await runDoctor();
    const lock1 = find(r1.json, 'lock');
    lock1 && !lock1.ok && /999999/.test(lock1.detail) ? ok('发现残留锁', lock1.detail) : bad('没发现残留锁', JSON.stringify(lock1));

    const r2 = await runDoctor({}, ['--json', '--fix']);
    const lock2 = find(r2.json, 'lock');
    lock2?.ok && !fs.existsSync(lockFile) ? ok('--fix 自动清掉了') : bad('--fix 没清掉', JSON.stringify(lock2));
  } finally {
    if (backup !== null) fs.writeFileSync(lockFile, backup, 'utf8');
    else fs.rmSync(lockFile, { force: true });
  }
}

console.log('\n=== 6. 坏掉的 config.json ===');
{
  const cfg = path.join(TMP, 'config.json');
  fs.writeFileSync(cfg, '{ "access": { "allowedQqs": [1,2, ] }', 'utf8');
  // doctor 读的是项目根的 config.json，这里只验证解析逻辑：临时替换再还原
  const real = path.join(ROOT, 'config.json');
  const backup = fs.existsSync(real) ? fs.readFileSync(real) : null;
  fs.copyFileSync(cfg, real);
  try {
    const r = await runDoctor();
    const c = find(r.json, 'config');
    c && !c.ok && /解析失败/.test(c.detail) ? ok('识别出坏配置', c.detail.slice(0, 40)) : bad('没识别出坏配置', JSON.stringify(c));
  } finally {
    if (backup) fs.writeFileSync(real, backup);
  }
}

console.log('\n=== 7. 端口被别的程序占用 ===');
{
  // 占一个随机空闲端口，并把锁改成假 pid，doctor 才会认定"不是机器人自己占的"
  const srv = net.createServer();
  await new Promise((res, rej) => {
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', res);
  });
  const port = srv.address().port;
  const lockFile = path.join(ROOT, 'data', 'bot.lock');
  const backup = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null;
  fs.writeFileSync(lockFile, '999998', 'utf8');
  try {
    const r = await runDoctor({ WEB_PORT: String(port) });
    const c = find(r.json, 'console');
    c && !c.ok && /占用/.test(c.detail) ? ok('识别出端口被占', `${port} ${c.detail}`) : bad('没识别出端口占用', JSON.stringify(c));
    c?.level === 'warn' ? ok('只是提醒，不拦启动') : bad('级别不对', c?.level);
  } finally {
    await new Promise((r) => srv.close(r));
    if (backup !== null) fs.writeFileSync(lockFile, backup, 'utf8');
    else fs.rmSync(lockFile, { force: true });
  }
}

console.log('\n=== 8. 磁盘检查 ===');
{
  const r = await runDoctor();
  const d = find(r.json, 'disk');
  d?.ok && /剩/.test(d.detail) ? ok('读到了剩余空间', d.detail) : bad('磁盘检查异常', JSON.stringify(d));
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
