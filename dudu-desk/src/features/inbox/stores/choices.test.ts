import { describe, expect, it } from "vitest";
import {
  cancelConversationChoices,
  pinPickerChoicesScope,
  readConversationChoices,
  retryConversationChoices,
  selectPinnableChoices,
} from "./choices";
import { loadConversations } from "./queue";
import { selectQueue, selectReplyConversation } from "./selectors";
import { inboxActions } from "./slice";
import {
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("independent conversation choices", () => {
  it("leaves the main queue, filters and reply target unchanged and ignores cancelled results", async () => {
    const pending = deferred<{
      items: (typeof firstConversation)[];
      nextCursor: string | null;
    }>();
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
              items: [firstConversation, secondConversation],
              nextCursor: "choices-page-two",
              total: 2,
            };
      },
    });
    await store.dispatch(
      loadConversations({
        query: {
          search: "主列表关键词",
          channelId: "wechat-kf",
          status: "active",
          order: "messages",
        },
      }),
    );
    const mainQueue = selectQueue(store.getState());

    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        search: "完整历史关键词",
        scope: pinPickerChoicesScope,
      }),
    );

    // The read settles into its scope: server results pass the query's
    // membership rule, while the primary conversation stays excluded.
    const choices = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(choices?.status).toBe("ready");
    expect(choices?.ids).toEqual(["conversation-a", "conversation-b"]);
    expect(choices?.nextCursor).toBe("choices-page-two");
    expect(choices?.query.search).toBe("完整历史关键词");
    expect(
      selectPinnableChoices(store.getState()).candidates.map(({ id }) => id),
    ).toEqual(["conversation-b"]);
    expect(selectQueue(store.getState())).toEqual(mainQueue);
    expect(selectReplyConversation(store.getState())).toEqual(
      firstConversation,
    );

    const loadingMore = store.dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
        cursor: "choices-page-two",
      }),
    );
    store.dispatch(cancelConversationChoices(pinPickerChoicesScope));
    expect(choiceSignal?.aborted).toBe(true);
    pending.resolve({
      items: [
        { ...firstConversation, version: 100, preview: "取消后的过时结果" },
        { ...secondConversation, id: "conversation-c" },
      ],
      nextCursor: null,
    });

    await loadingMore;
    // Cancelling abandons the scope's results and the stale page merges
    // nothing.
    expect(
      store.getState().inbox.choices[pinPickerChoicesScope],
    ).toBeUndefined();
    expect(
      store.getState().inbox.conversations["conversation-c"],
    ).toBeUndefined();
    expect(selectQueue(store.getState())).toEqual(mainQueue);
    expect(selectReplyConversation(store.getState())).toEqual(
      firstConversation,
    );
  });

  it("re-checks live entities against the read's query when serving the pinnable view", async () => {
    const store = testStore();
    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
      }),
    );
    expect(
      selectPinnableChoices(store.getState()).candidates.map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);

    store.dispatch(
      inboxActions.conversationsDiscovered([
        { ...secondConversation, status: "closed", version: 2 },
      ]),
    );

    // The closed conversation drops out of the view without a re-read while
    // its id stays on the loaded scope.
    expect(
      selectPinnableChoices(store.getState()).candidates.map(({ id }) => id),
    ).toEqual(["conversation-a"]);
    expect(
      store.getState().inbox.choices[pinPickerChoicesScope]?.ids,
    ).toContain("conversation-b");
  });

  it("settles read failures into the scope load state and retries them there", async () => {
    let calls = 0;
    const store = testStore({
      listConversations: async () => {
        calls += 1;
        if (calls === 1) throw new Error("query interrupted");
        return { items: [secondConversation], nextCursor: null };
      },
    });

    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        search: "重试关键词",
        scope: pinPickerChoicesScope,
      }),
    );

    const failed = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(failed?.status).toBe("error");
    expect(failed?.error?.kind).toBe("network");
    expect(failed?.error?.message).toBe("暂时无法连接服务，请稍后重试");
    expect(failed?.hasLoaded).toBe(false);
    expect(failed?.failedRead).toBe("refresh");

    await store.dispatch(retryConversationChoices(pinPickerChoicesScope));

    const retried = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(calls).toBe(2);
    expect(retried?.status).toBe("ready");
    expect(retried?.ids).toEqual(["conversation-b"]);
    expect(retried?.query.search).toBe("重试关键词");
    expect(retried?.failedRead).toBeUndefined();
  });

  it("keeps the accumulated page and cursor across a failed continuation and retries it", async () => {
    let cursorCalls = 0;
    const third = { ...secondConversation, id: "conversation-c" };
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (cursor) {
          cursorCalls += 1;
          if (cursorCalls === 1) throw new Error("query interrupted");
          return { items: [third], nextCursor: null };
        }
        return { items: [secondConversation], nextCursor: "choices-page-two" };
      },
    });
    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
      }),
    );
    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
        cursor: "choices-page-two",
      }),
    );

    const failed = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(failed?.status).toBe("error");
    expect(failed?.failedRead).toBe("more");
    expect(failed?.ids).toEqual(["conversation-b"]);
    expect(failed?.nextCursor).toBe("choices-page-two");

    await store.dispatch(retryConversationChoices(pinPickerChoicesScope));

    const retried = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(cursorCalls).toBe(2);
    expect(retried?.status).toBe("ready");
    // Appended ids stay deduplicated across the retried continuation.
    expect(retried?.ids).toEqual(["conversation-b", "conversation-c"]);
    expect(retried?.nextCursor).toBeNull();
  });

  it("settles a superseded read silently and leaves the newer read's state standing", async () => {
    const pending = deferred<{
      items: (typeof firstConversation)[];
      nextCursor: string | null;
    }>();
    let staleSignal: AbortSignal | undefined;
    const store = testStore({
      listConversations: async ({ query, signal }) => {
        if (query.search === "第二轮搜索")
          return { items: [secondConversation], nextCursor: null };
        staleSignal = signal;
        return pending.promise;
      },
    });
    const stale = store.dispatch(
      readConversationChoices({
        view: "pinnable",
        search: "第一轮搜索",
        scope: pinPickerChoicesScope,
      }),
    );
    const fresh = store.dispatch(
      readConversationChoices({
        view: "pinnable",
        search: "第二轮搜索",
        scope: pinPickerChoicesScope,
      }),
    );
    expect(staleSignal?.aborted).toBe(true);

    pending.resolve({
      items: [
        { ...firstConversation, version: 100, preview: "过期的候选结果" },
        { ...secondConversation, id: "conversation-c" },
      ],
      nextCursor: "stale-cursor",
    });
    await stale;
    await fresh;

    // The stale read wrote nothing: no entities, no cursor, no error — the
    // superseding read's settled state stands.
    expect(
      store.getState().inbox.conversations["conversation-c"],
    ).toBeUndefined();
    const choices = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(choices?.query.search).toBe("第二轮搜索");
    expect(choices?.status).toBe("ready");
    expect(choices?.ids).toEqual(["conversation-b"]);
    expect(choices?.nextCursor).toBeNull();
    expect(choices?.error).toBeNull();
  });

  it("carries the standing search into a continuation and its membership re-check", async () => {
    const searches: string[] = [];
    const third = { ...secondConversation, id: "conversation-c" };
    const store = testStore({
      listConversations: async ({ query, cursor }) => {
        searches.push(query.search);
        if (cursor) return { items: [third], nextCursor: null };
        return query.search === "继续搜索"
          ? { items: [secondConversation], nextCursor: "choices-page-two" }
          : { items: [], nextCursor: null };
      },
    });
    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        search: "继续搜索",
        scope: pinPickerChoicesScope,
      }),
    );

    // The continuation restates nothing: the scope's standing search follows
    // it onto the wire and into the scope's membership query.
    await store.dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
        cursor: "choices-page-two",
      }),
    );

    expect(searches).toEqual(["继续搜索", "继续搜索"]);
    const choices = store.getState().inbox.choices[pinPickerChoicesScope];
    expect(choices?.query.search).toBe("继续搜索");
    expect(choices?.status).toBe("ready");
    expect(choices?.ids).toEqual(["conversation-b", "conversation-c"]);
  });
});
