// Image attachments for the composer: pick or paste PNG/JPEG/WebP, preview as a
// thumbnail strip, submit as base64 in POST /api/questions `images`.

export type AttachedImage = {
  id: string;
  name: string;
  mime: string;
  /** data: URL — shown in the preview and sent to the API as `data`. */
  dataUrl: string;
  bytes: number;
};

export const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
export const IMAGE_MAX_COUNT = 9;
export const IMAGE_MAX_TOTAL = 12 * 1024 * 1024;

export const IMAGE_TOO_MANY = `一次最多附 ${IMAGE_MAX_COUNT} 张图。`;
export const IMAGE_WRONG_TYPE = "只支持 PNG、JPEG、WebP 图片。";
export const IMAGE_TOO_BIG = "图片总共不能超过 12MB。";
export const IMAGE_UNREADABLE = "有张图片读不出来，换一张试试。";

let nextId = 0;

function readFile(file: File): Promise<AttachedImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? { id: `img-${nextId++}`, name: file.name || "image", mime: file.type, dataUrl: reader.result, bytes: file.size } : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Read `files` into attachments; returns what was added plus the first rejection reason. */
export async function readImages(
  files: Iterable<File>,
  existing: readonly AttachedImage[],
): Promise<{ images: AttachedImage[]; error: string | null }> {
  const images: AttachedImage[] = [];
  let error: string | null = null;
  let total = existing.reduce((sum, item) => sum + item.bytes, 0);
  for (const file of files) {
    if (existing.length + images.length >= IMAGE_MAX_COUNT) {
      error ??= IMAGE_TOO_MANY;
      break;
    }
    if (!IMAGE_MIME.has(file.type)) {
      error ??= IMAGE_WRONG_TYPE;
      continue;
    }
    if (total + file.size > IMAGE_MAX_TOTAL) {
      error ??= IMAGE_TOO_BIG;
      continue;
    }
    const image = await readFile(file);
    if (!image) {
      error ??= IMAGE_UNREADABLE;
      continue;
    }
    total += image.bytes;
    images.push(image);
  }
  return { images, error };
}

/** ClipboardData → image files (screenshots paste as `image/png`). */
export function pastedImages(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const item of data.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/** Payload shape for POST /api/questions. */
export function imagePayload(images: readonly AttachedImage[]): { name: string; mime: string; data: string }[] {
  return images.map(({ name, mime, dataUrl }) => ({ name, mime, data: dataUrl }));
}
