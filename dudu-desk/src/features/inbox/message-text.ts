import type { MessageBody } from "./types";

export function messageSummary(body: MessageBody): string {
  switch (body.type) {
    case "text":
      return body.text;
    case "reply":
      return (
        body.text ||
        body.attachments.map((item) => `[附件] ${item.name}`).join("、")
      );
    case "image":
      return `[图片] ${body.media.name}`;
    case "audio":
      return `[音频] ${body.media.name}`;
    case "video":
      return `[视频] ${body.media.name}`;
    case "file":
      return `[文件] ${body.media.name}`;
    case "link":
      return `[链接] ${body.title || body.url}`;
    case "location":
      return `[位置] ${body.label || `${body.latitude}, ${body.longitude}`}`;
    case "quote":
      return body.text;
    case "card":
      return `[${body.kind}] ${body.title || body.externalId || "详情未提供"}`;
    case "unknown":
      return `[暂不支持的消息] ${body.originalType}`;
  }
}
