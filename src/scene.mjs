/**
 * 场景层 v2：按 preset 算时间带，按场景池选场景，事项有生命周期，产出 seeds。
 *
 * 兼容：对外仍是 getScene / sceneBlock / findConflict / learnScene，
 * 返回值保留 location / doing / pending / since / minutes，旧调用方不用改。
 */
import fs from 'node:fs';
import path from 'node:path';

const LIFE_DIR = path.resolve('personas', 'life');
const HISTORY_KEEP = 4;

/** 事项在"待办"阶段停留多久（分钟），之后转 doing */
const ITEM_PENDING_MIN = 18;

/* ── 载入配置（一次性，改文件后需重启）────────────────── */
function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const TEMPLATE = loadJson(path.join(LIFE_DIR, 'template.json')) || {
  itemRules: {
    chore: { expectMin: [5, 180], carry: true, doneKeepMin: 120 },
    work: { expectMin: [10, 240], carry: false, doneKeepMin: 60 },
    meal: { expectMin: [5, 40], carry: false, doneKeepMin: 60 },
    commute: { expectMin: [5, 60], carry: false, doneKeepMin: 30 },
    leisure: { expectMin: [5, 90], carry: false, doneKeepMin: 60 },
  },
  seedsRule: { max: 3, minChar: 4 },
  refresh: { minMin: 25, maxMin: 90, doneSwapChance: 0.6 },
};

const PRESET = loadJson(path.join(LIFE_DIR, 'presets', 'office.json')) || {
  wake: 7.2,
  leave: 8.2,
  workStart: 9,
  lunch: [12, 13],
  workEnd: 18,
  home: 18.8,
  sleep: 0.3,
};

export const PENDING_TTL_HOURS = 1.5;

/** 场景池 */
const HOLDS = [];
try {
  const dir = path.join(LIFE_DIR, 'scenes');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const data = loadJson(path.join(dir, f));
    if (!data?.scenes) continue;
    for (const s of data.scenes) HOLDS.push({ ...s, band: s.band || data.band, hours: data.hours });
  }
} catch {
  /* 没有场景文件就退回空，getScene 会用兜底场景 */
}

const FALLBACK = { id: 'fallback', place: 'home', location: '家', doing: '在发呆', pace: 'normal', chat: 0.6, items: [{ text: '在想一件没想通的事', kind: 'leisure', expectMin: 30 }] };

/* ── 按人设解析"生活配置" ─────────────────────────────
 * 单文件方案：人设 JSON 里写 life，就用人设自己的作息和场景；
 * 没写就退回 office + 通用场景池，新人设不需要额外文件也能跑。
 */
const LIFE_CACHE = new Map();

function lifeOf(persona) {
  const inline = persona && persona.life;
  if (!inline || typeof inline !== 'object') return { preset: PRESET, holds: HOLDS, key: 'default' };

  const key = `${persona.name || ''}|${Object.keys(inline).length}|${(inline.scenes || []).length}`;
  if (LIFE_CACHE.has(key)) return LIFE_CACHE.get(key);

  const preset = {
    ...PRESET,
    ...(inline.preset && typeof inline.preset === 'object' ? inline.preset : {}),
  };
  let holds = [];
  if (Array.isArray(inline.scenes) && inline.scenes.length) {
    holds = inline.scenes.map((s) => ({ ...s, band: s.band, hours: s.hours, _own: true }));
  }
  // 通用场景（吃饭/刷手机/洗澡）默认也给她用
  if (inline.common !== false) holds = holds.concat(HOLDS);
  if (!holds.length) holds = HOLDS;

  const life = { preset, holds, key };
  LIFE_CACHE.set(key, life);
  return life;
}

/* ── 时间带：由 preset 算出来 ─────────────────────────── */
function bands(preset = PRESET) {
  const [l0, l1] = preset.lunch || [12, 13];
  return [
    ['morning', preset.wake ?? 7.2, preset.leave ?? 8.2],
    ['forenoon', preset.workStart ?? 9, l0],
    ['noon', l0, l1],
    ['afternoon', l1, preset.workEnd ?? 18],
    ['evening', preset.workEnd ?? 18, 21.5],
    ['night', 21.5, 24],
  ];
}

function bandOf(hour, preset = PRESET) {
  for (const [name, from, to] of bands(preset)) if (hour >= from && hour < to) return name;
  return hour < 7 ? 'night' : 'night';
}

function bandHours(name) {
  const b = TEMPLATE.bands?.[name];
  return b || { chat: 0.6, pace: 'normal' };
}

