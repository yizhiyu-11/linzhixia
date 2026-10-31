/**
 * 语音链路自测：合成一段语音并真的发到指定 QQ。
 * 用法：node --env-file=.env scripts/try-voice.mjs [QQ号]
 */
import process from 'node:process';
import { config } from '../src/config.mjs';
import { OneBot } from '../src/onebot.mjs';
import { synthesize, closeVoice } from '../src/voice.mjs';
import { createLogger } from '../src/logger.mjs';

const qq = process.argv[2] || config.allowedQqs[0] || config.ownerQq;
if (!qq) {
  console.error('没指定 QQ 号，也没配 ALLOWED_QQS');
  process.exit(1);
}

const log = createLogger('info');
const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log });

bot.on('ready', async () => {
  try {
    const text = '欸，你在干嘛呀。我刚洗完澡，头发还在滴水。';
    console.log('合成中…');
    const t0 = Date.now();
    const v = await synthesize(text, {
      voice: config.voiceName,
      engine: config.voiceEngine,
      bailianKey: config.bailianKey,
      bailianBase: config.bailianBase,
      sapiVoice: config.voiceSapi,
    });
    console.log(`合成完成：${v.engine}，${(v.bytes / 1024).toFixed(1)} KB，${Date.now() - t0}ms`);
    await bot.sendRecord(qq, v.filePath);
    console.log(`已发送到 ${qq} ✅`);
  } catch (e) {
    console.error('失败：', e.message);
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
}, 60_000);
