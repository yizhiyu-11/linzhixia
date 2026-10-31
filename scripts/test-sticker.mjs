/**
 * 表情包发送自测：发一张指定的到某个 QQ。
 * node --env-file=.env scripts/test-sticker.mjs 10000002 撒娇
 * 参数可以是分类名，也可以是某张的 id。
 */
import process from 'node:process';
import { config } from '../src/config.mjs';
import { OneBot } from '../src/onebot.mjs';
import { loadStickers, findSticker, pickByCategory } from '../src/sticker.mjs';
import { createLogger } from '../src/logger.mjs';

const qq = process.argv[2] || config.allowedQqs[0];
const arg = process.argv[3] || '开心';
const list = loadStickers('stickers');

const st = findSticker(list, arg) || pickByCategory(list, arg, []);

if (!st) {
  console.error(`没找到「${arg}」`);
  console.error(`分类：${[...new Set(list.map((s) => s.category))].join(', ')}`);
  process.exit(1);
}

const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log: createLogger('info') });
bot.on('ready', async () => {
  try {
    await bot.sendImage(qq, st.file);
    console.log(`✔ 已发送 ${st.category}/${st.id} → ${qq}`);
  } catch (e) {
    console.error('✘ 失败：', e.message);
  } finally {
    bot.stop();
    setTimeout(() => process.exit(0), 300);
  }
});
bot.start();
setTimeout(() => {
  console.error('超时');
  process.exit(1);
}, 30_000);
