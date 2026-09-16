import { describe, expect, it } from "vitest";
import { createDevelopmentInboxApi } from "./development-api";
import { loadConversations } from "./stores/reading";
import { emptyQuery } from "./stores/state";
import { createInboxStore } from "./stores/store";

const context = { workspaceId: "preview", agentId: "agent" };
const request = () => ({ context, signal: new AbortController().signal });

describe("conversation query contract", () => {
  it("orders by the original waiting time or total messages before pagination", async () => {
    const driver = createDevelopmentInboxApi({
      now: () => "2026-09-16T08:00:00Z",
    });
    for (let index = 0; index < 80; index += 1)
      driver.controls.receive(context, "dev-conversation-02", "补充咨询内容");

    const oldest = await driver.api.listConversations({
      ...request(),
      query: { ...emptyQuery, order: "wait" },
    });
    const most = await driver.api.listConversations({
      ...request(),
      query: { ...emptyQuery, order: "messages" },
    });

    expect(oldest.items[0].id).toBe("dev-conversation-01");
    expect(most.items[0].id).toBe("dev-conversation-02");
    expect(most.items[0].messageCount).toBeGreaterThan(80);
    expect(oldest.nextCursor).not.toBeNull();
    driver.dispose();
  });

  it("keeps a service search match from older messages even when its latest preview differs", async () => {
    const driver = createDevelopmentInboxApi();
    driver.controls.receive(
      context,
      "dev-conversation-01",
      "历史专用关键字：周末送货",
    );
    driver.controls.receive(
      context,
      "dev-conversation-01",
      "还有另一件事需要确认",
    );
    const store = createInboxStore({ api: driver.api, context });
    await store.dispatch(
      loadConversations({
        query: {
          ...emptyQuery,
          status: "all",
          search: "历史专用关键字",
        },
      }),
    );
    expect(store.getState().inbox.queue.ids).toEqual(["dev-conversation-01"]);
    driver.dispose();
  });
});
