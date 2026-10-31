import PageTitle from './PageTitle.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CATS = ['开心', '好笑', '无语', '生气', '难过', '撒娇', '累困', '疑惑', '鼓励', '亲密'];

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function Stickers({ token, api }) {
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState([]); // 上传后待确认的
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(false);
  const [editing, setEditing] = useState({});
  const [filter, setFilter] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api('/api/stickers', {}, token));
    } catch (e) {
      setMsg(e.message);
    }
  }, [api, token]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg('');
    const results = [];
    for (const f of files) {
      try {
        const dataUrl = await toDataUrl(f);
        const r = await api(
          '/api/stickers/upload',
          { method: 'POST', body: JSON.stringify({ dataUrl, name: f.name }) },
          token,
        );
        if (r.ok) {
          // 入库后再按需调整：这里直接显示已入库结果
          results.push({ ok: true, sticker: r.sticker, name: f.name });
        } else {
          results.push({ ok: false, error: r.error, name: f.name, duplicate: r.duplicate });
        }
      } catch (e) {
        results.push({ ok: false, error: e.message, name: f.name });
      }
    }
    setBusy(false);
    await load();
    const okCount = results.filter((r) => r.ok).length;
    const dupCount = results.filter((r) => r.duplicate).length;
    setMsg(`上传 ${results.length} 张：成功 ${okCount}${dupCount ? `，重复 ${dupCount}` : ''}${results.length - okCount - dupCount ? `，失败 ${results.length - okCount - dupCount}` : ''}`);
    // 把刚入库的放进"最近添加"，方便改分类
    setPending(results.filter((r) => r.ok).map((r) => r.sticker));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    upload([...e.dataTransfer.files]);
  };

  const saveEdit = async (id) => {
    const e = editing[id] || {};
    try {
      await api('/api/stickers/update', { method: 'POST', body: JSON.stringify({ id, ...e }) }, token);
      setEditing((s) => ({ ...s, [id]: undefined }));
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const del = async (id) => {
    if (!confirm('从库里删掉这张？（文件也会删掉）')) return;
    try {
      await api('/api/stickers/delete', { method: 'POST', body: JSON.stringify({ id }) }, token);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const groups = useMemo(() => {
    if (!info?.items) return [];
    const map = new Map();
    for (const s of info.items) {
      if (filter && s.category !== filter) continue;
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category).push(s);
    }
    return [...map].sort((a, b) => CATS.indexOf(a[0]) - CATS.indexOf(b[0]));
  }, [info, filter]);

  const scoreMap = useMemo(() => {
    const m = new Map();
    for (const s of info?.scores || []) m.set(s.id, s);
    return m;
  }, [info]);

  return (
    <div>
      <PageTitle id="__stickers" title="表情库" />
      <p className="page-desc">
        往里加图就行，自动分类；也可以在 QQ 里发图并说「存」，同样入库。
      </p>
      {msg && <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>{msg}</div>}

      {info && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="stats">
            <div className="stat">
              <div className="k">总数</div>
              <div className="v">{info.total}</div>
            </div>
            <div className="stat">
              <div className="k">图 / 颜文字</div>
              <div className="v" style={{ fontSize: 15 }}>
                {info.images} / {info.texts}
              </div>
            </div>
            <div className="stat">
              <div className="k">动图</div>
              <div className="v">{info.animated}</div>
            </div>
            <div className="stat">
              <div className="k">发过的种类</div>
              <div className="v" style={{ fontSize: 15 }}>
                {(info.scores || []).filter((s) => s.sent > 0).length}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={'card drop' + (drag ? ' drag' : '')}
        style={{ marginBottom: 14 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => upload([...e.target.files])}
        />
        <div style={{ fontSize: 13 }}>
          {busy ? '上传中…' : '把图片拖到这里，或点一下选择（可多选，自动分类）'}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          支持 png / jpg / gif / webp，单张 ≤3MB；同一张会自动去重
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="mem-head">
            <span>这次加进来的（可以改分类）</span>
            <button className="btn-ghost" onClick={() => setPending([])}>
              收起
            </button>
          </div>
          <div className="stick-grid">
            {pending.map((s) => (
              <div className="stick-cell" key={s.id}>
                <img src={`/stickers/${encodeURIComponent(s.category)}/${encodeURIComponent(s.id + (s.animated ? '.gif' : '.png'))}`} alt="" />
                <select
                  value={s.category}
                  onChange={async (e) => {
                    const next = e.target.value;
                    await api(
                      '/api/stickers/update',
                      { method: 'POST', body: JSON.stringify({ id: s.id, category: next }) },
                      token,
                    );
                    // 本地同步，免得下拉框还显示旧分类
                    setPending((list) => list.map((x) => (x.id === s.id ? { ...x, category: next } : x)));
                    await load();
                  }}
                >
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <div className="stick-desc">{s.desc || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="mem-head">
          <span>库（{info?.total || 0} 条）</span>
          <select className="mini-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部分类</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}（{info?.byCat?.[c] || 0}）
              </option>
            ))}
          </select>
        </div>
        {groups.map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div className="cat-label">
              {cat} · {list.length}
            </div>
            <div className="stick-grid">
              {list.map((s, i) =>
                s.type === 'text' ? (
                  <div className="stick-cell text rise" style={{ '--i': Math.min(i, 14) }} key={s.id}>
                    <div className="kao">{s.text}</div>
                    <div className="stick-desc">{s.desc}</div>
                  </div>
                ) : (
                  <div className="stick-cell rise" style={{ '--i': Math.min(i, 14) }} key={s.id}>
                    <img
                      src={`/stickers/${encodeURIComponent(s.category)}/${encodeURIComponent(String(s.file).split('/').pop())}`}
                      alt={s.desc}
                      loading="lazy"
                    />
                    {editing[s.id] !== undefined ? (
                      <div className="stick-ops">
                        <select
                          value={editing[s.id]?.category ?? s.category}
                          onChange={(e) =>
                            setEditing((st) => ({ ...st, [s.id]: { ...editing[s.id], category: e.target.value } }))
                          }
                        >
                          {CATS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <input
                          value={editing[s.id]?.desc ?? s.desc}
                          onChange={(e) => setEditing((st) => ({ ...st, [s.id]: { ...editing[s.id], desc: e.target.value } }))}
                          placeholder="描述"
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-ghost" onClick={() => saveEdit(s.id)}>
                            存
                          </button>
                          <button className="btn-ghost" onClick={() => setEditing((st) => ({ ...st, [s.id]: undefined }))}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="stick-ops">
                        <div className="stick-desc" title={s.desc}>
                          {s.desc || '（无描述）'}
                        </div>
                        <div className="stick-meta">
                          {scoreMap.get(s.id)?.sent ? `发${scoreMap.get(s.id).sent}次` : ''}
                          {scoreMap.get(s.id)?.score != null ? ` · ${scoreMap.get(s.id).score.toFixed(2)}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-ghost" onClick={() => setEditing((st) => ({ ...st, [s.id]: { category: s.category, desc: s.desc } }))}>
                            改
                          </button>
                          <button className="btn-ghost danger" onClick={() => del(s.id)}>
                            删
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="mem-head">
          <span>表现（发出去之后你接不接话）</span>
        </div>
        <table className="usage-table">
          <thead>
            <tr>
              <th>图</th>
              <th>分类</th>
              <th>发出</th>
              <th>快速回</th>
              <th>没回</th>
              <th>分数</th>
            </tr>
          </thead>
          <tbody>
            {(info?.scores || []).filter((s) => s.sent > 0).map((s) => (
              <tr key={s.id}>
                <td style={{ fontSize: 12 }}>{s.id}</td>
                <td>{s.category}</td>
                <td>{s.sent}</td>
                <td>{s.replied_fast}</td>
                <td>{s.no_reply}</td>
                <td>{Number(s.score).toFixed(2)}</td>
              </tr>
            ))}
            {!(info?.scores || []).some((s) => s.sent > 0) && (
              <tr>
                <td colSpan={6} className="muted">
                  还没有发送记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
