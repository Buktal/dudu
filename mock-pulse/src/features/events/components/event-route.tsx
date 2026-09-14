import { ArrowRightIcon, Settings2Icon } from "lucide-react";
import { ChannelMark } from "@/components/channel-mark";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
} from "@/components/ui/item";
import { type ChannelId, channelById } from "@/lib/channels";

export function EventRoute({
  channel,
  url,
  expectedStatus,
  onConfigure,
  onExpected,
}: {
  channel: ChannelId;
  url?: string;
  expectedStatus: number;
  onConfigure: () => void;
  onExpected: () => void;
}) {
  return (
    <div className="bg-card px-5 pb-5 lg:px-7">
      <Item variant="muted" size="sm" className="flex-nowrap">
        <ItemMedia className="hidden items-center gap-2 @2xl/workspace:flex">
          <ChannelMark channel={channel} small />
          <span className="text-xs">{channelById(channel)?.name}</span>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline">POST</Badge>
            <code
              className="min-w-0 truncate text-xs text-muted-foreground"
              title={url}
            >
              {url || "尚未配置回调地址"}
            </code>
          </div>
        </ItemContent>
        <ItemActions className="shrink-0">
          <IconButton label="配置该平台目标地址" onClick={onConfigure}>
            <Settings2Icon />
          </IconButton>
          <ArrowRightIcon className="hidden size-3.5 text-muted-foreground @xl/workspace:block" />
          <Button
            variant="ghost"
            size="sm"
            className="hidden @xl/workspace:inline-flex"
            onClick={onExpected}
          >
            期望 {expectedStatus}
          </Button>
        </ItemActions>
      </Item>
    </div>
  );
}
