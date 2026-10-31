/**
 * 测试语句库生成器：5000 条，覆盖"连续 / 无关 / 无意义 / 情绪 / 场景 / 形式变异"。
 *
 * 设计依据：
 *  - 对话行为分类参考 ISO 24617-2 / SwDA 的中文简化版（问候、提问、陈述、请求、确认、道歉…）
 *  - 语料形态参考清华 LCCC 短文本对话（单条短、多轮紧密）
 *  - 语音助手场景分类（问候/请求/提问/反馈/抱怨）来自公开论文的分类表
 *
 * 输出：
 *  - test/corpus/messages-5000.jsonl   每行 {id, text, category, sub, group, turn, source}
 *  - test/corpus/messages-5000.csv     方便用 Excel 看
 *  - docs/corpus-report.md             类型分布报告
 *
 * node scripts/build-corpus.mjs [数量]
 */
import fs from 'node:fs';
import path from 'node:path';

const TOTAL = Number(process.argv[2] || 5000);
const OUT_DIR = path.resolve('test', 'corpus');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 可复现随机 ─────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261023);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const maybe = (s) => (rnd() < 0.5 ? s : '');

// ── 槽位词表 ───────────────────────────────────────────────
const SLOT = {
  食物: ['火锅', '烧烤', '螺蛳粉', '麻辣烫', '寿司', '面条', '饺子', '麻辣香锅', '炸鸡', '粥'],
  地点: ['公司', '学校', '地铁', '楼下', '超市', '医院', '咖啡店', '健身房', '公园', '家'],
  时间: ['今天', '昨天', '早上', '中午', '下午', '晚上', '凌晨', '周末', '上周', '刚才'],
  人物: ['领导', '同事', '我妈', '室友', '老师', '客户', '老板', '朋友', '学长', '房东'],
  工作物: ['方案', '报表', '需求', '代码', '文案', 'PPT', '合同', '排期', '预算', '设计稿'],
  应用: ['微信', '抖音', 'B站', '游戏', '外卖软件', '淘宝', '小红书', '微博'],
  症状: ['头疼', '嗓子疼', '发烧', '咳嗽', '胃疼', '腰酸', '眼睛干', '流鼻涕'],
};

const PREFIX = ['', '', '', '', '欸，', '对了，', '那个，', '话说，', '哎，', '刚想起来，', 'emm，', '问你个事，'];
const SUFFIX = ['啊', '呀', '……', '！！', '哈', '欸'];
const seen = new Set();

/**
 * 给句子加口语修饰，用来拉开多样性。
 * 有三条硬规则，否则会产出"睡了吗啊""上次说的那个事你还记得吗呢"这种病句：
 *   - 结尾是 吗/呢/吧/啊/？/！ 的，不再加语气词
 *   - 疑问句、超短反应句（≤3 字）不加前缀
 *   - 前缀只在 35% 的情况下加
 */
function decorate(text) {
  let t = text;
  const endsModal = /[吗呢吧啊嘛哦]$/.test(t);
  const endsPunct = /[？?！!。…，、]$/.test(t);
  const isQuestion = endsModal || /[？?]$/.test(t);
  const isReaction = t.replace(/\s/g, '').length <= 3;

  const len = t.replace(/\s/g, '').length;
  const oddStart = /^(哈哈|笑死|成了|好了|嗯|是|对|行|在|哦)/.test(t);
  if (!isQuestion && !isReaction && !endsPunct && !oddStart && len >= 6 && rnd() < 0.35) t = pick(PREFIX) + t;

  if (!endsModal && !endsPunct && len >= 4 && !/[哈欸]$/.test(t) && rnd() < 0.35) t += pick(SUFFIX);
  return t;
}

/** 对话片段专用：口语里前缀/语气词更密，用它拉开差异 */
function decorateDialogue(text) {
  let t = text;
  const len = t.replace(/\s/g, '').length;
  const q = /[？?吗呢吧]$/.test(t);
  if (!q && len >= 5 && rnd() < 0.62) t = pick(['欸，', '我跟你讲，', '对了，', '那个，', '真的，', '说真的，', '哎，', '唉，', '嗯……', '好吧，']) + t;
  if (!q && len >= 4 && rnd() < 0.52) t = t + pick(['啊', '呢', '呀', '……', '真的', '嘛', '咯']);
  return t;
}
/** 生成一条不重复的语句，最多试 30 次 */
function unique(build) {
  for (let i = 0; i < 30; i++) {
    const t = decorate(build());
    if (!seen.has(t)) {
      seen.add(t);
      return t;
    }
  }
  // 实在凑不出新的，允许重复，但绝不往句子里塞编号（否则会出现"…掏空了。4511"这种垃圾）
  const plain = build();
  seen.add(plain);
  return plain;
}
const fill = (t) =>
  t.replace(/\{(食物|地点|时间|人物|工作物|应用|症状)\}/g, (_, k) => pick(SLOT[k]));

