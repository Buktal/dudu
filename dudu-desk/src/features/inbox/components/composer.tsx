import { ArrowUp, ArrowUpRight, History, LockKeyhole } from "lucide-react";
import { type CSSProperties, useId, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { nowIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import { attachmentBatchRestriction } from "../attachment-rules";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { composerIntent, sendRestriction } from "../sending-rules";
import { resumeReception } from "../stores/reception";
import { editDraft, focusReply, sendReply } from "../stores/sending";
import { blankDraft } from "../stores/sending-state";
import { AttachmentDrafts } from "./attachment-drafts";
import { ComposerTools } from "./composer-tools";
import { SourceBadge, visitorName } from "./identity";

export function Composer({
  conversationId,
  compact = false,
  onFocus,
  onHistory,
}: {
  conversationId: string;
  compact?: boolean;
  onFocus?: () => void;
  onHistory?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const id = useId();
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
  const reception = useInboxSelector(
    (state) => state.inbox.ending[conversationId],
  );
  const pendingAttachments = useInboxSelector((state) =>
    draft.attachmentIds.some(
      (attachmentId) =>
        state.inbox.attachments[attachmentId]?.status !== "ready",
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
      draft.attachmentIds
        .map((attachmentId) => attachments[attachmentId])
        .filter(Boolean),
      nowIso(),
    );
  const disabled =
    !!restriction ||
    busy ||
    pendingAttachments ||
    (!draft.text.trim() && !draft.attachmentIds.length);
  const ended = conversation.status === "closed";
  const name = visitorName(conversation.identity);
  const target = `${name}，${conversation.identity.channelName}，${conversation.identity.accountName}`;
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
    <Field
      className={cn(
        "shrink-0 gap-2 px-3 pt-2 pb-3 max-[760px]:px-2",
        compact && "px-4 pt-0 pb-3",
      )}
    >
      <FieldLabel className="sr-only" htmlFor={id}>
        回复 {target}
      </FieldLabel>
      {restriction && (
        <Alert
          role="status"
          className="rounded-lg px-3 py-2"
          id={`${id}-restriction`}
        >
          <LockKeyhole />
          <AlertTitle>
            {ended ? "本次接待已结束" : "当前暂时无法发送"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs">
              {ended ? "记录和当前草稿仍然保留。" : restriction}
              {!ended &&
                conversation.capability.nextStep &&
                ` · ${conversation.capability.nextStep}`}
            </span>
            {ended && (
              <Button
                variant="outline"
                size="xs"
                disabled={
                  reception?.status === "saving" || connection !== "connected"
                }
                onClick={() => void dispatch(resumeReception(conversationId))}
              >
                {reception?.status === "saving" ? "正在恢复…" : "继续接待"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div
        className="rounded-xl border border-border bg-card shadow-xs"
        style={{ "--input": "var(--card)" } as CSSProperties}
      >
        <InputGroup
          className="rounded-xl"
          aria-label={`给 ${target} 的回复编辑器`}
        >
          <InputGroupAddon
            align="block-start"
            className="flex-wrap justify-between gap-x-1 gap-y-1 px-2 pt-1.5 pb-0"
          >
            <ComposerTools
              conversationId={conversationId}
              compact={compact}
              onInsert={insert}
            />
            <span
              title={`回复给 ${target}`}
              className="ml-auto flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] font-normal text-muted-foreground"
            >
              <span className="truncate">
                回复给{" "}
                <strong className="font-medium text-foreground">{name}</strong>
              </span>
              <SourceBadge identity={conversation.identity} />
            </span>
          </InputGroupAddon>
          <InputGroupTextarea
            ref={input}
            id={id}
            value={draft.text}
            aria-label={`回复 ${target}`}
            aria-describedby={restriction ? `${id}-restriction` : undefined}
            placeholder={
              restriction ? "可以保留草稿，恢复接待后发送" : `回复 ${name}…`
            }
            className={cn(
              "max-h-36 px-4 py-2",
              compact || restriction ? "min-h-12" : "min-h-[77px]",
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
          <InputGroupAddon
            align="block-end"
            className="flex-col items-stretch gap-0 px-2 pt-0 pb-2"
          >
            {draft.attachmentIds.length > 0 && (
              <div className="max-h-24 overflow-y-auto max-[760px]:max-h-16">
                <AttachmentDrafts conversationId={conversationId} />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              {onHistory ? (
                <InputGroupButton
                  size="xs"
                  onClick={onHistory}
                  aria-label={`查看与 ${name} 的完整对话`}
                >
                  <History data-icon="inline-start" />
                  完整对话
                </InputGroupButton>
              ) : (
                <span className="pl-2 text-[10px] font-normal text-muted-foreground">
                  Enter 发送
                  <span className="max-[1360px]:hidden">
                    {" "}
                    · Shift + Enter 换行
                  </span>
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <InputGroupButton
                  size="icon-sm"
                  title="发送并接待下一位 · Ctrl + Enter"
                  aria-label={`发送给 ${name} 并接待下一位`}
                  disabled={disabled}
                  onClick={() => submit(true)}
                >
                  <ArrowUpRight data-icon="inline-start" />
                </InputGroupButton>
                <Button
                  size="sm"
                  className="rounded-lg"
                  disabled={disabled}
                  title="Enter 发送，Shift + Enter 换行"
                  onClick={() => submit(false)}
                >
                  {busy ? "发送中" : "发送"}
                  <ArrowUp data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Field>
  );
}
