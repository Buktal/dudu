import {
  ChevronRight,
  Image as ImageIcon,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { messageTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { messageSummary } from "../message-text";
import { loadHistory } from "../stores/reading";
import { selectMessages } from "../stores/selectors";
import { retryReply } from "../stores/sending";
import type { Conversation } from "../types";
import { Composer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { visitorName } from "./identity";
import { deliveryLabels } from "./message-view";

export function QuickCard({
  conversation,
  onHistory,
  onInfo,
  infoOpen,
}: {
  conversation: Conversation;
  onHistory: () => void;
  onInfo: () => void;
  infoOpen: boolean;
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
        "flex h-[380px] min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-xl border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-ring/40 motion-reduce:transition-none",
        selected ? "border-ring/40 shadow-md" : "border-border",
      )}
      aria-label={`${name} 的接待卡，${conversation.identity.channelName}，${conversation.identity.accountName}`}
    >
      <ConversationHeader
        conversation={conversation}
        compact
        infoOpen={infoOpen}
        onInfo={onInfo}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden px-5 pt-[15px] pb-2.5 max-[760px]:px-4 max-[760px]:pt-[13px]">
          <p className="mb-[5px] flex items-center gap-[7px] text-[10px] text-muted-foreground">
            最新来信
            <time className="opacity-70">
              {messageTime(incoming?.createdAt ?? conversation.updatedAt)}
            </time>
          </p>
          {incoming &&
          incoming.body.type !== "text" &&
          incoming.body.type !== "reply" ? (
            <Button
              variant="secondary"
              size="sm"
              className="h-auto w-full justify-start gap-2 px-3 py-3"
              onClick={onHistory}
              aria-label={`在完整对话中查看 ${name} 的最新来信`}
            >
              {incoming.body.type === "image" ? (
                <ImageIcon data-icon="inline-start" />
              ) : (
                <MessageCircle data-icon="inline-start" />
              )}
              <span className="line-clamp-2 min-w-0 flex-1 text-left whitespace-normal">
                {messageSummary(incoming.body)}
              </span>
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <p className="line-clamp-3 min-h-[39px] text-[15px] leading-[1.8] wrap-anywhere whitespace-pre-wrap">
              {incoming
                ? messageSummary(incoming.body)
                : conversation.preview || "暂无来信"}
            </p>
          )}
          {history?.error && (
            <Button
              variant="ghost"
              size="xs"
              className="mt-1"
              onClick={() => void dispatch(loadHistory(conversation.id))}
            >
              消息读取失败，重试
            </Button>
          )}
        </div>
        {reply && (
          <div
            className={cn(
              "mx-5 mb-3 flex shrink-0 items-center gap-2 border-l-2 pl-2 text-[11px] max-[760px]:mx-4",
              reply.delivery?.state === "failed"
                ? "border-destructive text-destructive"
                : "border-border text-muted-foreground",
            )}
          >
            <span className="shrink-0 text-[9px]">
              {reply.delivery
                ? deliveryLabels[reply.delivery.state]
                : "上次回复"}
            </span>
            <p className="min-w-0 flex-1 truncate">
              {messageSummary(reply.body)}
            </p>
            {reply.delivery?.state === "failed" && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`重试给 ${name} 的原消息`}
                onClick={() => void dispatch(retryReply(reply.id))}
              >
                <RotateCcw data-icon="inline-start" />
              </Button>
            )}
          </div>
        )}
      </div>
      <Composer
        conversationId={conversation.id}
        compact
        onHistory={onHistory}
      />
    </article>
  );
}
