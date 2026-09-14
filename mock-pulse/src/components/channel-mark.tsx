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
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        channel === "douyin" ? "dy" : "wc",
        small && "mini",
        className,
      )}
    >
      {channel === "douyin" ? "♪" : "企"}
    </span>
  );
}
