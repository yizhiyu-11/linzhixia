/**
 * TTS 自测：只合成不发送。
 * node --env-file=.env scripts/test-tts.mjs
 */
import { config } from '../src/config.mjs';
import { synthesize, closeVoice } from '../src/voice.mjs';

const samples = ['欸，你终于回我了。', '我刚洗完澡，头发还在滴水，你先说。', '今天好累啊，不想动了。'];

for (const text of samples) {
  const t0 = Date.now();
  try {
    const r = await synthesize(text, {
      voice: config.voiceName,
      engine: config.voiceEngine,
      bailianKey: config.bailianKey,
      bailianBase: config.bailianBase,
      sapiVoice: config.voiceSapi,
    });
    const ms = Date.now() - t0;
    console.log(
      `[${r.engine}] ${(r.bytes / 1024).toFixed(1)} KB  ${ms} ms  字符=${r.characters ?? '?'}  「${text}」`,
    );
  } catch (e) {
    console.log(`[失败] ${e.message.slice(0, 100)}  「${text}」`);
  }
}
closeVoice();
