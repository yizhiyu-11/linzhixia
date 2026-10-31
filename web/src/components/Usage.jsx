import PageTitle from './PageTitle.jsx';
﻿import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 数字滚动：数值变化时补间，不跳变 */
function AnimatedNumber({ value, format = (v) => v }) {
  const [shown, setShown] = useState(Number(value) || 0);
  const fromRef = useRef(Number(value) || 0);
  const rafRef = useRef(0);
  useEffect(() => {
    const to = Number(value) || 0;
    const from = fromRef.current;
    if (to === from) return;
    const t0 = performance.now();
    const dur = 420;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (to - from) * eased);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <>{format(shown)}</>;
}

const TAG_LABEL = {
  perceive: '感知',
  reply: '生成',
  media: '看图',
  judge: '判定',
  read: '读空气',
  summary: '摘要',
  'burst+': '补发',
  cmp: '对比',
  bin: '二元判定',
  '': '其它',
};
const TAG_COLOR = {
  感知: '#2563eb',
  生成: '#16a34a',
  看图: '#ea580c',
  判定: '#9333ea',
  读空气: '#0891b2',
  摘要: '#4f46e5',
  补发: '#db2777',
  对比: '#64748b',
  主动消息: '#0d9488',
  事实提取: '#7c3aed',
  打标签: '#a16207',
};

function tagLabel(raw) {
  const t = String(raw || '');
  if (!t) return '其它';
  const base = t.split('/')[0];
  return TAG_LABEL[t] || TAG_LABEL[base] || t;
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
const money = (n) => '¥' + (n || 0).toFixed(4);

/** 每次调用的费用柱状图 + 累计线（手写 SVG，不引依赖） */
function Chart({ calls }) {
  const [hover, setHover] = useState(null);
  const W = 980;
  const H = 260;
  const padL = 44;
  const padB = 26;
  const padT = 14;

  const { bars, cum, maxCost, total } = useMemo(() => {
    const n = calls.length || 1;
    const bw = Math.max(1.5, (W - padL - 12) / n);
    const maxCost = Math.max(0.0001, ...calls.map((c) => c.cost || 0));
    const totalCost = calls.reduce((a, c) => a + (c.cost || 0), 0) || 0.0001;
    let acc = 0;
    const bars = [];
    const cum = [];
    calls.forEach((c, i) => {
      acc += c.cost || 0;
      const h = ((c.cost || 0) / maxCost) * (H - padB - padT);
      const x = padL + i * bw;
      const tag = tagLabel(c.tag);
      bars.push({ x, y: H - padB - h, w: Math.max(1, bw - 0.6), h, tag, color: TAG_COLOR[tag] || '#8a8f98', call: c });
      cum.push([x + bw / 2, H - padB - (acc / totalCost) * (H - padB - padT)]);
    });
    return { bars, cum, maxCost, total: acc };
  }, [calls]);

  if (!calls.length) return <div className="empty">这个时间段没有调用记录。</div>;

  const cumPath = cum.map(([x, y], i) => (i ? `L${x},${y}` : `M${x},${y}`)).join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = H - padB - f * (H - padB - padT);
          return (
            <g key={f}>
              <line x1={padL} x2={W - 6} y1={y} y2={y} stroke="var(--line)" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="axis">
                {(maxCost * f).toFixed(4)}
              </text>
            </g>
          );
        })}

        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(1, b.h)}
            fill={b.color}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'bottom',
              animation: `growBar 380ms cubic-bezier(.2,.8,.2,1) both`,
              animationDelay: `${Math.min(400, i * 3)}ms`,
            }}
            opacity={hover && hover.i !== i ? 0.45 : 0.9}
            onMouseEnter={() => setHover({ i, ...b })}
          />
        ))}

        <path
          d={cumPath}
          fill="none"
          stroke="var(--dim)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
          style={{ animation: 'fadeRise 500ms var(--ease) both', animationDelay: '200ms' }}
        />

        <text x={padL} y={H - 8} className="axis">
          {calls.length ? fmtTime(calls[0].at) : ''}
        </text>
        <text x={W - 6} y={H - 8} textAnchor="end" className="axis">
          {calls.length ? fmtTime(calls[calls.length - 1].at) : ''}
        </text>
      </svg>

      {hover && (
        <div className="chart-tip">
          <b>{hover.tag}</b> · {money(hover.call.cost)}
          <div className="muted">
            {fmtTime(hover.call.at)} · 入 {hover.call.prompt} / 出 {hover.call.completion} token
          </div>
        </div>
      )}

      <div className="chart-foot">
        <span>每次调用一根柱（{calls.length} 次），虚线是累计</span>
        <span>合计 {money(total)}</span>
      </div>
    </div>
  );
}

