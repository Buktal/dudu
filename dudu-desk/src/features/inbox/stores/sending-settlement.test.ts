import { describe, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "../api";
import type { InboxMessage, SendSubmission } from "../types";
import { applyAccessChanged } from "./access";
import { loadConversations } from "./queue";
import { loadHistory, resetContext } from "./reading";
import { selectMessages } from "./selectors";
import {
  editDraft,
  endReception,
  retryReply,
  sendReply,
  settleConfirmedReplies,
} from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  testStore,
} from "./test-support";

/**
 * 接待下一位的推进链路在本文件整体替换为抛错的桩：它只服务「落定之后链上
 * 出现意外异常」这一条守卫用例，其余用例的发送都不带 next 或不会走到推进。
 */
vi.mock("./next-reception", () => ({
  // 形态对齐真实 receiveNext：返回 thunk（由 dispatch 调用），再在体内抛错
  receiveNext: () => async () => {
    throw new TypeError("unexpected advance failure");
  },
}));

/**
 * 发送结果落定：服务端三态的结算、socket 与 HTTP 的合并、中断与取消的
 * unconfirmed 收敛，以及「已接受的发送不被降级」守卫。
 */
describe("send result settlement", () => {
  it("settles the contract's sending result as an accepted submission", async () => {
    const store = testStore({
      send: async (input) => ({
        ...acceptedMessage(input),
        delivery: { state: "sending" },
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "受理中的回复"));
    await store.dispatch(sendReply("conversation-a"));

    const message = selectMessages(store.getState(), "conversation-a")[1];
    // 契约第 4 节的受理记录：如实显示发送中，不判成无效响应或结果未确认
    expect(message.delivery).toEqual({ state: "sending" });
    expect(store.getState().inbox.submissions[message.id].status).toBe(
      "accepted",
    );
    expect(store.getState().inbox.notice?.kind).not.toBe("unconfirmed-send");
  });

  it("settles a persisted channel failure as the failed bubble with its real reason", async () => {
    const store = testStore({
      send: async (input) => ({
        ...acceptedMessage(input),
        delivery: {
          state: "failed",
          reason: "微信客服消息发送失败：40001 invalid credential",
        },
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "稍等，我查一下"));
    await store.dispatch(sendReply("conversation-a"));

    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages).toHaveLength(2);
    // 渠道失败同样是已保存的持久消息：显示真实原因，不能判成无效响应或结果未确认
    expect(messages[1].delivery).toEqual({
      state: "failed",
      reason: "微信客服消息发送失败：40001 invalid credential",
    });
    expect(store.getState().inbox.submissions[messages[1].id].status).toBe(
      "failed",
    );
    expect(
      store.getState().inbox.sendingByConversation["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.notice?.kind).not.toBe("unconfirmed-send");
  });

  it("merges the socket result and the HTTP response into one persisted message", async () => {
    const pending = deferred<InboxMessage>();
    let request: SendSubmission | undefined;
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      send: async (input) => {
        request = input;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已受理的回复"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const clientRequestId = request?.clientRequestId ?? "";
    const persisted: InboxMessage = {
      id: "server-9002",
      clientRequestId,
      conversationId: "conversation-a",
      direction: "outgoing",
      body: { type: "text", text: "已受理的回复" },
      createdAt: "2026-09-16T00:01:00Z",
      sequence: 2,
      version: 2,
      delivery: { state: "sent" },
    };

    // Socket 先进：完整消息 + 最新访客摘要；随后 HTTP 返回同一条消息
    subscription.onEvent({
      type: "message",
      context: subscription.context,
      message: persisted,
      conversation: {
        ...firstConversation,
        status: "waiting",
        version: 2,
        messageCount: 2,
        preview: "已受理的回复",
      },
    });
    pending.resolve(persisted);
    await sending;

    const messages = selectMessages(store.getState(), "conversation-a");
    expect(
      messages.filter((message) => message.direction === "outgoing"),
    ).toHaveLength(1);
    expect(messages[1].delivery?.state).toBe("sent");
    expect(
      store.getState().inbox.conversations["conversation-a"],
    ).toMatchObject({
      status: "waiting",
      preview: "已受理的回复",
    });
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
  });

  it("shows the sending bubble without overwriting the persisted summary", async () => {
    const pending = deferred<InboxMessage>();
    let request: SendSubmission | undefined;
    const store = testStore({
      send: async (input) => {
        request = input;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    const before = store.getState().inbox.conversations["conversation-a"];
    store.dispatch(editDraft("conversation-a", "正在发送的回复"));
    const sending = store.dispatch(sendReply("conversation-a"));

    // 发送中先显示本地气泡；持久摘要与计数等到结果保存后的通知才更新
    expect(selectMessages(store.getState(), "conversation-a")[1]).toMatchObject(
      {
        direction: "outgoing",
        body: { type: "text", text: "正在发送的回复" },
        delivery: { state: "sending" },
      },
    );
    const during = store.getState().inbox.conversations["conversation-a"];
    expect(during.preview).toBe(before.preview);
    expect(during.messageCount).toBe(before.messageCount);
    expect(during.status).toBe(before.status);

    if (request) pending.resolve(acceptedMessage(request));
    await sending;
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      before.status,
    );
  });

  it("keeps interrupted sends unconfirmed without auto retry or moving to the next visitor", async () => {
    let calls = 0;
    const store = testStore({
      send: async () => {
        calls++;
        throw new TypeError("network lost");
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "等待结果"));
    await store.dispatch(sendReply("conversation-a", true));
    const message = selectMessages(store.getState(), "conversation-a")[1];
    await store.dispatch(retryReply(message.id));
    expect(message.delivery?.state).toBe("unconfirmed");
    expect(calls).toBe(1);
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "等待结果",
    );
  });

  it("marks accepted submissions settled so repeated settlements skip them", async () => {
    const store = testStore({
      send: async (input) => acceptedMessage(input),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    for (const text of ["第一条回复", "第二条回复", "第三条回复"]) {
      store.dispatch(editDraft("conversation-a", text));
      await store.dispatch(sendReply("conversation-a"));
    }
    const settled = Object.values(store.getState().inbox.submissions);
    expect(settled).toHaveLength(3);
    expect(settled.every((submission) => submission.settled)).toBe(true);
    // 落定后的提交不进入再扫描：重复结算不产生任何状态变化
    const before = store.getState().inbox;
    store.dispatch(settleConfirmedReplies());
    expect(store.getState().inbox).toBe(before);
  });

  it("keeps an accepted send settled when the follow-up advance chain throws", async () => {
    // 接受已落定（delivery 仍为受理中的 sending）后，loaded 链上的异常会进入
    // 骨架的 failed 结算；守卫必须让服务端已确认的接受不被降级成 unconfirmed
    const store = testStore({
      send: async (input) => ({
        ...acceptedMessage(input),
        delivery: { state: "sending" },
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已受理的回复"));
    await store.dispatch(sendReply("conversation-a", true));

    const message = selectMessages(store.getState(), "conversation-a")[1];
    expect(store.getState().inbox.submissions[message.id]).toMatchObject({
      status: "accepted",
      settled: true,
    });
    expect(message.delivery?.state).toBe("sending");
    expect(
      store.getState().inbox.sendingByConversation["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.notice?.kind).not.toBe("unconfirmed-send");
  });

  it("settles an in-flight send locally when a reconnect cancels the scope", async () => {
    // 真实适配器在取消时以 aborted 拒绝（desk-http 的统一映射）
    const store = testStore({
      send: ({ signal }) =>
        new Promise<InboxMessage>((_, reject) => {
          const abort = () => reject(new DeskApiError("aborted", "操作已取消"));
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "重连时仍在发送"));
    const sending = store.dispatch(sendReply("conversation-a"));
    // 手动重连链路：applyAccessChanged 递增范围代数并取消在途读取
    await store.dispatch(applyAccessChanged());
    await sending;
    const message = selectMessages(store.getState(), "conversation-a")[1];
    // 取消按无确定结果结算：submission 不再停在 sending，会话发送锁释放
    expect(message.delivery?.state).toBe("unconfirmed");
    expect(store.getState().inbox.submissions[message.id].status).toBe(
      "unconfirmed",
    );
    expect(
      store.getState().inbox.sendingByConversation["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.notice?.kind).toBe("unconfirmed-send");
  });

  it("rejects late send and end responses after a context change", async () => {
    const pending = deferred<InboxMessage>();
    const ending = deferred<typeof firstConversation>();
    let submission: SendSubmission | undefined;
    const store = testStore({
      send: async (input) => {
        submission = input;
        return pending.promise;
      },
      endConversation: () => ending.promise,
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "旧上下文"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const closing = store.dispatch(endReception("conversation-a"));
    store.dispatch(
      resetContext({ agentId: "other-agent", workspaceId: "other-workspace" }),
    );
    expect(submission).toBeDefined();
    if (submission) pending.resolve(acceptedMessage(submission));
    ending.resolve({ ...firstConversation, status: "closed", version: 2 });
    await Promise.all([sending, closing]);
    expect(store.getState().inbox.drafts).toEqual({});
    expect(store.getState().inbox.messages).toEqual({});
    expect(store.getState().inbox.conversations).toEqual({});
  });
});
