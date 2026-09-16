import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { forwardRef, type HTMLAttributes, useEffect, useRef } from "react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import { closeQuickHistory, openQuickHistory } from "../stores/quick";
import {
  loadConversations,
  loadProfile,
  retryConversations,
} from "../stores/reading";
import {
  selectQueue,
  selectQuickQueueConversations,
} from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
import { QueueTools } from "./queue-tools";
import { QuickCard } from "./quick-card";
import { VisitorInfo } from "./visitor-info";

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
    historyId ? state.inbox.conversations[historyId] : undefined,
  );
  const info = useVisitorPanel();
  const pending =
    queue.counts?.needsReply ??
    conversations.filter(
      (conversation) => conversation.status === "needs-reply",
    ).length;
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
    <div className="relative flex min-h-0 flex-1 gap-4">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-2.5 pr-2.5 pl-[25px] max-[1260px]:px-5 max-[760px]:pt-2 max-[760px]:pr-[5px] max-[760px]:pl-[13px]">
        <div className="mb-2 shrink-0">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <header className="flex h-8 shrink-0 items-center gap-2">
              <h1 className="text-sm font-semibold">速答</h1>
              {queue.hasLoaded && (
                <Badge
                  variant="secondary"
                  title={
                    queue.counts
                      ? "全部会话中的待回应数量"
                      : "仅统计当前已加载列表中的待回应会话"
                  }
                >
                  {queue.counts ? "全部" : "当前列表"} {pending} 位待回应
                </Badge>
              )}
            </header>
            <div className="order-last min-w-0 basis-full min-[1360px]:order-none min-[1360px]:flex-1 min-[1360px]:basis-0">
              <QueueTools compact showOrder={false} />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              disabled={!replyId}
              aria-label={info.open ? "收起来访资料" : "展开来访资料"}
              title={info.open ? "收起来访资料" : "展开来访资料"}
              onClick={info.toggle}
            >
              {info.open ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
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
                onInfo={() => details(conversation.id)}
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
      {replyId && info.inline && info.open && (
        <aside className="w-[286px] shrink-0 overflow-hidden rounded-l-3xl max-[1360px]:w-[260px]">
          <VisitorInfo
            conversationId={replyId}
            onClose={() => info.setOpen(false)}
          />
        </aside>
      )}
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
      <Sheet open={info.open && !info.inline} onOpenChange={info.setOpen}>
        <SheetContent className="w-[min(380px,90vw)]" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>访客资料</SheetTitle>
            <SheetDescription>
              当前回复对象的渠道资料与接待记录
            </SheetDescription>
          </SheetHeader>
          {replyId && (
            <VisitorInfo
              conversationId={replyId}
              onClose={() => info.setOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