// ── 单条消息类别 ───────────────────────────────────────────
// weight 是目标占比（总和 100），templates 里 {x} 会被槽位替换
const CATS = [
  {
    id: 'greet',
    name: '寒暄问候',
    group: '对话功能',
    weight: 7,
    templates: [
      '在吗', '早', '早啊', '晚上好', '睡了吗', '在不在', '人呢', '哈喽', '喂', '你好呀',
      '我回来了', '我到了', '出门了', '下班了', '到家了', '我先去忙了', '待会儿聊', '晚安',
      '晚安啦', '明天见', '有空吗', '在干嘛', '干嘛呢', '在忙吗', '忙不忙',
    ],
  },
  {
    id: 'ask',
    name: '提问',
    group: '对话功能',
    weight: 10,
    templates: [
      '你吃饭了吗', '现在几点', '外面下雨了吗', '你觉得{食物}好吃吗', '这电影好看吗',
      '你明天有空吗', '你在哪', '你说我该不该去', '{地点}怎么走', '这个怎么弄',
      '你猜我在哪', '你知道{应用}怎么注销吗', '为什么我总是睡不好', '{人物}为什么这么说',
      '你更喜欢哪个', '这两个选哪个好', '多少钱合适', '我是不是想多了', '你听懂了吗',
      '你刚才说什么', '然后呢', '还有吗', '能不能再说一遍', '真的假的', '你确定吗',
    ],
  },
  {
    id: 'state',
    name: '陈述分享',
    group: '对话功能',
    weight: 10,
    templates: [
      '我刚下班', '我今天走了两万步', '我买了新键盘', '我养了只猫', '今天天气不错',
      '我在地铁上', '刚洗完澡', '今天{食物}吃撑了', '我在{地点}排队', '手机快没电了',
      '我把{工作物}改完了', '我在看{应用}', '我剪头发了', '我换了新手机', '今天{时间}起得早',
      '刚看完一个纪录片', '我在等外卖', '我在{地点}附近', '今天开了三个会', '我加了会儿班',
      '刚把衣服洗了', '窗外的风好大', '楼下新开了家店', '{人物}又催我了', '我今天什么都没干',
    ],
  },
  {
    id: 'request',
    name: '请求指令',
    group: '对话功能',
    weight: 5,
    templates: [
      '帮我看看这个', '发张照片', '你过来一下', '帮我点个外卖', '提醒我十点睡觉',
      '帮我记一下', '你别说了', '先别急', '等我一下', '把地址发我', '再说一遍',
      '你查一下{地点}几点关门', '帮我想个名字', '陪我聊会儿', '给我讲个笑话',
      '帮我看看{工作物}有没有问题', '你能帮我拿下快递吗',
    ],
  },
  {
    id: 'confirm',
    name: '确认否定附和',
    group: '对话功能',
    weight: 5,
    templates: [
      '嗯', '哦', '好', '行吧', '可以', '不是', '对', '对啊', '没错', '确实', '也是',
      '没有', '我不这么觉得', '好像是', '大概是吧', '不好说', '再说吧', '看情况',
      '行', '成', '收到', '知道了', '懂了', '明白', '有道理',
    ],
  },
  {
    id: 'invite',
    name: '邀请约定',
    group: '对话功能',
    weight: 4,
    templates: [
      '晚上一起吃饭吗', '周末去哪玩', '要不要去看电影', '明天见个面', '一起打游戏吗',
      '{时间}有空没', '我请你吃{食物}', '咱们{时间}在{地点}碰', '你什么时候方便',
      '我到了跟你说', '那说好了', '别放我鸽子', '我可能会晚点到', '改成{时间}行吗',
    ],
  },
  {
    id: 'sorry',
    name: '道歉感谢',
    group: '对话功能',
    weight: 3,
    templates: [
      '对不起', '抱歉啊', '不好意思', '我错了', '是我不对', '谢谢你', '谢啦', '多亏你',
      '麻烦你了', '辛苦你了', '别生气', '原谅我这一次', '真不好意思让你等',
    ],
  },
  {
    id: 'happy',
    name: '开心兴奋',
    group: '情绪表达',
    weight: 5,
    templates: [
      '哈哈哈哈', '笑死我了', '太好了', '我升职了', '我中了', '今天超顺利',
      '终于做完了', '我买到票了', '太爽了', '这波不亏', '我成功了', '{人物}夸我了',
      '今天运气爆炸', '我捡到钱了', '好开心啊', '绝了', '太牛了', '成了成了',
    ],
  },
  {
    id: 'sad',
    name: '难过低落',
    group: '情绪表达',
    weight: 5,
    templates: [
      '今天好累', '心里有点难受', '我想哭', '有点委屈', '感觉撑不住了',
      '没人懂我', '我好失败', '是不是我不够好', '最近状态很差', '什么都不想做',
      '我好像被讨厌了', '今天被{人物}骂了', '我觉得好孤单', '没意思', '算了',
      '不想说话', '我大概不适合这个', '我搞砸了',
    ],
  },
  {
    id: 'angry',
    name: '生气抱怨',
    group: '情绪表达',
    weight: 5,
    templates: [
      '烦死了', '气死我了', '{人物}是不是有病', '凭什么啊', '受不了了', '无语',
      '又改需求', '这破{工作物}改第八版了', '我刚说的他们根本没听', '什么破规定',
      '凭什么让我加班', '这服务太差了', '我真想骂人', '太过分了', '离谱',
      '天天这样谁受得了', '我忍很久了', '别惹我',
    ],
  },
  {
    id: 'anxious',
    name: '焦虑压力',
    group: '情绪表达',
    weight: 3,
    templates: [
      '我该怎么办', '明天就要交', '来不及了', '压力好大', '我怕搞砸', '睡不着',
      '心跳很快', '一闭眼就是工作', '我怕被裁', '考核要来了', '我还没准备好',
      '要是失败了怎么办', '我不敢跟{人物}说', '越拖越慌',
    ],
  },
  {
    id: 'flirt',
    name: '撒娇亲密',
    group: '情绪表达',
    weight: 2,
    templates: [
      '我想你了', '抱抱', '亲亲', '你在干嘛呀', '陪我说说话', '你是不是不喜欢我了',
      '你不理我', '我生气了', '哄我', '要你', '贴贴', '你猜我想干嘛',
      '你今天想我了吗', '我只跟你说', '别走', '再聊会儿嘛',
    ],
  },
  {
    id: 'work',
    name: '工作学习',
    group: '场景主题',
    weight: 5,
    templates: [
      '今天开了三个会', '方案又要重做', '{人物}让我改{工作物}', '加班到十点',
      '我被分到新项目了', '考核结果出来了', '我请了一天假', '明天要汇报',
      '我不想上班', '这个需求太离谱', '我在写周报', '这周排期满的',
      '我在准备面试', '论文还没写完', '考试周要到了', '我把{工作物}发出去了',
    ],
  },
  {
    id: 'food',
    name: '吃喝',
    group: '场景主题',
    weight: 4,
    templates: [
      '晚上吃什么', '我想吃{食物}', '刚吃完{食物}', '点了外卖还没到', '你会做饭吗',
      '我煮了面', '今天喝了两杯咖啡', '有点想吃烧烤', '冰箱空了', '想喝奶茶',
      '{食物}哪家好吃', '我吃撑了', '我减肥了', '这家的{食物}一般',
    ],
  },
  {
    id: 'sleep',
    name: '睡眠作息',
    group: '场景主题',
    weight: 2,
    templates: [
      '我睡了', '困了', '刚睡醒', '失眠了', '凌晨三点还醒着', '我要早睡',
      '闹钟没响', '我睡过头了', '午睡睡了两个小时', '再睡五分钟', '今天睡得好吗',
      '我做梦了', '梦到{人物}了',
    ],
  },
  {
    id: 'commute',
    name: '通勤出行',
    group: '场景主题',
    weight: 2,
    templates: [
      '我在地铁上', '堵车了', '公交又晚点', '我坐过站了', '打不到车',
      '今天地铁特别挤', '我快到了', '还有两站', '下雨没带伞', '路上摔了一跤',
      '机场人好多', '高铁晚点半小时',
    ],
  },
  {
    id: 'health',
    name: '健康',
    group: '场景主题',
    weight: 2,
    templates: [
      '我好像感冒了', '头有点{症状}', '昨天没睡好', '我胃不舒服', '要去医院吗',
      '吃药了没效果', '我体检报告出来了', '最近总是{症状}', '我想去健身', '今天跑了五公里',
    ],
  },
  {
    id: 'short',
    name: '超短句',
    group: '形式变异',
    weight: 5,
    templates: [
      '嗯', '哦', '啊', '？', '！', '好', '行', '在', '对', '没', '是', '啥', '怎么',
      '真的', '假的', '嗯嗯', '好好好', '来了', '走了', '算了', '没事', '随便', '不知道',
      '呵呵', '哈', '哎', '喂', '欸', '诶', '啊？',
    ],
  },
  {
    id: 'long',
    name: '长段陈述',
    group: '形式变异',
    weight: 3,
    templates: [
      '今天早上七点就起来了，赶地铁的时候人特别多，站了四十分钟才到公司，结果一到就被拉去开会，会开到中午，饭都没吃上，下午又接着改{工作物}，改到晚上八点才走，感觉整个人都被掏空了。',
      '我最近在想要不要搬到离公司近一点的地方，现在每天通勤来回三个小时，实在太浪费时间了，但是那边房租要贵一千多，而且离我常去的那几个地方都远，纠结了好久也没决定。',
      '昨天晚上看了个纪录片，讲的是深海生物，那些鱼长得特别奇怪，有的会发光，有的透明得能看见内脏，我本来只是想看十分钟，结果一口气看到半夜两点。',
      '我妈今天给我打电话，问我什么时候找对象，我说还没有，她就一直念叨，说隔壁谁谁都结婚了，我听得头都大了，最后找了个借口挂了电话。',
      '刚把冰箱里剩的东西都清了，做了个炒饭，加了点{食物}的剩菜，味道居然还不错，就是有点咸，下次少放点酱油，不过自己做饭还是挺有成就感的。',
      '我这两天在想一个事，就是我现在的工作到底适不适合我，工资还行，但是每天都在做重复的事，学不到新东西，想换又怕找不到更好的，你说人是不是都得这么耗着。',
    ],
  },
  {
    id: 'typo',
    name: '错字乱码',
    group: '形式变异',
    weight: 2,
    templates: [
      'tudyu', 'asdfgh', '123456789', 'woshishui', 'zheshishenme', 'aaaaa', 'nihao',
      'zaiganma', '哈哈哈哈哈哈哈哈', 'xswl', 'yyds', '666', '呢吗', '我打了半天',
      '发错了', '手滑', '按错了', '我手机卡了', '输入法坏了', '打了三遍都不对',
    ],
  },
  {
    id: 'repeat',
    name: '重复连发',
    group: '形式变异',
    weight: 2,
    templates: [
      '你在吗', '你好', '喂', '人呢', '在不在啊', '看到了吗', '回我一下', '快回我',
      '怎么不说话', '你睡了吗',
    ],
  },
  {
    id: 'symbol',
    name: '纯符号/表情文字',
    group: '无意义',
    weight: 3,
    templates: [
      '？？？', '。。。', '！！！', '……', '、、、', '555', '2333', 'hhhh', 'www',
      '[微笑]', '[捂脸]', '[裂开]', '[旺柴]', '[流泪]', '[赞]', '[ok]', '😂😂', '🥲',
      '🙃', '🤣', '👀', '💤', '？ ？ ？', '...', '!!!', '？？',
    ],
  },
  {
    id: 'nonsense',
    name: '无逻辑/梗',
    group: '无意义',
    weight: 3,
    templates: [
      '今天的天是甜的', '我家的猫会背古诗了', '如果云是棉花糖我就要爬上去', '我把月亮摘下来了',
      '键盘在唱歌', '我和我的影子吵架了', '冰箱里住了一个人', '我决定从明天开始当一只鸟',
      '你说水会不会做梦', '我感觉我是台复印机', '刚才有个念头从我脑子里跑掉了',
      '我可以用脚思考吗', '空气有点咸', '我的左手不同意我的右手',
      '正常发挥，把简单的事搞复杂了', '这波操作我给零分', '我人麻了', '绷不住了',
    ],
  },
  {
    id: 'unrelated',
    name: '上下文无关',
    group: '无意义',
    weight: 2,
    templates: [
      '对了你知道{地点}怎么走吗', '突然想起来我还没交电费', '我昨天梦见{人物}了',
      '那个…你听说过{应用}吗', '我刚看到一条新闻说南极在下雪', '对了你会修自行车吗',
      '话说{食物}是不是涨价了', '我想不起来那首歌叫什么了', '你认识会游泳的猫吗',
      '上次说的那个事你还记得吗', '我刚才在{地点}看见一个很像你的人',
    ],
  },
];

