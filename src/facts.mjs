/**
 * 事实提取：从聊天里抽出"关于他"的稳定信息，写进 facts 表。
 *
 * 为什么单独做：摘要是散文，程序没法回答"他叫什么"。facts 是结构化的、可检索的。
 *
 * 触发：每攒够 12 条消息跑一次（摊薄成本，一次约 ¥0.0008）
 * 纪律：只记明确陈述，玩笑/假设/反问不记；置信度低的不覆盖已有高置信度。
 */

export const FACT_KEYS = {
  nickname: '称呼',
  birthday: '生日',
  job: '工作',
  schedule: '作息',
  likes: '喜欢',
  dislikes: '讨厌',
  food: '口味',
  pets: '宠物',
  family: '家人',
  promise: '约定',
  taboo: '不想聊的话题',
  anniversary: '纪念日',
  health: '身体',
  recent: '最近在忙',
  worry: '烦心事',
};

const SYS = `你是信息抽取器。从聊天记录里抽出"关于对方"的稳定事实，写进 JSON 数组。

只输出 JSON 数组，不要解释：
[
  { "key": "nickname", "value": "陈子鹏", "confidence": 0.9, "evidence": "他说'我叫陈子鹏'" }
]

可用的 key（禁止自创）：
nickname 称呼 / birthday 生日 / job 工作 / schedule 作息 / likes 喜欢 /
dislikes 讨厌 / food 口味 / pets 宠物 / family 家人 / promise 约定 /
taboo 不想聊的话题 / anniversary 纪念日 / health 身体 / recent 最近在忙 / worry 烦心事

纪律：
- 只记**明确陈述**（"我叫…""我喜欢…""我生日是…""我膝盖下雨就疼"）。
- 玩笑、反问、假设、反讽、他自己否定过的，一律不记。
- 身体不舒服、最近在忙什么、在烦什么：他明确说了就记，confidence 填 0.6-0.7。
- value 要短（20 字内），能直接放进一句话里；不确定时间的不要编时间。
- 没有可记的就输出 []。
- 同一个人同一件事，只输出最新、最可信的那条。`;

/**
 * @returns {Promise<Array<{key,value,confidence,evidence}>|null>}
 */
export async function extractFacts({ memory, qq, chatFn, log }) {
  const every = 12;
  const lastId = Number(memory.getState(qq, 'lastFactMsgId', 0));
  const rows = memory.messagesSince(qq, lastId, every * 3);
  if (rows.length < every) return null;

  const existing = memory.getFacts(qq);
  const convo = rows.map((r) => `${r.role === 'user' ? '他' : '我'}：${String(r.content).slice(0, 80)}`).join('\n');

  const userMsg = [
    existing.length ? `已知信息：${existing.map((f) => `${f.key}=${f.value}`).join('；')}` : '已知信息：无',
    '聊天记录：',
    convo,
    '请输出需要新增或更新的事实。',
  ].join('\n');

  try {
    const r = await chatFn(
      [
        { role: 'system', content: SYS },
        { role: 'user', content: userMsg },
      ],
      'facts',
    );
    const raw = String(r.text || '').replace(/```json|```/g, '');
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('没有数组：' + raw.slice(0, 60));
    const arr = JSON.parse(m[0]);

    const out = [];
    for (const it of Array.isArray(arr) ? arr : []) {
      const key = String(it.key || '').trim();
      const value = String(it.value || '').trim().slice(0, 40);
      if (!FACT_KEYS[key] || !value) continue;
      const confidence = Math.max(0, Math.min(1, Number(it.confidence) || 0.6));
      // 置信度太低的不落库，避免玩笑被当真
      if (confidence < 0.55) continue;
      out.push({ key, value, confidence, evidence: String(it.evidence || '').slice(0, 60) });
    }

    // 写入：新值置信度不低于旧值才覆盖
    for (const f of out) {
      const oldConf = memory.getFactConfidence(qq, f.key);
      // 只有"没有旧值"或"新值更可信"才覆盖，避免一句玩笑盖掉问卷填的内容
      if (oldConf <= 0 || f.confidence >= oldConf) {
        memory.setFact(qq, f.key, f.value, f.confidence);
      }
    }

    memory.setState(qq, 'lastFactMsgId', rows[rows.length - 1].id);
    if (!out.length) log?.debug(`🧠 事实提取：看了 ${rows.length} 条，本次没抽出`);
    if (out.length) {
      log?.info(`🧠 记住 ${out.length} 条：${out.map((f) => `${FACT_KEYS[f.key]}=${f.value}`).join('、')}`);
    }
    return out;
  } catch (e) {
    log?.warn(`事实提取失败：${e.message}`);
    return null;
  }
}

/** 拼成 prompt 里的一段 */
export function factsBlock(facts) {
  if (!facts?.length) return '';
  const shown = facts
    .filter((f) => FACT_KEYS[f.key])
    .slice(0, 12)
    .map((f) => `${FACT_KEYS[f.key]}：${f.value}`)
    .join('；');
  if (!shown) return '';
  return `【你早就知道的事（别重复确认）】${shown}`;
}
