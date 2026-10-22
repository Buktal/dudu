import { type ReactNode, useCallback, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { WorkspaceView } from "@/components/workspace-motion";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { ensureHistoryLoaded, markConversationRead } from "../stores/reading";
import { selectConversationById } from "../stores/selectors";
import { retryReply } from "../stores/sending";
import { Composer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { visitorName } from "./identity";
import { InboxEmpty } from "./inbox-state";
import { MessageTimeline } from "./message-timeline";

/**
 * Reception workspace conversation pane: the single module behind the
 * conversation-reading seam. Owns the focus / retry / read-receipt wiring and
 * the header + timeline + composer layout, so calm, parallel and quick modes
 * share one pane instead of drilling pane props through a pass-through.
 */
export function ConversationPane({
  conversationId,
  paneRole,
  paneActions,
  onInfo,
  infoOpen = false,
}: {
  conversationId: string;
  paneRole?: "primary" | "pinned";
  paneActions?: ReactNode;
  onInfo: () => void;
  infoOpen?: boolean;
}) {
  const dispatch = useInboxDispatch();
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const focused = useInboxSelector(
    (state) => state.inbox.replyId === conversationId,
  );
  // 展示完整对话（专注、并排任一侧、卡片展开）才按需读取最近页；
  // 已经初始化过的访客由 store 直接复用缓存，不重查
  useEffect(() => {
    void dispatch(ensureHistoryLoaded(conversationId));
  }, [conversationId, dispatch]);
  const markVisible = useCallback(() => {
    if (focused && document.visibilityState === "visible")
      void dispatch(markConversationRead(conversationId));
  }, [conversationId, dispatch, focused]);
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
        paneActions={paneActions}
        infoOpen={infoOpen}
        onInfo={onInfo}
      />
      <Separator />
      <WorkspaceView key={conversationId}>
        <MessageTimeline
          conversationId={conversationId}
          onRetry={(id) => void dispatch(retryReply(id))}
          onAtBottom={markVisible}
        />
      </WorkspaceView>
      <Composer conversationId={conversationId} />
    </section>
  );
}
