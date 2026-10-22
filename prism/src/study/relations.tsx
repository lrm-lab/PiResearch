// Relation swatches in the star map's line language (DESIGN.md §3): parent a thin dashed neutral
// curve, audit dotted indigo, support solid green, challenge an orange arch with a bead, error a
// red zigzag. Colours come from RELATION_HEX so the chrome and the map always agree.

import { RELATION_HEX } from "../lib/palette";
import { cx } from "../ui/cx";
import type { DrawnRelation } from "./model";

export function RelationGlyph({ relation, className }: { relation: DrawnRelation; className?: string }) {
  const stroke = RELATION_HEX[relation];
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 28 12" aria-hidden="true" className={cx("h-3 w-7 shrink-0", className)}>
      {relation === "parent" && <path d="M2 9C9 9 13 3 26 3" {...common} strokeWidth={1.5} strokeDasharray="3 3" />}
      {relation === "audit" && <path d="M2 6H26" {...common} strokeDasharray="0.1 4" strokeWidth={2.4} />}
      {relation === "support" && <path d="M2 6H26" {...common} />}
      {relation === "challenge" && (
        <>
          <path d="M2 10C7 1 21 1 26 10" {...common} />
          <circle cx="14" cy="3.3" r="2" fill={stroke} />
        </>
      )}
      {relation === "error" && <path d="M2 7L6 3L10 9L14 3L18 9L22 3L26 7" {...common} strokeWidth={1.75} />}
    </svg>
  );
}

/** A small round swatch for counts and chips. */
export function RelationDot({ relation, className }: { relation: DrawnRelation; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: RELATION_HEX[relation] }}
    />
  );
}
