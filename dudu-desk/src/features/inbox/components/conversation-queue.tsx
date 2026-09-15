import { Columns2, Star } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messageTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadConversations, selectConversation } from "../stores/reading";
import { selectQueue, selectQueueConversations } from "../stores/selectors";
import type { Conversation } from "../types";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";

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
  return (
    <div
      className={cn(
        "group relative mx-2 my-1 flex rounded-xl transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`接待 ${name}，${conversation.identity.channelName}，${conversation.identity.accountName}`}
        className="flex min-w-0 flex-1 gap-3 rounded-xl px-3 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-conversation-id={conversation.id}
      >
        <VisitorAvatar identity={conversation.identity} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <strong className="truncate text-sm font-semibold">{name}</strong>
            {conversation.starred && (
              <Star className="size-3 shrink-0 fill-primary text-primary" />
            )}
            <time className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {messageTime(conversation.updatedAt)}
            </time>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {draft?.text ? (
              <>
                <span className="text-primary">草稿 · </span>
                {draft.text}
              </>
            ) : draft?.attachmentIds.length ? (
              <span className="text-primary">草稿 · 待发送附件</span>
            ) : (
              conversation.preview || "暂无消息"
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <SourceBadge identity={conversation.identity} />
            <span className="min-w-0 truncate text-[10px] text-muted-foreground">
              {conversation.identity.accountName}
            </span>
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
      {onPin && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label={`固定接待 ${name}`}
          onClick={onPin}
        >
          <Columns2 />
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
  const hasFilters =
    !!queue.query.search ||
    queue.query.channelId !== "all" ||
    queue.query.status !== "all" ||
    queue.query.starred;
  if (!queue.hasLoaded && queue.status === "loading") return <InboxLoading />;
  if (!queue.ids.length && queue.error)
    return (
      <InboxError
        error={queue.error}
        onRetry={() => void dispatch(loadConversations())}
      />
    );
  if (!queue.ids.length)
    return (
      <InboxEmpty
        title={hasFilters ? "没有符合条件的会话" : "暂时没有会话"}
        description={
          hasFilters
            ? "试试其他关键词，或清除筛选条件。"
            : "新的来信会出现在这里。"
        }
      />
    );
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="来访用户会话列表"
    >
      <Virtuoso
        className="min-h-0 flex-1"
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
      {queue.error && (
        <div className="p-2">
          <InboxError
            compact
            error={queue.error}
            onRetry={() => void dispatch(loadConversations({ more: true }))}
          />
        </div>
      )}
      <p className="px-5 py-3 text-[10px] text-muted-foreground">
        {queue.status === "loading"
          ? "正在读取更多会话…"
          : queue.nextCursor
            ? "向下滚动，继续查看"
            : `已加载 ${conversations.length} 段会话`}
      </p>
    </section>
  );
}
