/**
 * 用 emoji-datasource-apple 的 64px 图，挑一套"贴合林知夏"的表情包。
 * 输出到 stickers2/（先不覆盖旧库），并生成候选清单。
 *
 * node scripts/build-stickers-v2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'E:/ai-gf/tools/emoji/node_modules/emoji-datasource-apple';
const OUT = 'E:/ai-gf/stickers2';
const IMG_DIR = path.join(SRC, 'img/apple/64');

const emoji = JSON.parse(fs.readFileSync(path.join(SRC, 'emoji.json'), 'utf8'));
const byShort = new Map();
for (const e of emoji) {
  if (e.has_img_apple === false) continue;
  byShort.set(e.short_name, e);
  // 有些版本 short_name 是数组
  if (Array.isArray(e.short_names)) for (const s of e.short_names) if (!byShort.has(s)) byShort.set(s, e);
}

// 每个分类：挑贴合"温柔/粘人/会自嘲"的
const PLAN = {
  开心: [
    ['grinning', '咧嘴笑'],
    ['smiley', '笑眼'],
    ['smile', '笑'],
    ['grin', '嘻嘻'],
    ['joy', '笑到打滚'],
    ['rolling_on_the_floor_laughing', '笑翻'],
    ['star_struck', '眼睛发光'],
    ['partying_face', '庆祝'],
    ['smiling_face_with_three_hearts', '冒爱心'],
    ['heart_eyes', '花痴'],
    ['yum', '好吃'],
    ['sunglasses', '得意'],
  ],
  好笑: [
    ['sweat_smile', '哭笑不得'],
    ['zany_face', '搞怪'],
    ['upside_down_face', '倒着的笑'],
    ['wink', '眨眼'],
    ['smirk', '坏笑'],
    ['stuck_out_tongue', '吐舌头'],
    ['stuck_out_tongue_winking_eye', '吐舌眨眼'],
    ['smiling_imp', '小恶魔'],
    ['clown_face', '小丑竟是我'],
    ['face_with_hand_over_mouth', '捂嘴笑'],
    ['giggle', '咯咯笑'],
    ['laughing', '大笑'],
  ],
  无语: [
    ['unamused', '无语'],
    ['expressionless', '面无表情'],
    ['neutral_face', '平静'],
    ['roll_eyes', '翻白眼'],
    ['face_with_rolling_eyes', '翻白眼'],
    ['grimacing', '尴尬'],
    ['no_mouth', '无话可说'],
    ['face_with_raised_eyebrow', '挑眉'],
    ['face_with_monocle', '你在逗我'],
    ['lying_face', '皮诺曹'],
    ['dotted_line_face', '消失中'],
    ['zipper_mouth_face', '闭嘴了'],
  ],
  生气: [
    ['angry', '生气'],
    ['rage', '暴怒'],
    ['pout', '撅嘴'],
    ['triumph', '不服'],
    ['face_with_symbols_on_mouth', '骂人'],
    ['enraged_face', '气炸'],
    ['thumbsdown', '差评'],
    ['broken_heart', '心碎'],
    ['face_with_steam_from_nose', '气到冒烟'],
    ['imp', '恼火'],
    ['not_amused', '不爽'],
    ['miffed', '不乐意'],
  ],
  难过: [
    ['cry', '哭'],
    ['sob', '大哭'],
    ['disappointed', '失望'],
    ['pensive', '难过'],
    ['worried', '担心'],
    ['slightly_frowning_face', '皱眉'],
    ['white_frowning_face', '皱眉'],
    ['confounded', '崩溃'],
    ['weary', '心累'],
    ['pleading_face', '求求你'],
    ['people_hugging', '抱团'],
    ['crying_cat_face', '猫猫哭'],
  ],
  撒娇: [
    ['kissing_heart', '亲一个'],
    ['kissing', '么么'],
    ['kissing_closed_eyes', '闭眼亲'],
    ['kissing_smiling_eyes', '笑着亲'],
    ['smiling_face_with_hearts', '爱心脸'],
    ['hugging_face', '抱抱'],
    ['hug', '抱'],
    ['innocent', '无辜'],
    ['blush', '脸红'],
    ['relaxed', '放松'],
    ['two_hearts', '两颗心'],
    ['sparkling_heart', '闪亮的心'],
  ],
  累困: [
    ['sleeping', '睡着'],
    ['sleepy', '困'],
    ['tired_face', '累'],
    ['zzz', '困困'],
    ['yawning_face', '打哈欠'],
    ['woozy_face', '晕乎乎'],
    ['dizzy_face', '晕'],
    ['melting_face', '化了'],
    ['face_exhaling', '叹气'],
    ['face_with_head_bandage', '脑壳疼'],
    ['hot_face', '热到冒烟'],
    ['sneeze', '打喷嚏'],
  ],
  疑惑: [
    ['thinking', '思考'],
    ['confused', '困惑'],
    ['face_with_spiral_eyes', '眼中打转'],
    ['exploding_head', '脑子炸了'],
    ['question', '问号'],
    ['grey_question', '灰问号'],
    ['interrobang', '？！'],
    ['astonished', '惊'],
    ['flushed', '脸红耳赤'],
    ['open_mouth', '张大嘴'],
    ['face_vomiting', '吐了'],
    ['nauseated_face', '晕车脸'],
  ],
  鼓励: [
    ['thumbsup', '赞'],
    ['plus1', '点赞'],
    ['pray', '拜托'],
    ['muscle', '加油'],
    ['clap', '鼓掌'],
    ['ok_hand', 'OK'],
    ['fist', '拳头'],
    ['raised_hands', '举手'],
    ['100', '满分'],
    ['fire', '绝了'],
    ['sparkles', '闪闪'],
    ['tada', '当当'],
  ],
  亲密: [
    ['heart', '爱心'],
    ['orange_heart', '橙心'],
    ['yellow_heart', '黄心'],
    ['purple_heart', '紫心'],
    ['revolving_hearts', '绕圈心'],
    ['heartbeat', '心跳'],
    ['gift_heart', '心意'],
    ['love_letter', '情书'],
    ['couple_with_heart', '你和我'],
    ['couplekiss', '亲亲'],
    ['smiley_cat', '猫猫笑'],
    ['cat_face', '猫'],
  ],
};

const slug = (s) => s.replace(/[^a-z0-9_]/gi, '_');
const index = [];
fs.mkdirSync(OUT, { recursive: true });

let total = 0;
const missing = [];
for (const [cat, list] of Object.entries(PLAN)) {
  fs.mkdirSync(path.join(OUT, cat), { recursive: true });
  for (const [name, desc] of list) {
    const e = byShort.get(name);
    if (!e) {
      missing.push(`${cat}/${name}`);
      continue;
    }
    const file = path.join(IMG_DIR, `${e.unified.toLowerCase()}.png`);
    if (!fs.existsSync(file)) {
      missing.push(`${cat}/${name}（无图 ${e.unified}）`);
      continue;
    }
    const id = `${slug(name)}`;
    const dest = path.join(OUT, cat, `${id}.png`);
    fs.copyFileSync(file, dest);
    index.push({ id, category: cat, desc, emoji: e.char, file: `stickers2/${cat}/${id}.png` });
    total++;
  }
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT, 'MISSING.txt'), missing.join('\n'), 'utf8');

console.log(`✓ 生成 ${total} 张，覆盖 ${Object.keys(PLAN).length} 类`);
for (const [cat, list] of Object.entries(PLAN)) {
  const n = index.filter((x) => x.category === cat).length;
  console.log(`  ${cat}: ${n}/${list.length}`);
}
if (missing.length) {
  console.log(`\n缺失 ${missing.length} 个（写进 stickers2/MISSING.txt）:`);
  console.log('  ' + missing.slice(0, 15).join('、'));
}
