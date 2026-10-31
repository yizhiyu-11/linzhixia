import { useEffect, useState } from 'react';
import PageTitle from './PageTitle.jsx';

/**
 * 两个外部服务的可替换配置：文本模型（聊天）+ 语音合成。
 * key 存在服务端 data/providers.json，这里只显示掩码。
 */
export default function Api({ token, api }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ chat: {}, voice: {} });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState({});

  const load = () =>
    api('/api/providers', {}, token)
      .then((r) => {
        setData(r);
        setDraft({
          chat: { name: r.chat.name, baseUrl: r.chat.baseUrl, model: r.chat.model, key: '' },
          voice: { name: r.voice.name, baseUrl: r.voice.baseUrl, model: r.voice.model, key: '' },
        });
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
  }, [token]);

  const set = (svc, k, v) => setDraft((d) => ({ ...d, [svc]: { ...d[svc], [k]: v } }));

  const save = async (svc) => {
    setBusy('save-' + svc);
    setErr('');
    setMsg('');
    try {
      const body = { [svc]: draft[svc] };
      const r = await api('/api/providers', { method: 'POST', body: JSON.stringify(body) }, token);
      setData(r);
      setDraft((d) => ({ ...d, [svc]: { ...d[svc], key: '' } }));
      setMsg(`${svc === 'chat' ? '文本模型' : '语音合成'} 已保存，立即生效`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const test = async (svc) => {
    setBusy('test-' + svc);
    try {
      const r = await api('/api/providers/test', { method: 'POST', body: JSON.stringify({ service: svc }) }, token);
      setTests((t) => ({ ...t, [svc]: r }));
    } catch (e) {
      setTests((t) => ({ ...t, [svc]: { ok: false, error: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const reset = async (svc) => {
    if (!window.confirm('恢复成默认地址和模型？key 会被清空，之后会回落到 .env 里的。')) return;
    setBusy('reset-' + svc);
    try {
      const r = await api('/api/providers/reset', { method: 'POST', body: JSON.stringify({ service: svc }) }, token);
      setData(r);
      setMsg('已恢复默认');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const card = (svc) => {
    const p = data?.[svc];
    if (!p) return null;
    const d = draft[svc] || {};
    const t = tests[svc];
    return (
      <div className="card" style={{ marginBottom: 14 }} key={svc}>
        <div className="card-h">
          <h2>{p.label}</h2>
          <span className="muted">{p.keySet ? (p.keyFromEnv ? 'key 来自 .env' : 'key 已设置') : '未设置 key'}</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{p.note}</p>

        <div className="api-grid">
          <label>
            <span>名称</span>
            <input value={d.name || ''} onChange={(e) => set(svc, 'name', e.target.value)} placeholder="随便写，方便认" />
          </label>
          <label>
            <span>接口地址</span>
            <input value={d.baseUrl || ''} onChange={(e) => set(svc, 'baseUrl', e.target.value)} placeholder="https://api.deepseek.com" />
          </label>
          <label>
            <span>模型</span>
            <input value={d.model || ''} onChange={(e) => set(svc, 'model', e.target.value)} placeholder="deepseek-chat" />
          </label>
          <label>
            <span>Key {p.keySet ? `（当前 ${p.key}，留空不改）` : ''}</span>
            <input
              type="password"
              value={d.key || ''}
              onChange={(e) => set(svc, 'key', e.target.value)}
              placeholder={p.keySet ? '留空表示不改' : '粘贴 key'}
              autoComplete="off"
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={busy === 'save-' + svc} onClick={() => save(svc)}>
            {busy === 'save-' + svc ? '保存中…' : '保存'}
          </button>
          <button className="btn" disabled={busy === 'test-' + svc} onClick={() => test(svc)}>
            {busy === 'test-' + svc ? '测试中…' : '测试连通'}
          </button>
          <button className="btn-ghost" disabled={busy === 'reset-' + svc} onClick={() => reset(svc)}>
            恢复默认
          </button>
          {t && (
            <span className={t.ok ? 'api-ok' : 'api-bad'}>
              {t.ok ? `✓ ${t.ms}ms${t.bytes ? ` · ${Math.round(t.bytes / 1024)}KB` : ''}` : `✗ ${t.error}`}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageTitle id="__api" title="接口" />
      <p className="page-desc">
        两个外部服务都可以换掉：文本模型走 OpenAI 兼容协议，语音走百炼的实时合成。改完点保存立刻生效，不用重启。
        <br />
        key 存在服务端的 <code>{data?.file || 'data/providers.json'}</code>（不进 git），页面只显示掩码。
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>{err}</div>}
      {msg && <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 12 }}>{msg}</div>}

      {!data && <div className="card skeleton" style={{ height: 120 }} />}
      {card('chat')}
      {card('voice')}

      <div className="card">
        <h2 style={{ fontSize: 14, marginTop: 0 }}>换一家要改什么</h2>
        <table className="manual-table">
          <tbody>
            <tr>
              <td style={{ width: '28%' }}>同一家、换个模型</td>
              <td>只改「模型」，地址和 key 不用动</td>
            </tr>
            <tr>
              <td>换中转站 / 自建</td>
              <td>改「接口地址」（到 <code>/v1</code> 之前）和 key，模型名按对方文档填</td>
            </tr>
            <tr>
              <td>语音换引擎</td>
              <td>地址一般还是百炼，但模型名要一起换（如 <code>cosyvoice-v3-flash</code>）；音色在「语音」页选</td>
            </tr>
            <tr>
              <td>出问题</td>
              <td>点「恢复默认」会清掉这个服务的自定义 key，回落到 .env 里的值</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