/* ── 挑场景 ───────────────────────────────────────────── */
function pick(history, hour, preset = PRESET, holds = HOLDS) {
  const band = bandOf(hour, preset);
  let pool = holds.filter((h) => h.band === band);
  if (!pool.length) pool = holds;
  // ????????????????????????60% ??????
  const own = pool.filter((h) => h._own);
  if (own.length && Math.random() < 0.6) pool = own;
  if (!pool.length) return FALLBACK;

  const recentDoing = new Set(history.map((x) => x.doing));
  const recentPlace = new Set(history.slice(0, 2).map((x) => x.location));
  for (const filter of [
    (x) => !recentDoing.has(x.doing) && !recentPlace.has(x.location),
    (x) => !recentDoing.has(x.doing),
    () => true,
  ]) {
    const p = pool.filter(filter);
    if (p.length) return p[Math.floor(Math.random() * p.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function readHistory(memory, qq) {
  try {
    const arr = JSON.parse(memory.getState(qq, 'sceneHistory', '[]'));
    return Array.isArray(arr) ? arr.slice(-HISTORY_KEEP) : [];
  } catch {
    return [];
  }
}

/* ── 事项生命周期 ─────────────────────────────────────── */
function phaseOf(item, now) {
  const rule = TEMPLATE.itemRules?.[item.kind] || {};
  const elapsed = (now - item.at) / 60_000;
  const expect = Number(item.expectMin) || 30;
  const pendingMin = Math.min(ITEM_PENDING_MIN, Math.max(2, expect * 0.4));
  if (elapsed < pendingMin) return 'pending';
  if (elapsed < expect) return 'doing';
  const keep = Number(rule.doneKeepMin) ?? 60;
  if (elapsed < expect + keep) return 'done';
  return 'expired';
}

function advance(items, now) {
  const out = [];
  for (const it of items || []) {
    const phase = phaseOf(it, now);
    if (phase === 'expired') continue;
    const doneAt = phase === 'done' ? it.at + (Number(it.expectMin) || 30) * 60_000 : null;
    out.push({ ...it, phase, doneAt });
  }
  return out;
}

function buildSeeds(items) {
  const rule = TEMPLATE.seedsRule || { max: 3, minChar: 4 };
  const minChar = rule.minChar ?? 4;
  const usable = (it) => String(it.text || '').replace(/\s/g, '').length >= minChar;
  const order = ['done', 'doing', 'pending'];
  const seeds = [];
  for (const ph of order) {
    for (const it of items) {
      if (it.phase !== ph || !usable(it)) continue;
      seeds.push({ text: it.text, source: ph, kind: it.kind, weight: ph === 'done' ? 0.9 : ph === 'doing' ? 0.7 : 0.5 });
    }
  }
  return seeds.slice(0, rule.max ?? 3);
}

/* ── 对外：取场景 ─────────────────────────────────────── */
export function getScene(memory, qq, persona = null) {
  const life = lifeOf(persona);
  const now = Date.now();
  const raw = memory.getState(qq, 'scene', '');
  const since = Number(memory.getState(qq, 'sceneSince', 0));
  const holdMax = (TEMPLATE.refresh?.maxMin ?? 90) * 60_000;
  const holdMin = (TEMPLATE.refresh?.minMin ?? 25) * 60_000;
  let carriedDone = []; // 换场景也要把"刚做完的事"带出去，否则情绪丢了

  if (raw && since && now - since < holdMax) {
    try {
      const s = JSON.parse(raw);
      const el = now - since;
      if (el < holdMin || Math.random() < 0.5) {
        const items = advance(s.items, now);
        // 找出"刚变成 done"的事项：交给情绪层注入（appraisal 是燃料）
        const prevPhase = new Map((s.items || []).map((i) => [i.text, i.phase || null]));
        const doneNow = items
          .filter((i) => i.phase === 'done' && prevPhase.get(i.text) !== 'done' && i.appraisal)
          .map((i) => ({ text: i.text, appraisal: i.appraisal }));
        // 待办全部做完 → 有机会换场景
        const allDone = items.length > 0 && items.every((i) => i.phase === 'done');
        if (!(allDone && Math.random() < (TEMPLATE.refresh?.doneSwapChance ?? 0.6))) {
          // 把带 phase 的事项写回去，下一轮才有得比
          memory.setState(qq, 'scene', JSON.stringify({ ...s, items }));
          return decorate(s, items, since, now, doneNow);
        }
        // 要换场景：这些"刚做完"的事仍然要交给情绪层
        carriedDone = doneNow;
      }
    } catch {
      /* 坏数据当没有 */
    }
  }

  const history = readHistory(memory, qq);
  const hour = new Date().getHours();
  const hold = pick(history, hour, life.preset, life.holds);
  const items = (hold.items || []).map((it) => ({
    text: it.text,
    kind: it.kind,
    expectMin: it.expectMin,
    carry: Boolean(it.carry),
    appraisal: it.appraisal || null,
    at: now,
  }));

  const scene = {
    id: hold.id,
    place: hold.place,
    band: hold.band || bandOf(hour, life.preset),
    location: hold.location,
    doing: hold.doing,
    pace: hold.pace || bandHours(bandOf(hour, life.preset)).pace,
    chat: Number.isFinite(hold.chat) ? hold.chat : bandHours(bandOf(hour, life.preset)).chat,
    items,
    since: now,
  };

  memory.setState(qq, 'scene', JSON.stringify(scene));
  memory.setState(qq, 'sceneSince', now);
  memory.setState(
    qq,
    'sceneHistory',
    JSON.stringify([...history, { location: scene.location, doing: scene.doing }].slice(-HISTORY_KEEP)),
  );
  if (memory.addSceneLog) memory.addSceneLog(qq, scene);
  return decorate(scene, advance(items, now), now, now, carriedDone);
}

function decorate(scene, items, since, now, doneNow = []) {
  let seeds = buildSeeds(items);
  if (!seeds.length) seeds = [{ text: scene.doing, source: 'doing', kind: 'leisure', weight: 0.4 }];
  const pending = items.filter((i) => i.phase !== 'done').map((i) => ({ text: i.text, at: i.at }));
  return {
    ...scene,
    items,
    seeds,
    chat: Number.isFinite(scene.chat) ? scene.chat : 0.6,
    pace: scene.pace || 'normal',
    pending,
    hasSeed: seeds.length > 0,
    doneNow,
    minutes: Math.round((now - since) / 60_000),
  };
}

/* ── 兼容接口 ─────────────────────────────────────────── */
export function learnScene(memory, qq, reply) {
  const t = String(reply || '');
  if (!t) return;
  if (/(回来了|到家了|进家门)/.test(t)) {
    const scene = getScene(memory, qq);
    if (scene.location !== '家') {
      scene.location = '家';
      scene.place = 'home';
      memory.setState(qq, 'scene', JSON.stringify({ ...scene, pending: undefined, seeds: undefined }));
    }
  }
}

const VAGUE = new Set(['路上']);

export function findConflict(scene, reply) {
  const t = String(reply || '');
  const actual = scene.location;
  for (const { re, place } of PLACE_ALIAS) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 4), m.index);
      if (/你/.test(before)) continue;
      if (place === actual) return null;
      if (VAGUE.has(place) || VAGUE.has(actual)) return null;
      return { claimed: place, actual };
    }
  }
  return null;
}

