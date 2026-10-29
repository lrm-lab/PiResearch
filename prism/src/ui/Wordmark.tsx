// The handwritten "PiResearch" logo, shared by all three themes (same font stack as 2D/Galaxy).

import { APP_BASE } from "../lib/api";

export function Wordmark() {
  return (
    <a
      href={APP_BASE}
      title="回到主页"
      className="shrink-0 text-[22px] leading-none text-primary outline-none transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      style={{ fontFamily: '"Savoye LET", "Snell Roundhand", "Segoe Script", "Bradley Hand", cursive' }}
    >
      PiResearch
    </a>
  );
}
