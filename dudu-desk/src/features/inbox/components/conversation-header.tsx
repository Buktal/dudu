import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { conversationStatusLabels } from "../presentation";
import type { Conversation } from "../types";
import { ConversationActions } from "./conversation-actions";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { WaitingTime } from "./waiting-time";

export function ConversationHeader({
  conversation,
  compact = false,
  paneRole,
  paneActions,
  focused = true,
  onInfo,
  infoOpen = false,
}: {
  conversation: Conversation;
  compact?: boolean;
  paneRole?: "primary" | "pinned";
  paneActions?: ReactNode;
  focused?: boolean;
  onInfo?: () => void;
  infoOpen?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 transition-colors max-[760px]:px-3",
        compact && "px-4",
        paneRole && "gap-x-2 px-3",
        compact &&
          focused &&
          "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <VisitorAvatar identity={conversation.identity} className="size-8" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="max-w-full truncate text-[15px] font-semibold tracking-tight">
            {visitorName(conversation.identity)}
          </h2>
          <span className="text-[10px] text-muted-foreground">
            {conversation.status === "needs-reply" ? (
              <WaitingTime conversation={conversation} />
            ) : (
              conversationStatusLabels[conversation.status]
            )}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <SourceBadge identity={conversation.identity} />
          <span
            className="truncate text-[11px] text-muted-foreground"
            title={conversation.identity.accountName}
          >
            {conversation.identity.accountName}
          </span>
        </div>
      </div>
      <ConversationActions
        conversationId={conversation.id}
        infoOpen={infoOpen}
        onInfo={onInfo}
      />
      {paneRole && (
        <div className="flex basis-full items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1">
            {paneRole === "pinned" && <Pin className="size-3 text-primary" />}
            {paneRole === "primary" ? "主接待" : "固定接待"}
          </span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
            {paneActions}
          </div>
        </div>
      )}
    </header>
  );
}
