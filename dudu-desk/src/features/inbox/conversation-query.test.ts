import { describe, expect, it } from "vitest";
import { hasConversationFilters } from "./conversation-query";
import { emptyQuery } from "./stores/state";

describe("conversation query filters", () => {
  it("reads false on the standing defaults, whatever the order", () => {
    expect(hasConversationFilters(emptyQuery)).toBe(false);
    expect(hasConversationFilters({ ...emptyQuery, order: "messages" })).toBe(
      false,
    );
  });

  it("reads true once search, channel, status or starred narrows the query", () => {
    expect(hasConversationFilters({ ...emptyQuery, search: "小雨" })).toBe(
      true,
    );
    expect(
      hasConversationFilters({ ...emptyQuery, channelId: "wechat-kf" }),
    ).toBe(true);
    expect(hasConversationFilters({ ...emptyQuery, status: "closed" })).toBe(
      true,
    );
    expect(hasConversationFilters({ ...emptyQuery, status: "all" })).toBe(true);
    expect(hasConversationFilters({ ...emptyQuery, starred: true })).toBe(true);
  });
});
