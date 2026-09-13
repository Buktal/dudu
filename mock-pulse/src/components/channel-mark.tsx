import { type ChannelId, channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";

export function ChannelMark({
  channel,
  className,
  small,
}: {
  channel: ChannelId;
  className?: string;
  small?: boolean;
}) {
  return (
    <span
      title={channelById(channel)?.name}
      aria-hidden
      className={cn(
        "platform-logo",
        channel === "douyin" ? "dy" : "wc",
        small && "mini",
        className,
      )}
    >
      {channel === "douyin" ? "♪" : "企"}
    </span>
  );
}
