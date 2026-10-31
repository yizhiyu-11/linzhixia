/**
 * 发图给指定 QQ（用于让她把候选表情包发给人看）
 * node --env-file=.env scripts/send-images.mjs <qq> <file...>
 */
import path from 'node:path';
import { OneBot } from '../src/onebot.mjs';
import { config } from '../src/config.mjs';
import { createLogger } from '../src/logger.mjs';

const [qq, ...files] = process.argv.slice(2);
if (!qq || !files.length) {
  console.error('用法: node scripts/send-images.mjs <qq> <file...>');
  process.exit(1);
}

const log = createLogger('info');
const bot = new OneBot({ url: config.wsUrl, token: config.wsToken, log });
bot.start();

for (let i = 0; i < 60 && !bot.ready; i++) await new Promise((r) => setTimeout(r, 250));

for (const f of files) {
  const abs = path.resolve(f);
  try {
    await bot.sendImage(qq, abs);
    log.info(`已发送 ${path.basename(abs)}`);
  } catch (e) {
    log.warn(`发送失败 ${path.basename(abs)}：${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}

await new Promise((r) => setTimeout(r, 500));
bot.stop();
process.exit(0);