export default function Usage({ token, api }) {
  const [calls, setCalls] = useState([]);
  const [hours, setHours] = useState(24);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/usage?hours=${hours}`, {}, token);
      setCalls(r.calls || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token, hours]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const byTag = useMemo(() => {
    const m = new Map();
    for (const c of calls) {
      const tag = tagLabel(c.tag);
      const cur = m.get(tag) || { n: 0, cost: 0, tokens: 0 };
      cur.n += 1;
      cur.cost += c.cost || 0;
      cur.tokens += (c.prompt || 0) + (c.completion || 0);
      m.set(tag, cur);
    }
    return [...m].sort((a, b) => b[1].cost - a[1].cost);
  }, [calls]);

  const total = calls.reduce((a, c) => a + (c.cost || 0), 0);
  const avg = calls.length ? total / calls.length : 0;
  const max = calls.reduce((a, c) => Math.max(a, c.cost || 0), 0);

  return (
    <div>
      <PageTitle id="__usage" title="用量" />
      <p className="page-desc">每一次模型调用的费用都在这。柱子的颜色代表用途，虚线是累计。</p>
      {err && <div className="err">{err}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="stats">
          <div className="stat">
            <div className="k">合计</div>
            <div className="v"><AnimatedNumber value={total} format={(v) => money(v)} /></div>
          </div>
          <div className="stat">
            <div className="k">调用次数</div>
            <div className="v"><AnimatedNumber value={calls.length} /></div>
          </div>
          <div className="stat">
            <div className="k">平均每次</div>
            <div className="v"><AnimatedNumber value={avg} format={(v) => money(v)} /></div>
          </div>
          <div className="stat">
            <div className="k">最贵一次</div>
            <div className="v"><AnimatedNumber value={max} format={(v) => money(v)} /></div>
          </div>
          <div className="stat">
            <div className="k">时间范围</div>
            <div className="v" style={{ fontSize: 13 }}>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mini-select">
                <option value={1}>1 小时</option>
                <option value={6}>6 小时</option>
                <option value={24}>24 小时</option>
                <option value={72}>3 天</option>
                <option value={168}>7 天</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <Chart calls={calls} />
      </div>

      <div className="card">
        <table className="usage-table">
          <thead>
            <tr>
              <th>用途</th>
              <th>次数</th>
              <th>花费</th>
              <th>占比</th>
              <th>token</th>
            </tr>
          </thead>
          <tbody>
            {!calls.length && (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ width: '70%' }} />
                  <div className="skeleton" style={{ width: '45%' }} />
                </td>
              </tr>
            )}
            {byTag.map(([tag, v]) => (
              <tr key={tag}>
                <td>
                  <span className="dot-tag" style={{ background: TAG_COLOR[tag] || '#8a8f98' }} />
                  {tag}
                </td>
                <td>{v.n}</td>
                <td>{money(v.cost)}</td>
                <td>{total ? ((v.cost / total) * 100).toFixed(0) + '%' : '—'}</td>
                <td>{v.tokens.toLocaleString()}</td>
              </tr>
            ))}
            {!byTag.length && (
              <tr>
                <td colSpan={5} className="muted">
                  还没有记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
