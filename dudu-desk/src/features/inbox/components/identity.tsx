import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { VisitorIdentity } from "../types";

export function visitorName(identity: VisitorIdentity): string {
  return identity.name?.trim() || `访客 ${identity.externalUserId.slice(-6)}`;
}

export function VisitorAvatar({
  identity,
  large = false,
}: {
  identity: VisitorIdentity;
  large?: boolean;
}) {
  const name = visitorName(identity);
  return (
    <Avatar
      size={large ? "lg" : "default"}
      className={large ? "size-14" : "size-10"}
    >
      {identity.avatarUrl && (
        <AvatarImage src={identity.avatarUrl} alt={name} />
      )}
      <AvatarFallback className="bg-secondary font-medium text-secondary-foreground">
        {name.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
}

export function SourceBadge({ identity }: { identity: VisitorIdentity }) {
  return (
    <Badge
      variant="secondary"
      className="max-w-full truncate rounded-md text-[10px] font-normal"
    >
      {identity.channelName}
    </Badge>
  );
}
