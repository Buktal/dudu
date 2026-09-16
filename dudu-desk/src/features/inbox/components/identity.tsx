import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VisitorIdentity } from "../types";
import { ChannelGlyph, channelStyle } from "./channel-glyph";

const avatarSizes = {
  small: "size-[29px] rounded-md",
  normal: "size-[41px] rounded-md",
  large: "size-16 rounded-xl",
};
const fallbackSizes = {
  small: "text-xs",
  normal: "text-lg",
  large: "text-2xl",
};

export function visitorName(identity: VisitorIdentity): string {
  return identity.name?.trim() || `访客 ${identity.externalUserId.slice(-6)}`;
}

export function VisitorAvatar({
  identity,
  large = false,
  size = "normal",
  badge = true,
  className,
}: {
  identity: VisitorIdentity;
  large?: boolean;
  size?: "small" | "normal" | "large";
  badge?: boolean;
  className?: string;
}) {
  const name = visitorName(identity);
  const avatarSize = large ? "large" : size;
  return (
    <Avatar
      className={cn(
        "after:rounded-[inherit] [--muted:var(--secondary)] [--muted-foreground:var(--secondary-foreground)]",
        avatarSizes[avatarSize],
        className,
      )}
      style={channelStyle(identity.channelId)}
    >
      {identity.avatarUrl && (
        <AvatarImage
          src={identity.avatarUrl}
          alt={name}
          className="rounded-[inherit]"
        />
      )}
      <AvatarFallback className="rounded-[inherit]">
        <span className={cn("font-semibold", fallbackSizes[avatarSize])}>
          {name.slice(0, 1)}
        </span>
      </AvatarFallback>
      {badge && (
        <AvatarBadge
          title={identity.channelName}
          className="right-[-4px] bottom-[-3px] rounded-sm border-2 border-border group-data-[size=default]/avatar:size-[19px] [--background:var(--card)] [--primary:var(--card)] [--primary-foreground:var(--channel-foreground)]"
        >
          <span className="flex size-3 shrink-0">
            <ChannelGlyph channelId={identity.channelId} />
          </span>
        </AvatarBadge>
      )}
    </Avatar>
  );
}

export function SourceBadge({
  identity,
  className,
}: {
  identity: VisitorIdentity;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-auto max-w-full gap-1 rounded-sm border-0 px-[5px] py-px [--secondary:var(--channel-surface)] [--secondary-foreground:var(--channel-foreground)]",
        className,
      )}
      style={channelStyle(identity.channelId)}
      title={identity.channelName}
    >
      <span className="flex size-2.5 shrink-0">
        <ChannelGlyph channelId={identity.channelId} />
      </span>
      <span className="truncate text-[11px] leading-4 font-normal">
        {identity.channelName}
      </span>
    </Badge>
  );
}
