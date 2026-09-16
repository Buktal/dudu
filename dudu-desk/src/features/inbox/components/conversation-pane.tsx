import { useCallback } from "react";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { markConversationRead } from "../stores/events";
import { focusReply, retryReply } from "../stores/sending";
import { ChatPanel } from "./chat-panel";
import { Composer } from "./composer";

export function ConversationPane({
  conversationId,
  paneRole,
  onInfo,
  infoOpen = false,
}: {
  conversationId: string;
  paneRole?: "primary" | "pinned";
  onInfo: () => void;
  infoOpen?: boolean;
}) {
  const dispatch = useInboxDispatch();
  const focused = useInboxSelector(
    (state) => state.inbox.replyId === conversationId,
  );
  const markVisible = useCallback(
    (sequence: number) => {
      if (focused && document.visibilityState === "visible")
        void dispatch(markConversationRead(conversationId, sequence));
    },
    [conversationId, dispatch, focused],
  );
  return (
    <ChatPanel
      conversationId={conversationId}
      paneRole={paneRole}
      focused={focused}
      onFocus={() => dispatch(focusReply(conversationId))}
      onInfo={onInfo}
      infoOpen={infoOpen}
      onRetry={(id) => void dispatch(retryReply(id))}
      onAtBottom={markVisible}
      composer={<Composer conversationId={conversationId} />}
    />
  );
}
