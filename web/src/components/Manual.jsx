import { useEffect, useMemo, useState } from 'react';
import PageTitle from './PageTitle.jsx';

/**
 * 手册页：只读，数据来自 /api/manual（和 docs/manual.md 同源）。
 * 支持搜索：参数键、中文名、说明、脚本名、现象都能搜。
 */
export default function Manual({ token, api }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/api/manual', {}, token)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [api, token]);

  const kw = q.trim().toLowerCase();
  const hit = (...parts) => !kw || parts.some((p) => String(p || '').toLowerCase().includes(kw));

  const modules = useMemo(() => {
    if (!data) return [];
    return data.modules
      .map((m) => ({
        ...m,
        matched: m.fields.filter((f) => hit(f.key, f.label, f.help, m.title, m.desc)),
        selfMatch: hit(m.title, m.desc, m.id),
      }))
      .filter((m) => m.selfMatch || m.matched.length);
  }, [data, kw]);

  const env = useMemo(() => (data ? data.env.filter((e) => hit(e.key, e.title, e.help)) : []), [data, kw]);
  const scripts = useMemo(() => (data ? data.scripts.filter((s) => hit(s[0], s[1], s[2])) : []), [data, kw]);
  const troubles = useMemo(() => (data ? data.troubles.filter((t) => hit(t[0], t[1], t[2])) : []), [data, kw]);
  const presets = useMemo(() => (data ? data.presets.filter((p) => hit(p.title, p.note)) : []), [data, kw]);

  const totalHits = modules.reduce((n, m) => n + (m.selfMatch ? m.fields.length : m.matched.length), 0) + env.length + scripts.length + troubles.length;

  return (
    <>
      <PageTitle id="__manual" title="手册" />
      <p className="page-desc">
        所有参数、环境变量、脚本和排错方法都在这里。数据直接来自代码里的定义，不会和实际行为对不上。
        {data ? `　${data.counts.modules} 个模块 / ${data.counts.fields} 项参数 / ${data.counts.env} 个环境变量。` : ''}
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--danger)' }}>加载失败：{err}</div>}

      <div className="manual-bar">
        <input
          className="manual-search"
          placeholder="搜索：参数名、中文说明、脚本、现象…（例如 分心 / token / 掉登录）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {kw && (
          <span className="muted" style={{ fontSize: 12 }}>
            {totalHits} 条命中
            <button className="btn-ghost" style={{ marginLeft: 8 }} onClick={() => setQ('')}>
              清空
            </button>
          </span>
        )}
      </div>

      {!data && !err && <div className="card skeleton" style={{ height: 120 }} />}

      {modules.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <h2>参数</h2>
            <span className="muted">{kw ? `${modules.length} 个模块命中` : '改完下一轮生效'}</span>
          </div>
          {modules.map((m) => (
            <div key={m.id} className="manual-sec">
              <h3>
                <span style={{ marginRight: 6 }}>{m.icon}</span>
                {m.title}
                <code className="manual-id">{m.id}</code>
              </h3>
              {m.desc && <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>{m.desc}</p>}
              <table className="manual-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>参数</th>
                    <th>含义</th>
                    <th style={{ width: '18%' }}>取值</th>
                    <th style={{ width: '16%' }}>当前</th>
                  </tr>
                </thead>
                <tbody>
                  {(m.selfMatch && !m.matched.length ? m.fields : m.matched).map((f) => (
                    <tr key={f.key}>
                      <td>
                        <code className="manual-key">{f.key}</code>
                        <div className="manual-label">{f.label}</div>
                      </td>
                      <td className="manual-help">{f.help}</td>
                      <td className="muted">{f.range}</td>
                      <td>
                        <span className="manual-val">{f.value}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {env.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <h2>.env 变量</h2>
            <span className="muted">改完必须重启</span>
          </div>
          <table className="manual-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>变量</th>
                <th>说明</th>
                <th style={{ width: '20%' }}>当前</th>
              </tr>
            </thead>
            <tbody>
              {env.map((e) => (
                <tr key={e.key}>
                  <td>
                    <code className="manual-key">{e.key}</code>
                    <div className="manual-label">{e.title}</div>
                  </td>
                  <td className="manual-help">{e.help}</td>
                  <td>
                    <span className="manual-val">{e.value || '（空）'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {presets.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <h2>调参预设</h2>
            <span className="muted">挑一套抄进对应模块</span>
          </div>
          <div className="manual-presets">
            {presets.map((p) => (
              <div key={p.title} className="manual-preset">
                <h4>{p.title}</h4>
                <pre>{p.items.map(([k, v, note]) => `${k.padEnd(26)} ${v}${note ? '   # ' + note : ''}`).join('\n')}</pre>
                {p.note && <p className="muted" style={{ fontSize: 12 }}>{p.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {scripts.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <h2>运维脚本</h2>
            <span className="muted">{scripts.length} 个</span>
          </div>
          <table className="manual-table">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>脚本</th>
                <th style={{ width: '30%' }}>用途</th>
                <th>用法</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map(([name, use, cmd]) => (
                <tr key={name}>
                  <td>
                    <code className="manual-key">{name}</code>
                  </td>
                  <td className="manual-help">{use}</td>
                  <td>
                    <code className="manual-cmd">{cmd}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {troubles.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <h2>故障排查</h2>
            <span className="muted">{troubles.length} 种情况</span>
          </div>
          <table className="manual-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>现象</th>
                <th style={{ width: '30%' }}>原因</th>
                <th>怎么办</th>
              </tr>
            </thead>
            <tbody>
              {troubles.map(([what, why, fix]) => (
                <tr key={what}>
                  <td className="manual-help">{what}</td>
                  <td className="muted">{why}</td>
                  <td className="manual-help">{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !kw && (
        <div className="card">
          <div className="card-h">
            <h2>生效规则</h2>
          </div>
          <table className="manual-table">
            <tbody>
              {data.effects.map(([where, when]) => (
                <tr key={where}>
                  <td style={{ width: '40%' }}>{where}</td>
                  <td>{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            生成时间：{new Date(data.generatedAt).toLocaleString('zh-CN')}　·　重新生成 markdown：
            <code className="manual-cmd" style={{ marginLeft: 6 }}>
              node --env-file=.env scripts\manual.mjs
            </code>
          </p>
        </div>
      )}
    </>
  );
}
