/**
 * 从 emoji-datasource-google 里挑一批表情，按情绪分类复制到 stickers/，
 * 并生成 stickers/index.json（给 dsh 的选图逻辑用）。
 *
 * 用法：node scripts/build-stickers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.resolve('node_modules/emoji-datasource-google');
const OUT = path.resolve('stickers');

/** short_name → { 分类, 中文描述 } */
const CURATED = {
  // 开心 / 正向
  joy: { cat: '开心', desc: '笑到流泪，非常开心' },
  grin: { cat: '开心', desc: '咧嘴笑' },
  smile: { cat: '开心', desc: '微笑' },
  smiley: { cat: '开心', desc: '笑得很灿烂' },
  'star-struck': { cat: '开心', desc: '眼冒星星，崇拜或惊艳' },
  tada: { cat: '开心', desc: '庆祝、搞定了一件事' },
  clap: { cat: '开心', desc: '鼓掌、夸奖' },

  // 好笑
  rolling_on_the_floor_laughing: { cat: '好笑', desc: '笑到打滚' },
  laughing: { cat: '好笑', desc: '笑得眯眼' },
  sweat_smile: { cat: '好笑', desc: '尴尬又不失礼貌地笑' },
  smiling_face_with_tear: { cat: '好笑', desc: '笑中带泪' },

  // 无语 / 吐槽
  expressionless: { cat: '无语', desc: '面无表情' },
  neutral_face: { cat: '无语', desc: '平淡脸，不想说话' },
  unamused: { cat: '无语', desc: '嫌弃、不屑' },
  face_with_rolling_eyes: { cat: '无语', desc: '翻白眼' },
  'man-facepalming': { cat: '无语', desc: '扶额，被你整无语了' },
  skull: { cat: '无语', desc: '笑死/社死，人没了' },

  // 生气 / 吃醋
  angry: { cat: '生气', desc: '生气' },
  person_with_pouting_face: { cat: '生气', desc: '噘嘴不高兴' },
  rage: { cat: '生气', desc: '暴怒' },

  // 难过 / 委屈
  cry: { cat: '难过', desc: '哭' },
  sob: { cat: '难过', desc: '大哭' },
  disappointed: { cat: '难过', desc: '失望' },
  pensive: { cat: '难过', desc: '低落、发呆' },
  weary: { cat: '难过', desc: '疲惫又无奈' },
  broken_heart: { cat: '难过', desc: '心碎' },

  // 撒娇 / 亲密
  smiling_face_with_3_hearts: { cat: '撒娇', desc: '眼里冒爱心' },
  heart_eyes: { cat: '撒娇', desc: '爱心眼' },
  pleading_face: { cat: '撒娇', desc: '求求你了' },
  kissing_heart: { cat: '撒娇', desc: '飞吻' },
  hugging_face: { cat: '撒娇', desc: '抱抱' },
  heart_hands: { cat: '撒娇', desc: '比心' },

  // 累 / 困
  sleeping: { cat: '累困', desc: '睡着了' },
  sleepy: { cat: '累困', desc: '困得流鼻涕泡' },
  yawning_face: { cat: '累困', desc: '打哈欠' },
  tired_face: { cat: '累困', desc: '累到虚脱' },

  // 疑惑
  thinking_face: { cat: '疑惑', desc: '思考、琢磨' },
  face_with_raised_eyebrow: { cat: '疑惑', desc: '挑眉怀疑' },
  confused: { cat: '疑惑', desc: '困惑' },
  question: { cat: '疑惑', desc: '问号' },

  // 鼓励 / 加油
  raised_hands: { cat: '鼓励', desc: '举手欢呼' },
  pray: { cat: '鼓励', desc: '拜托/祈祷' },
  thumbsup: { cat: '鼓励', desc: '赞/收到' },
  ok_hand: { cat: '鼓励', desc: 'OK，没问题' },
  muscle: { cat: '鼓励', desc: '强壮、有力' },

  // 亲密 / 爱心
  heart: { cat: '亲密', desc: '红心' },
  sparkling_heart: { cat: '亲密', desc: '闪亮的心' },
  two_hearts: { cat: '亲密', desc: '两颗心' },
  kiss: { cat: '亲密', desc: '亲吻' },
};

const emojis = JSON.parse(fs.readFileSync(path.join(PKG, 'emoji.json'), 'utf8'));
const byShort = new Map();
for (const e of emojis) {
  for (const sn of e.short_names || [e.short_name]) byShort.set(sn, e);
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
const missing = [];

for (const [short, meta] of Object.entries(CURATED)) {
  const e = byShort.get(short);
  if (!e) {
    missing.push(short);
    continue;
  }
  const src = path.join(PKG, 'img', 'google', '64', e.image);
  if (!fs.existsSync(src)) {
    missing.push(`${short}(无图 ${e.image})`);
    continue;
  }
  const dir = path.join(OUT, meta.cat);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${short}.png`);
  fs.copyFileSync(src, file);
  index.push({
    id: short,
    file: path.relative(OUT, file).replace(/\\/g, '/'),
    category: meta.cat,
    desc: meta.desc,
    emoji: e.character || '',
  });
}

// 保留旧的手绘图（如果还在），标成"自绘"
const oldIndex = path.join(OUT, 'stickers.json');
if (fs.existsSync(oldIndex)) {
  try {
    const old = JSON.parse(fs.readFileSync(oldIndex, 'utf8').replace(/^\uFEFF/, ''));
    for (const s of old.stickers || []) {
      const p = path.join(OUT, s.file);
      if (fs.existsSync(p) && !index.some((i) => i.id === s.tag)) {
        index.push({ id: s.tag, file: s.file, category: '自绘', desc: s.desc });
      }
    }
  } catch {
    /* 旧的坏了就算了 */
  }
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ stickers: index }, null, 2), 'utf8');

const byCat = {};
for (const s of index) (byCat[s.category] ??= []).push(s.id);
console.log(`共 ${index.length} 张表情包：`);
for (const [cat, ids] of Object.entries(byCat)) console.log(`  ${cat}（${ids.length}）：${ids.join(', ')}`);
if (missing.length) console.log(`\n缺失 ${missing.length} 个：${missing.join(', ')}`);
