// CoForge's agent avatar: the mascot sticker (a Rive canvas over its still picture) instead of
// initials, sized to the avatar box. The still picture shows until the first Rive frame draws and
// whenever the runtime cannot load; reduced motion keeps the still picture.

import { useMemo, useState } from "react";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../lib/media";
import type { Mood } from "../lib/mood";
import { MOOD_LABEL } from "../lib/mood";
import type { MascotActivity } from "./mascot/contract";
import { mascotOf, mascotStaticUrl } from "./mascot/contract";
import { MascotCanvas } from "./mascot/MascotCanvas";
import { cx } from "./cx";
import "./avatar.css";

export type AvatarSize = "xxs" | "xs" | "sm" | "md";

const SIZE: Record<AvatarSize, string> = {
  xxs: "size-5",
  xs: "size-6",
  sm: "size-9",
  md: "size-11",
};

const ACTIVITY: Record<Mood, MascotActivity> = {
  calm: "idle",
  focus: "working",
  puzzled: "thinking",
  angry: "error",
  happy: "idle",
};

/** Readable short label for an agent id: "fact_verifier" → "FV", "fiscal" → "F". */
export function agentInitials(name: string): string {
  const parts = name.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (name[0] ?? "?").toUpperCase();
}

export function AgentAvatar({
  name,
  size = "xs",
  mood = "calm",
  className,
  ring = false,
}: {
  name: string;
  /** Kept for call sites that still pass the task tone; the mascot carries the colour. */
  tone?: string;
  size?: AvatarSize;
  mood?: Mood;
  className?: string;
  /** Separator ring for stacked avatars. */
  ring?: boolean;
}) {
  const mascot = useMemo(() => mascotOf(name), [name]);
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const [hovered, setHovered] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span
      title={`${name} · ${MOOD_LABEL[mood]}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cx("prism-avatar relative inline-flex shrink-0 items-center justify-center select-none", SIZE[size], ring && "ring-[1.5px] ring-[var(--color-bg-primary)]", className)}
    >
      <img
        src={mascotStaticUrl(mascot)}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-full object-contain transition-opacity duration-200"
        style={{ opacity: drawn ? 0 : 1 }}
      />
      {!reduced && !failed && (
        <span className="absolute inset-0">
          <MascotCanvas mascot={mascot} activity={ACTIVITY[mood]} hovered={hovered} onReady={() => setDrawn(true)} onFailed={() => setFailed(true)} />
        </span>
      )}
      <span className="sr-only">
        {name}，{MOOD_LABEL[mood]}
      </span>
    </span>
  );
}
