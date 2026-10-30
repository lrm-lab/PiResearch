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
  return (
    <img
      src={`${import.meta.env.BASE_URL}models/${id === "deepseek" ? "deepseek" : "openai"}.svg`}
      alt=""
      aria-hidden="true"
      className="size-[72%] object-contain"
      draggable={false}
    />
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
