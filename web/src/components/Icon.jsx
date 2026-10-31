/**
 * 导航图标：统一 24×24 线性符号 + 圆角色块底座（方案 B）。
 * 每个页面一个图标，颜色按分组走，保持整体协调。
 */

const P = {
  person: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="12" width="3" height="7" rx="1"/><rect x="12" y="9" width="3" height="10" rx="1"/><rect x="17" y="6" width="3" height="13" rx="1"/>',
  chat: '<path d="M4.5 6.5h15v9h-9l-4 3.2v-3.2h-2z"/>',
  memory: '<rect x="7" y="7" width="10" height="10" rx="2.2"/><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3"/>',
  flask: '<path d="M9 4h6M10 4v5.2L5.8 17c-.7 1.5.3 3 2 3h8.4c1.7 0 2.7-1.5 2-3L14 9.2V4"/><path d="M7.5 14h9"/>',
  mask: '<path d="M4 8.5c2.6-1.6 5.2-2.4 8-2.4s5.4.8 8 2.4c0 5.4-3.2 9.2-8 11.5C7.2 17.7 4 13.9 4 8.5z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3L16 12l3.5 5"/>',
  smile: '<circle cx="12" cy="12" r="8.2"/><path d="M8.6 14.2c.9 1.4 2 2.1 3.4 2.1s2.5-.7 3.4-2.1"/><circle cx="9.2" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0"/><path d="M12 18v3"/>',
  megaphone: '<path d="M4 10v4l10 4V6L4 10z"/><path d="M14 9.2c1.7.6 2.8 1.6 2.8 2.8s-1.1 2.2-2.8 2.8"/><path d="M7 14.5V19"/>',
  sliders: '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="8" cy="17" r="2" fill="var(--panel)"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6"/>',
  shield: '<path d="M12 4l6.5 2.6v5.1c0 3.6-2.6 6.4-6.5 8.3-3.9-1.9-6.5-4.7-6.5-8.3V6.6z"/><path d="M9.3 12.2l1.9 1.9 3.6-3.7"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
  book: '<path d="M5 4.5h6.5A2.5 2.5 0 0114 7v12.5H7.5A2.5 2.5 0 015 17V4.5z"/><path d="M19 4.5h-4.5A2.5 2.5 0 0012 7v12.5h4.5A2.5 2.5 0 0019 17V4.5z"/>',
};

/** 页面 id → 图标 + 色块 */
export const NAV_ICONS = {
  // 概览（蓝）
  __profile: { icon: 'person', tint: '#e8f0ff', ink: '#2f6fed' },
  __usage: { icon: 'chart', tint: '#e8f0ff', ink: '#2f6fed' },
  // 对话（粉 / 紫）
  __turns: { icon: 'chat', tint: '#ffe9f3', ink: '#d6336c' },
  __memory: { icon: 'memory', tint: '#f3e9ff', ink: '#8b5cf6' },
  __sandbox: { icon: 'flask', tint: '#ffe9f3', ink: '#d6336c' },
  // 她（绿 / 橙）
  persona: { icon: 'mask', tint: '#e9f7ef', ink: '#12a150' },
  act: { icon: 'target', tint: '#fff1e6', ink: '#e8590c' },
  pacing: { icon: 'clock', tint: '#e9f7ef', ink: '#12a150' },
  __stickers: { icon: 'image', tint: '#e6f6f8', ink: '#0e7490' },
  stickers: { icon: 'smile', tint: '#e6f6f8', ink: '#0e7490' },
  voice: { icon: 'mic', tint: '#fff1e6', ink: '#e8590c' },
  // 系统（紫 / 灰蓝）
  proactive: { icon: 'megaphone', tint: '#efefff', ink: '#5b5bd6' },
  memory: { icon: 'sliders', tint: '#efefff', ink: '#5b5bd6' },
  model: { icon: 'gear', tint: '#efefff', ink: '#5b5bd6' },
  safety: { icon: 'shield', tint: '#eef2f6', ink: '#475569' },
  access: { icon: 'lock', tint: '#eef2f6', ink: '#475569' },
  __manual: { icon: 'book', tint: '#eef2f6', ink: '#475569' },
};

const FALLBACK = { icon: 'smile', tint: '#eef2f6', ink: '#475569' };

export function navIcon(id) {
  return NAV_ICONS[id] || FALLBACK;
}

export default function Icon({ name, size = 16 }) {
  const paths = P[name] || P.smile;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
