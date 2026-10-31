/**
 * 表情库上传 / 去重 / 改分类 / 删除 / 静态图 接口测试
 * node --env-file=.env scripts/test-stickers-api.mjs
 */
import fs from 'node:fs';

const token = fs.readFileSync('data/web-token', 'utf8').trim();
const BASE = 'http://127.0.0.1:3870';

const call = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}token=${token}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
};

const file = fs.readFileSync('data/console-shot.png');
const dataUrl = `data:image/png;base64,${file.toString('base64')}`;

console.log('=== 1. 上传一张新图 ===');
const up = await call('/api/stickers/upload', { method: 'POST', body: JSON.stringify({ dataUrl, name: 'shot.png' }) });
console.log(' ', up.status, JSON.stringify(up.body).slice(0, 160));
const id = up.body?.sticker?.id;

console.log('\n=== 2. 再传一次（应判重复）===');
const dup = await call('/api/stickers/upload', { method: 'POST', body: JSON.stringify({ dataUrl, name: 'shot.png' }) });
console.log(' ', dup.status, JSON.stringify(dup.body).slice(0, 120));

console.log('\n=== 3. 改分类 ===');
const upd = await call('/api/stickers/update', { method: 'POST', body: JSON.stringify({ id, category: '疑惑', desc: '后台截图' }) });
console.log(' ', upd.status, JSON.stringify(upd.body?.sticker || upd.body).slice(0, 140));

console.log('\n=== 4. 静态图能取到吗 ===');
const cat = upd.body?.sticker?.category || '开心';
const fname = (upd.body?.sticker?.file || '').split('/').pop();
const img = await fetch(`${BASE}/stickers/${encodeURIComponent(cat)}/${encodeURIComponent(fname)}`);
console.log('  HTTP', img.status, img.headers.get('content-type'), (img.headers.get('content-length') || '?') + ' bytes');

console.log('\n=== 5. 列表里能看到吗 ===');
const list = await call('/api/stickers');
const found = (list.body.items || []).find((s) => s.id === id);
console.log('  总数', list.body.total, ' 找到:', JSON.stringify(found));

console.log('\n=== 6. 删除 ===');
const del = await call('/api/stickers/delete', { method: 'POST', body: JSON.stringify({ id }) });
console.log(' ', del.status, JSON.stringify(del.body).slice(0, 100));
const after = await call('/api/stickers');
console.log('  删除后总数:', after.body.total);
