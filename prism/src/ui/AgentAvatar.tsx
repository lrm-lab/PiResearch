// CoForge's agent avatar: a rounded square on the avatar tone with the brand's light-violet →
// violet gradient hairline frame. `xs` (24px) is the round one, `sm` the 36 × 40 message avatar.
import type { Tone } from "../types/api";
import { agentTone } from "../lib/palette";
import type { Mood } from "../lib/mood";
import { MOOD_LABEL } from "../lib/mood";
import { cx } from "./cx";
import "./avatar.css";

export type AvatarSize = "xxs" | "xs" | "sm" | "md";

const SIZE: Record<AvatarSize, string> = {
  xxs: "size-5 rounded-full text-[0.625rem]",
  xs: "size-6 rounded-full text-xs",
  sm: "h-10 w-9 rounded-[10px] text-sm",
  md: "size-12 rounded-xl text-md",
};

/** Readable short label for an agent id: "fact_verifier" → "FV", "fiscal" → "F". */
export function agentInitials(name: string): string {
  const parts = name.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (name[0] ?? "?").toUpperCase();
}

/** The face CoForge draws on an avatar: two eyes and a mouth, one shape per mood. */
export function AgentFace({ mood, className }: { mood: Mood; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cx("prism-face", className)} data-mood={mood}>
      {mood === "happy" ? (
        <>
          <path d="M6.4 10.4q1.6-1.7 3.2 0" />
          <path d="M14.4 10.4q1.6-1.7 3.2 0" />
        </>
      ) : mood === "angry" ? (
        <>
          <path d="M6.2 8.6 9.6 10" />
          <path d="M17.8 8.6 14.4 10" />
          <circle cx="7.9" cy="11.4" r="1.15" />
          <circle cx="16.1" cy="11.4" r="1.15" />
        </>
      ) : (
        <>
          <circle cx="8.3" cy="10.4" r="1.25" />
          <circle cx="15.7" cy="10.4" r="1.25" />
        </>
      )}
      {mood === "calm" && <path d="M9.4 16h5.2" />}
      {mood === "focus" && <path d="M9.6 15.4q2.4 1.7 4.8 0" />}
      {mood === "puzzled" && <path d="M9.2 15.9q1.4-1.4 2.8 0t2.8 0" />}
      {mood === "angry" && <path d="M9.4 16.9q2.6-2.1 5.2 0" />}
      {mood === "happy" && <path d="M8.8 15.2q3.2 2.9 6.4 0" />}
    </svg>
  );
}

export function AgentAvatar({
  name,
  tone,
  size = "xs",
  mood,
  className,
  ring = false,
}: {
  name: string;
  tone: Tone | string | undefined;
  size?: AvatarSize;
  /** When set, the avatar shows the agent's face instead of its initials. */
  mood?: Mood;
  className?: string;
  /** Separator ring for stacked avatars. */
  ring?: boolean;
}) {
  return (
    <span
      title={name}
      className={cx(
        "prism-avatar relative inline-flex shrink-0 items-center justify-center font-semibold text-white select-none",
        SIZE[size],
        ring && "ring-[1.5px] ring-[var(--color-bg-primary)]",
        className,
      )}
      style={{ backgroundColor: agentTone(tone) }}
    >
      {mood ? (
        <AgentFace mood={mood} />
      ) : (
        <span aria-hidden="true">{agentInitials(name)}</span>
      )}
      <span className="sr-only">
        {name}
        {mood ? `，${MOOD_LABEL[mood]}` : ""}
      </span>
    </span>
  );
}
