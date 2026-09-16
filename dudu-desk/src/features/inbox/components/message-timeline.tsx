import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { messageDate } from "@/lib/time";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadHistory } from "../stores/reading";
import { selectConversationById, selectMessages } from "../stores/selectors";
import type { InboxMessage } from "../types";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
import { MessageView } from "./message-view";

function HistoryList({
  conversationId,
  messages,
  onRetry,
  onAtBottom,
}: {
  conversationId: string;
  messages: InboxMessage[];
  onRetry?: (id: string) => void;
  onAtBottom?: (sequence: number) => void;
}) {
  const dispatch = useInboxDispatch();
  const history = useInboxSelector(
    (state) => state.inbox.histories[conversationId],
  );
  const identity = useInboxSelector(
    (state) => selectConversationById(state, conversationId)?.identity,
  );
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [initialFirstId] = useState(messages[0].id);
  const [atBottom, setAtBottom] = useState(true);
  const firstItemIndex =
    100000 -
    Math.max(
      0,
      messages.findIndex((message) => message.id === initialFirstId),
    );
  const lastSequence = messages[messages.length - 1]?.sequence ?? 0;
  useEffect(() => {
    const markVisible = () => {
      if (atBottom) onAtBottom?.(lastSequence);
    };
    markVisible();
    document.addEventListener("visibilitychange", markVisible);
    window.addEventListener("focus", markVisible);
    return () => {
      document.removeEventListener("visibilitychange", markVisible);
      window.removeEventListener("focus", markVisible);
    };
  }, [atBottom, lastSequence, onAtBottom]);
  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        className="h-full [scrollbar-gutter:stable]"
        data={messages}
        computeItemKey={(_, message) => message.id}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={{ index: "LAST", align: "end" }}
        followOutput={(bottom) => (bottom ? "auto" : false)}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={60}
        startReached={() => void dispatch(loadHistory(conversationId, true))}
        components={{
          Header: () => (
            <div className="mx-auto max-w-[910px] px-6 pt-[22px] pb-[15px] text-center max-[760px]:px-[11px]">
              {history?.nextCursor && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={history.status === "loading"}
                  onClick={() =>
                    void dispatch(loadHistory(conversationId, true))
                  }
                >
                  {history.status === "loading" ? "正在读取…" : "查看更早消息"}
                </Button>
              )}
              <Marker
                variant="separator"
                className="justify-center gap-3 before:mr-0 before:w-7 before:flex-none after:ml-0 after:w-7 after:flex-none"
              >
                <MarkerContent>
                  <span className="text-[11px]">
                    {messageDate(messages[0].createdAt)}
                  </span>
                </MarkerContent>
              </Marker>
            </div>
          ),
          Footer: () => <div className="h-3" />,
        }}
        itemContent={(_, message) => (
          <div className="mx-auto max-w-[910px] px-6 max-[760px]:px-[11px]">
            <MessageView
              message={message}
              identity={identity}
              onRetry={onRetry ? () => onRetry(message.id) : undefined}
            />
          </div>
        )}
      />
      {!atBottom && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-md"
          onClick={() =>
            virtuoso.current?.scrollToIndex({
              index: "LAST",
              align: "end",
              behavior: "auto",
            })
          }
        >
          <ChevronDown data-icon="inline-start" />
          查看最新消息
        </Button>
      )}
    </div>
  );
}

export function MessageTimeline({
  conversationId,
  onRetry,
  onAtBottom,
}: {
  conversationId: string;
  onRetry?: (id: string) => void;
  onAtBottom?: (sequence: number) => void;
}) {
  const dispatch = useInboxDispatch();
  const messages = useInboxSelector((state) =>
    selectMessages(state, conversationId),
  );
  const history = useInboxSelector(
    (state) => state.inbox.histories[conversationId],
  );
  if (!history?.hasLoaded && history?.status === "loading")
    return <InboxLoading label="正在读取消息…" />;
  if (!messages.length && history?.error)
    return (
      <InboxError
        error={history.error}
        onRetry={() => void dispatch(loadHistory(conversationId))}
      />
    );
  if (!messages.length)
    return (
      <InboxEmpty title="这段会话还没有消息" description="来信会显示在这里。" />
    );
  return (
    <>
      <HistoryList
        key={conversationId}
        conversationId={conversationId}
        messages={messages}
        onRetry={onRetry}
        onAtBottom={onAtBottom}
      />
      {history?.error && (
        <div className="px-4 pb-2">
          <InboxError
            compact
            error={history.error}
            onRetry={() => void dispatch(loadHistory(conversationId, true))}
          />
        </div>
      )}
    </>
  );
}