const weightSum = CATS.reduce((a, c) => a + c.weight, 0);

// ── 连续对话片段（30% 语料）────────────────────────────────
// 每个片段 5 条，围绕一个主题，turn1..turn5 各有模板池
const TOPICS = [
  { id: 'work_rant', name: '工作吐槽' },
  { id: 'eat', name: '约饭' },
  { id: 'date', name: '约会安排' },
  { id: 'game', name: '打游戏' },
  { id: 'fight', name: '闹别扭' },
  { id: 'sweet', name: '撒娇' },
  { id: 'sleep', name: '睡前' },
  { id: 'commute', name: '通勤' },
  { id: 'movie', name: '看电影' },
  { id: 'shop', name: '逛街买东西' },
  { id: 'pet', name: '宠物' },
  { id: 'weather', name: '天气' },
  { id: 'family', name: '家里的事' },
  { id: 'study', name: '学习考试' },
];

const TURNS = {
  work_rant: [
    ['今天被{人物}当众骂了', '今天真的累死了', '方案又被打回来了', '我在公司加班到现在'],
    ['就为了那个{工作物}', '说我做的不行', '当着全组的面', '改了三天白改'],
    ['他凭什么啊', '我真想不干了', '我是不是不适合这行', '这活没法干了'],
    ['你先别气', '那后来呢', '要不要跟{人物}谈谈', '我陪你说会儿'],
    ['算了不想了', '明天再说吧', '谢谢你听我啰嗦', '我先去洗个脸'],
  ],
  eat: [
    ['晚上吃什么', '饿了', '想出去吃'],
    ['吃{食物}吧', '随便都行', '你想吃什么'],
    ['那家太远了', '上周刚吃过', '要不点外卖'],
    ['那就{食物}吧', '我请你', '你定'],
    ['好 我订位置', '几点', '我到了跟你说'],
  ],
  date: [
    ['周末有空吗', '想约你出来', '明天有时间没'],
    ['有啊 怎么了', '去哪', '几点'],
    ['看电影还是吃饭', '我都可以', '你安排'],
    ['那先吃饭再看电影', '好', '票我买'],
    ['行 说定了', '别迟到', '到时候见'],
  ],
  game: [
    ['打游戏吗', '上号', '来一把'],
    ['等我一分钟', '我马上', '什么游戏'],
    ['{应用}那个', '还是老规矩', '我菜你别嫌'],
    ['输了怪我', '再来一把', '这把认真了'],
    ['不打了 太晚了', '明天继续', '先睡了'],
  ],
  fight: [
    ['你是不是生气了', '你为什么不理我', '我刚才说错话了吗'],
    ['没有', '你说呢', '我没事'],
    ['那你怎么不说话', '我要是惹你不高兴你就说', '别这样'],
    ['我不想说', '说了你也不懂', '你根本没在听'],
    ['那我们好好说', '对不起', '我不该那样'],
  ],
  sweet: [
    ['在干嘛', '我想你了', '你在忙吗'],
    ['在想你', '刚忙完', '我也想你'],
    ['真的吗', '那你过来', '我不信'],
    ['半小时到', '等我', '你别骗我'],
    ['骗你是小狗', '抱抱', '马上就见'],
  ],
  sleep: [
    ['困了', '我准备睡了', '几点了'],
    ['快十二点了', '这么早', '再陪我聊会儿'],
    ['明天要早起', '你也早点睡', '别熬夜'],
    ['那我睡了', '晚安', '你也晚安'],
    ['晚安', '做个好梦', '明天聊'],
  ],
  movie: [
    ['最近有什么好看的', '周末去看电影吗', '我想看那个新片'],
    ['听说那个挺好看', '评分挺高的', '你想看哪个'],
    ['那就看那个吧', '几点场', '我买两张'],
    ['七点那场', '好', '我提前到'],
    ['票买好了', '爆米花要吗', '待会儿见'],
  ],
  shop: [
    ['在逛街', '我想买个{食物}', '这双鞋好看吗'],
    ['在哪', '多少钱', '我也想要'],
    ['在{地点}', '有点贵', '你来看看'],
    ['等我一下', '我马上到', '先别买'],
    ['我到了', '在门口', '你人呢'],
  ],
  pet: [
    ['我家猫又拆家了', '我的狗今天很乖', '它今天不吃饭'],
    ['又怎么了', '真的假的', '带去医院看看'],
    ['把纸巾全撕了', '气得我想笑', '可能是不舒服'],
    ['拍张照片看看', '它还小', '别太凶它'],
    ['发你了', '可爱死了', '我摸摸它'],
  ],
  weather: [
    ['今天好冷', '外面下雨了', '风好大'],
    ['多穿点', '带伞没', '我这也冷'],
    ['穿了两件', '忘带了', '窗户没关'],
    ['那就别出门了', '我送你去', '记得喝热水'],
    ['嗯不出去了', '好', '我到家了'],
  ],
  family: [
    ['我妈又打电话催我', '家里让我回去一趟', '我爸身体不太好'],
    ['催什么', '什么时候回', '严重吗'],
    ['催我找对象', '这周末', '在住院观察'],
    ['你怎么想', '我陪你回', '需要帮忙说'],
    ['再说吧', '好', '谢谢你'],
  ],
  study: [
    ['我在准备考试', '论文写不完了', '要报名了'],
    ['什么时候考', '写到哪了', '报了吗'],
    ['下周三', '还剩两章', '还没'],
    ['来得及吗', '要不要我帮你看', '别拖了'],
    ['有点慌', '好啊', '知道了'],
  ],  commute: [
    ['我出门了', '在地铁上', '堵车了'],
    ['人多吗', '几号线', '还有几站'],
    ['挤得要命', '三号线', '还有四站'],
    ['那你小心点', '到了跟我说', '别坐过站'],
    ['到了', '刚出站', '我马上到'],
  ],
};

