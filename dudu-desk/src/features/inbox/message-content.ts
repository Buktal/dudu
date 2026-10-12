import type { LucideIcon } from "lucide-react";
import { AudioLines, FileText, Film, ImageIcon } from "lucide-react";
import { safeExternalUrl } from "@/lib/attachment-utils";
import type { MediaReference, MessageBody, SendKind } from "./types";

/**
 * Message content: the deep module owning the MessageBody seam.
 *
 * Summary prefixes, media extraction, external-URL extraction and the
 * mime/kind/purpose mappings used to live as Repeated Switches across
 * message-text, message-body, attachment-rules and attachment-utils. They
 * converge here behind three small functions, so a new body type or media
 * kind changes one table plus one descriptor branch instead of drifting
 * across callers. `attachment-utils` stays a kind-free URL primitive below
 * this seam; `message-text` is a thin adapter above it.
 */

export type MediaKind = Exclude<SendKind, "text">;

export type AssetPurpose = "image" | "audio" | "video" | "download";

export type MessageDescriptor = {
  summary: string;
  media: MediaReference[];
  externalUrl: string | null;
};

const MEDIA_LABELS: Record<MediaKind, string> = {
  image: "图片",
  audio: "音频",
  video: "视频",
  file: "文件",
};

const MEDIA_ICONS: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  audio: AudioLines,
  video: Film,
  file: FileText,
};

const ASSET_PURPOSES: Record<MediaKind, AssetPurpose> = {
  image: "image",
  audio: "audio",
  video: "video",
  file: "download",
};

export function messageSummary(body: MessageBody): string {
  switch (body.type) {
    case "text":
      return body.text;
    case "reply":
      return (
        body.text ||
        body.attachments.map((item) => `[附件] ${mediaName(item)}`).join("、")
      );
    case "image":
      return mediaSummary("图片", body.media);
    case "audio":
      return mediaSummary("音频", body.media);
    case "video":
      return mediaSummary("视频", body.media);
    case "file":
      return mediaSummary("文件", body.media);
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

// 渠道可能不给文件名：摘要与展示都回落到类型名，不填假值
function mediaSummary(label: string, media: MediaReference): string {
  return media.name ? `[${label}] ${media.name}` : `[${label}]`;
}

/** 媒体的展示名：渠道未提供文件名时用类型名。 */
export function mediaName(media: MediaReference): string {
  return media.name || MEDIA_LABELS[media.kind];
}

/**
 * Describe a body once: summary + media references + external URL are
 * derived in a single pass, so renderers read the descriptor instead of
 * re-dispatching over `body.type`.
 */
export function describeMessageBody(body: MessageBody): MessageDescriptor {
  switch (body.type) {
    case "text":
      return { summary: body.text, media: [], externalUrl: null };
    case "reply":
      return {
        summary: messageSummary(body),
        media: body.attachments,
        externalUrl: null,
      };
    case "image":
    case "audio":
    case "video":
    case "file":
      return {
        summary: messageSummary(body),
        media: [body.media],
        externalUrl: null,
      };
    case "link":
      return {
        summary: messageSummary(body),
        media: [],
        externalUrl: safeExternalUrl(body.url),
      };
    case "location":
    case "quote":
      return { summary: messageSummary(body), media: [], externalUrl: null };
    case "card":
      return {
        summary: messageSummary(body),
        media: [],
        externalUrl: safeExternalUrl(body.url),
      };
    case "unknown":
      return {
        summary: messageSummary(body),
        media: [],
        externalUrl: safeExternalUrl(body.sourceUrl),
      };
  }
}

export function mediaKindOfMime(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export function mediaLabel(kind: MediaKind): string {
  return MEDIA_LABELS[kind];
}

export function mediaIcon(kind: MediaKind): LucideIcon {
  return MEDIA_ICONS[kind];
}

export function assetPurposeOf(kind: MediaKind): AssetPurpose {
  return ASSET_PURPOSES[kind];
}
