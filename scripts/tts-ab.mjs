/**
 * CosyVoice2（硅基流动） vs qwen3-tts（百炼）盲听对比
 *
 * node --env-file=.env scripts/tts-ab.mjs [--send]
 *
 * 生成结果放 data/tts-ab/，加 --send 会发到 OWNER_QQ。
 */
import fs from 'node:fs';
import path from 'node:path';
import { synthesize } from '../src/voice.mjs';
import { config } from '../src/config.mjs';

const OWNER = process.env.OWNER_QQ || config.allowedQqs?.[0] || '';
const SF_KEY = process.env.SILICONFLOW_API_KEY || '';
const OUT = path.resolve('data/tts-ab');
fs.mkdirSync(OUT, { recursive: true });

const SF_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
const SF_VOICE = `${SF_MODEL}:claire`; // 温柔女声

// 五句，覆盖她日常的语气；instruction 用自然语言描述怎么演
const LINES = [
  {
    id: '1',
    tag: '撒娇',
    text: '你终于回我了',
    instruct: '用撒娇的语气说，语速慢一点，尾音往上扬',
    emotion: '撒娇',
  },
  {
    id: '2',
    tag: '低落',
    text: '我今天不想说话',
    instruct: '用低落、有点疲惫的语气说，语速慢，声音轻',
    emotion: '难过',
  },
  {
    id: '3',
    tag: '生气',
    text: '你再说一遍试试',
    instruct: '用生气的语气说，语速稍快，音调提高一点',
    emotion: '生气',
  },
  {
    id: '4',
    tag: '日常',
    text: '我在楼下买咖啡',
    instruct: '用平常聊天的语气说，自然一点',
    emotion: '平静',
  },
  {
    id: '5',
    tag: '调侃',
    text: '就你这点出息',
    instruct: '用调侃的语气说，带一点笑意',
    emotion: '开心',
  },
];

const bytes = (p) => {
  try {
    return Math.round(fs.statSync(p).size / 1024);
  } catch {
    return 0;
  }
};

async function genCosyVoice(line) {
  const url = 'https://api.siliconflow.cn/v1/audio/speech';
  const body = {
    model: SF_MODEL,
    voice: SF_VOICE,
    input: `${line.instruct}<|endofprompt|>${line.text}`,
    response_format: 'wav',
    speed: 1.0,
    gain: 0,
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SF_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`CosyVoice ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) throw new Error(`CosyVoice 返回太小：${buf.length} 字节`);
  const file = path.join(OUT, `${line.id}a-cosyvoice.wav`);
  fs.writeFileSync(file, buf);
  return file;
}

async function genQwen(line) {
  const r = await synthesize(line.text, {
    engine: 'bailian',
    bailianKey: process.env.DASHSCOPE_API_KEY,
    bailianBase: config.bailianBase,
    voice: config.voiceName || 'Chelsie',
    emotion: line.emotion,
    dir: OUT,
  });
  // synthesize 返回 { file, ... } 或路径，兼容两种
  const file = typeof r === 'string' ? r : r.file || r.path;
  const dest = path.join(OUT, `${line.id}b-qwen.wav`);
  fs.copyFileSync(file, dest);
  return dest;
}

const results = [];
for (const line of LINES) {
  process.stdout.write(`第 ${line.id} 句（${line.tag}）：${line.text}\n`);
  for (const [name, fn] of [
    ['cosyvoice', genCosyVoice],
    ['qwen', genQwen],
  ]) {
    try {
      const f = await fn(line);
      console.log(`  ✓ ${name}: ${path.basename(f)}  ${bytes(f)} KB`);
      results.push({ line, name, file: f });
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }
}

fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify(results.map((r) => ({ id: r.line.id, tag: r.line.tag, text: r.line.text, engine: r.name, file: path.basename(r.file), kb: bytes(r.file) })), null, 2),
  'utf8',
);
console.log(`\n共 ${results.length} 个文件 → ${OUT}`);

// 发到 QQ（每句先发一行说明，再发语音）
if (process.argv.includes('--send') && OWNER) {
  const { OneBot } = await import('../src/onebot.mjs');
  const { createLogger } = await import('../src/logger.mjs');
  const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });
  bot.start();
  for (let i = 0; i < 80 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));

  const byLine = LINES.map((l) => ({ line: l, items: results.filter((r) => r.line.id === l.id) }));
  for (const { line, items } of byLine) {
    if (!items.length) continue;
    await bot.sendPrivate(OWNER, `第 ${line.id} 句 · ${line.tag}：「${line.text}」`);
    await new Promise((r) => setTimeout(r, 600));
    for (const it of items) {
      try {
        await bot.sendRecord(OWNER, it.file);
        await new Promise((r) => setTimeout(r, 900));
      } catch (e) {
        console.log(`  发送失败 ${it.name}: ${e.message}`);
      }
    }
  }
  bot.stop();
  console.log('已发送到 QQ');
}
