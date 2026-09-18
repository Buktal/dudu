import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ContextProp,
  Virtuoso,
  type VirtuosoHandle,
} from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { messageDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadHistory } from "../stores/reading";
import { selectConversationById, selectMessages } from "../stores/selectors";
import type { InboxMessage } from "../types";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
import { MessageView } from "./message-view";

type HistoryContext = { conversationId: string; firstCreatedAt: string };

function HistoryHeader({ context }: ContextProp<HistoryContext>) {
  const dispatch = useInboxDispatch();
  const history = useInboxSelector(
    (state) => state.inbox.histories[context.conversationId],
  );
  return (
    <div className="mx-auto max-w-[910px] px-6 pt-[22px] pb-[15px] text-center max-[760px]:px-[11px]">
      {history?.nextCursor && (
        <Button
          variant="ghost"
          size="xs"
          disabled={history.status === "loading"}
          onClick={() =>
            void dispatch(loadHistory(context.conversationId, true))
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
            {messageDate(context.firstCreatedAt)}
          </span>
        </MarkerContent>
      </Marker>
    </div>
  );
}

// Stable component identities keep Virtuoso's measured header mounted while scrolling.
const historyComponents = { Header: HistoryHeader };
const latestLocation = {
  index: "LAST",
  align: "end",
  behavior: "auto",
} as const;

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
  const identity = useInboxSelector(
    (state) => selectConversationById(state, conversationId)?.identity,
  );
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [initialFirstId] = useState(messages[0].id);
  const [atBottom, setAtBottom] = useState(true);
  const firstCreatedAt = messages[0].createdAt;
  const context = useMemo(
    () => ({ conversationId, firstCreatedAt }),
    [conversationId, firstCreatedAt],
  );
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
        initialTopMostItemIndex={latestLocation}
        followOutput={(bottom) => (bottom ? "auto" : false)}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={4}
        increaseViewportBy={320}
        skipAnimationFrameInResizeObserver
        startReached={() => void dispatch(loadHistory(conversationId, true))}
        components={historyComponents}
        context={context}
        itemContent={(_, message) => (
          <div
            className={cn(
              "mx-auto max-w-[910px] px-6 max-[760px]:px-[11px]",
              message.id === messages[messages.length - 1].id && "pb-3",
            )}
          >
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
          onClick={() => virtuoso.current?.scrollToIndex(latestLocation)}
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
