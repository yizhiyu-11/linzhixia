import { useState } from 'react';
import Tooltip from './Tooltip.jsx';

/** QQ 号列表编辑器：输入 + 添加，标签上 × 删除 */
function ListField({ value = [], onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!/^\d{5,12}$/.test(v)) {
      alert('QQ 号应该是 5-12 位数字');
      return;
    }
    if (value.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...value, v]);
    setDraft('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      <div className="chips">
        {value.length === 0 && <span style={{ color: 'var(--dim)', fontSize: 12 }}>还没有人</span>}
        {value.map((v) => (
          <span className="chip" key={v}>
            {v}
            <button onClick={() => onChange(value.filter((x) => x !== v))} title="移除">
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={draft}
          placeholder={placeholder || 'QQ 号'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          style={{ width: 140 }}
        />
        <button className="btn" onClick={add}>
          添加
        </button>
      </div>
    </div>
  );
}

export default function Field({ field, value, onChange }) {
  const { key, label, type, help, unit, min, max, step, options } = field;

  let control = null;

  if (type === 'boolean') {
    control = (
      <button
        className={value ? 'switch on' : 'switch'}
        onClick={() => onChange(!value)}
        aria-pressed={value}
        title={value ? '点击关闭' : '点击开启'}
      />
    );
  } else if (type === 'select') {
    control = (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (type === 'range') {
    control = (
      <>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span style={{ minWidth: 46, textAlign: 'right' }}>{format(value, step)}</span>
        {unit && <span className="unit">{unit}</span>}
      </>
    );
  } else if (type === 'number') {
    control = (
      <>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {unit && <span className="unit">{unit}</span>}
      </>
    );
  } else if (type === 'list') {
    control = <ListField value={value} onChange={onChange} />;
  } else {
    control = (
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ minWidth: 220 }}
      />
    );
  }

  return (
    <div className="row">
      <div className="row-label">
        <div className="name">
          <span>{label}</span>
          <Tooltip text={help} />
        </div>
        {key === 'allowedQqs' && (
          <div className="hint">白名单开着时，只有这些号能触发她</div>
        )}
      </div>
      <div className="row-control">{control}</div>
    </div>
  );
}

function format(v, step) {
  if (step === 0.01 || step === 0.05) return Number(v).toFixed(2);
  if (step < 1) return Number(v).toFixed(1);
  return String(v);
}
