import { Pin, Star } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasConversationFilters } from "../conversation-query";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadConversations, retryConversations } from "../stores/queue";
import { selectConversation } from "../stores/reading";
import { selectQueue, selectQueueConversations } from "../stores/selectors";
import type { Conversation } from "../types";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxListPhase } from "./inbox-state";
import { WaitingTime } from "./waiting-time";

function ConversationRow({
  conversation,
  selected,
  onSelect,
  onPin,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
  onPin?: () => void;
}) {
  const name = visitorName(conversation.identity);
  const draft = useInboxSelector(
    (state) => state.inbox.drafts[conversation.id],
  );
  const order = useInboxSelector((state) => state.inbox.queue.query.order);
  const canPin = !!onPin && conversation.status !== "closed";
  return (
    <div
      className={cn(
        "group mx-2 my-0.5 grid grid-cols-[32px_minmax(0,1fr)] gap-x-2 rounded-lg px-2 py-2 transition-colors",
        selected
          ? "bg-selection text-selection-foreground"
          : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`接待 ${name}，${conversation.identity.channelName}，${conversation.identity.accountName}`}
        className={cn(
          "col-span-2 col-start-1 row-start-1 flex min-w-0 gap-2 rounded-lg text-left outline-none focus-visible:[&_strong]:underline focus-visible:[&_strong]:underline-offset-4",
          canPin && "min-h-[62px]",
        )}
        data-conversation-id={conversation.id}
      >
        <VisitorAvatar identity={conversation.identity} className="size-8" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <strong className="truncate text-sm font-semibold" title={name}>
              {name}
            </strong>
            {conversation.starred && (
              <Star className="size-3 shrink-0 fill-primary text-primary" />
            )}
            <span className="ml-auto shrink-0">
              <WaitingTime conversation={conversation} />
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {draft?.text ? (
              <>
                <span className="text-accent-foreground">草稿 · </span>
                {draft.text}
              </>
            ) : draft?.attachmentIds.length ? (
              <span className="text-accent-foreground">草稿 · 待发送附件</span>
            ) : (
              conversation.preview || "暂无消息"
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <SourceBadge identity={conversation.identity} />
            <span
              className="min-w-0 truncate text-[10px] text-muted-foreground"
              title={conversation.identity.accountName}
            >
              {conversation.identity.accountName}
            </span>
            {order === "messages" &&
              conversation.messageCount !== undefined && (
                <span
                  className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground"
                  title="完整会话消息数量"
                >
                  {conversation.messageCount} 条
                </span>
              )}
            {conversation.unread > 0 && (
              <Badge
                className="ml-auto min-w-4 px-1 text-[10px]"
                aria-label={`${conversation.unread} 条未读`}
              >
                {conversation.unread > 99 ? "99+" : conversation.unread}
              </Badge>
            )}
          </span>
        </span>
      </button>
      {canPin && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="col-start-1 row-start-1 size-7 self-end justify-self-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`固定接待 ${name}`}
          title="固定到右窗"
          onClick={onPin}
        >
          <Pin data-icon="inline-start" />
        </Button>
      )}
    </div>
  );
}

export function ConversationQueue({
  onSelected,
  onPin,
}: {
  onSelected?: () => void;
  onPin?: (id: string) => void;
}) {
  const dispatch = useInboxDispatch();
  const queue = useInboxSelector(selectQueue);
  const conversations = useInboxSelector(selectQueueConversations);
  const selectedId = useInboxSelector((state) => state.inbox.replyId);
  const hasFilters = hasConversationFilters(queue.query);
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="来访用户会话列表"
    >
      <InboxListPhase
        read={queue}
        count={queue.ids.length}
        error={queue.error}
        onRetry={() => void dispatch(retryConversations())}
        empty={
          hasFilters
            ? {
                title: "没有符合条件的会话",
                description: "试试其他关键词，或清除筛选条件。",
              }
            : { title: "暂时没有会话", description: "新的来信会出现在这里。" }
        }
        compactClassName="p-2"
        footer={
          queue.status === "loading" ? (
            <p
              role="status"
              className="px-4 py-2 text-xs text-muted-foreground"
            >
              正在加载…
            </p>
          ) : null
        }
      >
        <Virtuoso
          className="min-h-0 flex-1 [scrollbar-gutter:stable]"
          data={conversations}
          computeItemKey={(_, conversation) => conversation.id}
          endReached={() => void dispatch(loadConversations({ more: true }))}
          itemContent={(_, conversation) => (
            <ConversationRow
              conversation={conversation}
              selected={conversation.id === selectedId}
              onSelect={() => {
                void dispatch(selectConversation(conversation.id));
                onSelected?.();
              }}
              onPin={onPin ? () => onPin(conversation.id) : undefined}
            />
          )}
        />
      </InboxListPhase>
    </section>
  );
}
