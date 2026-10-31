/**
 * 把模型/网络的原始报错，翻译成客户能看懂的话。
 * 客户在浏览器或 QQ 里直接看到这些文案。
 */

const RULES = [
  {
    test: /401|Authentication Fails|invalid.*api.?key|api key.*invalid|Unauthorized/i,
    text: 'API Key 无效或已过期。打开「林知夏 管理后台」→ 模型 → 重新填一次 Key。',
  },
  {
    test: /402|insufficient.?balance|余额不足|Quota|quota exceeded|exceeded your current quota/i,
    text: '模型账户余额不足。去模型平台充值后就能继续用。',
  },
  {
    test: /429|rate.?limit|too many requests|请求过于频繁/i,
    text: '请求太频繁了，等十几秒再发一次。',
  },
  {
    test: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket hang up/i,
    text: '连不上模型服务。检查网络，或后台「模型」页的 Base URL 是否写错。',
  },
  {
    test: /404|model.*not.?found|does not exist/i,
    text: '模型名不对。打开「林知夏 管理后台」→ 模型 → 检查模型名（默认 deepseek-chat）。',
  },
  {
    test: /ENOSPC|no space left/i,
    text: '磁盘空间不足，清理一下再试。',
  },
];

export function friendlyError(err) {
  const raw = typeof err === 'string' ? err : (err && err.message) || String(err || '未知错误');
  for (const r of RULES) {
    if (r.test.test(raw)) {
      return { text: r.text, raw: raw.slice(0, 200) };
    }
  }
  return { text: '出错了：' + raw.slice(0, 120), raw: raw.slice(0, 200) };
}

/** 只返回给客户看的那句话 */
export function friendlyText(err) {
  return friendlyError(err).text;
}
