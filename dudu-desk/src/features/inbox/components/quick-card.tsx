import { ChevronRight, RotateCcw, Rows3 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { messageTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { messageSummary } from "../message-text";
import { loadHistory } from "../stores/reading";
import { selectMessages } from "../stores/selectors";
import { focusReply, retryReply } from "../stores/sending";
import type { Conversation } from "../types";
import { Composer } from "./composer";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { deliveryLabels } from "./message-view";

export function QuickCard({
  conversation,
  onHistory,
  onInfo,
}: {
  conversation: Conversation;
  onHistory: () => void;
  onInfo: () => void;
}) {
  const dispatch = useInboxDispatch();
  const selected = useInboxSelector(
    (state) => state.inbox.replyId === conversation.id,
  );
  const messages = useInboxSelector((state) =>
    selectMessages(state, conversation.id),
  );
  const history = useInboxSelector(
    (state) => state.inbox.histories[conversation.id],
  );
  useEffect(() => {
    if (!history) void dispatch(loadHistory(conversation.id));
  }, [conversation.id, history, dispatch]);
  const incoming = [...messages]
    .reverse()
    .find((message) => message.direction === "incoming");
  const reply = [...messages]
    .reverse()
    .find((message) => message.direction === "outgoing");
  const name = visitorName(conversation.identity);
  return (
    <article
      className={cn(
        "flex h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground transition-colors",
        selected ? "border-ring/50" : "border-transparent",
      )}
      aria-label={`${name} 的速答卡，${conversation.identity.channelName}，${conversation.identity.accountName}`}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`查看 ${name} 的资料，${conversation.identity.accountName}`}
          onClick={() => {
            dispatch(focusReply(conversation.id));
            onInfo();
          }}
        >
          <VisitorAvatar identity={conversation.identity} />
          <span className="min-w-0">
            <strong className="block truncate text-sm">{name}</strong>
            <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <SourceBadge identity={conversation.identity} />
              <span className="truncate text-[10px] text-muted-foreground">
                {conversation.identity.accountName}
              </span>
            </span>
          </span>
        </button>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {conversation.status === "closed"
            ? "已结束"
            : conversation.status === "needs-reply"
              ? "待回复"
              : "等待中"}
        </span>
      </header>
      <div className="min-h-0 flex-1 px-4">
        <div className="rounded-xl bg-muted/60 px-3 py-3">
          <p className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
            最新来信{" "}
            <time>
              {messageTime(incoming?.createdAt ?? conversation.updatedAt)}
            </time>
          </p>
          <p className="line-clamp-3 text-sm leading-relaxed">
            {incoming
              ? messageSummary(incoming.body)
              : conversation.preview || "暂无来信"}
          </p>
        </div>
        {history?.error && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void dispatch(loadHistory(conversation.id))}
          >
            消息读取失败，重试
          </Button>
        )}
        {reply && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 text-[10px]">
              {reply.delivery
                ? deliveryLabels[reply.delivery.state]
                : "上次回复"}
            </span>
            <p className="truncate">{messageSummary(reply.body)}</p>
            {reply.delivery?.state === "failed" && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`重试给 ${name} 的原消息`}
                onClick={() => void dispatch(retryReply(reply.id))}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 pb-1">
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2"
          data-quick-history={conversation.id}
          onClick={onHistory}
        >
          <Rows3 />
          完整对话
          <ChevronRight />
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {selected ? "当前回复对象" : "就地回复，按需展开"}
        </span>
      </div>
      <Composer conversationId={conversation.id} compact />
    </article>
  );
}
