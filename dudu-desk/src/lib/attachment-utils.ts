export function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeAssetUrl(
  value: string | undefined,
  purpose: "image" | "audio" | "video" | "download",
): string | null {
  const web = safeExternalUrl(value);
  if (web) return web;
  if (!value) return null;
  const source = value.trim();
  if (/^blob:(?:https?:\/\/[^/]+|tauri:\/\/[^/]+|null)\/.+/.test(source))
    return source;
  const mediaType = /^data:([^;,]+)(?:;[^,]*)?,/i
    .exec(source)?.[1]
    .toLowerCase();
  if (!mediaType) return null;
  if (
    purpose === "image" &&
    /^image\/(?:png|jpeg|jpg|gif|webp|avif|bmp|svg\+xml)$/.test(mediaType)
  )
    return source;
  if (
    (purpose === "audio" && mediaType.startsWith("audio/")) ||
    (purpose === "video" && mediaType.startsWith("video/"))
  )
    return source;
  if (
    purpose === "download" &&
    [
      "text/plain",
      "application/pdf",
      "application/zip",
      "application/octet-stream",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ].includes(mediaType)
  )
    return source;
  return null;
}

export function formatFileSize(size: number | undefined): string {
  if (size === undefined || !Number.isFinite(size) || size < 0)
    return "大小未知";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
