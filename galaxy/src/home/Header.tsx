// Brand (with a slow shimmer), live counts and the link to the classic 2D home.

import { useMemo } from "react";
import { splitRows } from "./format";
import { useHome } from "./store";

export function Header() {
  const rows = useHome((state) => state.rows);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);
  return (
    <header className="home-header">
      <a href="/galaxy/" className="home-brand">
        <span className="home-brand-word">PiResearch</span>
      </a>
      <div className="home-header-side">
        {rows && rows.length > 0 && (
          <p className="home-header-stats" aria-live="polite">
            <span className="home-row-dot is-live" aria-hidden="true" />
            {split.running.length} 项调研中 · {split.done.length} 项已完成
          </p>
        )}
        <a href="/index.html" className="home-classic">
          经典 2D 版
        </a>
      </div>
    </header>
  );
}
