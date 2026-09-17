import { describe, expect, it } from "vitest";
import type { Conversation, VisitorIdentity } from "../types";
import {
  needsQueueRefreshForEvent,
  needsQueueReloadAfterProfileSave,
  needsQueueReloadAfterStarChange,
  rewriteQueueIds,
} from "./queue-membership";
import { emptyQuery } from "./state";
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

  it("reconcile unions when no search is active", () => {
    const conversations = world(["a", "b"]);
    expect(
      rewriteQueueIds({
        conversations,
        query: emptyQuery,
        previousIds: ["a"],
        incomingIds: ["b"],
        mode: "reconcile",
      }),
    ).toEqual(["a", "b"]);
  });

  it("reconcile prunes to recovered ids while searching", () => {
    const conversations = world(["a", "b"]);
    expect(
      rewriteQueueIds({
        conversations,
        query: { ...emptyQuery, search: "保修" },
        previousIds: ["a"],
        incomingIds: ["b"],
        mode: "reconcile",
      }),
    ).toEqual(["b"]);
  });

  it("drops ids that fail the queue filter in every mode", () => {
    const conversations: Record<string, Conversation> = {
      a: card("a"),
      b: card("b", { channelId: "telegram" }),
    };
    const query = { ...emptyQuery, channelId: "wechat-kf" };
    for (const mode of ["refresh", "append", "reconcile"] as const) {
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
    starred: 0,
  };
  it("fires for queue-moving types when searching or counts exist", () => {
    for (const type of ["conversation", "message", "removed"] as const) {
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

  it("never fires for receipt or capability events", () => {
    for (const type of ["receipt", "capability"] as const) {
      expect(
        needsQueueRefreshForEvent(
          type,
          { ...emptyQuery, search: "保修" },
          counts,
        ),
      ).toBe(false);
    }
  });
});

describe("queue reload predicates", () => {
  it("profile save reloads only the search view", () => {
    expect(
      needsQueueReloadAfterProfileSave({ ...emptyQuery, search: "保修" }),
    ).toBe(true);
    expect(needsQueueReloadAfterProfileSave(emptyQuery)).toBe(false);
  });

  it("star change reloads only the starred view", () => {
    expect(
      needsQueueReloadAfterStarChange({ ...emptyQuery, starred: true }),
    ).toBe(true);
    expect(needsQueueReloadAfterStarChange(emptyQuery)).toBe(false);
  });
});
