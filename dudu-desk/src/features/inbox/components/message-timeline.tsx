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
import {
  useFollowOutput,
  virtuosoBehaviorProps,
} from "../hooks/use-follow-output";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadHistory, retryHistory } from "../stores/reading";
import { selectConversationById, selectMessages } from "../stores/selectors";
import type { InboxMessage } from "../types";
import { InboxListPhase } from "./inbox-state";
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

/** 反向分页锚点：firstItemIndex 基于基准消息在列表中的位置递减，prepend 越多
 *  值越小，Virtuoso 据此保持滚动锚定。基准消息不在列表中（重连
 *  historiesInvalidated 剔除旧缓存后重建列表）时以当前首条重算基准，否则锚点
 *  固定在 100000，后续 prepend 锚定错位。 */
export const FIRST_ITEM_INDEX_BASE = 100000;

export function firstItemAnchor(
  messages: { id: string }[],
  baseId: string,
): { baseId: string; firstItemIndex: number } {
  const index = messages.findIndex((message) => message.id === baseId);
  if (index < 0)
    return {
      baseId: messages[0]?.id ?? baseId,
      firstItemIndex: FIRST_ITEM_INDEX_BASE,
    };
  return { baseId, firstItemIndex: FIRST_ITEM_INDEX_BASE - index };
}

function HistoryList({
  conversationId,
  messages,
  onRetry,
  onAtBottom,
}: {
  conversationId: string;
  messages: InboxMessage[];
  onRetry?: (id: string) => void;
  onAtBottom?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const identity = useInboxSelector(
    (state) => selectConversationById(state, conversationId)?.identity,
  );
  const virtuoso = useRef<VirtuosoHandle>(null);
  // atBottom 初始为 true：initialTopMostItemIndex 定位最新消息，且内容不满一屏时
  // Virtuoso 不会触发 atBottomStateChange。
  const { followOutput, atBottom, setAtTop, setAtBottom } =
    useFollowOutput(true);
  const [anchorBase, setAnchorBase] = useState(messages[0].id);
  const anchor = firstItemAnchor(messages, anchorBase);
  // 基准被剔除时在渲染期换到当前首条：下一次 prepend 从新基准继续递减
  if (anchor.baseId !== anchorBase) setAnchorBase(anchor.baseId);
  const firstCreatedAt = messages[0].createdAt;
  const context = useMemo(
    () => ({ conversationId, firstCreatedAt }),
    [conversationId, firstCreatedAt],
  );
  const firstItemIndex = anchor.firstItemIndex;
  useEffect(() => {
    const markVisible = () => {
      if (atBottom) onAtBottom?.();
    };
    markVisible();
    document.addEventListener("visibilitychange", markVisible);
    window.addEventListener("focus", markVisible);
    return () => {
      document.removeEventListener("visibilitychange", markVisible);
      window.removeEventListener("focus", markVisible);
    };
  }, [atBottom, onAtBottom]);
  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        className="h-full [scrollbar-gutter:stable]"
        {...virtuosoBehaviorProps}
        // 消息高度不一且反向分页更重：视口扩展与 overscan 在共选之上取更大值
        increaseViewportBy={{ bottom: 400, top: 600 }}
        overscan={{ main: 400, reverse: 600 }}
        // 实现反向无限滚动时使用，结合 totalCount 减少此属性值，以向列表顶部追加项（警告：firstItemIndex 应该是一个正数，基于要显示的总项数）
        firstItemIndex={firstItemIndex}
        // 列表初始位置
        initialTopMostItemIndex={latestLocation}
        // 默认情况下，followOutput 只会在列表已经到底部时向下滚动
        followOutput={followOutput}
        // 当列表滚动到顶部或向下滚动时，会调用此回调并传入 true / false
        atTopStateChange={setAtTop}
        // 当列表滚动到底部或向上滚动时，会调用此回调并传入 true / false
        atBottomStateChange={setAtBottom}
        // 要渲染的数据数组。设置这个后，会根据数组长度推断总数量
        data={messages}
        // 自定义列表每项的 key（React key），提升性能，避免重复渲染
        computeItemKey={(_, message) => message.id}
        // 渲染每个项目的回调函数。返回要显示的 React 元素
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
        // 设置默认项目高度，避免首次渲染探测。消息高度不一，按生产验证取 200。
        defaultItemHeight={200}
        startReached={() => void dispatch(loadHistory(conversationId, true))}
        components={historyComponents}
        context={context}
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
  onAtBottom?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const messages = useInboxSelector((state) =>
    selectMessages(state, conversationId),
  );
  const history = useInboxSelector(
    (state) => state.inbox.histories[conversationId],
  );
  return (
    <InboxListPhase
      read={history}
      count={messages.length}
      error={history?.error ?? null}
      onRetry={() => void dispatch(retryHistory(conversationId))}
      loadingLabel="正在读取消息…"
      empty={{
        title: "这段会话还没有消息",
        description: "来信会显示在这里。",
      }}
      compactClassName="px-4 pb-2"
    >
      <HistoryList
        key={conversationId}
        conversationId={conversationId}
        messages={messages}
        onRetry={onRetry}
        onAtBottom={onAtBottom}
      />
    </InboxListPhase>
  );
}
