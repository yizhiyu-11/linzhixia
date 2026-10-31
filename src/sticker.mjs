/**
 * 表情包库：读 stickers/index.json（分类版），按情绪挑图。
 *
 * 分类：开心 好笑 无语 生气 难过 撒娇 累困 疑惑 鼓励 亲密 自绘
 * 每张带 desc，既能给模型看，也能在日志里解释为什么选它。
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const INDEX_FILES = ['index.json', 'stickers.json'];

export function loadStickers(dir = 'stickers') {
  const abs = path.resolve(dir);
  for (const name of INDEX_FILES) {
    const p = path.join(abs, name);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      const list = Array.isArray(raw?.stickers) ? raw.stickers : [];
      const out = list
        .map((s) => ({
          id: String(s.id || s.tag || '').trim(),
          category: String(s.category || '未分类').trim(),
          desc: String(s.desc || '').trim(),
          emoji: s.emoji || '',
          type: s.type === 'text' ? 'text' : 'image',
          text: String(s.text || '').trim(),
          animated: Boolean(s.animated),
          group: String(s.group || ''),
          file: s.file ? path.join(abs, String(s.file)) : '',
        }))
        // 文本表情包不需要文件；图片表情包必须有图
        .filter((s) => s.id && (s.type === 'text' ? Boolean(s.text) : fs.existsSync(s.file)));
      if (out.length) return out;
    } catch {
      /* 换下一个文件 */
    }
  }
  return [];
}

/** 从回复文本里抠出 [fig:标签]，返回 { text, tags } */
export function extractStickerTags(text) {
  const tags = [];
  const cleaned = String(text || '').replace(
    /[\[【(（]\s*fig\s*[:：]\s*([^\]】)）]+)\s*[\]】)）]/gi,
    (_, tag) => {
      tags.push(String(tag).trim());
      return '';
    },
  );
  return { text: cleaned.replace(/\n{3,}/g, '\n\n').trim(), tags };
}

/** 按 id / 分类 / 描述找一张 */
export function findSticker(list, tag) {
  const t = String(tag || '').trim();
  if (!t) return null;
  return (
    list.find((s) => s.id === t) ||
    list.find((s) => s.category === t) ||
    list.find((s) => s.desc.includes(t) || t.includes(s.desc)) ||
    null
  );
}

/**
 * 文本 → 情绪分类。返回 null 表示没有明显情绪。
 * 顺序有意义：越具体的越靠前。
 */
const CATEGORY_RULES = [
  { cat: '撒娇', re: /(贴贴|抱抱|亲亲|想你|爱你|么么|乖乖|宝贝)/ },
  { cat: '亲密', re: /(喜欢你|心动|亲一口)/ },
  { cat: '好笑', re: /(哈哈|笑死|好笑|搞笑|绷不住|乐死|太逗)/ },
  { cat: '无语', re: /(无语|离谱|服了|什么鬼|整不会|离大谱|真行)/ },
  { cat: '生气', re: /(生气|气死|讨厌|烦死|滚|哼|不理你)/ },
  { cat: '难过', re: /(难过|委屈|想哭|心累|失望|崩溃|难受)/ },
  { cat: '累困', re: /(累|困|想睡|没精神|电量|熬夜|上班)/ },
  { cat: '疑惑', re: /(不懂|啥意思|为什么|啊？|\?\?|真的假的|没听懂)/ },
  { cat: '鼓励', re: /(加油|你可以|没事|别怕|相信自己|挺你)/ },
  { cat: '开心', re: /(太好了|开心|好耶|成功了|搞定了|爽|棒)/ },
];

export function classifyCategory(text) {
  const t = String(text || '');
  for (const rule of CATEGORY_RULES) if (rule.re.test(t)) return rule.cat;
  return null;
}

/** 同一分类里随机挑一张，尽量避开最近发过的 */
export function pickByCategory(list, category, excludeIds = [], opts = {}) {
  const allowAnimated = Boolean(opts.allowAnimated);
  const scores = opts.scores || null;
  const pool = list.filter(
    (s) => s.category === category && (allowAnimated || !s.animated) && !excludeIds.includes(s.id),
  );
  if (!pool.length) return null;
  const fresh = pool.filter((s) => !excludeIds.includes(s.id));
  const use = fresh.length ? fresh : pool;

  // 10% 纯随机（探索），90% 按表现分加权
  if (!scores || Math.random() < 0.1) return use[Math.floor(Math.random() * use.length)];

  const weights = use.map((s) => 0.5 + (scores.get(s.id) ?? 0.5));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < use.length; i++) {
    r -= weights[i];
    if (r <= 0) return use[i];
  }
  return use[use.length - 1];
}

/** 完全随机（兜底） */
export function randomSticker(list, excludeIds = []) {
  const fresh = list.filter((s) => !excludeIds.includes(s.id));
  const pool = fresh.length ? fresh : list;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 给 prompt 用的分类清单（每类取几张，省 token） */
export function stickerCatalogText(list, perCategory = 3) {
  const byCat = new Map();
  for (const s of list) {
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category).push(s);
  }
  const lines = [];
  for (const [cat, items] of byCat) {
    const sample = items.slice(0, perCategory).map((s) => s.desc).join('、');
    lines.push(`- ${cat}：${sample}${items.length > perCategory ? ' 等' : ''}`);
  }
  return lines.join('\n');
}

/** 给每张图算 sha1，返回 Map<hash, sticker>：他发的图如果库里就有，直接知道是什么 */
export function buildStickerHashIndex(list) {
  const map = new Map();
  for (const s of list || []) {
    if (s.type === 'text' || !s.file) continue;
    try {
      const buf = fs.readFileSync(s.file);
      const h = crypto.createHash('sha1').update(buf).digest('hex');
      map.set(h, s);
    } catch {
      /* 跳过读不到的文件 */
    }
  }
  return map;
}
