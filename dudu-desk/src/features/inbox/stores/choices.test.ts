import { describe, expect, it } from "vitest";
import type { ConversationPage } from "../types";
import { cancelConversationChoices, readConversationChoices } from "./choices";
import { loadConversations } from "./queue";
import { selectQueue, selectReplyConversation } from "./selectors";
import { emptyQuery } from "./state";
import {
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("independent conversation choices", () => {
  it("leaves the main queue, filters and reply target unchanged and ignores cancelled results", async () => {
    const pending = deferred<ConversationPage>();
    let choiceSignal: AbortSignal | undefined;
    const store = testStore({
      listConversations: async ({ query, cursor, signal }) => {
        if (cursor) {
          choiceSignal = signal;
          return pending.promise;
        }
        return query.channelId === "wechat-kf"
          ? { items: [firstConversation], nextCursor: null, total: 1 }
          : {
              items: [secondConversation],
              nextCursor: "choices-page-two",
              total: 2,
            };
      },
    });
    await store.dispatch(
      loadConversations({
        query: {
          ...emptyQuery,
          channelId: "wechat-kf",
          search: "主列表关键词",
          order: "messages",
        },
      }),
    );
    const mainQueue = selectQueue(store.getState());
    const choiceQuery = { ...emptyQuery, search: "完整历史关键词" };

    const choices = await store.dispatch(
      readConversationChoices({ query: choiceQuery, scope: "pin-picker" }),
    );

    expect(choices?.items.map(({ id }) => id)).toEqual(["conversation-b"]);
    expect(selectQueue(store.getState())).toEqual(mainQueue);
    expect(selectReplyConversation(store.getState())).toEqual(
      firstConversation,
    );

    const loadingMore = store.dispatch(
      readConversationChoices({
        query: choiceQuery,
        cursor: "choices-page-two",
        scope: "pin-picker",
      }),
    );
    store.dispatch(cancelConversationChoices("pin-picker"));
    expect(choiceSignal?.aborted).toBe(true);
    pending.resolve({
      items: [
        { ...firstConversation, version: 100, preview: "取消后的过时结果" },
        { ...secondConversation, id: "conversation-c" },
      ],
      nextCursor: null,
    });

    expect(await loadingMore).toBeUndefined();
    expect(
      store.getState().inbox.conversations["conversation-c"],
    ).toBeUndefined();
    expect(selectQueue(store.getState())).toEqual(mainQueue);
    expect(selectReplyConversation(store.getState())).toEqual(
      firstConversation,
    );
  });
});
