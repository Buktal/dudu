import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import { emptyQuery } from "../conversation-query";
import type { Conversation, Page, VisitorProfile } from "../types";
import {
  discardProfileEdits,
  editVisitorProfile,
  saveVisitorProfile,
} from "./details";
import { loadConversations } from "./queue";
import { loadProfile, resetContext, selectConversation } from "./reading";
import { selectQueueConversations } from "./selectors";
import { inboxActions } from "./slice";
import {
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("visitor details", () => {
  it("refreshes tag search membership after a saved tag is removed and restored", async () => {
    let tags = ["保修"];
    let version = 1;
    const store = testStore({
      listConversations: async ({ query }) => ({
        items:
          !query.search || tags.includes("保修") ? [firstConversation] : [],
        nextCursor: null,
      }),
      readProfile: async ({ conversationId }) => ({
        conversationId,
        version,
        tags,
        note: "",
        fields: [],
      }),
      saveProfile: async ({ conversationId, tags: savedTags, note }) => {
        tags = savedTags;
        version++;
        return { conversationId, version, tags, note, fields: [] };
      },
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "保修" } }),
    );
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(editVisitorProfile(firstConversation.id, { tagsText: "" }));

    await store.dispatch(saveVisitorProfile(firstConversation.id));

    expect(selectQueueConversations(store.getState())).toEqual([]);
    expect(store.getState().inbox.replyId).toBe("conversation-a");

    store.dispatch(
      editVisitorProfile(firstConversation.id, { tagsText: "保修；回访" }),
    );
    await store.dispatch(saveVisitorProfile(firstConversation.id));

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a"]);
    expect(store.getState().inbox.queue.query.search).toBe("保修");
  });

  it("does not overwrite concurrent server changes with an older editing baseline", async () => {
    let profile: VisitorProfile = {
      conversationId: firstConversation.id,
      version: 1,
      fields: [],
      tags: [],
      note: "原备注",
    };
    const store = testStore({
      readProfile: async () => profile,
      saveProfile: async ({ tags, note, version }) => {
        if (version !== profile.version)
          throw new DeskApiError("business", "资料已更新，请核对后重试");
        profile = { ...profile, tags, note, version: version + 1 };
        return profile;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "正在编辑的备注" }),
    );
    profile = { ...profile, version: 2, tags: ["服务端新标签"] };
    await store.dispatch(loadProfile(firstConversation.id));
    await store.dispatch(saveVisitorProfile(firstConversation.id));

    expect(
      store.getState().inbox.profiles[firstConversation.id].data,
    ).toMatchObject({ version: 2, tags: ["服务端新标签"] });
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ status: "error", note: "正在编辑的备注" });
  });

  it("discards late profile writes after the agent context changes", async () => {
    const pendingProfile = deferred<VisitorProfile>();
    const store = testStore({
      saveProfile: () => pendingProfile.promise,
    });
    await store.dispatch(loadConversations());
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "旧坐席的未保存备注" }),
    );
    const saving = store.dispatch(saveVisitorProfile(firstConversation.id));
    store.dispatch(
      resetContext({ agentId: "new-agent", workspaceId: "new-workspace" }),
    );
    pendingProfile.resolve({
      conversationId: firstConversation.id,
      version: 2,
      fields: [],
      tags: [],
      note: "旧坐席的未保存备注",
    });
    await saving;

    expect(store.getState().inbox).toMatchObject({
      context: { agentId: "new-agent", workspaceId: "new-workspace" },
      profiles: {},
      profileEdits: {},
      conversations: {},
    });
  });

  it("drops a late profile save for a removed conversation", async () => {
    const pendingProfile = deferred<VisitorProfile>();
    const store = testStore({
      saveProfile: () => pendingProfile.promise,
    });
    await store.dispatch(loadConversations());
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "移除后才返回的备注" }),
    );
    const saving = store.dispatch(saveVisitorProfile(firstConversation.id));
    // Detach through the reducer-level removal only: the live subscription
    // path would also cancel the request, and this pins the settle guard
    // itself — a current operation whose conversation is gone writes nothing.
    store.dispatch(
      inboxActions.eventReceived({
        context: { agentId: "agent-a", workspaceId: "workspace-a" },
        id: "removed-a",
        cursor: "removed-a",
        type: "removed",
        conversationId: firstConversation.id,
        version: 3,
      }),
    );
    pendingProfile.resolve({
      conversationId: firstConversation.id,
      version: 2,
      fields: [],
      tags: [],
      note: "移除后才返回的备注",
    });
    await saving;

    const state = store.getState().inbox;
    expect(state.profiles).toEqual({});
    expect(state.profileEdits).toEqual({});
    expect(state.conversations[firstConversation.id]).toBeUndefined();
  });

  it("keeps newer edits when an earlier profile save completes", async () => {
    const result = deferred<VisitorProfile>();
    const store = testStore({ saveProfile: () => result.promise });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, {
        note: "第一版备注",
        tagsText: "待回访，首次咨询",
      }),
    );
    const saving = store.dispatch(saveVisitorProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "保存时补充的备注" }),
    );
    result.resolve({
      conversationId: firstConversation.id,
      version: 2,
      fields: [],
      tags: ["待回访", "首次咨询"],
      note: "第一版备注",
    });
    await saving;

    expect(
      store.getState().inbox.profiles[firstConversation.id].data?.note,
    ).toBe("第一版备注");
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({
      note: "保存时补充的备注",
      revision: 2,
      savedRevision: 1,
    });
  });

  it("retains failed edits per visitor and retries the original identity after switching", async () => {
    let fail = true;
    const store = testStore({
      saveProfile: async ({ conversationId, tags, note, version }) => {
        if (fail) throw new DeskApiError("business", "备注暂时无法保存");
        return { conversationId, tags, note, version: version + 1, fields: [] };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, {
        note: "品牌店待回访",
        tagsText: "回访，回访；重点",
      }),
    );
    await store.dispatch(saveVisitorProfile(firstConversation.id));
    await store.dispatch(selectConversation(secondConversation.id));
    store.dispatch(
      editVisitorProfile(secondConversation.id, { note: "海外账号备注" }),
    );

    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ status: "error", note: "品牌店待回访" });
    fail = false;
    await store.dispatch(saveVisitorProfile(firstConversation.id));
    expect(
      store.getState().inbox.profiles[firstConversation.id].data,
    ).toMatchObject({ note: "品牌店待回访", tags: ["回访", "重点"] });
    expect(
      store.getState().inbox.profileEdits[secondConversation.id].note,
    ).toBe("海外账号备注");
    expect(store.getState().inbox.replyId).toBe(secondConversation.id);
    store.dispatch(discardProfileEdits(secondConversation.id));
    expect(
      store.getState().inbox.profileEdits[secondConversation.id],
    ).toBeUndefined();
  });

  it("resets filtered pagination and keeps the reply target when no results remain", async () => {
    const olderPage = deferred<Page<Conversation>>();
    let oldSignal: AbortSignal | undefined;
    const store = testStore({
      listConversations: async ({ query, cursor, signal }) => {
        if (cursor) {
          oldSignal = signal;
          return olderPage.promise;
        }
        return query.search
          ? { items: [], nextCursor: null, total: 0 }
          : {
              items: [firstConversation, secondConversation],
              nextCursor: "page-two",
              total: 3,
            };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(secondConversation.id));
    const loadingMore = store.dispatch(loadConversations({ more: true }));
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "没有匹配" } }),
    );
    olderPage.resolve({
      items: [{ ...firstConversation, id: "late-page" }],
      nextCursor: "page-three",
    });
    await loadingMore;

    expect(oldSignal?.aborted).toBe(true);
    expect(store.getState().inbox.queue).toMatchObject({
      ids: [],
      nextCursor: null,
      hasLoaded: true,
      total: 0,
    });
    expect(store.getState().inbox.replyId).toBe(secondConversation.id);
    expect(store.getState().inbox.conversations["late-page"]).toBeUndefined();
  });

  it("starts new edits from the latest confirmed profile after a refresh", async () => {
    let profile: VisitorProfile = {
      conversationId: firstConversation.id,
      version: 1,
      fields: [],
      tags: [],
      note: "原备注",
    };
    const store = testStore({
      readProfile: async () => profile,
      saveProfile: async ({ tags, note }) => {
        profile = { ...profile, tags, note, version: profile.version + 1 };
        return profile;
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "首次保存的备注" }),
    );
    await store.dispatch(saveVisitorProfile(firstConversation.id));
    profile = { ...profile, version: 3, note: "服务端后来更新的备注" };
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { tagsText: "刚添加的标签" }),
    );
    await store.dispatch(saveVisitorProfile(firstConversation.id));

    expect(
      store.getState().inbox.profiles[firstConversation.id].data,
    ).toMatchObject({
      tags: ["刚添加的标签"],
      note: "服务端后来更新的备注",
    });
  });

  it("keeps the saved profile ready when a refresh returns an older version", async () => {
    const store = testStore({
      saveProfile: async ({ conversationId, tags, note, version }) => ({
        conversationId,
        tags,
        note,
        version: version + 1,
        fields: [],
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "服务端已确认的备注" }),
    );
    await store.dispatch(saveVisitorProfile(firstConversation.id));
    await store.dispatch(loadProfile(firstConversation.id));

    expect(store.getState().inbox.profiles[firstConversation.id]).toMatchObject(
      {
        status: "ready",
        data: { version: 2, note: "服务端已确认的备注" },
      },
    );
  });

  it("applies another employee's profile update and keeps the local draft", async () => {
    const store = testStore({
      readProfile: async ({ conversationId }) => ({
        conversationId,
        version: 1,
        fields: [],
        tags: [],
        note: "原备注",
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { tagsText: "本地标签" }),
    );

    profileEvent(store, {
      conversationId: firstConversation.id,
      version: 2,
      fields: [],
      tags: ["他人标签"],
      note: "他人备注",
    });

    // 未在编辑的查看界面即时刷新；本地草稿原样保留
    expect(store.getState().inbox.profiles[firstConversation.id]).toMatchObject(
      {
        status: "ready",
        data: { version: 2, tags: ["他人标签"], note: "他人备注" },
      },
    );
    expect(store.getState().inbox.profileEdits[firstConversation.id]).toEqual({
      tagsText: "本地标签",
      note: "原备注",
      revision: 1,
      savedRevision: 0,
      baseVersion: 1,
      status: "idle",
      error: null,
    });

    // 较旧的名片报文不回退已确认的资料
    profileEvent(store, {
      conversationId: firstConversation.id,
      version: 1,
      fields: [],
      tags: [],
      note: "过期备注",
    });
    expect(
      store.getState().inbox.profiles[firstConversation.id].data?.note,
    ).toBe("他人备注");
  });

  it("confirms an overwrite against the latest version while a plain save keeps its baseline", async () => {
    let profile: VisitorProfile = {
      conversationId: firstConversation.id,
      version: 1,
      fields: [],
      tags: [],
      note: "原备注",
    };
    const baselines: number[] = [];
    const store = testStore({
      readProfile: async () => profile,
      saveProfile: async ({ tags, note, version }) => {
        baselines.push(version);
        // 版本基线是真前提：未经确认的旧基线保存被服务端拒绝
        if (version !== profile.version)
          throw new DeskApiError("business", "资料已更新，请重新读取后再保存");
        profile = { ...profile, version: version + 1, tags, note };
        return profile;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "本地备注" }),
    );
    profile = { ...profile, version: 2, tags: ["他人标签"] };
    profileEvent(store, profile);

    await store.dispatch(saveVisitorProfile(firstConversation.id));
    expect(baselines).toEqual([1]);
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ status: "error", note: "本地备注" });

    // 确认覆盖：按最新已知版本重新提交，后保存覆盖
    await store.dispatch(
      saveVisitorProfile(firstConversation.id, { overwrite: true }),
    );
    expect(baselines).toEqual([1, 2]);
    // 后保存覆盖：落库内容与本地的标签/备注提交一致，不与其人的修改合并
    expect(
      store.getState().inbox.profiles[firstConversation.id].data,
    ).toMatchObject({ version: 3, note: "本地备注", tags: [] });
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ status: "saved", note: "本地备注" });
  });
});

function profileEvent(
  store: ReturnType<typeof testStore>,
  profile: VisitorProfile,
) {
  store.dispatch(
    inboxActions.eventReceived({
      context: { agentId: "agent-a", workspaceId: "workspace-a" },
      type: "profile",
      profile,
    }),
  );
}