// ── 生成 ───────────────────────────────────────────────────
const ROOM = TOTAL * 0.3; // 连续片段占比 30%
const dialogueLines = Math.round(ROOM);
const groups = Math.floor(dialogueLines / 5);
const singleLines = TOTAL - groups * 5;

const rows = [];
let id = 1;

// 1) 连续片段
for (let g = 0; g < groups; g++) {
  const topic = pick(TOPICS);
  const pools = TURNS[topic.id];
  const gid = `D${String(g + 1).padStart(4, '0')}`;
  for (let t = 0; t < 5; t++) {
    const text = unique(() => decorateDialogue(fill(pick(pools[t]))));
    rows.push({
      id: id++,
      text,
      category: '连续对话',
      sub: topic.name,
      group: gid,
      turn: t + 1,
      source: 'dialogue',
    });
  }
}

// 2) 单条消息（按权重分配）
const singleCounts = CATS.map((c) => ({
  cat: c,
  n: Math.floor((singleLines * c.weight) / weightSum),
}));
let assigned = singleCounts.reduce((a, x) => a + x.n, 0);
let k = 0;
while (assigned < singleLines) {
  singleCounts[k % singleCounts.length].n += 1;
  assigned += 1;
  k += 1;
}

for (const { cat, n } of singleCounts) {
  for (let i = 0; i < n; i++) {
    const text = unique(() => fill(pick(cat.templates)));
    rows.push({
      id: id++,
      text,
      category: cat.name,
      sub: cat.group,
      group: null,
      turn: null,
      source: 'single',
    });
  }
}

