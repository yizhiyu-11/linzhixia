/**
 * 图片处理：把 QQ 发来的图片变成模型能吃的 data URL。
 * NapCat 给的可能是 http(s) 链接，也可能是本地文件路径。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/**
 * @param {string} source http(s) 链接 / file:// / 本地路径
 * @param {number} maxBytes 超过就拒绝
 * @returns {Promise<{dataUrl: string, bytes: number}>}
 */
export async function loadImage(source, maxBytes = 5 * 1024 * 1024) {
  const src = String(source || '').trim();
  if (!src) throw new Error('图片地址为空');

  // 网络图片（NapCat 默认给的是这种）
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`图片太大（${Math.round(buf.length / 1024)} KB）`);
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    return { dataUrl: `data:${ct};base64,${buf.toString('base64')}`, bytes: buf.length, buf };
  }

  // 本地文件：file:///E:/x.png 在 Windows 上会变成 "/E:/x.png"，必须去掉前导斜杠
  let filePath = decodeURIComponent(src.replace(/^file:\/{1,3}/i, ''));
  if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) throw new Error(`图片太大（${Math.round(stat.size / 1024)} KB）`);
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'image/png';
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, bytes: buf.length, buf };
}
