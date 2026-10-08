import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import { closeQuickHistory, openQuickHistory } from "../stores/parallel";
import { loadConversations, retryConversations } from "../stores/queue";
import { loadProfile } from "../stores/reading";
import {
  selectConversationById,
  selectQueue,
  selectQuickQueueConversations,
} from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { QueueHeading } from "./conversation-sidebar";
import { visitorName } from "./identity";
import { InboxListPhase } from "./inbox-state";
import { QueueTools } from "./queue-tools";
import { QuickCard } from "./quick-card";
import { VisitorInfoPanel } from "./visitor-info-panel";
import { VisitorInfoToggle } from "./visitor-info-toggle";

const CardGrid = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      className={cn(
        "grid grid-cols-1 gap-4 p-1 pb-5 min-[761px]:grid-cols-2 min-[1750px]:grid-cols-3 max-[760px]:gap-3",
        className,
      )}
    >
      {children}
    </div>
  ),
);
const gridComponents = { List: CardGrid };
const retainedCardLimit = 36;

export function QuickWorkspace() {
  const dispatch = useInboxDispatch();
  const conversations = useInboxSelector(selectQuickQueueConversations);
  const queue = useInboxSelector(selectQueue);
  // Keep short queues mounted to avoid reinitializing editors on the scroll path.
  // A 400 px buffer per card also covers the single-column layout's 380 px cards.
  const viewportBuffer =
    queue.total !== undefined &&
    Math.max(queue.total, conversations.length) <= retainedCardLimit
      ? Math.max(queue.total, conversations.length) * 400
      : 800;
  const historyId = useInboxSelector((state) => state.inbox.quickHistoryId);
  const replyId = useInboxSelector((state) => state.inbox.replyId);
  const historyConversation = useInboxSelector((state) =>
    historyId ? selectConversationById(state, historyId) : undefined,
  );
  const info = useVisitorPanel();
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
    if (index >= 0) {
      // Keep a card under the pointer when its own controls select the reply target.
      const focusedCard = document.activeElement?.closest(
        "[data-reception-card]",
      );
      if (focusedCard?.getAttribute("data-reception-card") !== replyId)
        grid.current?.scrollToIndex({
          index,
          align: "center",
          behavior: "auto",
        });
    } else if (replyId) void dispatch(openQuickHistory(replyId));
  }, [conversations, dispatch, replyId]);
  const details = useCallback(
    (id: string) => {
      void dispatch(loadProfile(id));
      info.setOpen(true);
    },
    [dispatch, info.setOpen],
  );
  const showHistory = useCallback(
    (id: string) => {
      void dispatch(openQuickHistory(id));
    },
    [dispatch],
  );
  const setCardInfoOpen = useCallback(
    (id: string, open: boolean) => {
      if (open) details(id);
      else info.setOpen(false);
    },
    [details, info.setOpen],
  );
  return (
    <div className="relative flex min-h-0 flex-1 gap-(--workspace-gap) [--workspace-gap:16px] max-[1360px]:[--workspace-gap:12px]">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-3 pr-2 pl-5 max-[760px]:px-2 max-[760px]:pt-2">
        <div className="mb-2 flex shrink-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
            <QueueHeading className="h-8 px-0" />
            <QueueTools />
            <VisitorInfoToggle
              className="ml-auto"
              disabled={!replyId}
              open={info.open && !!replyId}
              onToggle={info.toggle}
            />
          </div>
          <Separator className="mx-1 w-auto" />
        </div>
        <InboxListPhase
          read={queue}
          count={conversations.length}
          error={queue.error}
          onRetry={() => void dispatch(retryConversations())}
          empty={{
            title: "当前没有匹配的消息",
            description: "试试更换会话状态或消息来源。",
          }}
        >
          {/* WebView2 scroll anchoring otherwise fights Virtuoso's virtual padding. */}
          <VirtuosoGrid
            ref={grid}
            className="min-h-0 flex-1 overscroll-y-contain [overflow-anchor:none] [scrollbar-gutter:stable]"
            data={conversations}
            components={gridComponents}
            increaseViewportBy={viewportBuffer}
            overscan={400}
            computeItemKey={(_, conversation) => conversation.id}
            endReached={() => void dispatch(loadConversations({ more: true }))}
            itemContent={(_, conversation) => (
              <QuickCard
                conversation={conversation}
                onHistory={showHistory}
                infoOpen={info.open && replyId === conversation.id}
                onInfo={setCardInfoOpen}
              />
            )}
          />
        </InboxListPhase>
      </main>
      <VisitorInfoPanel
        conversationId={replyId}
        open={info.open}
        inline={info.inline}
        onOpenChange={info.setOpen}
      />
      <Dialog
        open={!!historyConversation}
        onOpenChange={(open) => {
          if (!open) dispatch(closeQuickHistory());
        }}
      >
        <DialogContent
          initialFocus={historyTitle}
          className="flex h-[min(740px,94dvh)] max-w-[calc(100%-1rem)] flex-col gap-4 rounded-2xl p-5 max-[760px]:p-3 sm:max-w-[810px]"
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle ref={historyTitle} tabIndex={-1}>
              与{" "}
              {historyConversation
                ? visitorName(historyConversation.identity)
                : "访客"}{" "}
              的完整对话
            </DialogTitle>
            <DialogDescription className="sr-only">
              补看上下文，继续同一份回复草稿。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-background">
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
    </div>
  );
}
