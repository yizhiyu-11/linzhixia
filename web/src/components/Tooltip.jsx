import { useEffect, useRef, useState } from 'react';

/**
 * 悬停提示：停留 400ms 才出现，移开立刻消失。
 * 键盘 Tab 聚焦也能看（可访问性）。
 */
export default function Tooltip({ text }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 400);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) return null;

  return (
    <span className="tip-wrap" onMouseEnter={show} onMouseLeave={hide}>
      <span
        className="tip-icon"
        tabIndex={0}
        onFocus={() => setOpen(true)}
        onBlur={hide}
        aria-label={text}
      >
        ?
      </span>
      {open && <span className="tip-bubble">{text}</span>}
    </span>
  );
}
