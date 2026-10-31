/**
 * 什么时候该发语音。
 *
 * 核心想法：不是"随机 8%"，而是"这句话值不值得用声音说"。
 *   · 短句 + 情绪明显 → 更容易发（这是最像真人的时刻）
 *   · 长句 → 不发（念 30 秒谁听）
 *   · 凌晨 → 不发（除非对方明确要）
 *   · 太频繁 → 不发（连着发语音很烦人）
 */

const STRONG_MOODS = new Set(['撒娇', '生气', '难过', '开心', '惊讶', '委屈']);

const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * @param {object} o
 * @param {string} o.text     要念的文本
 * @param {string} [o.emotion] 感知到的情绪
 * @param {number} [o.hour]   现在几点
 * @param {number[]} [o.recent] 最近发语音的时间戳（毫秒）
 * @param {object} [o.cfg]    覆盖默认值
 */
export function shouldVoice({ text = '', emotion = '', hour = new Date().getHours(), recent = [], cfg = {} } = {}) {
  const strongChance = cfg.voiceChanceStrong ?? 0.35;
  const normalChance = cfg.voiceChance ?? 0.05;
  const maxChars = cfg.voiceMaxChars ?? 30;
  const capDay = cfg.voiceCapDay ?? 25;
  const minGapMin = cfg.voiceMinGapMin ?? 10;

  // 没内容 / 太长 → 不念
  if (!text.trim()) return false;
  if ([...text].length > maxChars) return false;

  // 凌晨不主动发语音（对方点名要的不走这里）
  if (hour >= 1 && hour < 7) return false;

  // 当天额度
  const dayStart = startOfDay(Date.now());
  if (recent.filter((t) => t >= dayStart).length >= capDay) return false;

  // 两条语音之间至少隔一会儿
  const last = recent.length ? Math.max(...recent) : 0;
  if (last && Date.now() - last < minGapMin * 60_000) return false;

  const p = STRONG_MOODS.has(emotion) ? strongChance : normalChance;
  return Math.random() < p;
}
