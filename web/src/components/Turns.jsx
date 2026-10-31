import PageTitle from './PageTitle.jsx';
﻿import { useCallback, useEffect, useState } from 'react';

// App 会把地址栏的 query 抹掉（含 token），所以要在模块加载时就抓住 turn 参数
const INITIAL_TURN = Number(new URLSearchParams(location.search).get('turn')) || null;

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
const GUARD_LABEL = {
  'rep-judge': '复读判定',
  repeat: '相似重写',
  'exact-repeat': '完全重复',
  'scene-conflict': '场景矛盾',
  'too-short': '太短重写',
  skip: '按设计不回',
};

/**
 * 对话回放：左边列表，右边详情。点一条能看到她这一轮"怎么想的"。
 */
export default function Turns({ token, api }) {
  const [list, setList] = useState([]);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  // 支持 ?turn=12 直接打开某一条（截图/分享都用得上）

  const load = useCallback(async () => {
    try {
      const r = await api('/api/turns?limit=60', {}, token);
      setList(r.turns || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token]);

  useEffect(() => {
    load();
    if (INITIAL_TURN) open(INITIAL_TURN);
    if (!auto) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load, auto]);

  const open = async (id) => {
    try {
      const d = await api(`/api/turns/${id}`, {}, token);
      setDetail(d);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="turns">
      <PageTitle id="__turns" title="对话回放" />
      <p className="page-desc">
        最近 60 轮。点一条看她的感知、裁决、场景和当时注入的提示 —— 用来回答“她这句为什么这么说”。
      </p>
      {err && <div className="err">{err}</div>}

      <div className="turns-layout">
        <div className="card turns-list">
          <div className="turns-toolbar">
            <label>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动刷新
            </label>
            <button className="btn-ghost" onClick={load}>
              刷新
            </button>
          </div>
          {list.length === 0 && (
            <div style={{ padding: 8 }}>
              <div className="skeleton" style={{ width: '86%' }} />
              <div className="skeleton" style={{ width: '62%' }} />
              <div className="skeleton" style={{ width: '74%' }} />
            </div>
          )}
          {list.map((t, i) => (
            <button
              key={t.id}
              className={'turn-row rise' + (detail?.id === t.id ? ' active' : '')}
              style={{ '--i': Math.min(i, 12) }}
              onClick={() => open(t.id)}
            >
              <div className="turn-top">
                <span className="turn-time">{fmtTime(t.at)}</span>
                <span className={'turn-act act-' + (t.act || '')}>{t.act || '-'}</span>
                <span className="turn-lat">{t.latencyMs ? t.latencyMs + 'ms' : ''}</span>
              </div>
              <div className="turn-in">你：{t.input || '(空)'}</div>
              <div className="turn-out">她：{t.reply || '(没回)'}</div>
            </button>
          ))}
        </div>

        <div className="card turns-detail page-fade">
          {!detail && <div className="empty">← 左边点一条</div>}
          {detail && (
            <>
              <div className="detail-head">
                <span className="turn-time">{new Date(detail.at).toLocaleString('zh-CN')}</span>
                <span className="turn-lat">{detail.latency_ms}ms · ¥{(detail.cost ?? 0).toFixed(4)}</span>
              </div>

              <div className="detail-block">
                <div className="k">你说</div>
                <div className="v">{detail.input || '(空)'}</div>
              </div>
              <div className="detail-block">
                <div className="k">她回</div>
                <div className="v">{detail.reply || '(没回)'}</div>
              </div>

              <div className="detail-grid">
                <div className="detail-block">
                  <div className="k">👁 感知</div>
                  {detail.perception ? (
                    <ul className="kv">
                      <li>情绪：{detail.perception.emotion}{detail.perception.tone && detail.perception.tone.intensity !== undefined ? `（强度 ${detail.perception.tone.intensity}）` : ''}</li>
                      <li>意图：{detail.perception.intent}（置信 {detail.perception.certainty}）</li>
                      {detail.perception.event && detail.perception.event.kind && detail.perception.event.kind !== 'none' ? (
                        <li>
                          你对她：{detail.perception.event.kind}（{detail.perception.event.toward}，影响 {detail.perception.event.impact}）
                        </li>
                      ) : null}
                      <li>
                        话题：{detail.perception.topic}
                        {detail.perception.topicDetail ? `（${detail.perception.topicDetail}）` : ''}
                      </li>
                      <li>
                        连续度：{detail.perception.continuity} · 跳：{detail.perception.jump}
                      </li>
                      {detail.perception.note && <li>依据：{detail.perception.note}</li>}
                    </ul>
                  ) : (
                    <div className="v muted">没有感知（走了规则）</div>
                  )}
                </div>

                <div className="detail-block">
                  <div className="k">🎯 裁决</div>
                  <div className="v">
                    <b>{detail.act}</b>
                    {detail.act_why ? ` —— ${detail.act_why}` : ''}
                  </div>
                  {detail.guards?.length > 0 && (
                    <div className="guards">
                      {detail.guards.map((g) => (
                        <span key={g} className="guard">
                          {GUARD_LABEL[g] || g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-block">
                  <div className="k">🏠 场景</div>
                  {detail.scene ? (
                    <div className="v">
                      {detail.scene.location}，{detail.scene.doing}
                      {detail.scene.pending?.length ? `（待办：${detail.scene.pending.map((p) => p.text).join('、')}）` : ''}
                    </div>
                  ) : (
                    <div className="v muted">—</div>
                  )}
                </div>

                <div className="detail-block">
                  <div className="k">🖼 图片</div>
                  {detail.media ? (
                    <div className="v">
                      {detail.media.kind} · {detail.media.visual || '-'}
                      {detail.media.candidates?.[0]
                        ? ` → ${detail.media.candidates[0].intent}（${detail.media.confidence}）`
                        : ''}
                    </div>
                  ) : (
                    <div className="v muted">这一轮没有图</div>
                  )}
                </div>
              </div>

              <div className="detail-block">
                <div className="k">📌 当时注入的提示</div>
                <pre className="hint">{detail.hint || '（空）'}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
