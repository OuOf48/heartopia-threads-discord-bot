import { createHash } from "node:crypto";

const MAX_IMAGE_FILES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

const EXTENSION_BY_TYPE = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function isAllowedThreadsImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "threads.com" ||
      hostname.endsWith(".threads.com") ||
      hostname.endsWith(".cdninstagram.com") ||
      hostname.endsWith(".fbcdn.net")
    );
  } catch {
    return false;
  }
}

function extensionFor(contentType, url) {
  const normalizedType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (EXTENSION_BY_TYPE.has(normalizedType)) {
    return { contentType: normalizedType, extension: EXTENSION_BY_TYPE.get(normalizedType) };
  }

  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.(avif|gif|jpe?g|png|webp)$/u);
  if (!match) return null;
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const fallbackType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return { contentType: fallbackType, extension };
}

/** Download trusted Threads CDN images before their signed URLs expire. */
export async function downloadPostImages(imageUrls, postId, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const uniqueUrls = [...new Set(imageUrls)].filter(isAllowedThreadsImageUrl).slice(0, MAX_IMAGE_FILES);
  const files = [];
  const contentHashes = new Set();
  let totalBytes = 0;

  for (const [index, url] of uniqueUrls.entries()) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.threads.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok || !isAllowedThreadsImageUrl(response.url || url)) {
      throw new Error(`Threads 圖片下載失敗（HTTP ${response.status}）。`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error("Threads 單張圖片超過 8 MiB，為避免 Discord 拒絕而停止發布。");
    }

    const type = extensionFor(response.headers.get("content-type"), response.url || url);
    if (!type) throw new Error("Threads 回傳的媒體不是支援的圖片格式。");

    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Threads 圖片大小不正確或超過 8 MiB。");
    }
    if (totalBytes + data.byteLength > MAX_TOTAL_IMAGE_BYTES) break;
    const contentHash = createHash("sha256").update(data).digest("hex");
    if (contentHashes.has(contentHash)) continue;

    contentHashes.add(contentHash);
    totalBytes += data.byteLength;
    files.push({
      data,
      contentType: type.contentType,
      filename: `threads-${postId}-${index + 1}.${type.extension}`,
      description: `Threads 貼文圖片 ${index + 1}`,
    });
  }

  return files;
}
