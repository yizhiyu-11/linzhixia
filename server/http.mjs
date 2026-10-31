/**
 * 后台 HTTP 服务：只监听 127.0.0.1，给管理页面用。
 * 零依赖（node:http），静态文件从 web/dist 出。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../src/config.mjs';
import { allModules, saveModule, MODULES } from './store.mjs';
import { buildManual } from './manual-data.mjs';
import { loadProviders, saveProviders, applyProviders, publicProviders, DEFAULT_PROVIDERS } from '../src/providers.mjs';

const DIST = path.resolve('web', 'dist');
const TOKEN_FILE = path.resolve('data', 'web-token');

function ensureToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) return t;
  } catch {
    /* 没就生成 */
  }
  const t = crypto.randomBytes(12).toString('hex');
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, t, 'utf8');
  return t;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error(`请求体太大（上限 ${Math.round(limit / 1024 / 1024 * 10) / 10}MB）`);
        err.code = 'TOO_LARGE';
        req.removeAllListeners('data');
        req.resume(); // 把剩余数据丢掉，别断连
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};

/**
 * @param {object} opts { port, getRuntime, actions }
 */
export function startWebConsole({ port = 3870, getRuntime, actions = {} }) {
  const token = ensureToken();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;

    // ── API ────────────────────────────────────────────────
    if (p.startsWith('/api/')) {
      const given = req.headers['x-web-token'] || url.searchParams.get('token');
      if (given !== token) return json(res, 401, { error: 'token 不对' });

      try {
        if (p === '/api/state' && req.method === 'GET') {
          return json(res, 200, {
            runtime: getRuntime ? getRuntime() : {},
            modules: allModules(),
            tokenHint: token.slice(0, 4) + '…',
          });
        }

        if (p.startsWith('/api/config/') && req.method === 'PATCH') {
          const id = p.slice('/api/config/'.length);
          const body = JSON.parse((await readBody(req)) || '{}');
          const r = saveModule(id, body);
          return json(res, r.ok ? 200 : 400, r);
        }

        // ── 人设预览 ────────────────────────────────────
        if (p === '/api/persona/preview' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = await actions.previewPersona(body);
          return json(res, out.ok ? 200 : 400, out);
        }

        // ── 测试台（独立记忆，不影响真实账号）────────────
        if (p === '/api/sandbox/send' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = await actions.sandboxTurn(body);
          return json(res, out.ok ? 200 : 400, out);
        }
        if (p === '/api/sandbox/reset' && req.method === 'POST') {
          return json(res, 200, actions.sandboxReset());
        }
        if (p === '/api/sandbox/history' && req.method === 'GET') {
          return json(res, 200, actions.sandboxHistory());
        }

        // ── 用户 & 人设 ──────────────────────────────────
        if (p === '/api/users' && req.method === 'GET') {
          return json(res, 200, {
            personas: actions.listPersonas ? actions.listPersonas() : [],
            users: actions.listUsers ? actions.listUsers() : [],
            globalPersona: actions.globalPersona ? actions.globalPersona() : '',
          });
        }
        if (p === '/api/users/persona' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = actions.setUserPersona(body);
          return json(res, out.ok ? 200 : 400, out);
        }

        // ── 表情库 ──────────────────────────────────────
        if (p === '/api/stickers' && req.method === 'GET') {
          return json(res, 200, actions.stickersInfo ? actions.stickersInfo() : {});
        }
        if (p === '/api/stickers/upload' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req, 8 << 20)) || '{}');
          if (!body?.dataUrl) return json(res, 400, { error: '缺少图片数据' });
          const out = await actions.uploadSticker(body);
          return json(res, out.ok ? 200 : 400, out);
        }
        if (p === '/api/stickers/update' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = actions.updateSticker(body);
          return json(res, out.ok ? 200 : 400, out);
        }
        if (p === '/api/stickers/delete' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = actions.deleteSticker(body);
          return json(res, out.ok ? 200 : 400, out);
        }

        // ── 两个外部服务（文本模型 / 语音）可替换配置 ──
  // 实际生效的 key：providers.json 优先，没有就回落到 .env
  const effKeys = () => ({ chat: loadProviders().chat.key || config.apiKey, voice: loadProviders().voice.key || config.bailianKey });

  if (p === '/api/providers' && req.method === 'GET') {
    return json(res, 200, publicProviders(loadProviders(), effKeys()));
  }

  if (p === '/api/providers' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const next = saveProviders(body);
      applyProviders(config, next);
      return json(res, 200, { ok: true, ...publicProviders(next, { chat: next.chat.key || config.apiKey, voice: next.voice.key || config.bailianKey }) });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  if (p === '/api/providers/test' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const which = body.service === 'voice' ? 'voice' : 'chat';
    const prov = loadProviders()[which];
    const t0 = Date.now();

    if (which === 'chat') {
      const chatKey = prov.key || config.apiKey;
      if (!chatKey) return json(res, 200, { ok: false, ms: 0, error: '没填 key' });
      try {
        const r = await fetch(`${prov.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chatKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: prov.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
          signal: AbortSignal.timeout(15000),
        });
        const text = await r.text();
        const ms = Date.now() - t0;
        if (r.ok) return json(res, 200, { ok: true, ms, model: prov.model, sample: text.slice(0, 120) });
        return json(res, 200, { ok: false, ms, error: `HTTP ${r.status} ${text.slice(0, 160)}` });
      } catch (e) {
        return json(res, 200, { ok: false, ms: Date.now() - t0, error: e.name === 'TimeoutError' ? '超时（15s）' : e.message });
      }
    }

    // 语音：真合成一个字，验证 key/地址/模型都对
    const voiceKey = prov.key || config.bailianKey;
    if (!voiceKey) return json(res, 200, { ok: false, ms: 0, error: '没填 key' });
    try {
      const { synth } = await import('../src/tts-dashscope.mjs');
      const r = await synth({ model: prov.model, voice: body.voice || config.qwenVoice, text: '嗯', format: 'wav', timeoutMs: 20000, key: voiceKey });
      return json(res, 200, { ok: true, ms: Date.now() - t0, model: prov.model, bytes: r.buf.length });
    } catch (e) {
      return json(res, 200, { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) });
    }
  }

  if (p === '/api/providers/reset' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const which = body.service === 'voice' ? 'voice' : 'chat';
    const d = DEFAULT_PROVIDERS[which];
    const next = saveProviders({ [which]: { baseUrl: d.baseUrl, model: d.model, name: d.name, key: null } });
    applyProviders(config, next);
    return json(res, 200, { ok: true, ...publicProviders(next, { chat: next.chat.key || config.apiKey, voice: next.voice.key || config.bailianKey }) });
  }

  if (p === '/api/manual' && req.method === 'GET') {
    try {
      return json(res, 200, buildManual());
    } catch (e) {
      return json(res, 500, { error: `生成手册失败：${e.message}` });
    }
  }

  if (p === '/api/profile' && req.method === 'GET') {
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          return json(res, 200, actions.getProfile ? actions.getProfile(qq) : {});
        }

        if (p === '/api/profile' && req.method === 'POST') {
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = actions.saveProfile ? actions.saveProfile(qq, body) : { ok: false };
          return json(res, out.ok ? 200 : 400, out);
        }

        if (p === '/api/timeline' && req.method === 'GET') {
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          const span = Number(url.searchParams.get('span') || 24);
          const from = Date.now() - Math.max(1, Math.min(72, span)) * 3600_000;
          return json(res, 200, actions.timelineData ? actions.timelineData(qq, from) : {});
        }

        if (p === '/api/memory' && req.method === 'GET') {
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          return json(res, 200, actions.memorySnapshot ? actions.memorySnapshot(qq) : {});
        }

        if (p.startsWith('/api/memory/fact/') && req.method === 'PATCH') {
          const key = decodeURIComponent(p.slice('/api/memory/fact/'.length));
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          const body = JSON.parse((await readBody(req)) || '{}');
          const value = String(body.value || '').trim();
          if (!value) return json(res, 400, { error: 'value 不能为空' });
          const out = actions.updateFact ? actions.updateFact(qq, key, value) : { ok: false };
          return json(res, out.ok ? 200 : 400, out);
        }

        if (p.startsWith('/api/memory/fact/') && req.method === 'DELETE') {
          const key = decodeURIComponent(p.slice('/api/memory/fact/'.length));
          const qq = url.searchParams.get('qq') || actions.defaultQq?.() || '';
          return json(res, 200, actions.deleteFact ? actions.deleteFact(qq, key) : { ok: false });
        }

        if (p.startsWith('/api/memory/summary/') && req.method === 'DELETE') {
          const id = Number(p.slice('/api/memory/summary/'.length));
          return json(res, 200, actions.deleteSummary ? actions.deleteSummary(id) : { ok: false });
        }

        if (p === '/api/usage' && req.method === 'GET') {
          const hours = Math.min(24 * 14, Number(url.searchParams.get('hours') || 24));
          const rows = actions.usage ? actions.usage(hours) : [];
          return json(res, 200, { hours, calls: rows });
        }

        if (p === '/api/turns' && req.method === 'GET') {
          const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));
          const qq = url.searchParams.get('qq') || null;
          const list = actions.listTurns ? actions.listTurns(limit, qq) : [];
          return json(res, 200, { turns: list });
        }

        if (p.startsWith('/api/turns/') && req.method === 'GET') {
          const id = Number(p.slice('/api/turns/'.length));
          const turn = actions.getTurn ? actions.getTurn(id) : null;
          if (!turn) return json(res, 404, { error: '没有这条记录' });
          return json(res, 200, turn);
        }

        if (p.startsWith('/api/action/') && req.method === 'POST') {
          const name = p.slice('/api/action/'.length);
          const fn = actions[name];
          if (!fn) return json(res, 404, { error: `没有这个动作：${name}` });
          const body = JSON.parse((await readBody(req)) || '{}');
          const out = await fn(body);
          return json(res, 200, out);
        }

        return json(res, 404, { error: '没有这个接口' });
      } catch (e) {
        if (e.code === 'TOO_LARGE') return json(res, 413, { error: e.message });
        if (e instanceof SyntaxError) return json(res, 400, { error: 'JSON 格式不对' });
        return json(res, 500, { error: e.message });
      }
    }

    // ── 表情库图片（只读，给后台预览用）────────────────────
    if (p.startsWith('/stickers/')) {
      const rel = decodeURIComponent(p.slice('/stickers/'.length));
      const root = path.resolve('stickers');
      const abs = path.resolve(root, rel);
      if (!abs.startsWith(root)) return json(res, 403, { error: '越界' });
      if (!fs.existsSync(abs)) return json(res, 404, { error: '没有这张图' });
      const e2 = path.extname(abs).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[e2] || 'application/octet-stream', 'Cache-Control': 'max-age=60' });
      return fs.createReadStream(abs).pipe(res);
    }

    // ── 静态文件 ───────────────────────────────────────────
    let filePath = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!filePath.startsWith(DIST)) return json(res, 403, { error: '越界' });
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'index.html'); // SPA 兜底
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('前端还没构建。在 web/ 目录跑：pnpm install && pnpm build');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/?token=${token}`;
    console.log(`[web] 管理后台：${url}`);
    console.log(`[web] token 存在 data/web-token，换一次就失效`);
  });

  return { server, token, port, close: () => server.close() };
}