// 打散（保留 group 内部顺序用于连续片段）
const singles = rows.filter((r) => r.source === 'single').sort(() => rnd() - 0.5);
const dialogs = rows.filter((r) => r.source === 'dialogue');
const merged = [];
let si = 0;
let di = 0;
while (si < singles.length || di < dialogs.length) {
  if (di < dialogs.length && (si >= singles.length || rnd() < 0.3)) {
    const gid = dialogs[di].group;
    while (di < dialogs.length && dialogs[di].group === gid) merged.push(dialogs[di++]);
  } else if (si < singles.length) {
    merged.push(singles[si++]);
  }
}

// 重新编号
merged.forEach((r, i) => (r.id = i + 1));

// ── 输出 ───────────────────────────────────────────────────
const jsonl = merged.map((r) => JSON.stringify(r)).join('\n');
fs.writeFileSync(path.join(OUT_DIR, `messages-${TOTAL}.jsonl`), jsonl + '\n', 'utf8');

const csv = [
  'id,category,sub,group,turn,text',
  ...merged.map((r) => `${r.id},${r.category},${r.sub},${r.group || ''},${r.turn || ''},"${r.text.replace(/"/g, '""')}"`),
].join('\n');
fs.writeFileSync(path.join(OUT_DIR, `messages-${TOTAL}.csv`), csv, 'utf8');

