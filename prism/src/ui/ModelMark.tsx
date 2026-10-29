// A research model's mark: a rounded tile in the model's own hue with an abstract glyph — a wave for
// DeepSeek, a sun for GPT-6.1 Sol. Used on the settings cards, the composer chip and study chips.

import { modelOption, type ModelId } from "../lib/model";
import { cx } from "./cx";

const SIZE = {
  xs: "size-4 rounded-[5px]",
  sm: "size-5 rounded-md",
  lg: "size-11 rounded-xl",
} as const;

const TILE: Record<ModelId, string> = {
  deepseek: "bg-[linear-gradient(145deg,#6b84ff,#3b5bfd)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
  "gpt-6.1-sol": "bg-[linear-gradient(145deg,#2a2833,#0f0e14)] text-[#ffc65c] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
};

function Glyph({ id }: { id: ModelId }) {
  if (id === "deepseek") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[62%]">
        <path d="M3 13.5c2.2 0 3.3-3 5.5-3s3.3 3 5.5 3 3.3-3 5.5-3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M5 18c1.6 0 2.4-1.6 4-1.6s2.4 1.6 4 1.6 2.4-1.6 4-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
        <circle cx="16.5" cy="6.5" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[66%]">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      {Array.from({ length: 8 }, (_, index) => (
        <path
          key={index}
          d="M12 2.6v2.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${index * 45} 12 12)`}
          opacity={index % 2 ? 0.55 : 1}
        />
      ))}
    </svg>
  );
}

export function ModelMark({ id, size = "sm", className }: { id: ModelId; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex shrink-0 items-center justify-center", SIZE[size], TILE[id], className)}>
      <Glyph id={id} />
    </span>
  );
}

/** "▣ GPT-6.1" for cards and the study strip; nothing for studies that predate the model choice. */
export function ModelTag({ id, className }: { id: unknown; className?: string }) {
  const model = modelOption(id);
  if (!model) return null;
  return (
    <span title={`研究模型：${model.name}`} className={cx("inline-flex shrink-0 items-center gap-1 text-xs font-medium text-tertiary", className)}>
      <ModelMark id={model.id} size="xs" />
      {model.short}
    </span>
  );
}
