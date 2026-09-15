import {
  Columns2,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  collapsePinned,
  pinConversation,
  restorePinned,
  unpinConversation,
} from "../stores/parallel";
import { loadConversations } from "../stores/reading";
import { selectQueue, selectQueueConversations } from "../stores/selectors";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";
import { QueueTools } from "./queue-tools";

export function ParallelToolbar({
  onPick,
  onPinned,
}: {
  onPick: () => void;
  onPinned: () => void;
}) {
  const dispatch = useInboxDispatch();
  const primary = useInboxSelector((state) =>
    state.inbox.activeId
      ? state.inbox.conversations[state.inbox.activeId]
      : undefined,
  );
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const collapsed = useInboxSelector((state) => state.inbox.pinCollapsed);
  const reply = useInboxSelector((state) =>
    state.inbox.replyId
      ? state.inbox.conversations[state.inbox.replyId]
      : undefined,
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 pb-2">
      <p className="min-w-0 break-words text-xs text-muted-foreground">
        当前回复：
        <strong className="font-semibold text-foreground">
          {reply ? visitorName(reply.identity) : "尚未选择"}
        </strong>
        {reply && (
          <span className="ml-1.5 text-[10px]">
            {reply.identity.channelName} · {reply.identity.accountName}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          disabled={!primary || primary.status === "closed"}
          onClick={() => {
            if (primary) {
              void dispatch(pinConversation(primary.id));
              onPinned();
            }
          }}
        >
          <Pin data-icon="inline-start" />
          {pinnedId ? "固定主接待" : "固定当前"}
        </Button>
        <Button variant="ghost" size="xs" onClick={onPick}>
          <Columns2 data-icon="inline-start" />
          {pinnedId ? "更换固定会话" : "选择固定会话"}
        </Button>
        {pinnedId && (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                if (collapsed) {
                  void dispatch(restorePinned());
                  onPinned();
                } else dispatch(collapsePinned());
              }}
            >
              {collapsed ? (
                <PanelRightOpen data-icon="inline-start" />
              ) : (
                <PanelRightClose data-icon="inline-start" />
              )}
              {collapsed ? "恢复固定窗" : "收起固定窗"}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="解除固定会话"
              title="解除固定会话"
              onClick={() => dispatch(unpinConversation())}
            >
              <PinOff data-icon="inline-start" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PinnedConversationPicker({
  open,
  onOpenChange,
  onPinned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPinned: () => void;
}) {
  const dispatch = useInboxDispatch();
  const queue = useInboxSelector(selectQueue);
  const conversations = useInboxSelector(selectQueueConversations);
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const candidates = useMemo(
    () => conversations.filter((item) => item.status !== "closed"),
    [conversations],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(680px,90dvh)] flex-col gap-3"
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>选择固定在右侧的会话</DialogTitle>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="关闭固定会话选择"
                />
              }
            >
              <X data-icon="inline-start" />
            </DialogClose>
          </div>
          <DialogDescription>
            右窗保持这位来访用户，左窗可以继续接待其他会话。
          </DialogDescription>
        </DialogHeader>
        <QueueTools />
        {!queue.hasLoaded && queue.status === "loading" ? (
          <InboxLoading />
        ) : !candidates.length && queue.error ? (
          <InboxError
            error={queue.error}
            onRetry={() => void dispatch(loadConversations())}
          />
        ) : !candidates.length ? (
          <InboxEmpty
            title="没有可固定的会话"
            description="试试清除筛选条件，或选择尚未结束的会话。"
          />
        ) : (
          <Virtuoso
            className="min-h-0 flex-1"
            data={candidates}
            computeItemKey={(_, conversation) => conversation.id}
            endReached={() => void dispatch(loadConversations({ more: true }))}
            itemContent={(_, conversation) => (
              <Button
                variant={conversation.id === pinnedId ? "secondary" : "ghost"}
                className="my-1 h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left whitespace-normal"
                aria-label={`固定 ${visitorName(conversation.identity)}，${conversation.identity.channelName}，${conversation.identity.accountName}`}
                onClick={() => {
                  void dispatch(pinConversation(conversation.id));
                  onOpenChange(false);
                  onPinned();
                }}
              >
                <VisitorAvatar identity={conversation.identity} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <strong className="truncate text-sm font-semibold">
                    {visitorName(conversation.identity)}
                  </strong>
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceBadge identity={conversation.identity} />
                    <span className="truncate text-xs text-muted-foreground">
                      {conversation.identity.accountName}
                    </span>
                  </span>
                </span>
                {conversation.id === pinnedId && <Pin data-icon="inline-end" />}
              </Button>
            )}
          />
        )}
        {!candidates.length && queue.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            disabled={queue.status === "loading"}
            onClick={() => void dispatch(loadConversations({ more: true }))}
          >
            {queue.status === "loading" ? "正在加载…" : "继续加载会话"}
          </Button>
        )}
        {queue.error && candidates.length > 0 && (
          <InboxError
            error={queue.error}
            compact
            onRetry={() => void dispatch(loadConversations({ more: true }))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
