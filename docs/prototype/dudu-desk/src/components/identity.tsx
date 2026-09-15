import { type CSSProperties, useId } from "react";
import { type ChannelKey, channels, type Visitor } from "../types";

export function SourceLogo({ channel }: { channel: ChannelKey }) {
  if (channel === "wechat" || channel === "wechat-mp")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M10 3C4.9 3 1 6.2 1 10c0 2 1.1 3.8 2.9 5.1L3 18l3.5-1.4c.6.2 1.3.3 2 .4-.3-.7-.5-1.5-.5-2.3 0-4 4-7.3 9-7.3.5 0 1 0 1.5.1C17.2 4.9 13.9 3 10 3Z" />
        <path d="M23 14.4c0-3.1-3-5.6-6.8-5.6s-6.8 2.5-6.8 5.6 3 5.6 6.8 5.6c.8 0 1.6-.1 2.3-.4l2.6 1 .1-2.3c1.1-1 1.8-2.4 1.8-3.9Z" />
      </svg>
    );
  if (channel === "telegram")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="m3 10 17-7c1-.4 1.5.2 1.2 1.4l-3 15c-.2 1.1-.9 1.4-1.8.7l-4.6-3.4-2.2 2.2c-.2.3-.5.5-1 .5L9 14l9.3-8.4L6.8 12.8l-4-1.3C1.8 11.2 1.8 10.5 3 10Z" />
      </svg>
    );
  if (channel === "douyin")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 2h3c.4 2.6 1.8 4.1 4 4.5v3.3c-1.6 0-3-.5-4-1.2V16a6 6 0 1 1-6-6v3.3a2.7 2.7 0 1 0 3 2.7Z" />
      </svg>
    );
  if (channel === "whatsapp")
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        aria-hidden="true"
      >
        <path d="M4.3 17A9 9 0 1 1 8 20.5L2 22Z" />
        <path
          d="M8 7c-2 3 2 8 6 9l2-2-3-2-1 1-3-3 1-1Z"
          fill="currentColor"
          strokeWidth=".5"
        />
      </svg>
    );
  return (
    <span className="redbook-glyph" aria-hidden="true">
      红
    </span>
  );
}

export function SourceTag({
  channel,
  full = false,
}: {
  channel: ChannelKey;
  full?: boolean;
}) {
  const source = channels[channel];
  return (
    <span
      className="source-tag source-identity"
      style={
        {
          "--source-color": source.color,
          "--source-background": source.background,
        } as CSSProperties
      }
    >
      <SourceLogo channel={channel} />
      <span>{full ? source.name : source.short}</span>
    </span>
  );
}

export function Avatar({
  visitor,
  size = "normal",
  badge = true,
}: {
  visitor: Visitor;
  size?: "small" | "normal" | "large";
  badge?: boolean;
}) {
  const index = visitor.avatar ?? 0;
  const skin = [
    "#edc2a5",
    "#e0b59b",
    "#ecc7b6",
    "#edc5a7",
    "#dfac8c",
    "#e9bba3",
  ][index];
  const hair = [
    "#49372f",
    "#383b32",
    "#6b5047",
    "#3f3431",
    "#3d393d",
    "#665143",
  ][index];
  return (
    <span
      className={`avatar avatar-${size}`}
      style={
        {
          background: visitor.color,
          "--avatar-color": visitor.color,
        } as CSSProperties
      }
    >
      {visitor.avatar === null ? (
        <span className="avatar-fallback">{visitor.name.slice(0, 1)}</span>
      ) : (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M0 0h64v64H0Z" fill={visitor.color} />
          <circle cx="51" cy="13" r="24" fill="white" opacity=".14" />
          <path
            d="M12 66c1-16 9-24 20-24s20 8 21 24"
            fill={
              [
                "#f8f3df",
                "#485952",
                "#f2f3e9",
                "#56728e",
                "#eee1cd",
                "#9d6157",
              ][index]
            }
          />
          <path d="M26 38h12v12c-4 4-8 4-12 0Z" fill={skin} />
          <ellipse cx="32" cy="28" rx="16" ry="20" fill={hair} />
          <ellipse cx="32" cy="29" rx="12.7" ry="16" fill={skin} />
          <path
            d={
              index % 2
                ? "M18 28V20C18 5 44 4 47 20c-12 1-15-4-20-7-1 8-5 12-9 15Z"
                : "M17 29V18C19 3 46 6 47 23c-9-3-13-9-15-11-3 9-9 14-15 17Z"
            }
            fill={hair}
          />
          <path
            d="M25 29h1m12 0h1"
            stroke="#514236"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M30 37q3 2 6-1"
            stroke="#ae7463"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          {index === 1 && (
            <path
              d="M21 27h10v7H21Zm13 0h10v7H34Zm-3 2h3"
              fill="none"
              stroke={hair}
              strokeWidth="1.2"
            />
          )}
        </svg>
      )}
      {badge && (
        <span
          className="avatar-source source-identity"
          style={
            {
              "--source-color": channels[visitor.channel].color,
            } as CSSProperties
          }
          title={channels[visitor.channel].name}
        >
          <SourceLogo channel={visitor.channel} />
        </span>
      )}
    </span>
  );
}

export function BagIllustration({ large = false }: { large?: boolean }) {
  const textureId = useId();
  return (
    <svg
      viewBox="0 0 240 180"
      className={`bag-illustration ${large ? "bag-large" : ""}`}
      role="img"
      aria-label="米白色云朵托特包的演示插画"
    >
      <defs>
        <pattern
          id={textureId}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 0h4v4H0Z" fill="#e6dfcd" />
          <path d="M0 1h4M1 0v4" stroke="#f4efdf" strokeWidth=".7" />
        </pattern>
      </defs>
      <path fill="#e8eae3" d="M0 0h240v180H0Z" />
      <path fill="#d6dcd2" d="M169 0h71v180h-22Z" />
      <path d="M0 145 240 120v60H0Z" fill="#dfe2d8" />
      <ellipse cx="122" cy="157" rx="65" ry="9" fill="#747e6f" opacity=".14" />
      <path
        d="M92 72V50c0-40 57-40 57 0v22"
        fill="none"
        stroke="#c4bba5"
        strokeWidth="10"
      />
      <path
        d="M94 72V50c0-37 52-37 52 0v22"
        fill="none"
        stroke="#f1ecdb"
        strokeWidth="6"
      />
      <path
        d="m65 65 111 1-6 82c-21 13-74 13-98-1Z"
        fill={`url(#${textureId})`}
        stroke="#c9c1ae"
        strokeWidth="1"
      />
      <path
        d="M77 69c3 20 5 48 1 73m86-72c-3 25-5 47-1 74"
        stroke="#c5bca9"
        opacity=".7"
        fill="none"
      />
      <path d="M105 109h34v18h-34Z" fill="#f5f0df" />
      <text
        x="122"
        y="120"
        textAnchor="middle"
        fontSize="7"
        fill="#847962"
        fontFamily="sans-serif"
        letterSpacing="1"
      >
        MORROW
      </text>
    </svg>
  );
}
