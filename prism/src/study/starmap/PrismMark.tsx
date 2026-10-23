// The small animated prism that is all that remains of the old glass prism: white light in, the
// agents' colours out. Pure SVG + CSS (no WebGL).

import { AGENT_TONES } from "../../lib/palette";
import { cx } from "../../ui/cx";

export function PrismMark({ className, active = false }: { className?: string; active?: boolean }) {
  const rays = [AGENT_TONES[3], AGENT_TONES[4], AGENT_TONES[1], AGENT_TONES[0]];
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cx("shrink-0", className ?? "size-10")} fill="none">
      <path d="M2 24.5 14.5 22" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" className={cx(active && "sm-ray")} />
      <path d="M20 6 31 28H9L20 6Z" className="fill-brand-primary stroke-brand-600 dark:stroke-brand-400" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 12.5 25.5 24H14.5L20 12.5Z" className="fill-brand-secondary" opacity="0.55" />
      {rays.map((color, i) => (
        <path key={color} d={`M27 ${22 + i * 0.5} L38 ${13.5 + i * 6}`} stroke={color} strokeWidth="1.8" strokeLinecap="round" className={cx(active && "sm-ray")} style={{ animationDelay: `${-i * 0.5}s` }} />
      ))}
    </svg>
  );
}
