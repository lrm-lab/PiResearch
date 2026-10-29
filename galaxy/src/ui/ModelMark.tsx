// A research model's mark: a rounded tile in the model's own hue with an abstract glyph — a wave for
// DeepSeek, a sun for GPT-6.1 Sol (the same marks as Prism). Settings cards, the composer chip, study tags.

import { modelOption, type ModelId } from "../lib/model";

function Glyph({ id }: { id: ModelId }) {
  if (id === "deepseek") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="model-mark-glyph is-wave">
        <path d="M3 13.5c2.2 0 3.3-3 5.5-3s3.3 3 5.5 3 3.3-3 5.5-3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M5 18c1.6 0 2.4-1.6 4-1.6s2.4 1.6 4 1.6 2.4-1.6 4-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
        <circle cx="16.5" cy="6.5" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="model-mark-glyph is-sun">
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
