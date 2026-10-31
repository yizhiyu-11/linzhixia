/**
 * 每个用户自己的档案（问卷填的）→ 影响"他这一侧"的行为参数。
 * 没有单独填的人，用全局 config 兜底。
 */

/** 读某个用户的档案（state.profile） */
export function readProfile(memory, qq) {
  try {
    return JSON.parse(memory.getState(qq, 'profile', 'null') || 'null');
  } catch {
    return null;
  }
}

const CLOSENESS = {
  粘人: { deflectBelow: 0.15, maxPerDay: 4, minGapMin: 120 },
  适中: { deflectBelow: 0.2, maxPerDay: 3, minGapMin: 180 },
  独立: { deflectBelow: 0.3, maxPerDay: 1, minGapMin: 300 },
};

const FREQ = {
  少: { maxPerDay: 1, minGapMin: 300 },
  中: { maxPerDay: 3, minGapMin: 180 },
  多: { maxPerDay: 5, minGapMin: 120 },
};

/** 岔开阈值：档案优先，没填就用全局 */
export function actThresholds(profile, config) {
  const c = CLOSENESS[profile?.closeness];
  return {
    deflectBelow: c ? c.deflectBelow : config.actDeflectBelow,
    engageConfidence: config.actEngageConfidence,
  };
}

/** 主动消息上限：档案里"频率"和"粘人度"取更保守的那个 */
export function proactiveLimits(profile, config) {
  const c = CLOSENESS[profile?.closeness];
  const f = FREQ[profile?.proactive];
  const maxPerDay = Math.min(
    f ? f.maxPerDay : config.proactiveMaxPerDay,
    c ? c.maxPerDay : config.proactiveMaxPerDay,
  );
  const minGapMin = f ? f.minGapMin : config.proactiveMinGapMin;
  return { maxPerDay, minGapMin };
}

/** 关系提示词 */
export function relationHint(profile) {
  if (profile?.relation === '朋友') return '【你们是朋友，不是恋人：别越界、别撒娇、别叫男朋友】';
  if (profile?.relation === '暧昧') return '【你们还在暧昧期：别太黏、别直接叫男朋友】';
  return '';
}
