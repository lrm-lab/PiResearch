// A research model's mark: a rounded tile in the model's own hue with an abstract glyph — a wave for
// DeepSeek, a sun for GPT-6.1 Sol (the same marks as Prism). Settings cards, the composer chip, study tags.

import { modelOption, type ModelId } from "../lib/model";

function Glyph({ id }: { id: ModelId }) {
  return (
    <img
      src={`/galaxy/models/${id === "deepseek" ? "deepseek" : "openai"}.svg`}
      alt=""
      aria-hidden="true"
      className="size-[72%] object-contain"
      draggable={false}
    />
  );
}

export function ModelMark({ id, size = "sm" }: { id: ModelId; size?: "xs" | "sm" | "lg" }) {
  return (
    <span aria-hidden="true" className={`model-mark is-${size}`} data-model={id}>
      <Glyph id={id} />
    </span>
  );
}

/** Mark + short name for captions, cards and the study top bar; nothing for studies that predate the choice. */
export function ModelTag({ id }: { id: unknown }) {
  const model = modelOption(id);
  if (!model) return null;
  return (
    <span className="model-tag" title={`研究模型：${model.name}`}>
      <ModelMark id={model.id} size="xs" />
      {model.short}
    </span>
  );
}
