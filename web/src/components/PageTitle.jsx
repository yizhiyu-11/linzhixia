import Icon, { navIcon } from './Icon.jsx';

/** 统一的页面标题：色块图标 + 标题 */
export default function PageTitle({ id, title }) {
  const ic = navIcon(id);
  return (
    <div className="page-head" style={{ marginBottom: 10 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span className="nav-icon" style={{ '--tint': ic.tint, '--ink': ic.ink, width: 28, height: 28 }}>
          <Icon name={ic.icon} size={17} />
        </span>
        {title}
      </h1>
    </div>
  );
}
