import { useId, useRef } from "react";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { replyReadiness } from "../reply/pipeline";
import { selectConversationById } from "../stores/selectors";
import {
  editDraft,
  focusReply,
  resumeReception,
  sendReply,
} from "../stores/sending";
import { blankDraft } from "../stores/state";
import { composerIntent } from "./composer-keyboard";
import { ComposerView } from "./composer-view";
import { visitorName } from "./identity";

/**
 * Store-connected Composer container. Owns snapshot reads, the Reply
 * pipeline decision, keyboard intent and dispatches; rendering is answered
 * by the pure `ComposerView`.
 */
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
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const draft = useInboxSelector(
    (state) => state.inbox.drafts[conversationId] ?? blankDraft,
  );
  const connection = useInboxSelector((state) => state.inbox.connection);
  const busy = useInboxSelector(
    (state) => !!state.inbox.sendingByConversation[conversationId],
  );
  const reception = useInboxSelector(
    (state) => state.inbox.ending[conversationId],
  );
  if (!conversation) return null;
  const readiness = replyReadiness({
    conversation,
    connection,
    text: draft.text,
    sending: busy,
  });
  const notice = readiness.notice;
  const disabled = !readiness.sendable;
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
    <ComposerView
      view={{
        conversationId,
        id,
        compact,
        target,
        name,
        identity: conversation.identity,
        notice,
        ended,
        resumeDisabled:
          reception?.status === "saving" || connection !== "connected",
        resuming: reception?.status === "saving",
        draftText: draft.text,
        busy,
        disabled,
        onHistory,
      }}
      actions={{
        inputRef: input,
        onFocus: focus,
        onInsert: insert,
        onChangeText: (value) => dispatch(editDraft(conversationId, value)),
        onKeyDown: (event) => {
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
        },
        onCompositionStart: () => {
          composing.current = true;
        },
        onCompositionEnd: () => {
          composing.current = false;
        },
        onResume: () => void dispatch(resumeReception(conversationId)),
        onSubmit: submit,
      }}
    />
  );
}
