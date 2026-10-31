import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageTitle from './PageTitle.jsx';

const WAKE = ['6-7点', '7-8点', '8-9点', '9-10点', '10点以后', '不固定'];
const SLEEP = ['22-23点', '23-24点', '0-1点', '1-2点', '2-3点', '3点以后', '不固定'];
const TABOO = ['前任', '家人', '工作压力', '身体', '钱', '体重', '年龄'];
const CLOSENESS = [
  { v: '粘人', t: '粘人', d: '更少岔开话题，更常主动找你' },
  { v: '适中', t: '适中', d: '默认' },
  { v: '独立', t: '独立', d: '更多自己待着，主动少' },
];
const FREQ = [
  { v: '少', t: '少', d: '1 条/天' },
  { v: '中', t: '中', d: '3 条/天' },
  { v: '多', t: '多', d: '5 条/天' },
];
const RELATION = [
  { v: '女朋友', t: '女朋友', d: '默认人设' },
  { v: '暧昧', t: '暧昧', d: '别太黏，别直接叫男朋友' },
  { v: '朋友', t: '朋友', d: '别越界，别撒娇' },
];

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

export default function Profile({ token, api }) {
  const [form, setForm] = useState({
    nickname: '',
    birthday: '',
    job: '',
    wake: '7-8点',
    sleep: '0-1点',
    likes: '',
    dislikes: '',
    taboo: [],
    closeness: '适中',
    proactive: '中',
    relation: '女朋友',
  });
  const [users, setUsers] = useState([]);
  const [qq, setQq] = useState('');
  const [facts, setFacts] = useState([]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/users', {}, token)
      .then((r) => {
        setUsers(r.users || []);
        if (!qq && r.users?.length) setQq(r.users[0].qq);
      })
      .catch((e) => setErr(e.message));
  }, [api, token, qq]);

  const load = useCallback(async () => {
    if (!qq) return;
    try {
      const r = await api('/api/profile?qq=' + qq, {}, token);
      setFacts(r.facts || []);
      if (r.profile) setForm((f) => ({ ...f, ...r.profile }));
    } catch (e) {
      setErr(e.message);
    }
  }, [api, token]);

  useEffect(() => {
    if (!qq) return;
    // 切人时清掉上一个用户的缓存，避免串味
    setFacts([]);
    load();
  }, [qq, load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTaboo = (t) =>
    setForm((f) => ({
      ...f,
      taboo: f.taboo.includes(t) ? f.taboo.filter((x) => x !== t) : [...f.taboo, t],
    }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/api/profile?qq=' + qq, { method: 'POST', body: JSON.stringify(form) }, token);
      setFacts(r.facts || []);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => {
    const map = { 粘人: '更少岔开、更常主动', 适中: '默认节奏', 独立: '更多自己待着' };
    return `${map[form.closeness]} · 主动 ${form.proactive} · ${form.relation}`;
  }, [form]);

  return (
    <div>
      <PageTitle id="__profile" title="关于你" />
      <p className="page-desc">
        给某个人填一份档案，就只作用于你。全部可跳过，随时能改；填完立刻生效。
      </p>

      {users.length > 1 && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>给谁填</span>
          <select className="mini-select" value={qq} onChange={(e) => setQq(e.target.value)}>
            {users.map((u) => (
              <option key={u.qq} value={u.qq}>
                {u.nickname || u.qq}（{u.messages} 条）
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 11.5 }}>
            这个人的称呼、作息、粘人度、关系，只影响她跟你的聊天
          </span>
        </div>
      )}
      {err && <div className="err">{err}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="form-grid">
          <label className="fld">
            <span>她怎么称呼你</span>
            <input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="例：一只鱼" />
          </label>

          <label className="fld">
            <span>生日（可不填）</span>
            <input value={form.birthday} onChange={(e) => set('birthday', e.target.value)} placeholder="例：3 月 14" />
          </label>

          <label className="fld">
            <span>你做什么工作 / 在读书</span>
            <input value={form.job} onChange={(e) => set('job', e.target.value)} placeholder="例：前端开发" />
          </label>

          <label className="fld">
            <span>几点起</span>
            <select value={form.wake} onChange={(e) => set('wake', e.target.value)}>
              {WAKE.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <label className="fld">
            <span>几点睡</span>
            <select value={form.sleep} onChange={(e) => set('sleep', e.target.value)}>
              {SLEEP.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <label className="fld">
            <span>喜欢吃什么</span>
            <input value={form.likes} onChange={(e) => set('likes', e.target.value)} placeholder="例：火锅、烧烤" />
          </label>

          <label className="fld">
            <span>不吃 / 讨厌什么</span>
            <input value={form.dislikes} onChange={(e) => set('dislikes', e.target.value)} placeholder="例：香菜、内脏" />
          </label>
        </div>

        <div className="fld block">
          <span>不想聊的话题</span>
          <div className="chips">
            {TABOO.map((t) => (
              <button
                key={t}
                className={'chip' + (form.taboo.includes(t) ? ' on' : '')}
                onClick={() => toggleTaboo(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fld block">
          <span>你希望她粘一点还是独立一点</span>
          <div className="seg">
            {CLOSENESS.map((c) => (
              <button
                key={c.v}
                className={'seg-btn' + (form.closeness === c.v ? ' on' : '')}
                onClick={() => set('closeness', c.v)}
              >
                <b>{c.t}</b>
                <small>{c.d}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="fld block">
          <span>主动消息频率</span>
          <div className="seg">
            {FREQ.map((c) => (
              <button
                key={c.v}
                className={'seg-btn' + (form.proactive === c.v ? ' on' : '')}
                onClick={() => set('proactive', c.v)}
              >
                <b>{c.t}</b>
                <small>{c.d}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="fld block">
          <span>你希望她是什么关系</span>
          <div className="seg">
            {RELATION.map((c) => (
              <button
                key={c.v}
                className={'seg-btn' + (form.relation === c.v ? ' on' : '')}
                onClick={() => set('relation', c.v)}
              >
                <b>{c.t}</b>
                <small>{c.d}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="save-bar">
        <span className="muted">{preview}</span>
        <button className="btn-primary" disabled={busy} onClick={save}>
          {saved ? '已保存' : busy ? '保存中…' : '保存'}
        </button>
      </div>

      {facts.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="mem-head">
            <span>保存后会写进记忆（{facts.length} 条）</span>
            <span className="muted">可在「🧠 记忆」里改</span>
          </div>
          {facts.map((f) => (
            <div className="mem-row" key={f.key}>
              <div className="mem-k">{KEY_LABEL[f.key] || f.key}</div>
              <div className="mem-v">{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