export function sceneBlock(scene, { withPending = true } = {}) {
  const lines = [`【你现在的状态】${scene.location}，${scene.doing}${scene.minutes > 0 ? `（已经 ${scene.minutes} 分钟）` : ''}`];
  if (withPending) {
    const seed = scene.seeds?.[0];
    if (seed) {
      lines.push(`【手头的事】${seed.text}（可以提，也可以不提；别每句都提同一件）`);
    } else if (scene.pending?.length) {
      lines.push(`【手头的事】${scene.pending.map((p) => p.text).join('、')}`);
    }
  }
  if (scene.pace === 'busy') lines.push('（你现在手上有事，回得短一点）');
  if (scene.pace === 'quiet') lines.push('（你现在是闲着的，可以多说两句）');
  lines.push('——这是你的真实情况，话里不能和它矛盾；也不用主动全报备。');
  return lines.join('\n');
}

const PLACE_ALIAS = [
  { re: /(家里|在家|回?到家|沙发上|厨房|阳台|床上?|卧室|卫生间|屋里)/, place: '家' },
  { re: /(便利店|超市|小卖部)/, place: '便利店' },
  { re: /(公司|工位|办公室|会议室)/, place: '公司' },
  { re: /(地铁|车厢|站台)/, place: '地铁' },
  { re: /(路上|街上|路边)/, place: '路上' },
  { re: /(咖啡店|咖啡厅)/, place: '咖啡店' },
  { re: /(餐厅|食堂|饭馆)/, place: '餐厅' },
  { re: /(公园)/, place: '公园' },
  { re: /(床上)/, place: '床上' },
];
