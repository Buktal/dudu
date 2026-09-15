import { describe, expect, it } from "vitest";
import type { InboxEvent } from "../types";
import { closeQuickHistory, openQuickHistory } from "./quick";
import { loadConversations } from "./reading";
import { selectQueueConversations } from "./selectors";
import { editDraft } from "./sending";
import {
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

describe("quick-card and full-history workflow", () => {
  it("uses one explicit reply target and draft through opening and closing full history", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-b", "卡片中写了一半"));
    await store.dispatch(openQuickHistory("conversation-b"));
    expect(store.getState().inbox.replyId).toBe("conversation-b");
    expect(store.getState().inbox.quickHistoryId).toBe("conversation-b");
    expect(store.getState().inbox.drafts["conversation-b"].text).toBe(
      "卡片中写了一半",
    );
    store.dispatch(editDraft("conversation-b", "在完整对话中继续编辑"));
    store.dispatch(closeQuickHistory());
    expect(store.getState().inbox.quickHistoryId).toBeNull();
    expect(store.getState().inbox.drafts["conversation-b"].text).toBe(
      "在完整对话中继续编辑",
    );
    expect(store.getState().inbox.drafts["conversation-a"]).toBeUndefined();
  });

  it("updates an existing card in place and appends new visitors without taking the reply target", async () => {
    let emit: (event: InboxEvent) => void = () => {};
    const store = testStore({
      subscribe: (input) => {
        emit = input.onEvent;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(openQuickHistory("conversation-b"));
    store.dispatch(closeQuickHistory());
    store.dispatch(editDraft("conversation-b", "仍在输入"));
    const context = store.getState().inbox.context;
    emit({
      id: "new-message",
      cursor: "1",
      context,
      type: "message",
      message: {
        ...incomingMessage("conversation-a"),
        id: "new-incoming-a",
        sequence: 3,
        version: 3,
      },
    });
    emit({
      id: "update-card",
      cursor: "2",
      context,
      type: "conversation",
      conversation: { ...firstConversation, version: 3, preview: "新的来信" },
    });
    emit({
      id: "new-visitor",
      cursor: "3",
      context,
      type: "conversation",
      conversation: { ...secondConversation, id: "conversation-c", version: 3 },
    });
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a", "conversation-b", "conversation-c"]);
    expect(store.getState().inbox.replyId).toBe("conversation-b");
    expect(store.getState().inbox.drafts["conversation-b"].text).toBe(
      "仍在输入",
    );
  });
});
