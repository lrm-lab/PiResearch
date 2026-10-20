// Legend (bottom left): relation swatches that echo the scene's edge looks, and the body status key.

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { REL } from "../lib/activity";
import { RELATION_COLOR } from "../lib/palette";
import { hasWebGL2 } from "../lib/webgl";
import { useGalaxy } from "../store";
import { IconChevronDown } from "./icons";
import { useUi } from "./uiStore";

const RELATIONS = ["parent", "audit", "support", "challenge", "error"] as const;
const RELATION_HINT: Record<(typeof RELATIONS)[number], string> = {
  parent: "引力线",
  audit: "扫描光束",
  support: "金色光丝",
  challenge: "彗星弧",
  error: "红色锯齿",
};

function Swatch({ relation }: { relation: (typeof RELATIONS)[number] }) {
  const color = RELATION_COLOR[relation];
  switch (relation) {
    case "parent":
      return (
        <svg className="swatch" viewBox="0 0 40 14" aria-hidden="true">
          <path d="M2 11 Q20 1 38 11" stroke={color} strokeOpacity={0.4} strokeWidth={1.2} />
          <path className="flow" d="M2 11 Q20 1 38 11" stroke="#cfe0ff" strokeWidth={2.2} pathLength={40} />
        </svg>
      );
    case "audit":
      return (
        <svg className="swatch" viewBox="0 0 40 14" aria-hidden="true">
          <line x1="2" y1="7" x2="38" y2="7" stroke={color} strokeOpacity={0.3} strokeWidth={1.2} />
          <line className="beam" x1="2" y1="7" x2="38" y2="7" stroke={color} strokeWidth={2.4} pathLength={60} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        </svg>
      );
    case "support":
      return (
        <svg className="swatch" viewBox="0 0 40 14" aria-hidden="true">
          <line x1="2" y1="7" x2="38" y2="7" stroke={color} strokeWidth={4} strokeOpacity={0.25} style={{ filter: "blur(1.5px)" }} />
          <line className="shimmer" x1="2" y1="7" x2="38" y2="7" stroke={color} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 2.5px ${color})` }} />
        </svg>
      );
    case "challenge":
      return (
        <svg className="swatch" viewBox="0 0 40 14" aria-hidden="true">
          <path d="M2 12 Q20 -6 38 12" stroke={color} strokeOpacity={0.35} strokeWidth={1.2} />
          <path className="comet-trail" d="M2 12 Q20 -6 38 12" stroke={color} strokeOpacity={0.6} strokeWidth={1.8} pathLength={60} />
          <path className="comet" d="M2 12 Q20 -6 38 12" stroke="#f1eaff" strokeWidth={3.2} pathLength={60} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        </svg>
      );
    case "error":
      return (
        <svg className="swatch" viewBox="0 0 40 14" aria-hidden="true">
          <polyline className="jag" points="2,7 7,3 11,10 16,4 20,11 25,3 29,9 34,5 38,7" stroke={color} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
        </svg>
      );
  }
}

const BODY = "#c9d4e2";

const STATUSES: { label: string; glyph: ReactNode }[] = [
  {
    label: "未开始",
    glyph: (
      <svg className="body-glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle className="breathe" cx="7" cy="7" r="6" fill={BODY} fillOpacity={0.22} />
        <circle cx="7" cy="7" r="1.6" fill={BODY} fillOpacity={0.7} />
      </svg>
    ),
  },
  {
    label: "进行中",
    glyph: (
      <svg className="body-glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="3.4" fill="#48d3e4" />
        <g className="spin">
          <ellipse cx="7" cy="7" rx="6.4" ry="2.4" fill="none" stroke="#48d3e4" strokeOpacity={0.7} strokeDasharray="5 3" />
        </g>
      </svg>
    ),
  },
  {
    label: "已完成",
    glyph: (
      <svg className="body-glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6.5" fill="#58d69a" fillOpacity={0.18} />
        <circle className="twinkle" cx="7" cy="7" r="4" fill="#58d69a" style={{ filter: "drop-shadow(0 0 3px #58d69a)" }} />
      </svg>
    ),
  },
  {
    label: "已取消",
    glyph: (
      <svg className="body-glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" fill="#5f6573" />
        <path d="M5 5.5 7 7.5 6.2 9.5M8.5 4.8l.6 2" stroke="#2a2d35" strokeWidth={0.9} fill="none" />
      </svg>
    ),
  },
  {
    label: "存在错误",
    glyph: (
      <svg className="body-glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="3.8" fill={BODY} fillOpacity={0.55} />
        <circle className="flicker" cx="7" cy="7" r="5.8" fill="none" stroke="#ff5a6a" strokeWidth={1.4} style={{ filter: "drop-shadow(0 0 2px #ff5a6a)" }} />
      </svg>
    ),
  },
];

let webgl: boolean | null = null;

export function Legend() {
  const open = useUi((state) => state.legendOpen);
  const setOpen = useUi((state) => state.setLegendOpen);
  const selected = useGalaxy((state) => state.selectedId !== null);
  const lens = useGalaxy((state) => state.lens);
  const view = useGalaxy((state) => state.view);
  // Nothing to explain when the page shows the no-WebGL notice instead of the scene.
  webgl ??= hasWebGL2();
  if (!view?.ok || !webgl) return null;

  return (
    <section
      className={`legend glass glass-strong hud-auto ${selected ? "hide-when-sheet" : ""}`}
      data-open={open}
      aria-label="图例"
    >
      <button type="button" className="legend-toggle" aria-expanded={open} aria-controls="galaxy-legend-body" onClick={() => setOpen(!open)}>
        图例
        {lens && (
          <span className="g-chip" style={{ ["--chip-color" as string]: "#48d3e4", height: 20, letterSpacing: 0, fontSize: 11 }}>
            核验透镜
          </span>
        )}
        <IconChevronDown />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="galaxy-legend-body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="legend-body">
              <ul className="legend-list">
                {RELATIONS.map((relation) => (
                  <li key={relation} style={{ opacity: lens && relation === "parent" ? 0.4 : 1 }}>
                    <Swatch relation={relation} />
                    {REL[relation]}
                    <small>{RELATION_HINT[relation]}</small>
                  </li>
                ))}
              </ul>
              <ul className="legend-status" aria-label="状态">
                {STATUSES.map((status) => (
                  <li key={status.label}>
                    {status.glyph}
                    {status.label}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
