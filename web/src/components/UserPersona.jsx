import { useCallback, useEffect, useState } from 'react';

/**
 * 人设页：① 试一句（预览，不写记忆） ② 按用户分配
 */
export default function UserPersona({ token, api }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const [previewId, setPreviewId] = useState('');
  const [previewText, setPreviewText] = useState('在吗 今天好累');
  const [previewOut, setPreviewOut] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/users', {}, token));
    } catch (e) {
      setMsg(e.message);
    }
  }, [api, token]);

  useEffect(() => {
    load();
  }, [load]);

  const setPersona = async (qq, persona) => {
    setBusy(qq);
    try {
      await api('/api/users/persona', { method: 'POST', body: JSON.stringify({ qq, persona }) }, token);
      await load();
      setMsg(persona ? `已设为 ${persona}` : '已改回跟随默认');
      setTimeout(() => setMsg(''), 1800);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };

  const preview = async () => {
    setPreviewing(true);
    setPreviewOut(null);
    try {
      const r = await api(
        '/api/persona/preview',
        { method: 'POST', body: JSON.stringify({ persona: previewId, text: previewText }) },
        token,
      );
      setPreviewOut(r);
    } catch (e) {
      setPreviewOut({ ok: false, error: e.message });
    } finally {
      setPreviewing(false);
    }
  };

  const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('zh-CN') : '—');

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="mem-head">
          <span>试一句（不写入任何记忆）</span>
          <span className="muted">调一次模型 ¥0.003</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="mini-select" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
            <option value="">当前默认</option>
            {(data?.personas || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.role}
              </option>
            ))}
          </select>
          <input
            className="mem-input"
            style={{ flex: '1 1 240px', maxWidth: 360 }}
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') preview();
            }}
            placeholder="对她说一句话"
          />
          <button className="btn-primary" disabled={previewing} onClick={preview}>
            {previewing ? '生成中…' : '试一句'}
          </button>
        </div>
        {previewOut && (
          <div className="preview-box" style={{ marginTop: 10 }}>
            {previewOut.ok ? (
              <>
                <div className="bubble her" style={{ alignSelf: 'flex-start' }}>
                  {previewOut.reply}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {previewOut.persona} · ¥{(previewOut.cost || 0).toFixed(4)}
                </div>
              </>
            ) : (
              <div className="err">{previewOut.error || '生成失败'}</div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="mem-head">
          <span>按用户分配人设</span>
          <span className="muted">默认：{data?.globalPersona || '—'}（没单独设置的都跟她）</span>
        </div>
        {msg && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{msg}</div>}
        {!data && <div className="empty">加载中…</div>}
        {data?.users?.length === 0 && <div className="empty">还没有用户说过话。</div>}
        {data?.users?.map((u) => (
          <div className="user-row" key={u.qq}>
            <div className="user-id">
              <b>{u.nickname || u.qq}</b>
              <small>{u.qq}</small>
            </div>
            <div className="user-meta">
              {u.messages} 条 · 最后 {fmt(u.lastSeen)}
            </div>
            <select
              className="mini-select"
              value={u.persona || ''}
              disabled={busy === u.qq}
              onChange={(e) => setPersona(u.qq, e.target.value)}
            >
              <option value="">跟随默认（{data.globalPersona}）</option>
              {data.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
