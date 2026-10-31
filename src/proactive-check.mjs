/**
 * 主动消息去重、长度、指向性检查（纯函数，可单测）
 */

/** 取开头两个有意义字符（跳过标点/语气符号） */
export function headOf(text) {
  return String(text || '')
    .replace(/^[\s，。！？、~～…「」"'']+/, '')
    .slice(0, 2);
}

/** 是否和最近的主动消息开头重复 */
export function isHeadDup(text, recent = []) {
  const h = headOf(text);
  if (!h) return true;
  return recent.some((r) => headOf(r) === h);
}

/** 是否太短（去掉空白和标点后 < 5 字） */
export function isTooShort(text, min = 5) {
  const body = String(text || '').replace(/[\s，。！？、~～…」"'']/g, '');
  return body.length < min;
}

/** 是否和最近某条几乎一样（去掉标点后相同，或前 8 字相同） */
export function isNearDup(text, recent = []) {
  const norm = (s) => String(s || '').replace(/[\s，。！？、~～…」"'']/g, '');
  const a = norm(text);
  if (!a) return true;
  return recent.some((r) => {
    const b = norm(r);
    return b && (a === b || (a.length >= 8 && b.startsWith(a.slice(0, 8))));
  });
}

/** 问句 / 喊他过来的信号 */
const ASK_RE = /[?？]|吗|呢|吧$|要不要|有没有|是不是|好不好|行不行|在不在|还记得|你说|帮我看|陪我|跟你|和你|想你|想我|等我|回我|告诉我|跟我说|别熬|早点睡|记得/;

/** 第二人称指向 */
const YOU_RE = /你|您/;

/**
 * 有没有"指向他"。
 * 只看自述（"地板有点凉""我这车怎么还没到站"）就是没有指向。
 */
export function hasTarget(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (YOU_RE.test(t)) return true;
  return ASK_RE.test(t);
}

/**
 * 是不是纯自述：没有第二人称、没有问句、且是"我/这/今"开头或陈述句。
 * 这类消息发出去像自言自语，应该重写。
 */
export function isSelfTalk(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (hasTarget(t)) return false;
  return true;
}
