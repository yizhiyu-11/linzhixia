/**
 * 记忆存储（SQLite，Node 24 内置 node:sqlite，零原生依赖）
 *
 * M1 只建骨架：用户、消息、用量、事实。
 * L1/L2 摘要和关系状态在 M2/M3 加，表先留好。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export class Memory {
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.path = dbPath;
    this.db = this.#openWithHeal(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.#init();
    this.#upgrade();
  }

  /**
   * 打开数据库；如果文件损坏（断电、被杀软写坏、磁盘故障），
   * 把坏文件改名留档，然后建一个新的，保证程序还能起来。
   */
  #openWithHeal(dbPath) {
    let db = null;
    let reason = '';
    try {
      db = new DatabaseSync(dbPath);
      // 能被打开不代表没坏，做一次完整性检查
      const row = db.prepare('PRAGMA integrity_check').get();
      const verdict = row ? Object.values(row)[0] : 'ok';
      if (String(verdict).toLowerCase() === 'ok') return db;
      reason = 'integrity_check: ' + verdict;
    } catch (e) {
      reason = e && e.message ? e.message : String(e);
    }
    // 必须先关句柄，否则 Windows 不让改名/删除
    try {
      if (db) db.close();
    } catch {
      /* ignore */
    }
    db = null;
    {
      const e = { message: reason };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bad = dbPath + '.corrupt-' + stamp;
      try {
        fs.renameSync(dbPath, bad);
        for (const ext of ['-wal', '-shm']) {
          if (fs.existsSync(dbPath + ext)) fs.renameSync(dbPath + ext, bad + ext);
        }
      } catch {
        /* 改名失败就尽量删掉 */
        try {
          fs.rmSync(dbPath, { force: true });
        } catch {
          /* ignore */
        }
      }
      const note = path.join(path.dirname(dbPath), '数据库损坏说明.txt');
      const text = [
        '检测到数据库损坏，已自动重建。',
        '',
        '时间：' + new Date().toLocaleString('zh-CN'),
        '原因：' + (e && e.message ? e.message : String(e)),
        '坏文件：' + bad,                 
        '',
        '影响：之前的聊天记录和记忆读不出来了（文件还在，没有删）。',
        '处理：程序已用空数据库继续运行，可以正常聊天。',
        '      如果想把老记录找回来，把坏文件和这个说明发给卖家。',
      ].join('\r\n');
      try {
        fs.writeFileSync(note, '\ufeff' + text, 'utf8');
      } catch {
        /* ignore */
      }
      // 兜底：改名/删除都失败时，把文件截断成 0 字节（SQLite 视为空库）
      if (fs.existsSync(dbPath)) {
        try {
          fs.writeFileSync(dbPath, Buffer.alloc(0));
          fs.rmSync(dbPath + '-wal', { force: true });
          fs.rmSync(dbPath + '-shm', { force: true });
        } catch {
          /* ignore */
        }
      }
      try {
        return new DatabaseSync(dbPath);
      } catch (e2) {
        // 实在打不开就用内存库，至少程序能跑
        try {
          fs.writeFileSync(
            path.join(path.dirname(dbPath), '数据库无法修复.txt'),
            '\ufeff数据库无法打开，已临时改用内存模式（重启后记录会丢）。\r\n原因：' + (e2 && e2.message ? e2.message : String(e2)) + '\r\n请把 app\\data 目录打包发给卖家。',
            'utf8',
          );
        } catch {
          /* ignore */
        }
        return new DatabaseSync(':memory:');
      }
    }
  }

  /** 老库升级：给 usage 补 tag 列（新库建表时已有，失败就忽略） */
  #upgrade() {
    try {
      this.db.exec('ALTER TABLE usage ADD COLUMN tag TEXT');
    } catch {
      /* 已经有了 */
    }
  }

  #init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        qq          TEXT PRIMARY KEY,
        nickname    TEXT,
        created_at  INTEGER NOT NULL,
        last_seen   INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        role        TEXT NOT NULL,        -- user | assistant
        content     TEXT NOT NULL,
        meta        TEXT,                 -- 图片数等附加信息（JSON）
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_msg_qq_time ON messages(qq, id);

      CREATE TABLE IF NOT EXISTS usage (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        model       TEXT,
        prompt_tokens     INTEGER,
        completion_tokens INTEGER,
        cost_yuan   REAL,
        created_at  INTEGER NOT NULL,
        tag         TEXT
      );

      -- L3 长期事实：生日、喜好、约定…… 永久保留
      CREATE TABLE IF NOT EXISTS facts (
        qq          TEXT NOT NULL,
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        confidence  REAL DEFAULT 1.0,
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (qq, key)
      );

      -- M2 用：L1/L2 摘要
      CREATE TABLE IF NOT EXISTS summaries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        level       INTEGER NOT NULL,     -- 1 = 日摘要, 2 = 周摘要
        period      TEXT NOT NULL,        -- 2026-10-22 / 2026-W43
        content     TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      -- M3 用：关系状态
      CREATE TABLE IF NOT EXISTS relation (
        qq          TEXT PRIMARY KEY,
        intimacy    INTEGER DEFAULT 0,
        stage       TEXT DEFAULT 'stranger',
        updated_at  INTEGER NOT NULL
      );

      -- 内部状态（心情、上次主动时间等），不出现在 prompt 里
      CREATE TABLE IF NOT EXISTS turns (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        at          INTEGER NOT NULL,
        input       TEXT,
        perception  TEXT,
        act         TEXT,
        act_why     TEXT,
        scene       TEXT,
        media       TEXT,
        hint        TEXT,
        reply       TEXT,
        latency_ms  INTEGER,
        cost        REAL,
        guards      TEXT
      );
      -- 他发过的图（认得出来就别重复理解，也能说"你又发这张"）
      CREATE TABLE IF NOT EXISTS media_seen (
        qq          TEXT NOT NULL,
        hash        TEXT NOT NULL,
        kind        TEXT,
        desc        TEXT,
        category    TEXT,
        first_seen  INTEGER NOT NULL,
        last_seen   INTEGER NOT NULL,
        count       INTEGER DEFAULT 1,
        PRIMARY KEY (qq, hash)
      );

      -- 表情包表现：发出去之后对方接不接话
      CREATE TABLE IF NOT EXISTS sticker_stats (
        id            TEXT PRIMARY KEY,
        category      TEXT,
        sent          INTEGER DEFAULT 0,
        replied_fast  INTEGER DEFAULT 0,
        replied_slow  INTEGER DEFAULT 0,
        no_reply      INTEGER DEFAULT 0,
        last_sent_at  INTEGER,
        score         REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS perceptions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        text        TEXT,
        json        TEXT,
        created_at  INTEGER NOT NULL
      );

      -- 情节记忆：带时间/地点/情绪的"发生过什么"
      CREATE TABLE IF NOT EXISTS episodes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        text        TEXT NOT NULL,
        kind        TEXT,
        place       TEXT,
        mood        REAL,
        importance  INTEGER DEFAULT 3,
        at          INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ep_qq_time ON episodes(qq, id);

      -- 场景变化历史：给时间线用（什么时候换了地方、换了事）
      CREATE TABLE IF NOT EXISTS scene_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        qq          TEXT NOT NULL,
        at          INTEGER NOT NULL,
        scene_id    TEXT,
        location    TEXT,
        doing       TEXT,
        pace        TEXT,
        chat        REAL,
        place       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sl_qq_at ON scene_log(qq, at);
      CREATE TABLE IF NOT EXISTS state (
        qq          TEXT NOT NULL,
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (qq, key)
      );
    `);
  }

  ensureUser(qq, nickname = '') {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (qq, nickname, created_at, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(qq) DO UPDATE SET last_seen = excluded.last_seen,
           nickname = COALESCE(NULLIF(excluded.nickname, ''), users.nickname)`,
      )
      .run(qq, nickname, now, now);
  }

  addMessage(qq, role, content, meta = null) {
    this.db
      .prepare('INSERT INTO messages (qq, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(qq, role, content, meta ? JSON.stringify(meta) : null, Date.now());
  }

  /** 最近 n 轮（一问一答 = 2 条），按时间正序返回，直接能拼进 messages 数组 */
  recentMessages(qq, turns = 15) {
    const rows = this.db
      .prepare('SELECT role, content FROM messages WHERE qq = ? ORDER BY id DESC LIMIT ?')
      .all(qq, turns * 2);
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
  }

  /** 最近 n 条主动消息正文（升序），用于防重复 */
  recentProactive(qq, n = 8) {
    const rows = this.db
      .prepare(
        `SELECT content FROM messages WHERE qq = ? AND role = 'assistant' AND meta LIKE '%"proactive":true%' ORDER BY id DESC LIMIT ?`,
      )
      .all(qq, n);
    return rows.reverse().map((r) => r.content);
  }

  setFact(qq, key, value, confidence = 1.0) {
    this.db
      .prepare(
        `INSERT INTO facts (qq, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(qq, key) DO UPDATE SET value = excluded.value,
           confidence = excluded.confidence, updated_at = excluded.updated_at`,
      )
      .run(qq, key, value, confidence, Date.now());
  }

  getFacts(qq) {
    return this.db
      .prepare('SELECT key, value, confidence, updated_at AS updatedAt FROM facts WHERE qq = ? ORDER BY updated_at DESC')
      .all(qq);
  }

  getFactConfidence(qq, key) {
    const row = this.db.prepare('SELECT confidence FROM facts WHERE qq = ? AND key = ?').get(qq, key);
    return row ? Number(row.confidence) : 0;
  }

  deleteFact(qq, key) {
    return this.db.prepare('DELETE FROM facts WHERE qq = ? AND key = ?').run(qq, key).changes;
  }

  deleteSummary(id) {
    return this.db.prepare('DELETE FROM summaries WHERE id = ?').run(id).changes;
  }

  listSummaries(qq, limit = 50) {
    return this.db
      .prepare('SELECT id, period, content, created_at AS createdAt FROM summaries WHERE qq = ? ORDER BY id DESC LIMIT ?')
      .all(qq, limit);
  }

  getState(qq, key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM state WHERE qq = ? AND key = ?').get(qq, key);
    return row ? row.value : fallback;
  }

  setState(qq, key, value) {
    this.db
      .prepare(
        `INSERT INTO state (qq, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(qq, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(qq, key, String(value), Date.now());
  }

  addTurn(t) {
    this.db
      .prepare(
        'INSERT INTO turns (qq, at, input, perception, act, act_why, scene, media, hint, reply, latency_ms, cost, guards) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        t.qq,
        t.at || Date.now(),
        String(t.input || '').slice(0, 500),
        JSON.stringify(t.perception || null),
        t.act || null,
        String(t.actWhy || '').slice(0, 120),
        JSON.stringify(t.scene || null),
        JSON.stringify(t.media || null),
        String(t.hint || '').slice(0, 2000),
        String(t.reply || '').slice(0, 1000),
        t.latencyMs ?? null,
        t.cost ?? null,
        JSON.stringify(t.guards || []),
      );
  }

  listTurns(limit = 50, qq = null) {
    const sql = qq
      ? 'SELECT id, qq, at, input, act, reply, latency_ms AS latencyMs, cost FROM turns WHERE qq = ? ORDER BY id DESC LIMIT ?'
      : 'SELECT id, qq, at, input, act, reply, latency_ms AS latencyMs, cost FROM turns ORDER BY id DESC LIMIT ?';
    return qq ? this.db.prepare(sql).all(qq, limit) : this.db.prepare(sql).all(limit);
  }

  getTurn(id) {
    const row = this.db.prepare('SELECT * FROM turns WHERE id = ?').get(id);
    if (!row) return null;
    const parse = (s) => {
      try {
        return s ? JSON.parse(s) : null;
      } catch {
        return null;
      }
    };
    return {
      ...row,
      perception: parse(row.perception),
      scene: parse(row.scene),
      media: parse(row.media),
      guards: parse(row.guards) || [],
    };
  }
  // ── 他发过的图 ──────────────────────────────────────────
  recordMediaSeen(qq, hash, info = {}) {
    const now = Date.now();
    const row = this.db.prepare('SELECT count FROM media_seen WHERE qq = ? AND hash = ?').get(qq, hash);
    if (row) {
      this.db
        .prepare(
          'UPDATE media_seen SET last_seen = ?, count = count + 1, desc = COALESCE(?, desc), category = COALESCE(?, category) WHERE qq = ? AND hash = ?',
        )
        .run(now, info.desc || null, info.category || null, qq, hash);
      return { count: row.count + 1, ...info };
    }
    this.db
      .prepare(
        'INSERT INTO media_seen (qq, hash, kind, desc, category, first_seen, last_seen, count) VALUES (?,?,?,?,?,?,?,1)',
      )
      .run(qq, hash, info.kind || '', info.desc || '', info.category || '', now, now);
    return { count: 1, ...info };
  }

  getMediaSeen(qq, hash) {
    return this.db.prepare('SELECT * FROM media_seen WHERE qq = ? AND hash = ?').get(qq, hash) || null;
  }

  /** 他这几天最爱发的图（风格画像用） */
  topMediaSeen(qq, limit = 5) {
    return this.db
      .prepare('SELECT hash, kind, desc, category, count FROM media_seen WHERE qq = ? ORDER BY count DESC LIMIT ?')
      .all(qq, limit);
  }

  // ── 表情包表现 ──────────────────────────────────────────
  stickerSent(id, category = '') {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM sticker_stats WHERE id = ?').get(id);
    if (!row) {
      this.db
        .prepare('INSERT INTO sticker_stats (id, category, sent, last_sent_at) VALUES (?,?,1,?)')
        .run(id, category, now);
    } else {
      this.db.prepare('UPDATE sticker_stats SET sent = sent + 1, last_sent_at = ? WHERE id = ?').run(now, id);
      if (category) this.db.prepare('UPDATE sticker_stats SET category = ? WHERE id = ?').run(category, id);
    }
    this.#rescoreSticker(id);
  }

  stickerFeedback(id, kind) {
    if (!id) return;
    const col = kind === 'fast' ? 'replied_fast' : kind === 'slow' ? 'replied_slow' : 'no_reply';
    this.db.prepare(`UPDATE sticker_stats SET ${col} = ${col} + 1 WHERE id = ?`).run(id);
    this.#rescoreSticker(id);
  }

  #rescoreSticker(id) {
    const row = this.db.prepare('SELECT * FROM sticker_stats WHERE id = ?').get(id);
    if (!row) return;
    // 贝叶斯平滑：新图从 0.5 起步，不会被一两票打死
    const score = (Number(row.replied_fast) + 0.5 * Number(row.replied_slow) + 1) / (Number(row.sent) + 2);
    this.db.prepare('UPDATE sticker_stats SET score = ? WHERE id = ?').run(score, id);
  }

  /** Map<id, score>，选图时用来加权 */
  stickerScores() {
    const map = new Map();
    for (const r of this.db.prepare('SELECT id, score FROM sticker_stats').all()) {
      map.set(r.id, Number(r.score));
    }
    return map;
  }

  /** 最常发的几张（后台展示 / 调参） */
  topStickers(limit = 10) {
    return this.db
      .prepare('SELECT id, category, sent, replied_fast, replied_slow, no_reply, score FROM sticker_stats ORDER BY sent DESC LIMIT ?')
      .all(limit);
  }

  /** 用户列表（后台用）：昵称、消息数、最后活跃、当前人设 */
  listUsers() {
    return this.db
      .prepare(
        `SELECT u.qq, u.nickname, u.created_at AS createdAt, u.last_seen AS lastSeen,
                (SELECT COUNT(*) FROM messages m WHERE m.qq = u.qq) AS messages
         FROM users u ORDER BY u.last_seen DESC`,
      )
      .all();
  }

  /** 取最近消息（测试台历史用，带时间） */
  selectMessages(qq, limit = 40) {
    return this.db
      .prepare('SELECT role, content, created_at AS at FROM messages WHERE qq = ? ORDER BY id DESC LIMIT ?')
      .all(qq, limit)
      .reverse();
  }

  /** 清掉某个用户的对话记录（测试台重置用） */
  clearUserMessages(qq) {
    this.db.prepare('DELETE FROM messages WHERE qq = ?').run(qq);
    this.db.prepare('DELETE FROM turns WHERE qq = ?').run(qq);
    this.db.prepare('DELETE FROM summaries WHERE qq = ?').run(qq);
    this.db.prepare('DELETE FROM perceptions WHERE qq = ?').run(qq);
    this.db.prepare('DELETE FROM facts WHERE qq = ?').run(qq);
    this.db.prepare('DELETE FROM state WHERE qq = ?').run(qq);
  }

  addPerception(qq, text, obj) {
    this.db
      .prepare('INSERT INTO perceptions (qq, text, json, created_at) VALUES (?, ?, ?, ?)')
      .run(qq, String(text || '').slice(0, 300), JSON.stringify(obj || {}), Date.now());
  }

  /** 写一条情节记忆（发生过什么，带地点和情绪）
   *  干扰控制：和近 7 天某条"说的是同一件事"就合并，不新增（人脑里相似记忆会互相压制）
   */
  addEpisode(qq, { text, kind = 'event', place = '', mood = 0, importance = 3, at = Date.now() }) {
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return;
    const imp = Math.max(1, Math.min(5, Number(importance) || 3));
    const similar = findSimilar(this.recentEpisodes(qq, 50, 7), t);
    if (similar) {
      this.db
        .prepare('UPDATE episodes SET text = ?, at = ?, importance = MAX(importance, ?), mood = ? WHERE id = ?')
        .run(t, at, imp, Number(mood) || 0, similar.id);
      return;
    }
    this.db
      .prepare('INSERT INTO episodes (qq, text, kind, place, mood, importance, at) VALUES (?,?,?,?,?,?,?)')
      .run(qq, t, kind, place, Number(mood) || 0, imp, at);
  }

  /** 召回最近的情节（默认 14 天，最多 40 条） */
  recentEpisodes(qq, limit = 40, days = 14) {
    return this.db
      .prepare(
        'SELECT id, text, kind, place, mood, importance, at FROM episodes WHERE qq = ? AND at > ? ORDER BY id DESC LIMIT ?',
      )
      .all(qq, Date.now() - days * 86400_000, limit);
  }

  /** 记一次场景变化（同一场景 id 不重复记） */
  addSceneLog(qq, scene) {
    if (!scene || !scene.location) return;
    const last = this.db
      .prepare('SELECT scene_id, location, doing FROM scene_log WHERE qq = ? ORDER BY id DESC LIMIT 1')
      .get(qq);
    if (last && last.scene_id === scene.id && last.doing === scene.doing) return;
    this.db
      .prepare('INSERT INTO scene_log (qq, at, scene_id, location, doing, pace, chat, place) VALUES (?,?,?,?,?,?,?,?)')
      .run(qq, Date.now(), scene.id || '', scene.location, scene.doing, scene.pace || '', Number(scene.chat) || 0, scene.place || '');
  }

  /** 某一天的场景变化 */
  sceneLog(qq, fromMs, toMs = Date.now()) {
    return this.db
      .prepare('SELECT * FROM scene_log WHERE qq = ? AND at >= ? AND at <= ? ORDER BY at')
      .all(qq, fromMs, toMs);
  }

  /** 一段时间内的对话轮次（时间线用） */
  turnsSince(qq, fromMs, limit = 300) {
    return this.db
      .prepare('SELECT id, at, input, act, reply FROM turns WHERE qq = ? AND at >= ? ORDER BY at LIMIT ?')
      .all(qq, fromMs, limit);
  }

  /** 最近一条感知结果（感知失败 / 短消息时继承语气用） */  lastPerception(qq) {
    const row = this.db
      .prepare('SELECT json, created_at FROM perceptions WHERE qq = ? ORDER BY id DESC LIMIT 1')
      .get(qq);
    if (!row) return null;
    // 超过 6 小时的不继承，避免用过时的语气
    if (Date.now() - Number(row.created_at) > 6 * 3600_000) return null;
    try {
      return JSON.parse(row.json);
    } catch {
      return null;
    }
  }
  /** 某条消息之后的所有消息（用于做摘要） */
  messagesSince(qq, afterId, limit = 200) {
    return this.db
      .prepare('SELECT id, role, content FROM messages WHERE qq = ? AND id > ? ORDER BY id LIMIT ?')
      .all(qq, afterId, limit);
  }

  /** 最近 n 条她说的话（用于重复检测） */
  recentAssistant(qq, n = 4) {
    return this.db
      .prepare("SELECT content FROM messages WHERE qq = ? AND role = 'assistant' ORDER BY id DESC LIMIT ?")
      .all(qq, n)
      .map((r) => r.content);
  }

  addSummary(qq, level, period, content) {
    this.db
      .prepare('INSERT INTO summaries (qq, level, period, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(qq, level, period, content, Date.now());
  }

  getSummaries(qq, limit = 6) {
    return this.db
      .prepare('SELECT id, period, content FROM summaries WHERE qq = ? ORDER BY id DESC LIMIT ?')
      .all(qq, limit)
      .reverse();
  }

  /** 用给定的几段摘要整体替换该用户该层的摘要 */
  replaceSummaries(qq, level, contents) {
    this.db.prepare('DELETE FROM summaries WHERE qq = ? AND level = ?').run(qq, level);
    for (const c of contents) this.addSummary(qq, level, new Date().toISOString().slice(0, 10), c);
  }
  /** 最后一次「人说的」消息时间，用于判断多久没互动了 */
  lastUserMessageAt(qq) {
    const row = this.db.prepare("SELECT MAX(created_at) AS t FROM messages WHERE qq = ? AND role = 'user'").get(qq);
    return Number(row?.t || 0);
  }

  /** 今天已经主动开口几次 */
  countProactiveToday(qq) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
         WHERE qq = ? AND role = 'assistant' AND meta LIKE '%"proactive":true%' AND created_at >= ?`,
      )
      .get(qq, start.getTime());
    return Number(row?.c || 0);
  }

  recordUsage(qq, model, promptTokens, completionTokens, costYuan, tag = '') {
    this.db
      .prepare(
        'INSERT INTO usage (qq, model, prompt_tokens, completion_tokens, cost_yuan, created_at, tag) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(qq, model, promptTokens, completionTokens, costYuan, Date.now(), String(tag || ''));
  }

  /** 一段时间内的每次调用，用于用量图表 */
  usageSince(sinceMs) {
    return this.db
      .prepare(
        'SELECT id, qq, model, prompt_tokens AS prompt, completion_tokens AS completion, cost_yuan AS cost, created_at AS at, tag FROM usage WHERE created_at >= ? ORDER BY id',
      )
      .all(sinceMs);
  }

  /** 今天花了多少（用于预算告警，M5 接） */
  todayCost(qq = null) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const row = qq
      ? this.db.prepare('SELECT SUM(cost_yuan) AS c FROM usage WHERE qq = ? AND created_at >= ?').get(qq, start.getTime())
      : this.db.prepare('SELECT SUM(cost_yuan) AS c FROM usage WHERE created_at >= ?').get(start.getTime());
    return Number(row?.c || 0);
  }

  /** 清理：只留最近 N 天的原始消息（长期事实不受影响） */
  pruneMessages(days = 7) {
    const cutoff = Date.now() - days * 86_400_000;
    const r = this.db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
    return r.changes ?? 0;
  }

  close() {
    this.db.close();
  }
}

/** 两段文字是不是在说同一件事：包含关系，或二元组重合度过半 */
function findSimilar(list, text) {
  const norm = (x) => String(x || '').replace(/[\s，。！？、~～…「」"'']/g, '');
  const a = norm(text);
  if (a.length < 4) return null;
  const grams = (x) => {
    const out = new Set();
    for (let i = 0; i < x.length - 1; i++) out.add(x.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  for (const ep of list || []) {
    const b = norm(ep.text);
    if (!b) continue;
    if (a === b || b.includes(a) || a.includes(b)) return ep;
    const gb = grams(b);
    let hit = 0;
    for (const g of ga) if (gb.has(g)) hit++;
    if (hit / Math.max(1, Math.min(ga.size, gb.size)) >= 0.5) return ep;
  }
  return null;
}
