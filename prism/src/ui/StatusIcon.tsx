// CoForge's task status ring: an outline circle whose inner pie fills with progress
// (todo empty, in progress half, in review three quarters, done/closed full with a mark).
import type { TaskTone } from "../lib/status";
import { TONE_CLASS, TONE_RING } from "../lib/status";
import { cx } from "./cx";

const PIE = 2 * Math.PI * 3;

export function StatusIcon({ tone, className, pulse = false }: { tone: TaskTone; className?: string; pulse?: boolean }) {
  const ring = TONE_RING[tone];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cx("size-4 shrink-0", TONE_CLASS[tone].text, className)}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {ring.fill > 0 && ring.fill < 1 && (
        <circle
          cx="8"
          cy="8"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={`${PIE * ring.fill} ${PIE}`}
          transform="rotate(-90 8 8)"
          className={pulse ? "origin-center animate-[prism-pie_2.4s_linear_infinite]" : undefined}
        />
      )}
      {ring.fill === 1 && <circle cx="8" cy="8" r="6.25" fill="currentColor" />}
      {ring.mark === "check" && <path d="M5.2 8.2l1.9 1.9 3.7-3.9" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {ring.mark === "cross" && <path d="M6 6l4 4M10 6l-4 4" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />}
      {ring.mark === "bang" && <path d="M8 4.8v3.8M8 10.9v.1" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
