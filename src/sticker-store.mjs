/**
 * 表情库管理：上传入库 / 删除 / 改分类 / 列表。
 * 文件放 stickers/<分类>/upload-<hash>.png|gif，索引写 stickers/index.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export const CATEGORIES = ['开心', '好笑', '无语', '生气', '难过', '撒娇', '累困', '疑惑', '鼓励', '亲密'];
const ROOT = path.resolve('stickers');
const INDEX = path.join(ROOT, 'index.json');
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_GIF_KB = 900;

function readIndex() {
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(raw?.stickers) ? raw.stickers : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  fs.writeFileSync(INDEX, JSON.stringify({ stickers: list }, null, 2), 'utf8');
}

/** 列表 + 分类统计 */
export function listStickers() {
  const list = readIndex();
  const byCat = {};
  for (const s of list) byCat[s.category] = (byCat[s.category] || 0) + 1;
  return {
    total: list.length,
    byCat,
    images: list.filter((s) => s.type !== 'text').length,
    animated: list.filter((s) => s.animated).length,
    texts: list.filter((s) => s.type === 'text').length,
    items: list,
  };
}

/**
 * 上传入库
 * @param {object} p { buf, name, category, desc }
 */
export async function addSticker({ buf, name = 'upload', category = '', desc = '' }) {
  if (!buf?.length) return { ok: false, error: '空文件' };
  if (buf.length > MAX_BYTES) return { ok: false, error: `文件太大（${Math.round(buf.length / 1024)}KB）` };

  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  const list = readIndex();
  const dup = list.find((s) => String(s.id || '').includes(hash));
  if (dup) return { ok: false, duplicate: true, error: `库里已有这张（${dup.category}/${dup.desc || dup.id}）`, sticker: dup };

  const cat = CATEGORIES.includes(category) ? category : '开心';
  const dir = path.join(ROOT, cat);
  fs.mkdirSync(dir, { recursive: true });

  let meta = {};
  try {
    meta = await sharp(buf, { animated: true }).metadata();
  } catch {
    return { ok: false, error: '不是能识别的图片' };
  }

  const isAnimated = (meta.pages || 1) > 1 && buf.length / 1024 <= MAX_GIF_KB;
  const ext = isAnimated ? '.gif' : '.png';
  const id = `upload-${hash}`;
  const file = path.join(dir, `${id}${ext}`);

  if (isAnimated) {
    fs.writeFileSync(file, buf);
  } else {
    await sharp(buf, { page: 0 })
      .resize(240, 240, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 90 })
      .toFile(file);
  }

  const sticker = {
    id,
    category: cat,
    desc: String(desc || '').slice(0, 24),
    type: 'image',
    animated: isAnimated,
    group: 'upload',
    file: `${cat}/${id}${ext}`,
  };
  list.push(sticker);
  writeIndex(list);
  return { ok: true, sticker, source: name, bytes: buf.length, animated: isAnimated };
}

/** 删除（同时删文件） */
export function deleteSticker(id) {
  const list = readIndex();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return { ok: false, error: '没有这张' };
  const s = list[i];
  if (s.file) {
    const p = path.join(ROOT, s.file);
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* 文件可能早没了 */
    }
  }
  list.splice(i, 1);
  writeIndex(list);
  return { ok: true, removed: s };
}

/** 改分类 / 描述（换分类要移动文件） */
export function updateSticker(id, { category, desc } = {}) {
  const list = readIndex();
  const s = list.find((x) => x.id === id);
  if (!s) return { ok: false, error: '没有这张' };
  if (desc != null) s.desc = String(desc).slice(0, 24);
  if (category && CATEGORIES.includes(category) && category !== s.category) {
    const oldPath = path.join(ROOT, s.file);
    const newDir = path.join(ROOT, category);
    fs.mkdirSync(newDir, { recursive: true });
    const base = path.basename(s.file);
    const newPath = path.join(newDir, base);
    try {
      fs.renameSync(oldPath, newPath);
    } catch {
      /* 移动失败就保留旧路径 */
    }
    s.category = category;
    s.file = `${category}/${base}`;
  }
  writeIndex(list);
  return { ok: true, sticker: s };
}
