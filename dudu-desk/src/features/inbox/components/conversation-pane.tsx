import { Check, RotateCcw } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { markConversationRead } from "../stores/events";
import { endReception, resumeReception } from "../stores/reception";
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
      infoOpen={infoOpen}
      onRetry={(id) => void dispatch(retryReply(id))}
      onAtBottom={markVisible}
      composer={<Composer conversationId={conversationId} />}
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ending || !connected}
          aria-label={ended ? "继续接待" : "结束本次接待"}
          title={ended ? "继续接待" : "结束本次接待"}
          onClick={() =>
            void dispatch(
              ended
                ? resumeReception(conversationId)
                : endReception(conversationId),
            )
          }
        >
          {ended ? (
            <RotateCcw data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
        </Button>
      }
    />
  );
}
