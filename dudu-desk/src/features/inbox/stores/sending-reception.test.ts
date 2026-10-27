import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { Conversation, InboxMessage } from "../types";
import { loadConversations } from "./queue";
import { loadHistory } from "./reading";
import { editDraft, endReception, sendReply } from "./sending";
import { acceptedMessage, firstConversation, testStore } from "./test-support";

/**
 * 接待推进与结束后恢复：发送并接待下一位的显式推进、已结算提交的回收与
 * 结束接待的确认语义。这里使用真实的接待下一位链路（见 next-reception.ts）。
 */
describe("reception advance and recovery", () => {
  it("recycles settled submissions when the conversation reception ends", async () => {
    // 已结算提交随结束接待机会性回收（D2 拆除清单）；在途提交保留给结算扫描
    const endConversation = async (): Promise<Conversation> => ({
      ...firstConversation,
      status: "closed",
      version: firstConversation.version + 1,
    });

    const settledStore = testStore({
      send: async (input) => acceptedMessage(input),
      endConversation,
    });
    await settledStore.dispatch(loadConversations());
    await settledStore.dispatch(loadHistory("conversation-a"));
    settledStore.dispatch(editDraft("conversation-a", "已结算回复"));
    await settledStore.dispatch(sendReply("conversation-a"));
    expect(
      Object.values(settledStore.getState().inbox.submissions),
    ).toHaveLength(1);
    await settledStore.dispatch(endReception("conversation-a"));
    expect(settledStore.getState().inbox.submissions).toEqual({});
    // 结束结果由会话状态表达：保存态不留键控表（EndState 无 saved 态）
    expect(
      settledStore.getState().inbox.ending["conversation-a"],
    ).toBeUndefined();

    const inFlightStore = testStore({
      send: () => new Promise<InboxMessage>(() => {}),
      endConversation,
    });
    await inFlightStore.dispatch(loadConversations());
    await inFlightStore.dispatch(loadHistory("conversation-a"));
    inFlightStore.dispatch(editDraft("conversation-a", "在途回复"));
    void inFlightStore.dispatch(sendReply("conversation-a"));
    await inFlightStore.dispatch(endReception("conversation-a"));
    // 未结算提交不回收：重连结算扫描仍能找到它
    expect(
      Object.values(inFlightStore.getState().inbox.submissions),
    ).toHaveLength(1);
  });

  it("only advances after explicit send-and-next acceptance and never ends reception implicitly", async () => {
    let ends = 0;
    const store = testStore({
      send: async (input) => acceptedMessage(input),
      endConversation: async () => {
        ends++;
        return { ...firstConversation, status: "closed" };
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "普通发送"));
    await store.dispatch(sendReply("conversation-a"));
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    store.dispatch(editDraft("conversation-a", "发送再下一位"));
    await store.dispatch(sendReply("conversation-a", true));
    expect(store.getState().inbox.activeId).toBe("conversation-b");
    expect(ends).toBe(0);
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "needs-reply",
    );
  });

  it("only shows reception as ended after the API confirms it", async () => {
    let fail = true;
    const store = testStore({
      endConversation: async () => {
        if (fail) throw new DeskApiError("business", "结束接待未保存");
        return {
          ...firstConversation,
          version: 2,
          status: "closed",
          capability: {
            state: "restricted",
            kinds: [],
            reason: "本次接待已结束",
          },
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(endReception("conversation-a"));
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "needs-reply",
    );
    fail = false;
    await store.dispatch(endReception("conversation-a"));
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "closed",
    );
  });
});
