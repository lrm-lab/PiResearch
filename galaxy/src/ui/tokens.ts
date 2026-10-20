// HUD colour maps that the shared lib does not have.

import { ERROR_RED, TONE_COLOR } from "../lib/palette";

/** Tool label colours (2D TITLE_COLOR, constellation/index.html:446). */
const TOOL_COLOR: Record<string, string> = {
  web_search: "#60a5fa",
  web_fetch: "#2dd4bf",
  bash: "#fb923c",
  read_file: "#a3e635",
  create_file: "#f472b6",
  submit_report: "#e879f9",
  download_file: "#818cf8",
  压缩: "#f9a8d4",
  思考: "#fdba74",
};

export function toolColor(tool: string): string {
  return TOOL_COLOR[tool] ?? "#cbd2dc";
}

/** State text (from `stateText`) → chip colour. */
const STATE_COLOR: Record<string, string> = {
  未开始: TONE_COLOR.blue,
  进行中: TONE_COLOR.cyan,
  已完成: TONE_COLOR.green,
  已取消: "#8b93a6",
  存在错误: ERROR_RED,
  待分配: TONE_COLOR.pending,
};

export function stateColor(label: string): string {
  return STATE_COLOR[label] ?? TONE_COLOR.pending;
}
