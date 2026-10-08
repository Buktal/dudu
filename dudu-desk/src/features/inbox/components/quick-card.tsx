import { History, MessageSquareText, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import { Button } from "@/components/ui/button";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadHistory, retryHistory } from "../stores/reading";
import { selectMessages } from "../stores/selectors";
import { focusReply, retryReply } from "../stores/sending";
import type { Conversation } from "../types";
import { Composer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { visitorName } from "./identity";
import { MessageView } from "./message-view";

const previewMessageLimit = 3;

export const QuickCard = memo(function QuickCard({
  conversation,
  onHistory,
  onInfo,
  infoOpen,
}: {
  conversation: Conversation;
  onHistory: (id: string) => void;
  onInfo: (id: string, open: boolean) => void;
  infoOpen: boolean;
}) {
  const dispatch = useInboxDispatch();
  const selected = useInboxSelector(
    (state) => state.inbox.replyId === conversation.id,
  );
  const messages = useInboxSelector(
    (state) => selectMessages(state, conversation.id),
    shallowEqual,
  );
  const history = useInboxSelector(
    (state) => state.inbox.histories[conversation.id],
  );
  const draft = useInboxSelector(
    (state) => state.inbox.drafts[conversation.id],
  );
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLElement>(null);
  const preview = useRef<HTMLElement>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const expanded = editing && selected;
  useEffect(() => {
    if (!history) void dispatch(loadHistory(conversation.id));
  }, [conversation.id, history, dispatch]);
  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);
  useEffect(() => {
    if (!expanded) return;
    card.current
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
    function leave(event: Event) {
      if (
        event.target instanceof Node &&
        !card.current?.contains(event.target) &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            '[data-slot="popover-content"], [data-slot="dialog-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"]',
          )
        )
      )
        setEditing(false);
    }
    document.addEventListener("pointerdown", leave);
    document.addEventListener("focusin", leave);
    return () => {
      document.removeEventListener("pointerdown", leave);
      document.removeEventListener("focusin", leave);
    };
  }, [expanded]);
  const latestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if ((latestId || expanded) && preview.current)
      preview.current.scrollTop = preview.current.scrollHeight;
  }, [latestId, expanded]);
  const lastReply = [...messages]
    .reverse()
    .find((message) => message.direction === "outgoing");
  const lastReplyIndex = lastReply ? messages.indexOf(lastReply) : -1;
  const recent = messages.slice(
    lastReplyIndex >= 0 ? lastReplyIndex : -previewMessageLimit,
  );
  const name = visitorName(conversation.identity);
  const hasDraft = !!draft?.text || !!draft?.attachmentIds.length;
  return (
    <article
      ref={card}
      className="flex h-[380px] min-w-0 flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs"
      data-reception-card={conversation.id}
      aria-label={`${name} 的接待卡，${conversation.identity.channelName}，${conversation.identity.accountName}`}
    >
      <ConversationHeader
        conversation={conversation}
        compact
        focused={selected}
        infoOpen={infoOpen}
        onInfo={() => onInfo(conversation.id, !infoOpen)}
      />
      <section
        ref={preview}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The message viewport must support keyboard scrolling.
        tabIndex={0}
        aria-label={`${name} 的最近消息`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {recent.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            onRetry={() => void dispatch(retryReply(message.id))}
          />
        ))}
        {!recent.length && (
          <p className="text-sm text-muted-foreground">
            {history?.status === "loading"
              ? "正在读取消息…"
              : conversation.preview || "暂无消息"}
          </p>
        )}
        {history?.error && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void dispatch(retryHistory(conversation.id))}
          >
            消息读取失败，重试
          </Button>
        )}
      </section>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onHistory(conversation.id)}
          aria-label={`查看与 ${name} 的完整对话`}
        >
          <History data-icon="inline-start" />
          完整对话
        </Button>
        {expanded ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`收起 ${name} 的输入框`}
            onClick={() => {
              setEditing(false);
              requestAnimationFrame(() => replyButton.current?.focus());
            }}
          >
            <X data-icon="inline-start" />
          </Button>
        ) : (
          <Button
            ref={replyButton}
            variant={hasDraft ? "secondary" : "ghost"}
            size="xs"
            aria-label={`回复 ${name}`}
            onClick={() => {
              dispatch(focusReply(conversation.id));
              setEditing(true);
            }}
          >
            <MessageSquareText data-icon="inline-start" />
            {hasDraft ? "继续草稿" : "回复"}
          </Button>
        )}
      </div>
      {expanded && <Composer conversationId={conversation.id} compact />}
    </article>
  );
});
