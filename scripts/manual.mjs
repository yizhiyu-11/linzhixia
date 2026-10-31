/**
 * 生成操作参数手册：docs/manual.md
 *
 *   node --env-file=.env scripts/manual.mjs
 *
 * 数据来自 server/manual-data.mjs（和后台「手册」页共用同一份）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildManual } from '../server/manual-data.mjs';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'docs', 'manual.md');
const m = buildManual();

const d = new Date(m.generatedAt);
const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const lines = [];
const w = (s = '') => lines.push(s);

w('# 林知夏 · 操作参数手册');
w('');
w(`> 生成时间：${stamp}　·　参数来自 \`server/store.mjs\`，与代码同源，不会对不上。`);
w('> 重新生成：`node --env-file=.env scripts\\manual.mjs`　·　后台也有「手册」页（可搜索）。');
w('');

w('## 一、日常操作');
w('');
w('| 要做的事 | 怎么做 |');
w('|---|---|');
w('| 启动 | 双击 `启动机器人.cmd`（先体检，再拉起 NapCat，最后启动机器人） |');
w('| 只体检不启动 | 双击 `诊断.cmd` |');
w('| 停止 | `node scripts\\stop.mjs`（只停机器人）；`--all` 连 NapCat 一起停 |');
w('| 看管理后台 | 启动成功后会打印地址，形如 `http://127.0.0.1:3870/?token=…` |');
w('| 手动开后台 | `open-console.cmd`（只读 data/web-token，不启动任何东西） |');
w('| 看她在干嘛 | 后台「对话回放」（每轮记了感知/裁决/场景/花费） |');
w('| 改人设 | 后台「人设」页 |');
w('| 改行为参数 | 后台对应页面，或直接改 `config.json`（重启后生效） |');
w('| 改密钥 | 只能改 `.env`，然后重启 |');
w('');
w('### 三个入口的区别');
w('');
w('```');
w('启动机器人.cmd   体检 → 拉 NapCat → 启动 bot → 打开后台（失败不关窗）');
w('诊断.cmd         只体检，不动任何东西（带网络检测）');
w('boot-all.cmd     兼容旧快捷方式，等价于启动但不弹浏览器');
w('```');
w('');

w('## 二、参数总表');
w('');
w(`> ${m.counts.modules} 个模块、${m.counts.fields} 项参数，都在 \`config.json\` 里。`);
w('> 「当前值」是生成手册这一刻的实际配置。');
w('');
for (const mod of m.modules) {
  w(`### ${mod.title}　\`${mod.id}\``);
  w('');
  if (mod.desc) w(`> ${mod.desc}`);
  w('');
  w('| 参数 | 含义 | 取值 | 当前值 |');
  w('|---|---|---|---|');
  for (const f of mod.fields) {
    w(`| \`${f.key}\`<br>${f.label} | ${f.help.replace(/\|/g, '\\|')} | ${f.range} | ${f.value} |`);
  }
  w('');
}

w('## 三、.env 变量');
w('');
w('> 这些只在启动时读一次，**改完必须重启**。密钥类统一在这里，不进 `config.json`。');
w('');
w('| 变量 | 说明 | 当前值 |');
w('|---|---|---|');
for (const e of m.env) {
  w(`| \`${e.key}\` | ${e.title}　${e.help} | \`${e.value || '（空）'}\` |`);
}
w('');

w('## 三·五、三套调参预设');
w('');
w('不想逐项调的话，从这里挑一套抄。改完保存即可（config 走热更新）。');
w('');
for (const p of m.presets) {
  w(`### ${p.title}`);
  w('');
  w('```');
  for (const [k, v, note] of p.items) w(`${k.padEnd(26)} ${v}${note ? '   # ' + note : ''}`);
  w('```');
  if (p.note) w(p.note);
  w('');
}

w('## 四、运维脚本');
w('');
w('| 脚本 | 用途 | 用法 |');
w('|---|---|---|');
for (const [name, use, cmd] of m.scripts) w(`| \`${name}\` | ${use} | \`${cmd}\` |`);
w('');

w('## 五、故障排查');
w('');
w('| 现象 | 原因 | 怎么办 |');
w('|---|---|---|');
for (const [a, b, c] of m.troubles) w(`| ${a} | ${b} | ${c} |`);
w('');

w('## 六、参数怎么改、什么时候生效');
w('');
w('| 改哪里 | 生效时间 |');
w('|---|---|');
for (const [a, b] of m.effects) w(`| ${a} | ${b} |`);
w('');
w('> 前端（web/）改动要重新构建：`cd web && node node_modules\\vite\\bin\\vite.js build`。');
w('');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`已生成 ${path.relative(ROOT, OUT)}`);
console.log(`  模块 ${m.counts.modules} 个，参数 ${m.counts.fields} 项，.env ${m.counts.env} 个`);