// ── 统计 ───────────────────────────────────────────────────
const byCat = new Map();
const bySub = new Map();
for (const r of merged) {
  byCat.set(r.category, (byCat.get(r.category) || 0) + 1);
  bySub.set(r.category + ' / ' + r.sub, (bySub.get(r.category + ' / ' + r.sub) || 0) + 1);
}
const lens = merged.map((r) => r.text.length).sort((a, b) => a - b);
const pct = (n) => ((n / merged.length) * 100).toFixed(1) + '%';
const lenBucket = { '1-3字': 0, '4-10字': 0, '11-25字': 0, '26-50字': 0, '50字以上': 0 };
for (const L of lens) {
  if (L <= 3) lenBucket['1-3字']++;
  else if (L <= 10) lenBucket['4-10字']++;
  else if (L <= 25) lenBucket['11-25字']++;
  else if (L <= 50) lenBucket['26-50字']++;
  else lenBucket['50字以上']++;
}

const lines = [];
lines.push(`# 测试语句库报告（${TOTAL} 条）\n`);
lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN')}`);
lines.push(`- 文件：\`test/corpus/messages-${TOTAL}.jsonl\` / \`.csv\``);
lines.push(`- 连续片段：${groups} 组 × 5 条 = ${groups * 5} 条（${pct(groups * 5)}）`);
lines.push(`- 单条消息：${singles.length} 条（${pct(singles.length)}）`);
lines.push(`- 去重后不同文本：${new Set(merged.map((r) => r.text)).size} 条`);
lines.push(`- 长度：中位 ${lens[Math.floor(lens.length / 2)]} 字，最短 ${lens[0]}，最长 ${lens[lens.length - 1]}\n`);

