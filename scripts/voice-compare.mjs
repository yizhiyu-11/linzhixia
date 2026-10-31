/**
 * 给指定的 QQ 连发几条不同音色的测试语音，方便对比。
 * node --env-file=.env scripts/voice-compare.mjs 10000002 Serena Chelsie
 */
import process from 'node:process';
import { config } from '../src/config.mjs';
import { OneBot } from '../src/onebot.mjs';
import { synthesize, closeVoice } from '../src/voice.mjs';
import { createLogger } from '../src/logger.mjs';

const args = process.argv.slice(2);
const qq = args[0] || config.allowedQqs[0];
const voices = args.slice(1);
if (!qq || !voices.length) {
  console.error('用法: node --env-file=.env scripts/voice-compare.mjs <QQ> <音色1> [音色2] ...');
  process.exit(1);
}

const text = '欸，你在干嘛呀。我刚洗完澡，头发还在滴水，你先说。';
const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });

bot.on('ready', async () => {
  try {
    for (const voice of voices) {
      const t0 = Date.now();
      try {
        const v = await synthesize(text, {
          voice,
          engine: 'bailian',
          bailianKey: config.bailianKey,
          bailianBase: config.bailianBase,
        });
        await bot.sendRecord(qq, v.filePath);
        console.log(`✔ ${voice}：${(v.bytes / 1024).toFixed(0)} KB，${Date.now() - t0} ms，已发送`);
      } catch (e) {
        console.log(`✘ ${voice}：${e.message.slice(0, 80)}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    closeVoice();
    bot.stop();
    process.exit(0);
  }
});

bot.start();
setTimeout(() => {
  console.error('超时');
  process.exit(1);
}, 120_000);
