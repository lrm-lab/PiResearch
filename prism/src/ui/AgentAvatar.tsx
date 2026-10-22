// CoForge's agent avatar: a rounded square on the avatar tone with the brand's light-violet →
// violet gradient hairline frame. `xs` (24px) is the round one, `sm` the 36 × 40 message avatar.
import type { Tone } from "../types/api";
import { agentTone } from "../lib/palette";
import { cx } from "./cx";

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

export function AgentAvatar({
  name,
  tone,
  size = "xs",
  className,
  ring = false,
}: {
  name: string;
  tone: Tone | string | undefined;
  size?: AvatarSize;
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
      <span aria-hidden="true">{agentInitials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