lines.push('## 类型分布\n');
lines.push('| 类别 | 条数 | 占比 |');
lines.push('|---|---:|---:|');
for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${c} | ${n} | ${pct(n)} |`);
}

lines.push('\n## 细分类分布\n');
lines.push('| 类别 / 子类 | 条数 | 占比 |');
lines.push('|---|---:|---:|');
for (const [c, n] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${c} | ${n} | ${pct(n)} |`);
}

lines.push('\n## 长度分布\n');
lines.push('| 区间 | 条数 | 占比 |');
lines.push('|---|---:|---:|');
for (const [k, v] of Object.entries(lenBucket)) lines.push(`| ${k} | ${v} | ${pct(v)} |`);

lines.push('\n## 用途\n');
lines.push('1. **连续片段**：检验"接得住上文吗" —— 同一组 5 条应保持话题一致');
lines.push('2. **上下文无关**：检验"会不会强行关联" —— 不该硬接上一轮');
lines.push('3. **无意义语句**：检验"会不会瞎解读" —— 应追问或敷衍，不该编故事');
lines.push('4. **情绪类**：检验情绪识别与回应方式（先接情绪 vs 给方案）');
lines.push('5. **形式变异**：检验超短句、长段、错字、连发的处理');

fs.writeFileSync(path.resolve('docs', 'corpus-report.md'), lines.join('\n'), 'utf8');

console.log(`✓ 生成 ${merged.length} 条`);
console.log(`  连续片段 ${groups} 组（${groups * 5} 条）`);
console.log(`  单条 ${singles.length} 条`);
console.log(`  不同文本 ${new Set(merged.map((r) => r.text)).size} 条`);
console.log(`  中位长度 ${lens[Math.floor(lens.length / 2)]} 字`);
console.log('\n类型分布：');
for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(10)} ${String(n).padStart(5)}  ${pct(n)}`);
}
