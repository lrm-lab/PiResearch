// Example research questions: typed into the composer's placeholder and offered as chips in the
// empty state.

export const EXAMPLE_QUESTIONS = [
  "2020–2025 年地方政府土地出让收入下降了多少？专项债能补上缺口吗？",
  "新能源汽车出口 2025 年的增长主要来自哪些市场？关税变化影响多大？",
  "比较三种碳定价机制在钢铁行业的减排效果和成本。",
  "全球锂价 2022 年以来大幅波动的原因，以及对电池成本的传导。",
  "国产大模型在企业客服场景的落地情况：成本、效果和主要供应商。",
] as const;

/** Short chip labels for the empty state (the full question goes into the composer). */
export const EXAMPLE_CHIPS: readonly { label: string; question: string }[] = [
  { label: "土地财政转型", question: EXAMPLE_QUESTIONS[0] },
  { label: "新能源车出口", question: EXAMPLE_QUESTIONS[1] },
  { label: "碳定价比较", question: EXAMPLE_QUESTIONS[2] },
  { label: "锂价与电池成本", question: EXAMPLE_QUESTIONS[3] },
];

export const COMPOSER_PLACEHOLDER = "写下要查清的问题，可以包含范围、时间和必须回答的要点。";
