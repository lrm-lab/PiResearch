// The main agent's avatar: a prism-coloured sphere that breathes at rest, grows orbiting particles
// while it thinks and sends a ring out when a reply lands (`pulse` changes).

import type { CSSProperties } from "react";
import { cx } from "../../ui/cx";
import "./chat.css";

export function ChatOrb({
  size = 28,
  thinking = false,
  pulse = 0,
  className,
}: {
  size?: number;
  thinking?: boolean;
  /** Changes every time a reply completes. */
  pulse?: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx("prism-orb", thinking && "prism-orb--thinking", className)} style={{ "--s": `${size}px` } as CSSProperties}>
      <span className="prism-orb__body" />
      {thinking && (
        <>
          <span className="prism-orb__orbit" />
          <span className="prism-orb__orbit" />
        </>
      )}
      {pulse > 0 && <span key={pulse} className="prism-orb__ring" />}
    </span>
  );
}
