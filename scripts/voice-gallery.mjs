/**
 * 音色试听：给指定 QQ 逐条发「文字标签 + 该音色的语音」。
 * node --env-file=.env scripts/voice-gallery.mjs 10000002 Chery Serena ...
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
  console.error('用法: node --env-file=.env scripts/voice-gallery.mjs <QQ> <音色1> [音色2] ...');
  process.exit(1);
}

const SAMPLE = '欸，你怎么才回我呀。我等你等得都快睡着了。';
const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('warn') });

bot.on('ready', async () => {
  try {
    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i];
      const tag = `【${i + 1}/${voices.length}】${voice}`;
      try {
        const v = await synthesize(SAMPLE, {
          voice,
          engine: 'bailian',
          bailianKey: config.bailianKey,
          bailianBase: config.bailianBase,
        });
        await bot.sendPrivate(qq, tag);
        await new Promise((r) => setTimeout(r, 350));
        await bot.sendRecord(qq, v.filePath);
        console.log(`✔ ${tag}  ${(v.bytes / 1024).toFixed(0)} KB`);
      } catch (e) {
        await bot.sendPrivate(qq, `${tag}（合成失败：${e.message.slice(0, 40)}）`).catch(() => {});
        console.log(`✘ ${tag}  ${e.message.slice(0, 60)}`);
      }
      await new Promise((r) => setTimeout(r, 900));
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
}, 180_000);
