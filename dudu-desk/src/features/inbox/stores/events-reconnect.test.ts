import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import { defineProfile } from "../test-fixtures";
import type { InboxMessage, Page } from "../types";
import { reconnectInbox } from "./events";
import { loadConversations } from "./queue";
import { loadHistory, loadProfile, selectConversation } from "./reading";
import { selectMessages, selectQueueConversations } from "./selectors";
import { editDraft, sendReply } from "./sending";
import { inboxActions } from "./slice";
import {
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];

describe("reconnect re-initialization", () => {
  it("re-reads the visitor list first page with counts and re-queries identity, keeping reply and profile drafts", async () => {
    let input!: Subscription;
    let scopes = 0;
    const cursors: (string | undefined)[] = [];
    const store = testStore(
      {
        subscribe: (subscription) => {
          input = subscription;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async ({ cursor }) => {
          cursors.push(cursor);
          return cursors.length === 1
            ? {
                items: [firstConversation, secondConversation],
                nextCursor: null,
                total: 2,
              }
            : {
                items: [
                  {
                    ...firstConversation,
                    version: 2,
                    preview: "重连后的最新摘要",
                  },
                  { ...secondConversation, version: 2 },
                ],
                nextCursor: "page-two",
                total: 42,
                counts: { active: 2, needsReply: 2, waiting: 0, closed: 1 },
                channels: [{ id: "wechat-kf", name: "微信客服" }],
              };
        },
        readProfile: async ({ conversationId }) =>
          defineProfile({ conversationId, note: "服务端最新备注" }),
      },
      true,
      {
        refreshAccess: async () => {
          scopes += 1;
          return new Set(["account-a", "account-b"]);
        },
      },
    );
    await store.dispatch(loadConversations());
    store.dispatch(editDraft(firstConversation.id, "断线期间写的回复"));
    await store.dispatch(selectConversation(firstConversation.id));
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      inboxActions.profileEdited({
        conversationId: firstConversation.id,
        changes: { note: "断线期间改的备注" },
      }),
    );

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 重连重新执行初始化查询：重查身份、重读第一页与计数
    expect(scopes).toBe(1);
    expect(cursors).toEqual([undefined, undefined]);
    expect(store.getState().inbox.queue).toMatchObject({
      nextCursor: "page-two",
      total: 42,
      counts: { active: 2, needsReply: 2, waiting: 0, closed: 1 },
      channels: [{ id: "wechat-kf", name: "微信客服" }],
    });
    expect(
      store.getState().inbox.conversations[firstConversation.id].preview,
    ).toBe("重连后的最新摘要");
    // 临时断线保留仍有权访客的回复草稿与名片编辑草稿
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "断线期间写的回复",
    );
    expect(store.getState().inbox.profileEdits[firstConversation.id].note).toBe(
      "断线期间改的备注",
    );
    expect(store.getState().inbox.connection).toBe("connected");
  });

  it("removes conversations outside the re-queried identity scope while keeping drafts of the rest", async () => {
    let input!: Subscription;
    let lists = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          input = subscription;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async () =>
          lists++ === 0
            ? {
                items: [firstConversation, secondConversation],
                nextCursor: null,
              }
            : { items: [secondConversation], nextCursor: null },
      },
      true,
      // 断线期间员工被调出账号 a 的组：重连重查身份只返回账号 b
      { refreshAccess: async () => new Set(["account-b"]) },
    );
    await store.dispatch(loadConversations());
    store.dispatch(editDraft(firstConversation.id, "无权会话的草稿"));
    store.dispatch(editDraft(secondConversation.id, "仍有权的草稿"));

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual([secondConversation.id]);
    expect(
      store.getState().inbox.conversations[firstConversation.id],
    ).toBeUndefined();
    expect(store.getState().inbox.drafts[firstConversation.id]).toBeUndefined();
    expect(store.getState().inbox.drafts[secondConversation.id].text).toBe(
      "仍有权的草稿",
    );
  });

  it("invalidates cached histories and re-reads the displayed visitor's profile and recent page", async () => {
    let input!: Subscription;
    let round = 0;
    const historyReads: { conversationId: string; cursor?: string }[] = [];
    const profileReads: string[] = [];
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listMessages: async ({ conversationId, cursor }) => {
        round += 1;
        historyReads.push({ conversationId, cursor });
        return {
          items: [
            {
              ...incomingMessage(conversationId),
              id: `msg-${round}`,
              sequence: round,
            },
          ],
          nextCursor: `older-${round}`,
        };
      },
      readProfile: async ({ conversationId }) => {
        profileReads.push(conversationId);
        return defineProfile({ conversationId });
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));
    await store.dispatch(selectConversation(secondConversation.id));
    // 切回显示中访客复用缓存，不重新读取
    await store.dispatch(selectConversation(firstConversation.id));
    const readsBefore = historyReads.length;
    const profilesBefore = profileReads.length;
    expect(readsBefore).toBe(2);

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 显示中的访客重取最近页：不带旧游标，旧缓存被替换而不是与新页拼接
    expect(historyReads.slice(readsBefore)).toEqual([
      { conversationId: firstConversation.id, cursor: undefined },
    ]);
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ id }) => id,
      ),
    ).toEqual(["msg-3"]);
    // 更早消息的游标来自重取的最近页
    expect(
      store.getState().inbox.histories[firstConversation.id].nextCursor,
    ).toBe("older-3");
    // 名片重查只针对显示中的访客
    expect(profileReads.slice(profilesBefore)).toEqual([firstConversation.id]);
    // 其他访客的旧历史失效：切回时按需重取最近页
    expect(
      store.getState().inbox.histories[secondConversation.id],
    ).toMatchObject({ hasLoaded: false, ids: [] });
    const beforeSwitch = historyReads.length;
    await store.dispatch(selectConversation(secondConversation.id));
    expect(historyReads.slice(beforeSwitch)).toEqual([
      { conversationId: secondConversation.id, cursor: undefined },
    ]);
    // 更早消息仍通过向上分页读取
    await store.dispatch(loadHistory(firstConversation.id, true));
    expect(historyReads[historyReads.length - 1]).toEqual({
      conversationId: firstConversation.id,
      cursor: "older-3",
    });
  });

  it("ignores a pre-drop history read that resolves after the reconnect started", async () => {
    let input!: Subscription;
    let reads = 0;
    const started = deferred<void>();
    const stale = deferred<Page<InboxMessage>>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listMessages: async ({ conversationId }) => {
        reads += 1;
        if (reads === 1) {
          started.resolve();
          return stale.promise;
        }
        return {
          items: [
            {
              ...incomingMessage(conversationId),
              id: "fresh-recent",
              sequence: 9,
            },
          ],
          nextCursor: null,
        };
      },
    });
    await store.dispatch(loadConversations());
    const displaying = store.dispatch(selectConversation(firstConversation.id));
    await started.promise;

    // 断线前发起的最近页读取：重连开始后被取消，迟到的结果不写回
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    stale.resolve({
      items: [
        {
          ...incomingMessage(firstConversation.id),
          id: "stale-recent",
          sequence: 8,
        },
      ],
      nextCursor: "stale-cursor",
    });
    await displaying;
    await recovering;

    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ id }) => id,
      ),
    ).toEqual(["fresh-recent"]);
    // 迟到的旧结果连消息实体都不合并
    expect(store.getState().inbox.messages["stale-recent"]).toBeUndefined();
    expect(
      store.getState().inbox.histories[firstConversation.id].nextCursor,
    ).toBeNull();
  });

  it("keeps a profile edit draft across a reconnect and re-reads the newer server profile for the overwrite prompt", async () => {
    let input!: Subscription;
    let profiles = 0;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      readProfile: async ({ conversationId }) => {
        profiles += 1;
        return defineProfile({
          conversationId,
          version: profiles === 1 ? 1 : 4,
          note: profiles === 1 ? "原备注" : "同事改过的备注",
        });
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      inboxActions.profileEdited({
        conversationId: firstConversation.id,
        changes: { note: "我的编辑" },
      }),
    );

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 重查的名片更新于编辑基线：草稿保留，保存前仍按现有覆盖提示处理
    expect(store.getState().inbox.profiles[firstConversation.id].data).toEqual(
      expect.objectContaining({ version: 4, note: "同事改过的备注" }),
    );
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ note: "我的编辑", baseVersion: 1 });
  });

  it("settles an in-flight send from the reloaded page when its result was persisted", async () => {
    let input!: Subscription;
    let sent: { clientRequestId: string } | undefined;
    const pendingSend = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: async (request) => {
        sent = { clientRequestId: request.clientRequestId };
        return pendingSend.promise;
      },
      listMessages: async ({ conversationId }) => {
        // 重连重取的最近页含服务端已保存的回复（发送接口尚未返回）
        const response = sent
          ? [
              {
                ...incomingMessage(conversationId),
                id: `server:${sent.clientRequestId}`,
                clientRequestId: sent.clientRequestId,
                direction: "outgoing" as const,
                body: { type: "text" as const, text: "请查一下" },
                sequence: 2,
                delivery: { state: "sent" as const },
              },
            ]
          : [];
        return { items: response, nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory(firstConversation.id));
    store.dispatch(editDraft(firstConversation.id, "请查一下"));
    const sending = store.dispatch(sendReply(firstConversation.id));
    // 发送中：时间线只有本地气泡
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ delivery }) => delivery?.state,
      ),
    ).toEqual(["sending"]);

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 结果直接取重查结果：提交按服务端已保存的消息落定，草稿消费，气泡不重复
    expect(
      Object.values(store.getState().inbox.submissions).map(
        ({ status }) => status,
      ),
    ).toEqual(["accepted"]);
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe("");
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ delivery }) => delivery?.state,
      ),
    ).toEqual(["sent"]);
    pendingSend.resolve({
      ...incomingMessage(firstConversation.id),
      id: `server:${sent?.clientRequestId}`,
      direction: "outgoing",
      sequence: 2,
      delivery: { state: "sent" },
    });
    await sending;
  });

  it("reports reconnecting while the reload runs and connected once it settles", async () => {
    let input!: Subscription;
    let lists = 0;
    const started = deferred<void>();
    const reloading = deferred<Page<typeof firstConversation>>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => {
        lists += 1;
        if (lists === 1)
          return { items: [firstConversation], nextCursor: null };
        started.resolve();
        return reloading.promise;
      },
    });
    await store.dispatch(loadConversations());

    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await started.promise;
    expect(store.getState().inbox.connection).toBe("reconnecting");

    reloading.resolve({ items: [firstConversation], nextCursor: null });
    await recovering;
    expect(store.getState().inbox.connection).toBe("connected");
  });

  it("reports the failure category when the reload cannot read the list", async () => {
    let input!: Subscription;
    let lists = 0;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => {
        lists += 1;
        if (lists === 1)
          return { items: [firstConversation], nextCursor: null };
        throw new TypeError("network lost");
      },
    });
    await store.dispatch(loadConversations());

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    expect(store.getState().inbox.connection).toBe("disconnected");
    expect(store.getState().inbox.notice?.message).toBe(
      "暂时无法连接服务，请稍后重试",
    );
  });

  it("re-queries identity once when the socket reports auth rejection as unavailable", async () => {
    let input!: Subscription;
    let scopes = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          input = subscription;
          input.onConnection("unavailable");
          return () => {};
        },
      },
      true,
      {
        refreshAccess: async () => {
          scopes += 1;
          return null;
        },
      },
    );
    await Promise.resolve();

    // 认证被拒上报 unavailable：经账户缝隙重查一次身份，凭据失效由账户层回登录态
    expect(scopes).toBe(1);
    expect(store.getState().inbox.connection).toBe("unavailable");
    // 同状态重复上报不重复触发重查
    input.onConnection("unavailable");
    await Promise.resolve();
    expect(scopes).toBe(1);
  });
});
