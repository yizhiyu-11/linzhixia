/** 极简日志：带时间戳和级别，够用就好，不引依赖 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = 'info') {
  const min = LEVELS[level] ?? 20;
  // 用本地时间：toISOString() 是 UTC，日志会和实际时间差 8 小时，排查时很容易看错
  const ts = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const emit = (lv) => (msg, extra) => {
    if (LEVELS[lv] < min) return;
    const line = `[${ts()}] ${lv.toUpperCase().padEnd(5)} ${msg}`;
    if (extra !== undefined) console.log(line, typeof extra === 'string' ? extra : JSON.stringify(extra));
    else console.log(line);
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}
