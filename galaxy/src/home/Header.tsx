// Brand (with a slow shimmer), live counts and the Galaxy / Prism / 2D switch.

import { useMemo } from "react";
import { splitRows } from "./format";
import { UiSwitch } from "../ui/UiSwitch";
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
        <UiSwitch />
      </div>
    </header>
  );
}
