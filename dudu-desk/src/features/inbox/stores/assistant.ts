import { isFocusable } from "@/lib/focus";
import { selectFocusedId } from "./selectors";
import { editDraft, focusReply } from "./sending";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

// 采纳只编辑当前回复对象的草稿，避免切换会话或发送期间覆盖其他正文。
export function adoptAssistantReply(
  visitorId: string,
  text: string,
  expectedDraft: string,
  generation: number,
): InboxCommand<boolean> {
  return (dispatch, getState) => {
    const state = getState();
    const inbox = state.inbox;
    if (
      generation !== inbox.generation ||
      selectFocusedId(state) !== visitorId ||
      !inbox.conversations[visitorId] ||
      inbox.sendingByConversation[visitorId] ||
      (inbox.drafts[visitorId]?.text ?? "") !== expectedDraft
    ) {
      dispatch(
        inboxActions.noticeChanged(
          "回复对象或草稿已变化，请核对当前会话后重新采纳",
        ),
      );
      return false;
    }
    dispatch(editDraft(visitorId, text));
    dispatch(focusReply(visitorId));
    dispatch(inboxActions.noticeChanged("回复草稿已更新，请核对后发送"));
    // 等待助手收起与卡片完整对话的焦点管理结束，再聚焦可见且仍属于当前对象的编辑器。
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (
          getState().inbox.generation !== generation ||
          selectFocusedId(getState()) !== visitorId
        )
          return;
        Array.from(
          document.querySelectorAll<HTMLTextAreaElement>(
            "textarea[data-conversation-composer]",
          ),
        )
          .find(
            (input) =>
              input.dataset.conversationComposer === visitorId &&
              isFocusable(input),
          )
          ?.focus();
      }),
    );
    return true;
  };
}
