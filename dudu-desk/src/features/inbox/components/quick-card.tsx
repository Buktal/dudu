import { History, MessageSquareText, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { insideOverlay } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { focusReply } from "../stores/sending";
import type { Conversation } from "../types";
import { Composer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { visitorName } from "./identity";

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
  const draft = useInboxSelector(
    (state) => state.inbox.drafts[conversation.id],
  );
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLElement>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const expanded = editing && selected;
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
        // 浮层（含 Sheet）内的指针与焦点移动不收起编辑中的卡片：
        // 判定与快捷键守卫共用同一份浮层选择器
        !insideOverlay(event.target)
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
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The message viewport must support keyboard scrolling.
        tabIndex={0}
        aria-label={`${name} 的最后一条消息`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <p className="wrap-anywhere whitespace-pre-wrap text-sm text-muted-foreground">
          {conversation.preview || "暂无消息"}
        </p>
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
