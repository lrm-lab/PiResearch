// Scene-owned CSS for the DOM labels (pills, status dots, comet chips).
// Injected once; kept here so the scene does not depend on global styles.

const CSS = `
.gx-tool-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}
.gx-tool-list li {
  display: flex;
  min-width: 0;
}
.gx-toolchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 15rem;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(20, 24, 40, 0.78), rgba(10, 12, 22, 0.72));
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.32);
  color: #cfd6e4;
  font: 500 11.5px/1 Inter, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0;
  animation: gx-toolchip-in 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 180ms cubic-bezier(0.34, 1.6, 0.5, 1);
}
@keyframes gx-toolchip-in {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.gx-toolchip:hover {
  border-color: color-mix(in srgb, var(--gx-toolchip, #94a3b8) 55%, transparent);
  background: linear-gradient(180deg, rgba(32, 38, 60, 0.9), rgba(14, 17, 30, 0.85));
  color: #fff;
  transform: translateX(2px);
}
.gx-toolchip:focus-visible {
  outline: 2px solid var(--gx-toolchip, #94a3b8);
  outline-offset: 2px;
}
.gx-toolchip-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gx-toolchip, #94a3b8);
}
.gx-toolchip-tool {
  flex: none;
  color: color-mix(in srgb, var(--gx-toolchip, #94a3b8) 78%, #fff);
  font-weight: 600;
}
.gx-toolchip-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(223, 229, 241, 0.72);
}
.gx-toolchip-count {
  flex: none;
  color: rgba(223, 229, 241, 0.45);
  font: 500 10px/1 "JetBrains Mono", ui-monospace, monospace;
}
.gx-toolchip-more {
  justify-content: center;
  border-style: dashed;
  background: rgba(12, 15, 26, 0.6);
  color: rgba(223, 229, 241, 0.5);
}
.trace-flash {
  animation: trace-flash 1.5s cubic-bezier(0.22, 1, 0.36, 1);
  border-radius: 6px;
}
@keyframes trace-flash {
  0%,
  60% {
    background: rgba(109, 156, 255, 0.16);
  }
  100% {
    background: transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gx-toolchip {
    animation: none;
    opacity: 1;
  }
  .trace-flash {
    animation: none;
    outline: 1px solid rgba(109, 156, 255, 0.6);
  }
}

.gx-label {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 15rem;
  padding: 4px 11px 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: linear-gradient(180deg, rgba(20, 24, 40, 0.72), rgba(10, 12, 22, 0.66));
  box-shadow: inset 2px 0 0 var(--gx-tone), 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 0 0 transparent;
  color: #dfe5f1;
  font: 500 12.5px/1.25 Inter, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transform-origin: 50% 100%;
  will-change: transform, opacity;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 220ms ease, color 160ms ease;
}
.gx-label:hover, .gx-label[data-hot="1"] {
  border-color: color-mix(in srgb, var(--gx-tone) 45%, transparent);
  background: linear-gradient(180deg, rgba(30, 36, 58, 0.82), rgba(14, 17, 30, 0.78));
  box-shadow: inset 2px 0 0 var(--gx-tone), 0 0 22px color-mix(in srgb, var(--gx-tone) 30%, transparent), 0 4px 18px rgba(0, 0, 0, 0.4);
  color: #fff;
}
.gx-label[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--gx-tone) 70%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--gx-tone) 22%, rgba(20, 24, 40, 0.86)), rgba(14, 17, 30, 0.84));
  box-shadow: inset 3px 0 0 var(--gx-tone), 0 0 28px color-mix(in srgb, var(--gx-tone) 42%, transparent), 0 4px 18px rgba(0, 0, 0, 0.45);
  color: #fff;
}
.gx-label:focus-visible {
  outline: 2px solid #48d3e4;
  outline-offset: 2px;
}
.gx-label .gx-id {
  font: 600 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace;
  color: color-mix(in srgb, var(--gx-tone) 75%, #fff);
  opacity: 0.9;
}
.gx-label .gx-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gx-label.gx-goal {
  max-width: min(420px, 70vw);
  padding: 6px 14px 6px 12px;
  font: 600 14.5px/1.3 "Songti SC", "STSong", "Noto Serif SC", serif;
  color: #fff;
  border-color: color-mix(in srgb, var(--gx-tone) 35%, transparent);
}
.gx-dot {
  position: relative;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gx-dot);
  box-shadow: 0 0 8px var(--gx-dot);
}
.gx-dot[data-status="open"] {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--gx-dot);
}
.gx-dot[data-status="cancelled"] {
  box-shadow: none;
  opacity: 0.7;
}
.gx-dot[data-status="in_progress"]::after,
.gx-dot[data-status="error"]::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid var(--gx-dot);
  animation: gx-ping 1.6s ease-out infinite;
}
.gx-dot[data-status="error"]::after {
  animation-duration: 0.9s;
}
@keyframes gx-ping {
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(2.1); opacity: 0; }
}
.gx-chip {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 6px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--gx-tone) 40%, transparent);
  background: rgba(8, 10, 18, 0.72);
  color: color-mix(in srgb, var(--gx-tone) 35%, #fff);
  font: 500 10.5px/1.3 ui-monospace, "SF Mono", Menlo, monospace;
  white-space: nowrap;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  transform-origin: 0% 50%;
  will-change: transform, opacity;
  box-shadow: 0 0 14px color-mix(in srgb, var(--gx-tone) 25%, transparent);
}
.gx-chip::before {
  content: "";
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 6px var(--gx-tone), 0 0 2px #fff;
}
@media (prefers-reduced-motion: reduce) {
  .gx-dot::after { animation: none !important; opacity: 0.5; transform: scale(1.4); }
  .gx-label { transition: none; }
}
`;

let injected = false;

export function ensureLabelStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.galaxyScene = "labels";
  style.textContent = CSS;
  document.head.appendChild(style);
}
