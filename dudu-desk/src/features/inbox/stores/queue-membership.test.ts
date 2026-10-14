import { describe, expect, it } from "vitest";
import { emptyQuery } from "../conversation-query";
import type { Conversation, VisitorIdentity } from "../types";
import {
  applyQueuePageMeta,
  foldConversationPages,
  needsQueueRefreshForEvent,
  needsQueueReloadAfterProfileSave,
  rewriteQueueIds,
} from "./queue-membership";
import { emptyLoad, type InboxState } from "./state";
import { defineTestConversation } from "./test-support";

function card(
  id: string,
  identity: Partial<VisitorIdentity> = {},
  extra: Partial<Conversation> = {},
): Conversation {
  return defineTestConversation({
    id,
    identity: {
      id: `visitor-${id}`,
      externalUserId: `external-${id}`,
      name: `访客 ${id}`,
      channelId: "wechat-kf",
      channelName: "微信客服",
      accountId: "account-a",
      accountName: "品牌旗舰店",
      ...identity,
    },
    ...extra,
  });
}

function world(ids: string[]) {
  const conversations: Record<string, Conversation> = {};
  for (const id of ids) conversations[id] = card(id);
  return conversations;
}

describe("rewriteQueueIds", () => {
  it("refresh prunes outside the window but keeps preserved ids", () => {
    const conversations = world(["a", "b", "c", "d"]);
    expect(
      rewriteQueueIds({
        conversations,
        query: emptyQuery,
        previousIds: ["a", "b", "c"],
        incomingIds: ["b", "d"],
        mode: "refresh",
        preserveIds: ["c"],
      }),
    ).toEqual(["b", "c", "d"]);
  });

  it("append keeps every previous id", () => {
    const conversations = world(["a", "b"]);
    expect(
      rewriteQueueIds({
        conversations,
        query: emptyQuery,
        previousIds: ["a"],
        incomingIds: ["b"],
        mode: "append",
      }),
    ).toEqual(["a", "b"]);
  });

  it("drops ids that fail the queue filter in every mode", () => {
    const conversations: Record<string, Conversation> = {
      a: card("a"),
      b: card("b", { channelId: "telegram" }),
    };
    const query = { ...emptyQuery, channelId: "wechat-kf" };
    for (const mode of ["refresh", "append"] as const) {
      expect(
        rewriteQueueIds({
          conversations,
          query,
          previousIds: ["a", "b"],
          incomingIds: ["a", "b"],
          mode,
        }),
      ).toEqual(["a"]);
    }
  });

  it("drops missing conversations and dedupes", () => {
    const conversations = world(["a"]);
    expect(
      rewriteQueueIds({
        conversations,
        query: emptyQuery,
        previousIds: ["a", "ghost"],
        incomingIds: ["a"],
        mode: "refresh",
      }),
    ).toEqual(["a"]);
  });
});

describe("needsQueueRefreshForEvent", () => {
  const counts = {
    active: 1,
    needsReply: 1,
    waiting: 0,
    closed: 0,
  };
  it("fires for queue-moving types when searching or counts exist", () => {
    for (const type of ["conversation", "message"] as const) {
      expect(
        needsQueueRefreshForEvent(
          type,
          { ...emptyQuery, search: "保修" },
          undefined,
        ),
      ).toBe(true);
      expect(needsQueueRefreshForEvent(type, emptyQuery, counts)).toBe(true);
      expect(needsQueueRefreshForEvent(type, emptyQuery, undefined)).toBe(
        false,
      );
    }
  });

  it("never fires for access-changed events", () => {
    expect(
      needsQueueRefreshForEvent(
        "access-changed",
        { ...emptyQuery, search: "保修" },
        counts,
      ),
    ).toBe(false);
  });

  it("fires for a shared profile update only when the search view can move", () => {
    expect(
      needsQueueRefreshForEvent(
        "profile",
        { ...emptyQuery, search: "保修" },
        counts,
      ),
    ).toBe(true);
    // 名片更新不是消息活动：没有搜索词时排序与计数都不变，不重查
    expect(needsQueueRefreshForEvent("profile", emptyQuery, counts)).toBe(
      false,
    );
  });
});

describe("queue reload predicates", () => {
  it("profile save reloads only the search view", () => {
    expect(
      needsQueueReloadAfterProfileSave({ ...emptyQuery, search: "保修" }),
    ).toBe(true);
    expect(needsQueueReloadAfterProfileSave(emptyQuery)).toBe(false);
  });
});

function loadingQueue(): InboxState["queue"] {
  return {
    ...emptyLoad(),
    status: "loading",
    error: { kind: "network", message: "暂时无法连接服务" },
    ids: ["a"],
    query: emptyQuery,
    total: 5,
    counts: { active: 1, needsReply: 1, waiting: 0, closed: 0 },
    channels: [{ id: "wechat-kf", name: "微信客服" }],
  };
}

describe("foldConversationPages", () => {
  it("folds items in page order and takes the last cursor", () => {
    expect(
      foldConversationPages([
        { items: [card("a")], nextCursor: "page-two", total: 6 },
        { items: [card("b")], nextCursor: null },
      ]),
    ).toEqual({
      items: [card("a"), card("b")],
      nextCursor: null,
      total: 6,
    });
  });

  it("keeps the newest non-null total, counts and channels across pages", () => {
    const earlier = {
      active: 1,
      needsReply: 1,
      waiting: 0,
      closed: 0,
    };
    const later = {
      active: 2,
      needsReply: 0,
      waiting: 0,
      closed: 0,
    };
    expect(
      foldConversationPages([
        {
          items: [card("a")],
          nextCursor: "page-two",
          total: 6,
          counts: earlier,
          channels: [{ id: "wechat-kf", name: "微信客服" }],
        },
        { items: [card("b")], nextCursor: "page-three" },
        {
          items: [card("c")],
          nextCursor: null,
          counts: later,
          channels: [{ id: "telegram", name: "Telegram" }],
        },
      ]),
    ).toEqual({
      items: [card("a"), card("b"), card("c")],
      nextCursor: null,
      total: 6,
      counts: later,
      channels: [{ id: "telegram", name: "Telegram" }],
    });
  });

  it("folds an empty collection into an empty page", () => {
    expect(foldConversationPages([])).toEqual({ items: [], nextCursor: null });
  });
});

describe("applyQueuePageMeta", () => {
  const counts = {
    active: 1,
    needsReply: 1,
    waiting: 0,
    closed: 0,
  };
  const channels = [{ id: "wechat-kf", name: "微信客服" }];

  it("a queue read finalizes ready meta and owns the total outright", () => {
    const queue = loadingQueue();
    applyQueuePageMeta(queue, {
      items: [],
      nextCursor: "later",
      counts: { active: 2, needsReply: 0, waiting: 0, closed: 0 },
    });
    expect(queue).toMatchObject({
      status: "ready",
      hasLoaded: true,
      error: null,
      nextCursor: "later",
      counts: { active: 2, needsReply: 0, waiting: 0, closed: 0 },
      channels,
    });
    expect(queue.total).toBeUndefined();
  });

  it("keeps a reported total and the last counts and channels when omitted", () => {
    const queue = loadingQueue();
    applyQueuePageMeta(queue, { items: [], nextCursor: null, total: 9 });
    expect(queue).toMatchObject({
      status: "ready",
      hasLoaded: true,
      error: null,
      nextCursor: null,
      total: 9,
      counts,
      channels,
    });
  });
});
