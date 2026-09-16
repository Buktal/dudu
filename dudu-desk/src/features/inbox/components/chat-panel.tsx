import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { WorkspaceView } from "@/components/workspace-motion";
import { cn } from "@/lib/utils";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { ConversationHeader } from "./conversation-header";
import { visitorName } from "./identity";
import { InboxEmpty } from "./inbox-state";
import { MessageTimeline } from "./message-timeline";

export function ChatPanel({
  conversationId,
  focused = true,
  paneRole,
  onFocus,
  onInfo,
  infoOpen = false,
  composer,
  onRetry,
  onAtBottom,
}: {
  conversationId: string;
  focused?: boolean;
  paneRole?: "primary" | "pinned";
  onFocus?: () => void;
  onInfo?: () => void;
  infoOpen?: boolean;
  composer: ReactNode;
  onRetry?: (id: string) => void;
  onAtBottom?: (sequence: number) => void;
}) {
  const conversation = useInboxSelector(
    (state) => state.inbox.conversations[conversationId],
  );
  if (!conversation)
    return (
      <InboxEmpty
        title="这段会话已不可用"
        description="请从会话列表选择仍有效的接待。"
      />
    );
  const name = visitorName(conversation.identity);
  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        paneRole && "rounded-2xl bg-card text-card-foreground shadow-xs",
      )}
      aria-label={`${name} 的聊天`}
    >
      <ConversationHeader
        conversation={conversation}
        paneRole={paneRole}
        focused={focused}
        onFocus={onFocus}
        infoOpen={infoOpen}
        onInfo={onInfo}
      />
      {!paneRole && <Separator />}
      <WorkspaceView key={conversationId}>
        <MessageTimeline
          conversationId={conversationId}
          onRetry={onRetry}
          onAtBottom={onAtBottom}
        />
      </WorkspaceView>
      {composer}
    </section>
  );
}
