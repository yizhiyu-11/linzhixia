/** 主动消息指向性检查的单测 */
import { hasTarget, isSelfTalk, isTooShort, isHeadDup } from '../src/proactive-check.mjs';

const cases = [
  // [文本, 期望 hasTarget]
  ['地板有点凉', false],
  ['我这车怎么还没到站', false],
  ['今天超市那个阿姨又冲我笑 好奇怪', false],
  ['这会儿全是改字 讲出来怕你听不懂', true], // 指向弱，但确实在对他说话
  ['困了就躺着想我', true],
  ['你那边下雨了没', true],
  ['你上次说的那件衣服选好了吗', true],
  ['要不要一起看那个剧', true],
  ['刚看到个东西想起你', true],
  ['我在厨房煮面', false],
  ['你还记得我上次说哪儿不舒服吗', true],
  ['帮我看下这个是不是这么弄', true],
  ['在吗', true], // 有问句但太短，会被 isTooShort 拦
];

let pass = 0;
for (const [text, expect] of cases) {
  const got = hasTarget(text);
  const ok = got === expect;
  if (ok) pass++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${JSON.stringify(text)} → hasTarget=${got}（期望 ${expect}）`);
}

// 长度与去重
const checks = [
  ['太短', isTooShort('在吗') === true],
  ['够长', isTooShort('你那边下雨了没') === false],
  ['开头重复', isHeadDup('地板有点凉', ['地板有点潮']) === true],
  ['开头不重复', isHeadDup('你那边下雨了没', ['地板有点凉']) === false],
];
for (const [name, ok] of checks) {
  if (ok) pass++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}`);
}

const total = cases.length + checks.length;
console.log(`\n${pass}/${total} 通过`);
process.exit(pass === total ? 0 : 1);
