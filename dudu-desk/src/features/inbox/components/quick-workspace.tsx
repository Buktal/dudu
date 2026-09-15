import {
  forwardRef,
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { closeQuickHistory, openQuickHistory } from "../stores/quick";
import { loadConversations, loadProfile } from "../stores/reading";
import { selectQueue, selectQueueConversations } from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
import { QueueTools } from "./queue-tools";
import { QuickCard } from "./quick-card";
import { VisitorInfo } from "./visitor-info";

const CardGrid = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      className="grid grid-cols-1 gap-4 pb-4 min-[1000px]:grid-cols-2 min-[1660px]:grid-cols-3"
    >
      {children}
    </div>
  ),
);
const gridComponents = { List: CardGrid };

export function QuickWorkspace() {
  const dispatch = useInboxDispatch();
  const conversations = useInboxSelector(selectQueueConversations);
  const queue = useInboxSelector(selectQueue);
  const historyId = useInboxSelector((state) => state.inbox.quickHistoryId);
  const replyId = useInboxSelector((state) => state.inbox.replyId);
  const historyConversation = useInboxSelector((state) =>
    historyId ? state.inbox.conversations[historyId] : undefined,
  );
  const [showInfo, setShowInfo] = useState(false);
  const grid = useRef<VirtuosoGridHandle>(null);
  const historyTitle = useRef<HTMLHeadingElement>(null);
  const previousReply = useRef<string | null>(null);
  useInboxSearch();
  useEffect(() => {
    if (historyId && replyId !== historyId) dispatch(closeQuickHistory());
  }, [dispatch, historyId, replyId]);
  useEffect(() => {
    if (previousReply.current === replyId) return;
    previousReply.current = replyId;
    const index = conversations.findIndex(
      (conversation) => conversation.id === replyId,
    );
    if (index >= 0)
      grid.current?.scrollToIndex({ index, align: "center", behavior: "auto" });
  }, [conversations, replyId]);
  function details(id: string) {
    void dispatch(loadProfile(id));
    setShowInfo(true);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col px-1">
      <header className="flex items-end justify-between gap-4 px-3 pt-2 pb-5">
        <div>
          <p className="mb-1 text-[10px] tracking-wider text-muted-foreground">
            每个问题，都有回应
          </p>
          <h1 className="text-lg font-semibold tracking-tight">
            先看消息，再展开对话
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            每位访客一张卡。简单的问题，就在这里回复。
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground min-[760px]:block">
          回复对象固定在每张卡片上
        </span>
      </header>
      <QueueTools compact />
      {!queue.hasLoaded && queue.status === "loading" ? (
        <InboxLoading />
      ) : !conversations.length && queue.error ? (
        <InboxError
          error={queue.error}
          onRetry={() => void dispatch(loadConversations())}
        />
      ) : !conversations.length ? (
        <InboxEmpty
          title="当前没有匹配的消息"
          description="试试更换会话状态或消息来源。"
        />
      ) : (
        <VirtuosoGrid
          ref={grid}
          className="min-h-0 flex-1"
          data={conversations}
          components={gridComponents}
          computeItemKey={(_, conversation) => conversation.id}
          endReached={() => void dispatch(loadConversations({ more: true }))}
          itemContent={(_, conversation) => (
            <QuickCard
              conversation={conversation}
              onHistory={() => void dispatch(openQuickHistory(conversation.id))}
              onInfo={() => details(conversation.id)}
            />
          )}
        />
      )}
      {conversations.length > 0 && queue.error && (
        <InboxError
          compact
          error={queue.error}
          onRetry={() => void dispatch(loadConversations({ more: true }))}
        />
      )}
      <Dialog
        open={!!historyConversation}
        onOpenChange={(open) => {
          if (!open) dispatch(closeQuickHistory());
        }}
      >
        <DialogContent
          initialFocus={historyTitle}
          className="flex h-[min(850px,94dvh)] max-w-[calc(100%-1rem)] flex-col gap-3 rounded-2xl p-3 sm:max-w-[860px]"
        >
          <DialogHeader className="shrink-0 px-3 pt-2">
            <DialogTitle ref={historyTitle} tabIndex={-1}>
              与{" "}
              {historyConversation
                ? visitorName(historyConversation.identity)
                : "访客"}{" "}
              的完整对话
            </DialogTitle>
            <DialogDescription>
              补看上下文，继续同一份回复草稿。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {historyId && (
              <ConversationPane
                conversationId={historyId}
                onInfo={() => {
                  dispatch(closeQuickHistory());
                  details(historyId);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent className="w-[min(380px,90vw)]">
          <SheetHeader>
            <SheetTitle>访客资料</SheetTitle>
            <SheetDescription>
              当前回复对象的渠道资料与接待记录
            </SheetDescription>
          </SheetHeader>
          {replyId && (
            <VisitorInfo
              conversationId={replyId}
              onClose={() => setShowInfo(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
