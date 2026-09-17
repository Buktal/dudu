import { describe, expect, it, vi } from "vitest";
import type { InboxMessage, Page, SendSubmission } from "../types";
import {
  collapsePinned,
  enterParallel,
  focusPane,
  pinConversation,
  restorePinned,
  unpinConversation,
} from "./parallel";
import { loadConversations } from "./queue";
import { destroyInbox, selectConversation } from "./reading";
import { selectInbox } from "./selectors";
import { editDraft, focusReply, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

const thirdConversation = {
  ...secondConversation,
  id: "conversation-c",
  identity: {
    ...secondConversation.identity,
    id: "visitor-c",
    externalUserId: "external-c",
  },
};
const threeConversations = {
  items: [firstConversation, secondConversation, thirdConversation],
  nextCursor: null,
};

describe("parallel reception", () => {
  it.each([false, true])(
    "shows a reply target from quick mode in the primary pane while preserving a collapsed=%s pin",
    async (collapsed) => {
      const store = testStore({
        listConversations: async () => threeConversations,
      });
      await store.dispatch(loadConversations());
      await store.dispatch(pinConversation(secondConversation.id));
      if (collapsed) store.dispatch(collapsePinned());
      store.dispatch(editDraft(firstConversation.id, "主窗原草稿"));
      store.dispatch(editDraft(secondConversation.id, "固定窗原草稿"));
      store.dispatch(editDraft(thirdConversation.id, "速答中的草稿"));
      store.dispatch(focusReply(thirdConversation.id));
      const before = selectInbox(store.getState());

      await store.dispatch(enterParallel());

      const after = selectInbox(store.getState());
      expect(after).toMatchObject({
        activeId: thirdConversation.id,
        pinnedId: secondConversation.id,
        pinCollapsed: collapsed,
        replyId: thirdConversation.id,
        selectionRevision: before.selectionRevision,
        drafts: before.drafts,
      });
      expect(after.histories[thirdConversation.id].hasLoaded).toBe(true);
      expect(after.profiles[thirdConversation.id].status).toBe("ready");
    },
  );

  it("reveals a collapsed pin when it is still the reply target on re-entry", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    store.dispatch(editDraft(secondConversation.id, "速答继续编辑的固定会话"));
    store.dispatch(collapsePinned());
    store.dispatch(focusReply(secondConversation.id));
    const before = selectInbox(store.getState());

    await store.dispatch(enterParallel());
    await store.dispatch(enterParallel());

    expect(selectInbox(store.getState())).toMatchObject({
      activeId: firstConversation.id,
      pinnedId: secondConversation.id,
      pinCollapsed: false,
      replyId: secondConversation.id,
      selectionRevision: before.selectionRevision,
      drafts: before.drafts,
    });
  });

  it("preserves send-and-next intent while aligning the pane for an in-flight quick reply", async () => {
    const pending = deferred<InboxMessage>();
    const submissions: SendSubmission[] = [];
    const store = testStore({
      listConversations: async () => threeConversations,
      send: async (input) => {
        submissions.push(input);
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    store.dispatch(editDraft(secondConversation.id, "固定会话仍待回复"));
    store.dispatch(focusReply(thirdConversation.id));
    store.dispatch(editDraft(thirdConversation.id, "速答发送并下一位"));
    const revision = selectInbox(store.getState()).selectionRevision;
    const sending = store.dispatch(sendReply(thirdConversation.id, true));

    await store.dispatch(enterParallel());
    expect(selectInbox(store.getState())).toMatchObject({
      activeId: thirdConversation.id,
      replyId: thirdConversation.id,
      pinnedId: secondConversation.id,
      selectionRevision: revision,
    });
    expect(submissions[0].target.conversationId).toBe(thirdConversation.id);
    pending.resolve(acceptedMessage(submissions[0]));
    await sending;

    expect(selectInbox(store.getState())).toMatchObject({
      activeId: firstConversation.id,
      replyId: firstConversation.id,
      pinnedId: secondConversation.id,
      drafts: {
        [thirdConversation.id]: { text: "" },
        [secondConversation.id]: { text: "固定会话仍待回复" },
      },
    });
  });

  it("focuses the existing pinned visitor without swapping the primary pane", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    await store.dispatch(focusPane("primary"));
    expect(store.getState().inbox).toMatchObject({
      activeId: firstConversation.id,
      pinnedId: secondConversation.id,
      replyId: firstConversation.id,
    });

    await store.dispatch(selectConversation(secondConversation.id));
    expect(store.getState().inbox).toMatchObject({
      activeId: firstConversation.id,
      pinnedId: secondConversation.id,
      replyId: secondConversation.id,
      pinCollapsed: false,
    });
  });

  it("keeps both drafts while collapsing, restoring and releasing the pinned pane", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    store.dispatch(editDraft(firstConversation.id, "主会话草稿"));
    store.dispatch(editDraft(secondConversation.id, "固定会话草稿"));
    store.dispatch(collapsePinned());
    expect(store.getState().inbox).toMatchObject({
      pinnedId: secondConversation.id,
      pinCollapsed: true,
      replyId: firstConversation.id,
    });
    await store.dispatch(restorePinned());
    expect(store.getState().inbox).toMatchObject({
      pinnedId: secondConversation.id,
      pinCollapsed: false,
      replyId: secondConversation.id,
    });
    store.dispatch(unpinConversation());
    expect(store.getState().inbox).toMatchObject({
      activeId: firstConversation.id,
      pinnedId: null,
      replyId: firstConversation.id,
      drafts: {
        [firstConversation.id]: { text: "主会话草稿" },
        [secondConversation.id]: { text: "固定会话草稿" },
      },
    });
  });

  it("moves the current conversation into the pinned pane and never duplicates it", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    store.dispatch(editDraft(firstConversation.id, "原来的草稿"));
    await store.dispatch(pinConversation(firstConversation.id));
    expect(store.getState().inbox).toMatchObject({
      activeId: null,
      pinnedId: firstConversation.id,
      replyId: firstConversation.id,
    });
    await store.dispatch(selectConversation(secondConversation.id));
    await store.dispatch(pinConversation(secondConversation.id));
    expect(store.getState().inbox).toMatchObject({
      activeId: null,
      pinnedId: secondConversation.id,
      replyId: secondConversation.id,
    });
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "原来的草稿",
    );
    await store.dispatch(pinConversation("unavailable-conversation"));
    expect(store.getState().inbox.pinnedId).toBe(secondConversation.id);
    expect(store.getState().inbox.notice?.message).toContain("不可用");
  });

  it("keeps the visible primary history loading when a pinned row is selected", async () => {
    const pending = deferred<Page<InboxMessage>>();
    let primarySignal: AbortSignal | undefined;
    const store = testStore({
      listMessages: async ({ conversationId, signal }) => {
        if (conversationId === firstConversation.id) {
          primarySignal = signal;
          return pending.promise;
        }
        return { items: [incomingMessage(conversationId)], nextCursor: null };
      },
    });
    const loading = store.dispatch(loadConversations());
    // State-driven wait: the auto-select chain resolves in a tick count that
    // paging refactors may shift, so wait for the in-flight read itself.
    await vi.waitFor(() => expect(primarySignal).toBeDefined());
    await store.dispatch(pinConversation(secondConversation.id));
    await store.dispatch(selectConversation(secondConversation.id));
    expect(primarySignal?.aborted).toBe(false);
    pending.resolve({
      items: [incomingMessage(firstConversation.id)],
      nextCursor: null,
    });
    await loading;

    expect(
      store.getState().inbox.histories[firstConversation.id].hasLoaded,
    ).toBe(true);
    expect(store.getState().inbox).toMatchObject({
      activeId: firstConversation.id,
      replyId: secondConversation.id,
    });
  });

  it("keeps pending sends bound to each visitor while the pinned pane changes", async () => {
    const firstResult = deferred<InboxMessage>();
    const secondResult = deferred<InboxMessage>();
    const submitted: SendSubmission[] = [];
    const store = testStore({
      send: async (input) => {
        submitted.push(input);
        return input.target.conversationId === firstConversation.id
          ? firstResult.promise
          : secondResult.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    store.dispatch(editDraft(firstConversation.id, "品牌店的回复"));
    store.dispatch(editDraft(secondConversation.id, "海外账号的回复"));
    const firstSend = store.dispatch(sendReply(firstConversation.id));
    const secondSend = store.dispatch(sendReply(secondConversation.id));
    await store.dispatch(pinConversation(firstConversation.id));
    store.dispatch(editDraft(secondConversation.id, "新的海外草稿"));
    secondResult.resolve(acceptedMessage(submitted[1]));
    firstResult.resolve(acceptedMessage(submitted[0]));
    await Promise.all([firstSend, secondSend]);

    const replies = Object.values(store.getState().inbox.messages).filter(
      (message) => message.direction === "outgoing",
    );
    expect(replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: firstConversation.id,
          body: { type: "text", text: "品牌店的回复" },
        }),
        expect.objectContaining({
          conversationId: secondConversation.id,
          body: { type: "text", text: "海外账号的回复" },
        }),
      ]),
    );
    expect(store.getState().inbox.drafts[secondConversation.id].text).toBe(
      "新的海外草稿",
    );
    expect(store.getState().inbox.replyId).toBe(firstConversation.id);
  });

  it("clears pinned sessions and drafts when the running desk session ends", async () => {
    const store = testStore();
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation(secondConversation.id));
    store.dispatch(editDraft(secondConversation.id, "仅本次运行保留"));
    store.dispatch(collapsePinned());
    store.dispatch(destroyInbox());

    expect(store.getState().inbox).toMatchObject({
      pinnedId: null,
      pinCollapsed: false,
      activeId: null,
      replyId: null,
      drafts: {},
    });
  });
});
