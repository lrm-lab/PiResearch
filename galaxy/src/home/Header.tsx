// Brand (with a slow shimmer), live counts and the link to the classic 2D home.

import { useMemo } from "react";
import { splitRows } from "./format";
import { useHome } from "./store";

export function Header() {
  const rows = useHome((state) => state.rows);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);
  return (
    <header className="home-header">
      <a href="/galaxy/" className="home-brand" title="回到主页">
        <span className="home-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="3.2" fill="currentColor" />
            <ellipse cx="16" cy="16" rx="13" ry="5.2" stroke="currentColor" strokeWidth="1.2" opacity=".75" transform="rotate(-28 16 16)" />
            <ellipse cx="16" cy="16" rx="13" ry="5.2" stroke="currentColor" strokeWidth=".8" opacity=".35" transform="rotate(38 16 16)" />
          </svg>
        </span>
        <span className="home-brand-word">PiResearch</span>
        <span className="home-brand-tag">Galaxy</span>
      </a>
      <div className="home-header-side">
        {rows && rows.length > 0 && (
          <p className="home-header-stats" aria-live="polite">
            <span className="home-row-dot is-live" aria-hidden="true" />
            {split.running.length} 项调研中 · {split.done.length} 项已完成
          </p>
        )}
        <a href="/" className="home-classic">
          经典 2D 版
        </a>
      </div>
    </header>
  );
}
