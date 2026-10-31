import { useEffect, useMemo, useState } from 'react';
import PageTitle from './PageTitle.jsx';

const W = 1200;
const H = 360;
const L = 54;
const R = 12;

const BANDS = [
  ['早间', 7.2, 9],
  ['上午', 9, 12],
  ['午间', 12, 13],
  ['下午', 13, 18],
  ['晚间', 18, 21.5],
  ['夜间', 21.5, 24],
];

const PLACE_COLOR = {
  home: '#F6E7C8',
  commute: '#DCE6F4',
  work: '#DDE4F6',
  outside: '#DDEFE4',
  shop: '#F8E3D3',
  bed: '#E9E3F7',
};

export default function Timeline({ token, api }) {
  const [span, setSpan] = useState(24);
  const [users, setUsers] = useState([]);
  const [qq, setQq] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tip, setTip] = useState(null);

  useEffect(() => {
    api('/api/users', {}, token)
      .then((r) => {
        setUsers(r.users || []);
        if (!qq && r.users?.length) setQq(r.users[0].qq);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!qq) return undefined;
    let alive = true;
    setErr('');
    api(`/api/timeline?qq=${encodeURIComponent(qq)}&span=${span}`, {}, token)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, [span, token, qq]);

  const view = useMemo(() => {
    if (!data) return null;
    const from = data.from;
    const to = data.to;
    const spanMs = Math.max(1, to - from);
    const x = (t) => L + ((t - from) / spanMs) * (W - L - R);

    // 场景条：把日志转成区间
    const scenes = (data.scenes || []).map((s, i, arr) => {
      const next = arr[i + 1];
      return { ...s, until: next ? next.at : to };
    });

    // 情绪曲线
    const pts = (data.affect || []).map((p) => {
      const y = 250 - p.v * 70;
      return `${x(p.t).toFixed(1)},${y.toFixed(1)}`;
    });

    return { x, scenes, pts, from, to };
  }, [data]);

  if (err) return <div className="card">折线没取到：{err}</div>;
  if (!view) return <div className="card">加载中…</div>;

  const { x, scenes, pts } = view;

  return (
    <>
      <PageTitle title="时间线" sub="她这一天：什么时候换了场景、情绪怎么起伏、你们聊了几次" />

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {[
          [24, '最近 24 小时'],
          [12, '12 小时'],
          [6, '6 小时'],
        ].map(([v, label]) => (
          <button key={v} className={span === v ? 'btn' : 'btn-ghost'} onClick={() => setSpan(v)}>
            {label}
          </button>
        ))}
        {users.length > 0 && (
          <select className="mini-select" value={qq} onChange={(e) => setQq(e.target.value)}>
            {users.map((u) => (
              <option key={u.qq} value={u.qq}>
                {u.nickname || u.qq}
              </option>
            ))}
          </select>
        )}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          场景 {scenes.length} 次 · 对话 {(data.events || []).length} 轮
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setTip(null)}>
          {/* 时段背景 */}
          {BANDS.map(([name, a, b]) => {
            const x0 = L + ((a * 3600_000 - (BANDS[0][1] * 0 + 0)) / (24 * 3600_000)) * (W - L - R);
            const x1 = L + ((b / 24) * (W - L - R));
            return (
              <g key={name}>
                <rect x={x0} y={20} width={Math.max(0, x1 - x0)} height={26} fill="#F7FAFD" />
                <text x={x0 + 6} y={37} fontSize="11" fill="#8A9AAE">
                  {name}
                </text>
              </g>
            );
          })}

          {/* 场景条带 */}
          <text x={8} y={86} fontSize="11" fill="#8A9AAE">
            她在
          </text>
          {scenes.map((s) => {
            const x0 = x(s.at);
            const x1 = x(s.until);
            const w = Math.max(2, x1 - x0);
            return (
              <g key={s.id} onMouseEnter={() => setTip({ x: x0, y: 60, text: `${s.location} · ${s.doing}` })}>
                <rect x={x0} y={62} width={w} height={34} rx={6} fill={PLACE_COLOR[s.place] || '#EEF2F7'} />
                {w > 60 && (
                  <text x={x0 + 6} y={83} fontSize="11" fill="#4A5A6E">
                    {s.location}
                  </text>
                )}
              </g>
            );
          })}

          {/* 情绪曲线 */}
          <text x={8} y={150} fontSize="11" fill="#8A9AAE">
            她的情绪
          </text>
          <line x1={L} y1={250} x2={W - R} y2={250} stroke="#E6EEF7" />
          {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="#2E9C74" strokeWidth="2.5" />}

          {/* 事件层 */}
          <text x={8} y={300} fontSize="11" fill="#8A9AAE">
            聊过
          </text>
          <line x1={L} y1={306} x2={W - R} y2={306} stroke="#E6EEF7" />
          {(data.events || []).map((e) => (
            <circle
              key={e.turnId}
              cx={x(e.t)}
              cy={306}
              r={4}
              fill="#2B6EC8"
              onMouseEnter={() => setTip({ x: x(e.t), y: 270, text: `${e.input || ''} → ${e.reply || ''}` })}
            />
          ))}

          {tip && (
            <g>
              <rect
                x={Math.min(Math.max(tip.x - 4, L), W - 320)}
                y={tip.y - 18}
                width={300}
                height={24}
                rx={6}
                fill="#1C2432"
                opacity="0.92"
              />
              <text x={Math.min(Math.max(tip.x, L + 4), W - 314)} y={tip.y - 2} fontSize="11" fill="#FFFFFF">
                {String(tip.text).slice(0, 24)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {!scenes.length && !(data.events || []).length && (
        <div className="muted" style={{ marginTop: 10 }}>
          这段时间还没有记录。聊几句，或者等她自己动起来，这里就会长出来。
        </div>
      )}
    </>
  );
}
