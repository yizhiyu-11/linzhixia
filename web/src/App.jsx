import { useCallback, useEffect, useMemo, useState } from 'react';
import Field from './components/Field.jsx';
import Turns from './components/Turns.jsx';
import Timeline from './components/Timeline.jsx';
import Usage from './components/Usage.jsx';
import Memory from './components/Memory.jsx';
import Profile from './components/Profile.jsx';
import Stickers from './components/Stickers.jsx';
import UserPersona from './components/UserPersona.jsx';
import Sandbox from './components/Sandbox.jsx';
import Manual from './components/Manual.jsx';
import Api from './components/Api.jsx';
import Icon, { navIcon } from './components/Icon.jsx';

const TOKEN_KEY = 'ai-gf-console-token';
const THEME_KEY = 'ai-gf-console-theme';
// 允许 ?module=voice 直接打开某个模块（截图/书签都用得上）
const INITIAL_MODULE = new URLSearchParams(location.search).get('module') || 'persona';

function getToken() {
  const fromUrl = new URLSearchParams(location.search).get('token');
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    // 把 token 从地址栏抹掉，避免被截图/转发带出去
    history.replaceState(null, '', location.pathname);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY) || '';
}

async function api(path, opts = {}, token) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-web-token': token,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const fmtUptime = (s) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// 侧栏分组：先看、再调、最后系统
const GROUP_DEFS = [
  { title: '概览', ids: ['__timeline', '__profile', '__usage'] },
  { title: '对话', ids: ['__turns', '__memory', '__sandbox'] },
  { title: '她', ids: ['persona', 'act', 'pacing', '__stickers', 'stickers', 'voice'] },
  { title: '系统', ids: ['proactive', 'memory', 'model', 'safety', 'access', '__api', '__manual'] },
];

const CUSTOM_PAGES = {
  __timeline: { icon: '📈', title: '时间线' },
  __profile: { icon: '👤', title: '关于你' },
  __usage: { icon: '💸', title: '用量' },
  __turns: { icon: '🔎', title: '对话回放' },
  __memory: { icon: '🧠', title: '记忆' },
  __sandbox: { icon: '🧪', title: '测试台' },
  __stickers: { icon: '🖼', title: '表情库' },
  __manual: { icon: '📖', title: '手册' },
  __api: { icon: '🔌', title: '接口' },
};

