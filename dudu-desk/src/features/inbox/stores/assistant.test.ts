import { describe, expect, it, vi } from "vitest";
import { adoptAssistantReply } from "./assistant";
import { loadConversations } from "./queue";
import { editDraft, focusReply } from "./sending";
import { inboxActions } from "./slice";
import {
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("AI 建议进入真实草稿", () => {
  it("只修改当前对象草稿，调用现有发送链路前不发送消息", async () => {
    const send = vi.fn();
    const store = testStore({ send });
    await store.dispatch(loadConversations());
    store.dispatch(focusReply(firstConversation.id));
    store.dispatch(editDraft(firstConversation.id, "原草稿"));
    const generation = store.getState().inbox.generation;
    expect(
      store.dispatch(
        adoptAssistantReply(
          firstConversation.id,
          "AI 建议",
          "原草稿",
          generation,
        ),
      ),
    ).toBe(true);
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "AI 建议",
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("草稿、回复对象或权限代数变化时拒绝覆盖", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    store.dispatch(focusReply(firstConversation.id));
    store.dispatch(editDraft(firstConversation.id, "坐席刚修改"));
    const generation = store.getState().inbox.generation;
    expect(
      store.dispatch(
        adoptAssistantReply(
          firstConversation.id,
          "旧建议",
          "旧草稿",
          generation,
        ),
      ),
    ).toBe(false);
    store.dispatch(focusReply(secondConversation.id));
    expect(
      store.dispatch(
        adoptAssistantReply(
          firstConversation.id,
          "旧建议",
          "坐席刚修改",
          generation,
        ),
      ),
    ).toBe(false);
    store.dispatch(focusReply(firstConversation.id));
    store.dispatch(inboxActions.scopeRevised());
    expect(
      store.dispatch(
        adoptAssistantReply(
          firstConversation.id,
          "旧建议",
          "坐席刚修改",
          generation,
        ),
      ),
    ).toBe(false);
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "坐席刚修改",
    );
  });
});
