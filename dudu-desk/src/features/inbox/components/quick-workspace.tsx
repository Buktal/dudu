import { forwardRef, type HTMLAttributes, useEffect, useRef } from "react";
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
import {
  loadConversations,
  loadProfile,
  retryConversations,
} from "../stores/reading";
import {
  selectConversationById,
  selectQueue,
  selectQuickQueueConversations,
} from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { QueueHeading } from "./conversation-sidebar";
import { visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
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
        "grid grid-cols-1 gap-[17px] pt-[3px] pr-[5px] pb-[22px] pl-px min-[761px]:grid-cols-2 min-[1750px]:grid-cols-3 max-[760px]:gap-[13px]",
        className,
      )}
    >
      {children}
    </div>
  ),
);
const gridComponents = { List: CardGrid };

export function QuickWorkspace() {
  const dispatch = useInboxDispatch();
  const conversations = useInboxSelector(selectQuickQueueConversations);
  const queue = useInboxSelector(selectQueue);
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
    if (index >= 0)
      grid.current?.scrollToIndex({ index, align: "center", behavior: "auto" });
    else if (replyId) void dispatch(openQuickHistory(replyId));
  }, [conversations, dispatch, replyId]);
  function details(id: string) {
    void dispatch(loadProfile(id));
    info.setOpen(true);
  }
  return (
    <div className="relative flex min-h-0 flex-1 gap-(--workspace-gap) [--workspace-gap:14px] max-[1360px]:[--workspace-gap:10px]">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-2.5 pr-2.5 pl-[25px] max-[1260px]:px-5 max-[760px]:pt-2 max-[760px]:pr-[5px] max-[760px]:pl-[13px]">
        <div className="mb-2 shrink-0">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <QueueHeading className="h-8 px-0" />
            <div className="order-last min-w-0 basis-full min-[1360px]:order-none min-[1360px]:flex-1 min-[1360px]:basis-0">
              <QueueTools compact />
            </div>
            <VisitorInfoToggle
              className="ml-auto"
              disabled={!replyId}
              open={info.open && !!replyId}
              onToggle={info.toggle}
            />
          </div>
          <Separator />
        </div>
        {!queue.hasLoaded && queue.status === "loading" ? (
          <InboxLoading />
        ) : !conversations.length && queue.error ? (
          <InboxError
            error={queue.error}
            onRetry={() => void dispatch(retryConversations())}
          />
        ) : !conversations.length ? (
          <InboxEmpty
            title="当前没有匹配的消息"
            description="试试更换会话状态或消息来源。"
          />
        ) : (
          <VirtuosoGrid
            ref={grid}
            className="min-h-0 flex-1 overscroll-y-contain [scrollbar-gutter:stable]"
            data={conversations}
            components={gridComponents}
            computeItemKey={(_, conversation) => conversation.id}
            endReached={() => void dispatch(loadConversations({ more: true }))}
            itemContent={(_, conversation) => (
              <QuickCard
                conversation={conversation}
                onHistory={() =>
                  void dispatch(openQuickHistory(conversation.id))
                }
                infoOpen={info.open && replyId === conversation.id}
                onInfo={() => {
                  if (info.open && replyId === conversation.id)
                    info.setOpen(false);
                  else details(conversation.id);
                }}
              />
            )}
          />
        )}
        {conversations.length > 0 && queue.error && (
          <InboxError
            compact
            error={queue.error}
            onRetry={() => void dispatch(retryConversations())}
          />
        )}
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