export default function App() {
  const [token, setToken] = useState(getToken());
  const [state, setState] = useState(null);
  const [active, setActive] = useState(INITIAL_MODULE);
  const [drafts, setDrafts] = useState({}); // moduleId -> 改过的字段
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || 'light');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/state', {}, token);
      setState(data);
      if (!String(active).startsWith('__') && !data.modules.find((m) => m.id === active)) {
        setActive(data.modules[0]?.id);
      }
    } catch (e) {
      setToast({ type: 'err', text: e.message });
      if (e.message.includes('token')) localStorage.removeItem(TOKEN_KEY);
    }
  }, [token, active]);

  useEffect(() => {
    if (!token) return;
    load();
    const t = setInterval(load, 5000); // 运行时数据每 5 秒刷一次
    return () => clearInterval(t);
  }, [token, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const mod = state?.modules.find((m) => m.id === active);
  const values = useMemo(() => {
    if (!mod) return {};
    return { ...mod.values, ...(drafts[mod.id] || {}) };
  }, [mod, drafts]);

  const dirty = mod && drafts[mod.id] && Object.keys(drafts[mod.id]).length > 0;

  const setField = (key, value) => {
    setDrafts((d) => ({ ...d, [mod.id]: { ...(d[mod.id] || {}), [key]: value } }));
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const r = await api(`/api/config/${mod.id}`, {
        method: 'PATCH',
        body: JSON.stringify(drafts[mod.id]),
      }, token);
      setDrafts((d) => ({ ...d, [mod.id]: {} }));
      setState((s) => ({
        ...s,
        modules: s.modules.map((m) => (m.id === mod.id ? { ...m, values: r.values } : m)),
      }));
      setToast({ type: 'ok', text: '已保存，下一轮对话生效' });
    } catch (e) {
      setToast({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDrafts((d) => ({ ...d, [mod.id]: {} }));

  // 点导航：切页面并收起手机侧栏
  const go = (id) => {
    setActive(id);
    setMenuOpen(false);
  };

  if (!token) {
    return (
      <div className="login">
        <h2>需要访问令牌</h2>
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>
          打开机器人启动时打印的地址，形如 http://127.0.0.1:3870/?token=xxxx
        </p>
        <input
          type="text"
          placeholder="粘贴 token"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              localStorage.setItem(TOKEN_KEY, e.target.value.trim());
              setToken(e.target.value.trim());
            }
          }}
        />
      </div>
    );
  }

  if (!state) {
    return <div className="empty">加载中…（如果一直停在这里，看下 bot 是不是没启动）</div>;
  }

  const rt = state.runtime;

  // 把自定义页和配置模块合成一份可查找的清单，再按分组排
  const itemOf = (id) => {
    if (CUSTOM_PAGES[id]) return { id, ...CUSTOM_PAGES[id] };
    const m = state.modules.find((x) => x.id === id);
    return m ? { id, icon: m.icon, title: m.title } : null;
  };
  const known = new Set(GROUP_DEFS.flatMap((g) => g.ids));
  const groups = GROUP_DEFS.map((g) => ({
    title: g.title,
    items: g.ids.map(itemOf).filter(Boolean),
  }));
  // 没归类的模块（以后新加的）自动落到"系统"
  const leftovers = state.modules.filter((m) => !known.has(m.id)).map(itemOf).filter(Boolean);
  if (leftovers.length) {
    const sys = groups.find((g) => g.title === '系统');
    sys.items = [...sys.items, ...leftovers];
  }

  const currentTitle = active === 'persona' ? '人设' : itemOf(active)?.title || '';

  return (
    <div className="layout">
      {menuOpen && <div className="nav-mask" onClick={() => setMenuOpen(false)} />}

      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="brand">
          ai-gf
          <small>管理后台 v0.2</small>
        </div>

        <div className="sidebar-nav">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="nav-group">{g.title}</div>
            {g.items.map((it) => {
              const ic = navIcon(it.id);
              return (
                <button
                  key={it.id}
                  className={'nav-item' + (it.id === active ? ' active' : '')}
                  onClick={() => go(it.id)}
                >
                  <span
                    className="nav-icon"
                    style={{ '--tint': ic.tint, '--ink': ic.ink }}
                  >
                    <Icon name={ic.icon} />
                  </span>
                  <span>{it.title}</span>
                </button>
              );
            })}
          </div>
        ))}
        </div>

        <div className="sidebar-foot">
          <span className={'dot ' + (rt.online ? 'on' : 'off')} />
          {rt.online ? `在线 · ${rt.qq}` : '离线'}
          <div style={{ marginTop: 4 }}>已运行 {fmtUptime(rt.uptimeSec)}</div>
          <button
            className="btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? '🌙 深色' : '☀️ 浅色'}
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="菜单">
            ☰
          </button>
          <span className="title">{currentTitle}</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            {rt.online ? '在线' : '离线'}
          </span>
        </div>

        <main className="main">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="stats">
              <div className="stat">
                <div className="k">收到消息</div>
                <div className="v">{rt.messagesIn}</div>
              </div>
              <div className="stat">
                <div className="k">发出条数</div>
                <div className="v">{rt.messagesOut}</div>
              </div>
              <div className="stat">
                <div className="k">表情包</div>
                <div className="v">{rt.stickersSent}</div>
              </div>
              <div className="stat">
                <div className="k">今日花费</div>
                <div className="v">¥{rt.costToday ?? 0}</div>
              </div>
              <div className="stat">
                <div className="k">人设</div>
                <div className="v" style={{ fontSize: 14 }}>
                  {rt.persona}
                </div>
              </div>
            </div>
          </div>

          <div className="page-fade" key={active}>
          {active === '__timeline' && <Timeline token={token} api={api} />}
          {active === '__turns' && <Turns token={token} api={api} />}
          {active === '__sandbox' && <Sandbox token={token} api={api} />}
          {active === '__stickers' && <Stickers token={token} api={api} />}
          {active === '__profile' && <Profile token={token} api={api} />}
          {active === '__memory' && <Memory token={token} api={api} />}
          {active === '__usage' && <Usage token={token} api={api} />}
          {active === '__manual' && <Manual token={token} api={api} />}
          {active === '__api' && <Api token={token} api={api} />}

          {!String(active).startsWith('__') && mod && (
            <>
              <div className="page-head">
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    className="nav-icon"
                    style={{ '--tint': navIcon(active).tint, '--ink': navIcon(active).ink, width: 28, height: 28 }}
                  >
                    <Icon name={navIcon(active).icon} size={17} />
                  </span>
                  {mod.title}
                </h1>
              </div>
              <p className="page-desc">{mod.desc}</p>

              <div className="card">
                {mod.fields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    onChange={(v) => setField(f.key, v)}
                  />
                ))}
              </div>

              {dirty && (
                <div className="footer">
                  <span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>
                    有未保存的改动
                  </span>
                  <button className="btn ghost" onClick={reset}>
                    撤销
                  </button>
                  <button className="btn primary" disabled={saving} onClick={save}>
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              )}
            </>
          )}

          {active === 'persona' && <UserPersona token={token} api={api} />}
          </div>
        </main>
      </div>

      {toast && <div className={'toast ' + toast.type}>{toast.text}</div>}
    </div>
  );
}
