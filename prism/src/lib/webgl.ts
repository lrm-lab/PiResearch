let cached: boolean | null = null;

/** True when a WebGL2 context can be created (the Prism renderer). Probed once per page. */
export function hasWebGL2(): boolean {
  cached ??= probe();
  return cached;
}

function probe(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
