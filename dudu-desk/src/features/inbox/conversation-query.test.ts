import { describe, expect, it } from "vitest";
import { emptyQuery, hasConversationFilters } from "./conversation-query";

describe("conversation query filters", () => {
  it("reads false on the standing defaults, whatever the order", () => {
    expect(hasConversationFilters(emptyQuery)).toBe(false);
    expect(hasConversationFilters({ ...emptyQuery, order: "messages" })).toBe(
      false,
    );
  });

  it("reads true once search, channel or status narrows the query", () => {
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
  });
});
