import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { AgentSession } from "../api";

export function AccountAvatar({
  agent,
  className,
}: {
  agent: AgentSession["agent"];
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {agent.avatarUrl && (
        <AvatarImage src={agent.avatarUrl} alt={agent.name} />
      )}
      <AvatarFallback>{agent.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}
