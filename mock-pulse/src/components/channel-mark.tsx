import { MessagesSquareIcon } from "lucide-react";
import { type ChannelId, channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";

/** 渠道标识图形：图标来自渠道注册表数据行（新增渠道不再改本组件） */
export function ChannelMark({
  channel,
  className,
  small,
}: {
  channel: ChannelId;
  className?: string;
  small?: boolean;
}) {
  const row = channelById(channel);
  const Icon = row?.icon ?? MessagesSquareIcon;
  return (
    <span
      title={row?.name}
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        small && "size-5 rounded-sm text-xs",
        className,
      )}
    >
      <Icon className={cn("size-4", small && "size-3")} />
    </span>
  );
}
