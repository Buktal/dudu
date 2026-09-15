import { Check } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { markConversationRead } from "../stores/events";
import { endReception, focusReply, retryReply } from "../stores/sending";
import { ChatPanel } from "./chat-panel";
import { Composer } from "./composer";

export function ConversationPane({
  conversationId,
  paneRole,
  onInfo,
}: {
  conversationId: string;
  paneRole?: "primary" | "pinned";
  onInfo: () => void;
}) {
  const dispatch = useInboxDispatch();
  const focused = useInboxSelector(
    (state) => state.inbox.replyId === conversationId,
  );
  const ended = useInboxSelector(
    (state) => state.inbox.conversations[conversationId]?.status === "closed",
  );
  const ending = useInboxSelector(
    (state) => state.inbox.ending[conversationId]?.status === "saving",
  );
  const connected = useInboxSelector(
    (state) => state.inbox.connection === "connected",
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
      onRetry={(id) => void dispatch(retryReply(id))}
      onAtBottom={markVisible}
      composer={<Composer conversationId={conversationId} />}
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ended || ending || !connected}
          aria-label="结束本次接待"
          title="结束本次接待"
          onClick={() => void dispatch(endReception(conversationId))}
        >
          <Check />
        </Button>
      }
    />
  );
}
