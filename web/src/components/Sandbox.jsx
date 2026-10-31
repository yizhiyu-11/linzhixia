import PageTitle from './PageTitle.jsx';
﻿import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 测试台：独立记忆（data/sandbox.db），发消息看她怎么回，不碰真实账号。
 */
export default function Sandbox({ token, api }) {
  const [personas, setPersonas] = useState([]);
  const [persona, setPersona] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');
  const listRef = useRef(null);

  const loadMeta = useCallback(async () => {
    try {
      const r = await api('/api/users', {}, token);
      setPersonas(r.personas || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await api('/api/sandbox/history', {}, token);
      setMessages(r.messages || []);
      if (r.lastTurn) setDetail({ ...r.lastTurn, persona: '' });
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token]);

  useEffect(() => {
    loadMeta();
    loadHistory();
  }, [loadMeta, loadHistory]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: text, at: Date.now() }]);
    try {
      const r = await api('/api/sandbox/send', { method: 'POST', body: JSON.stringify({ text, persona }) }, token);
      if (!r.ok) throw new Error(r.error || '失败');
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, at: Date.now() }]);
      setDetail(r);
    } catch (e) {
      setErr(e.message);
      setMessages((m) => [...m, { role: 'assistant', content: `（出错：${e.message}）`, at: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm('清空测试台的对话记忆？（不影响真实账号）')) return;
    await api('/api/sandbox/reset', { method: 'POST' }, token);
    setMessages([]);
    setDetail(null);
    await loadHistory();
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div>
      <PageTitle id="__sandbox" title="测试台" />
      <p className="page-desc">
        这里用独立的记忆库（data/sandbox.db），怎么聊都不会进真实账号的记录。可以换人设试效果。
      </p>
      {err && <div className="err">{err}</div>}

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>人设</span>
        <select className="mini-select" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">跟随默认</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={reset}>
          清空测试记忆
        </button>
        <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
          每条约 ¥0.003
        </span>
      </div>

      <div className="sandbox-wrap">
        <div className="card sandbox-chat" ref={listRef}>
          {messages.length === 0 && <div className="empty">说点什么试试。</div>}
          {messages.map((m, i) => (
            <div className={'bubble rise ' + (m.role === 'user' ? 'me' : 'her')} style={{ '--i': 0 }} key={i}>
              {m.content}
            </div>
          ))}
          {busy && <div className="bubble her typing">…</div>}
        </div>

        <div className="card sandbox-side">
          <div className="mem-head">
            <span>这一轮她怎么想的</span>
            {detail?.latencyMs ? <span className="muted">{detail.latencyMs}ms · ¥{(detail.cost || 0).toFixed(4)}</span> : null}
          </div>
          {!detail && <div className="empty">发一条消息后显示</div>}
          {detail && (
            <>
              <div className="detail-block">
                <div className="k">👁 感知</div>
                <div className="v">
                  {detail.perception
                    ? `${detail.perception.emotion}${detail.perception.tone && detail.perception.tone.intensity !== undefined ? `(${detail.perception.tone.intensity})` : ''} / ${detail.perception.intent}（${detail.perception.certainty}） 话题=${detail.perception.topic}${detail.perception.event && detail.perception.event.kind !== 'none' ? ` 事=${detail.perception.event.kind}` : ''}`
                    : '没走感知'}
                </div>
              </div>
              <div className="detail-block">
                <div className="k">🎯 裁决</div>
                <div className="v">
                  <b>{detail.act?.act}</b>
                  {detail.act?.why ? ` —— ${detail.act.why}` : ''}
                </div>
              </div>
              <div className="detail-block">
                <div className="k">🎭 人设</div>
                <div className="v">{detail.persona}</div>
              </div>
              <div className="detail-block">
                <div className="k">🏠 场景</div>
                <div className="v">
                  {detail.scene ? `${detail.scene.location}，${detail.scene.doing}` : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <textarea
          className="sandbox-input"
          rows={2}
          placeholder="在这里输入，回车发送（Shift+回车换行）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn-primary" disabled={busy || !input.trim()} onClick={send}>
            {busy ? '她在想…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
