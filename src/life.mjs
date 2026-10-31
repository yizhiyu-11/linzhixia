/**
 * "她现在在干什么" —— 给回复一个生活背景。
 * 没有这个，她只能就着聊天记录反应，说的话永远是"关于你"的，没有人味。
 *
 * 做法很土但有效：一个活动池，随机挑一个，维持 20-70 分钟，然后换下一个。
 */

const ACTIVITIES = [
  '在通勤的地铁上，站着',
  '刚洗完澡，头发还湿着',
  '在楼下便利店买水',
  '窝在沙发上刷手机',
  '在阳台给多肉浇水',
  '在煮一锅面，等水开',
  '在等外卖，已经超时十分钟',
  '在收拾房间，把衣服叠了又乱',
  '插着耳机听歌，没干别的',
  '在改一份稿子，改到第三版',
  '在沙发上睡着了刚醒，有点懵',
  '在楼下散步，风挺大',
  '在泡茶，水温老是掌握不好',
  '在翻相册，翻到去年的照片',
  '在排队买咖啡，前面还有五个人',
  '刚吃完饭，有点撑',
  '在等洗衣机洗完',
  '在涂指甲油，涂歪了',
];

const MIN_HOLD_MS = 20 * 60_000;
const MAX_HOLD_MS = 70 * 60_000;

function pick(list, exclude) {
  const pool = list.filter((x) => x !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] || list[0];
}

/**
 * 取当前活动；过期就换一个。
 * @returns {{ text: string, minutes: number }}
 */
export function currentActivity(memory, qq) {
  const text = memory.getState(qq, 'activity');
  const since = Number(memory.getState(qq, 'activitySince', 0));
  const now = Date.now();

  if (text && since && now - since < MIN_HOLD_MS) {
    return { text, minutes: Math.round((now - since) / 60_000) };
  }

  const next = pick(ACTIVITIES, text);
  memory.setState(qq, 'activity', next);
  memory.setState(qq, 'activitySince', now);
  return { text: next, minutes: 0 };
}

/** 距上次聊天多久（分钟），用来判断"隔了很久"的语气 */
export function idleMinutes(memory, qq) {
  const last = memory.lastUserMessageAt(qq);
  if (!last) return null;
  return Math.max(0, Math.round((Date.now() - last) / 60_000));
}
