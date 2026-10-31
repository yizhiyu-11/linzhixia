import PageTitle from './PageTitle.jsx';
import { useCallback, useEffect, useState } from 'react';

const KEY_LABEL = {
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
};

const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('zh-CN') : '');

export default function Memory({ token, api }) {
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [qq, setQq] = useState('');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState({}); // key -> 输入框里的值
  const [busy, setBusy] = useState('');

  // 先拿到用户列表，默认看第一个
  useEffect(() => {
    api('/api/users', {}, token)
      .then((r) => {
        setUsers(r.users || []);
        if (!qq && r.users?.length) setQq(r.users[0].qq);
      })
      .catch((e) => setErr(e.message));
  }, [api, token, qq]);

  const load = useCallback(async () => {
    try {
      const r = await api('/api/memory' + (qq ? '?qq=' + qq : ''), {}, token);
      setData(r);
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token, qq]);

  useEffect(() => {
    if (qq) load();
  }, [qq, load]);

  const saveFact = async (key) => {
    const value = (editing[key] ?? '').trim();
    if (!value) return;
    setBusy(key);
    try {
      await api(`/api/memory/fact/${encodeURIComponent(key)}?qq=${encodeURIComponent(qq)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      }, token);
      setEditing((e) => ({ ...e, [key]: undefined }));
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const delFact = async (key) => {
    if (!confirm(`删掉「${KEY_LABEL[key] || key}」这条记忆？`)) return;
    setBusy(key);
    try {
      await api(`/api/memory/fact/${encodeURIComponent(key)}?qq=${encodeURIComponent(qq)}`, { method: 'DELETE' }, token);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const delSummary = async (id) => {
    if (!confirm('删掉这段摘要？删了之后她就不记得这部分了。')) return;
    try {
      await api(`/api/memory/summary/${id}?qq=${encodeURIComponent(qq)}`, { method: 'DELETE' }, token);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div>
      <PageTitle id="__memory" title="记忆" />
      <p className="page-desc">
        她记住的事。记错了直接改，不想留的删掉 —— 不用清库。
      </p>

      {users.length > 0 && (
        <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>看谁</span>
          <select className="mini-select" value={qq} onChange={(e) => setQq(e.target.value)}>
            {users.map((u) => (
              <option key={u.qq} value={u.qq}>
                {u.nickname || u.qq}（{u.messages} 条）
              </option>
            ))}
          </select>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {!data && <div className="empty">加载中…</div>}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="mem-head">
              <span>关于你（{data.facts?.length || 0} 条）</span>
              <span className="muted">QQ {data.qq}</span>
            </div>
            {!data.facts?.length && <div className="empty">还没有事实。多聊几十条会自动抽出来。</div>}
            {data.facts?.map((f, i) => (
              <div className="mem-row rise" style={{ '--i': Math.min(i, 14) }} key={f.key}>
                <div className="mem-k">{KEY_LABEL[f.key] || f.key}</div>
                <div className="mem-v">
                  {editing[f.key] !== undefined ? (
                    <input
                      className="mem-input"
                      value={editing[f.key]}
                      autoFocus
                      onChange={(e) => setEditing((s) => ({ ...s, [f.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveFact(f.key);
                        if (e.key === 'Escape') setEditing((s) => ({ ...s, [f.key]: undefined }));
                      }}
                    />
                  ) : (
                    <span>{f.value}</span>
                  )}
                </div>
                <div className="mem-meta">
                  {f.confidence != null ? Math.round(f.confidence * 100) + '%' : ''}
                  {f.updatedAt ? ' · ' + fmt(f.updatedAt) : ''}
                </div>
                <div className="mem-ops">
                  {editing[f.key] !== undefined ? (
                    <>
                      <button className="btn-ghost" disabled={busy === f.key} onClick={() => saveFact(f.key)}>
                        保存
                      </button>
                      <button className="btn-ghost" onClick={() => setEditing((s) => ({ ...s, [f.key]: undefined }))}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-ghost" onClick={() => setEditing((s) => ({ ...s, [f.key]: f.value }))}>
                        改
                      </button>
                      <button className="btn-ghost danger" disabled={busy === f.key} onClick={() => delFact(f.key)}>
                        删
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="mem-head">
              <span>她记得的片段（{data.summaries?.length || 0} 段）</span>
              <span className="muted">按时间倒序，最多 30 段</span>
            </div>
            {!data.summaries?.length && <div className="empty">还没有摘要（每 24 条消息生成一次）。</div>}
            {data.summaries?.map((s, i) => (
              <div className="mem-row summary rise" style={{ '--i': Math.min(i, 10) }} key={s.id}>
                <div className="mem-k">{s.period}</div>
                <div className="mem-v pre">{s.content}</div>
                <div className="mem-ops">
                  <button className="btn-ghost danger" onClick={() => delSummary(s.id)}>
                    删
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="mem-head">
              <span>情节记忆（{data.episodes?.length || 0} 条）</span>
              <span className="muted">发生过的事，带地点和当时的情绪</span>
            </div>
            {!data.episodes?.length && <div className="empty">还没有情节。聊几句会自动记。</div>}
            {data.episodes?.map((e, i) => (
              <div className="mem-row" style={{ '--i': Math.min(i, 10) }} key={e.id}>
                <div className="mem-k">{new Date(e.at).toLocaleDateString('zh-CN')}</div>
                <div className="mem-v">
                  {e.text}
                  <span className="muted">
                    （{e.place || '—'}，情绪 {Number(e.mood) > 0 ? '+' : ''}
                    {Number(e.mood).toFixed(1)}，重要度 {e.importance}）
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="mem-head">
              <span>她以为的你（UAffect）</span>
            </div>
            {data.he && data.he.he ? (
              <div className="mem-row">
                <div className="mem-k">状态</div>
                <div className="mem-v">
                  {data.he.he.state}（v={data.he.he.v}，a={data.he.he.a}，置信 {data.he.he.confidence}，趋势{' '}
                  {data.he.he.trend}）
                  <span className="muted">
                    （共情 {data.he.empathy}，收敛 {data.he.caution}
                    {data.he.allowProactive ? '' : '，别主动'}）
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty">还没积累出判断（要几轮对话或开了 uaffect 开关）。</div>
            )}
          </div>

          <div className="card">
            <div className="mem-head">
              <span>她现在的状态</span>
            </div>
            {data.scene ? (
              <div className="mem-row">
                <div className="mem-k">场景</div>
                <div className="mem-v">
                  {data.scene.location}，{data.scene.doing}
                  {data.scene.pending?.length ? (
                    <span className="muted">（待办：{data.scene.pending.map((p) => p.text).join('、')}）</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="empty">她还没建立场景（下一条消息时生成）。</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
