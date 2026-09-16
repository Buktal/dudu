import { Globe, MessagesSquare } from "lucide-react";
import type { CSSProperties } from "react";

const channelTones = new Map([
  ["wechat", "wechat"],
  ["wechat-kf", "wechat"],
  ["wechat-mp", "wechat-mp"],
  ["wecom", "wecom"],
  ["telegram", "telegram"],
  ["douyin", "douyin"],
  ["whatsapp", "whatsapp"],
  ["xiaohongshu", "xiaohongshu"],
]);

export function channelStyle(channelId: string): CSSProperties {
  const tone = channelTones.get(channelId) ?? "neutral";
  return {
    "--channel-foreground": `var(--channel-${tone}-foreground)`,
    "--channel-surface": `var(--channel-${tone}-surface)`,
  } as CSSProperties;
}

export function ChannelGlyph({ channelId }: { channelId: string }) {
  if (channelId === "wecom")
    return <MessagesSquare className="size-full" aria-hidden="true" />;
  if (!channelTones.has(channelId))
    return <Globe className="size-full" aria-hidden="true" />;
  return (
    <svg
      viewBox="0 0 24 24"
      fill={channelId === "whatsapp" ? "none" : "currentColor"}
      className="size-full"
      aria-hidden="true"
    >
      {channelId.startsWith("wechat") && (
        <>
          <path d="M10 3C4.9 3 1 6.2 1 10c0 2 1.1 3.8 2.9 5.1L3 18l3.5-1.4c.6.2 1.3.3 2 .4-.3-.7-.5-1.5-.5-2.3 0-4 4-7.3 9-7.3.5 0 1 0 1.5.1C17.2 4.9 13.9 3 10 3Z" />
          <path d="M23 14.4c0-3.1-3-5.6-6.8-5.6s-6.8 2.5-6.8 5.6 3 5.6 6.8 5.6c.8 0 1.6-.1 2.3-.4l2.6 1 .1-2.3c1.1-1 1.8-2.4 1.8-3.9Z" />
        </>
      )}
      {channelId === "telegram" && (
        <path d="m3 10 17-7c1-.4 1.5.2 1.2 1.4l-3 15c-.2 1.1-.9 1.4-1.8.7l-4.6-3.4-2.2 2.2c-.2.3-.5.5-1 .5L9 14l9.3-8.4L6.8 12.8l-4-1.3C1.8 11.2 1.8 10.5 3 10Z" />
      )}
      {channelId === "douyin" && (
        <path d="M14 2h3c.4 2.6 1.8 4.1 4 4.5v3.3c-1.6 0-3-.5-4-1.2V16a6 6 0 1 1-6-6v3.3a2.7 2.7 0 1 0 3 2.7Z" />
      )}
      {channelId === "whatsapp" && (
        <g stroke="currentColor" strokeWidth="1.9">
          <path d="M4.3 17A9 9 0 1 1 8 20.5L2 22Z" />
          <path
            d="M8 7c-2 3 2 8 6 9l2-2-3-2-1 1-3-3 1-1Z"
            fill="currentColor"
            strokeWidth=".5"
          />
        </g>
      )}
      {channelId === "xiaohongshu" && (
        <text x="12" y="19" textAnchor="middle" fontSize="21" fontWeight="800">
          红
        </text>
      )}
    </svg>
  );
}
