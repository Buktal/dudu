import { ArrowRight, MessageSquareText, Send, Smile } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { nowIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import { attachmentBatchRestriction } from "../attachment-rules";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { composerIntent, sendRestriction } from "../sending-rules";
import { editDraft, focusReply, sendReply } from "../stores/sending";
import { blankDraft } from "../stores/sending-state";
import { AttachmentDrafts } from "./attachment-drafts";
import { AttachmentPicker } from "./attachment-picker";
import { visitorName } from "./identity";

const quickReplies = [
  "您好，请问有什么可以帮您？",
  "收到，我先帮您核实一下，请稍等。",
  "还有其他需要帮助的地方吗？",
];
const emoji = ["😊", "👍", "🙏", "❤️", "✨", "🌷", "👌", "🎉"];

export function Composer({
  conversationId,
  compact = false,
  onFocus,
}: {
  conversationId: string;
  compact?: boolean;
  onFocus?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const conversation = useInboxSelector(
    (state) => state.inbox.conversations[conversationId],
  );
  const draft = useInboxSelector(
    (state) => state.inbox.drafts[conversationId] ?? blankDraft,
  );
  const connection = useInboxSelector((state) => state.inbox.connection);
  const attachments = useInboxSelector((state) => state.inbox.attachments);
  const busy = useInboxSelector(
    (state) => !!state.inbox.sendingByConversation[conversationId],
  );
  const pendingAttachments = useInboxSelector((state) =>
    draft.attachmentIds.some(
      (id) => state.inbox.attachments[id]?.status !== "ready",
    ),
  );
  if (!conversation) return null;
  const restriction =
    sendRestriction(
      conversation,
      connection,
      draft.text.trim() || !draft.attachmentIds.length ? ["text"] : [],
      nowIso(),
    ) ||
    attachmentBatchRestriction(
      conversation,
      connection,
      draft.attachmentIds.map((id) => attachments[id]).filter(Boolean),
      nowIso(),
    );
  const disabled =
    !!restriction ||
    busy ||
    pendingAttachments ||
    (!draft.text.trim() && !draft.attachmentIds.length);
  const name = visitorName(conversation.identity);
  function focus() {
    dispatch(focusReply(conversationId));
    onFocus?.();
  }
  function insert(text: string) {
    const start = input.current?.selectionStart ?? draft.text.length;
    const end = input.current?.selectionEnd ?? start;
    dispatch(
      editDraft(
        conversationId,
        `${draft.text.slice(0, start)}${text}${draft.text.slice(end)}`,
      ),
    );
    input.current?.focus();
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(
        start + text.length,
        start + text.length,
      ),
    );
  }
  function submit(next: boolean) {
    if (disabled) return;
    focus();
    void dispatch(sendReply(conversationId, next));
  }
  return (
    <div
      className={cn(
        "shrink-0 p-4 pt-2 max-[760px]:p-2 max-[760px]:pt-1",
        compact && "p-3 pt-1",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-input bg-background shadow-xs focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/10">
        <p className="flex flex-wrap items-center gap-x-1.5 px-3 pt-2.5 text-[10px] text-muted-foreground">
          回复 <strong className="font-medium text-foreground">{name}</strong>
          <span>
            · {conversation.identity.channelName} ·{" "}
            {conversation.identity.accountName}
          </span>
        </p>
        <Textarea
          ref={input}
          value={draft.text}
          aria-label={`回复 ${name}，${conversation.identity.channelName}，${conversation.identity.accountName}`}
          placeholder={
            restriction
              ? "可继续编辑，连接或能力恢复后再发送"
              : "认真回应每一份期待…"
          }
          className={cn(
            "resize-none rounded-none border-0 bg-transparent p-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
            compact ? "min-h-16" : "min-h-24 max-[760px]:min-h-16",
          )}
          onFocus={focus}
          onChange={(event) =>
            dispatch(editDraft(conversationId, event.target.value))
          }
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            const intent = composerIntent({
              key: event.key,
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              isComposing: composing.current || event.nativeEvent.isComposing,
              keyCode: event.nativeEvent.keyCode,
            });
            if (intent && !event.repeat) {
              event.preventDefault();
              submit(intent === "next");
            }
          }}
        />
        <div className="max-h-24 overflow-y-auto max-[760px]:max-h-16">
          <AttachmentDrafts conversationId={conversationId} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <AttachmentPicker conversationId={conversationId} />
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="插入表情"
                  />
                }
              >
                <Smile />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60">
                <p className="mb-2 text-xs text-muted-foreground">插入表情</p>
                <div className="grid grid-cols-4 gap-1">
                  {emoji.map((item) => (
                    <Button
                      key={item}
                      variant="ghost"
                      size="icon"
                      onClick={() => insert(item)}
                      aria-label={`插入 ${item}`}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="快捷回复"
                  />
                }
              >
                <MessageSquareText />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <p className="mb-2 text-xs text-muted-foreground">
                  快捷回复 · 点击插入后可编辑
                </p>
                <div className="flex flex-col gap-1">
                  {quickReplies.map((reply) => (
                    <Button
                      key={reply}
                      variant="ghost"
                      className="h-auto justify-start px-2 py-2 text-left text-xs whitespace-normal"
                      onClick={() => insert(reply)}
                    >
                      {reply}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              title="Ctrl + Enter"
              disabled={disabled}
              onClick={() => submit(true)}
            >
              发送并下一位
              <ArrowRight />
            </Button>
            <Button
              size="sm"
              disabled={disabled}
              title="Enter 发送，Shift + Enter 换行"
              onClick={() => submit(false)}
            >
              <Send />
              {busy ? "发送中" : "发送"}
            </Button>
          </div>
        </div>
      </div>
      {restriction ? (
        <p role="status" className="mt-2 text-xs text-warning-foreground">
          {restriction}
          {conversation.capability.nextStep &&
            ` · ${conversation.capability.nextStep}`}
        </p>
      ) : (
        !compact && (
          <p className="mt-2 text-[10px] text-muted-foreground max-[760px]:hidden">
            Enter 发送 · Shift + Enter 换行 · Ctrl + Enter 发送并下一位
          </p>
        )
      )}
    </div>
  );
}
