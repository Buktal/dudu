import { MessagesSquareIcon, Music2Icon } from "lucide-react";
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
        small && "size-5 rounded-sm text-xs",
        className,
      )}
    >
      {channel === "douyin" ? (
        <Music2Icon className={cn("size-4", small && "size-3")} />
      ) : (
        <MessagesSquareIcon className={cn("size-4", small && "size-3")} />
      )}
    </span>
  );
}
