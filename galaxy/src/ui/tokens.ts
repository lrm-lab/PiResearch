// HUD colour maps that the shared lib does not have.

/** Tool label colours (2D TITLE_COLOR, constellation/index.html:446). */
export const TOOL_COLOR: Record<string, string> = {
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
export const STATE_COLOR: Record<string, string> = {
  未开始: "#6d9cff",
  进行中: "#48d3e4",
  已完成: "#58d69a",
  已取消: "#8b93a6",
  存在错误: "#ff5a6a",
  待分配: "#9eb0c2",
};

export function stateColor(label: string): string {
  return STATE_COLOR[label] ?? "#9eb0c2";
}
