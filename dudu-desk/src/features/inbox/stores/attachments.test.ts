import { afterEach, describe, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { Conversation, MediaReference, SendSubmission } from "../types";
import {
  addAttachments,
  removeAttachment,
  retryAttachment,
} from "./attachments";
import { loadConversations, resetContext, selectConversation } from "./reading";
import { editDraft, retryReply, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

afterEach(() => vi.unstubAllGlobals());
const normalLimits = {
  maxBytes: 1024,
  maxCount: 4,
  mimeTypes: ["text/plain", "image/png"],
};

describe("attachment drafts", () => {
  it("waits for explicit attachment constraints before preparing a permitted kind", async () => {
    const conversation: Conversation = {
      ...firstConversation,
      capability: { state: "allowed", kinds: ["file"] },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ file }) => ({
        id: "unconstrained",
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["x"], "note.txt", { type: "text/plain" }),
      ]),
    );
    expect(store.getState().inbox.attachments).toEqual({});
    expect(store.getState().inbox.notice?.message).toContain(
      "附件限制尚未确认",
    );
  });
  it("rejects an attachment before preparing when the channel only allows text", async () => {
    let preparations = 0;
    const store = testStore({
      prepareAttachment: async () => {
        preparations += 1;
        throw new Error("Should not prepare a forbidden attachment");
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["test"], "photo.png", { type: "image/png" }),
      ]),
    );
    expect(preparations).toBe(0);
    expect(store.getState().inbox.attachments).toEqual({});
    expect(store.getState().inbox.notice?.message).toContain("不支持");
  });

  it("keeps a prepared attachment in its own conversation draft", async () => {
    const conversation = {
      ...firstConversation,
      capability: {
        state: "allowed" as const,
        kinds: ["text" as const, "file" as const],
        attachments: { maxBytes: 1024, maxCount: 2, mimeTypes: ["text/plain"] },
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation, secondConversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ target, file }) => {
        expect(target).toMatchObject({
          conversationId: "conversation-a",
          accountId: "account-a",
        });
        return {
          id: "prepared-file",
          kind: "file",
          name: file.name,
          mimeType: file.type,
          size: file.size,
          url: "https://example.test/attachment",
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["订单资料"], "订单资料.txt", { type: "text/plain" }),
      ]),
    );
    const draft = store.getState().inbox.drafts["conversation-a"];
    expect(draft.attachmentIds).toHaveLength(1);
    expect(
      store.getState().inbox.attachments[draft.attachmentIds[0]],
    ).toMatchObject({
      conversationId: "conversation-a",
      status: "ready",
      media: { id: "prepared-file" },
    });
    expect(store.getState().inbox.drafts["conversation-b"]).toBeUndefined();
  });

  it("enforces the server's size, MIME and count limits without losing accepted files", async () => {
    const conversation = {
      ...firstConversation,
      capability: {
        state: "allowed" as const,
        kinds: ["file" as const],
        attachments: { maxBytes: 4, maxCount: 1, mimeTypes: ["text/plain"] },
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ file }) => ({
        id: `prepared:${file.name}`,
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["12345"], "oversized.txt", { type: "text/plain" }),
        new File(["x"], "wrong-type.pdf", { type: "application/pdf" }),
        new File(["yes"], "accepted.txt", { type: "text/plain" }),
        new File(["x"], "overflow.txt", { type: "text/plain" }),
      ]),
    );
    expect(
      Object.values(store.getState().inbox.attachments).map(
        (item) => item.name,
      ),
    ).toEqual(["accepted.txt"]);
  });

  it("retries a preparation failure for the original visitor while preserving the text draft", async () => {
    const targets: string[] = [];
    const conversation = {
      ...firstConversation,
      capability: {
        state: "allowed" as const,
        kinds: ["text" as const, "file" as const],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation, secondConversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ target, file }) => {
        targets.push(target.conversationId);
        if (targets.length === 1) throw new DeskApiError("network", "上传中断");
        return {
          id: "prepared-after-retry",
          kind: "file",
          name: file.name,
          mimeType: file.type,
          size: file.size,
        };
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "正文保留"));
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["x"], "note.txt", { type: "text/plain" }),
      ]),
    );
    const id = store.getState().inbox.drafts["conversation-a"].attachmentIds[0];
    expect(store.getState().inbox.attachments[id]).toMatchObject({
      status: "failed",
      error: "上传中断",
    });
    expect(store.getState().inbox.attachments[id].media).toBeUndefined();
    await store.dispatch(selectConversation("conversation-b"));
    await store.dispatch(retryAttachment(id));
    expect(targets).toEqual(["conversation-a", "conversation-a"]);
    expect(store.getState().inbox.attachments[id].status).toBe("ready");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "正文保留",
    );
    expect(store.getState().inbox.activeId).toBe("conversation-b");
  });

  it("keeps preparing across a visitor switch, then cancels removal and ignores a late upload", async () => {
    const revokePreview = vi.fn();
    const NativeUrl = URL;
    vi.stubGlobal(
      "URL",
      class extends NativeUrl {
        static createObjectURL() {
          return "blob:http://localhost/preview";
        }
        static revokeObjectURL = revokePreview;
      },
    );
    const pending = deferred<MediaReference>();
    let uploadSignal: AbortSignal | undefined;
    const conversation = {
      ...firstConversation,
      capability: {
        state: "allowed" as const,
        kinds: ["image" as const],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation, secondConversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ signal }) => {
        uploadSignal = signal;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    const preparing = store.dispatch(
      addAttachments("conversation-a", [
        new File(["image"], "photo.png", { type: "image/png" }),
      ]),
    );
    const id = store.getState().inbox.drafts["conversation-a"].attachmentIds[0];
    await store.dispatch(selectConversation("conversation-b"));
    expect(store.getState().inbox.attachments[id].status).toBe("preparing");
    store.dispatch(removeAttachment(id));
    expect(uploadSignal?.aborted).toBe(true);
    expect(revokePreview).toHaveBeenCalledWith("blob:http://localhost/preview");
    pending.resolve({
      id: "late-resource",
      kind: "image",
      name: "photo.png",
      mimeType: "image/png",
      size: 5,
    });
    await preparing;
    expect(store.getState().inbox.attachments[id]).toBeUndefined();
    expect(
      store.getState().inbox.drafts["conversation-a"].attachmentIds,
    ).toEqual([]);
    expect(store.getState().inbox.activeId).toBe("conversation-b");
  });

  it("rechecks permissions when an upload finishes after the reply window closes", async () => {
    const pending = deferred<MediaReference>();
    let conversation: Conversation = {
      ...firstConversation,
      capability: {
        state: "allowed",
        kinds: ["file"],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async () => pending.promise,
    });
    await store.dispatch(loadConversations());
    const preparing = store.dispatch(
      addAttachments("conversation-a", [
        new File(["x"], "note.txt", { type: "text/plain" }),
      ]),
    );
    const id = store.getState().inbox.drafts["conversation-a"].attachmentIds[0];
    conversation = {
      ...conversation,
      version: 2,
      capability: { state: "restricted", kinds: [], reason: "回复窗口已关闭" },
    };
    await store.dispatch(loadConversations());
    pending.resolve({
      id: "already-uploaded",
      kind: "file",
      name: "note.txt",
      mimeType: "text/plain",
      size: 1,
    });
    await preparing;
    expect(store.getState().inbox.attachments[id]).toMatchObject({
      status: "failed",
      error: "回复窗口已关闭",
    });
    expect(store.getState().inbox.attachments[id].media).toBeUndefined();
  });

  it("requires a service resource id before an attachment becomes ready", async () => {
    const conversation: Conversation = {
      ...firstConversation,
      capability: {
        state: "allowed",
        kinds: ["file"],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ file }) => ({
        id: "",
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["x"], "note.txt", { type: "text/plain" }),
      ]),
    );
    const id = store.getState().inbox.drafts["conversation-a"].attachmentIds[0];
    expect(store.getState().inbox.attachments[id].status).toBe("failed");
    expect(store.getState().inbox.attachments[id].media).toBeUndefined();
  });

  it("retries the original text and attachment after switching visitors without clearing newer draft content", async () => {
    const sent: SendSubmission[] = [];
    const conversation: Conversation = {
      ...firstConversation,
      capability: {
        state: "allowed",
        kinds: ["text", "file"],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation, secondConversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ file }) => ({
        id: `prepared:${file.name}`,
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
      send: async (input) => {
        sent.push({
          clientRequestId: input.clientRequestId,
          target: input.target,
          text: input.text,
          attachments: input.attachments,
        });
        if (sent.length === 1)
          throw new DeskApiError("business", "渠道拒绝发送");
        return acceptedMessage(input);
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "原来的正文"));
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["old"], "old.txt", { type: "text/plain" }),
      ]),
    );
    await store.dispatch(sendReply("conversation-a"));
    const messageId = Object.keys(store.getState().inbox.submissions)[0];
    store.dispatch(editDraft("conversation-a", "之后编辑的正文"));
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["new"], "new.txt", { type: "text/plain" }),
      ]),
    );
    await store.dispatch(selectConversation("conversation-b"));
    await store.dispatch(retryReply(messageId));
    expect(sent[1]).toEqual(sent[0]);
    const state = store.getState().inbox;
    expect(state.activeId).toBe("conversation-b");
    expect(state.drafts["conversation-a"].text).toBe("之后编辑的正文");
    expect(
      state.drafts["conversation-a"].attachmentIds.map(
        (id) => state.attachments[id].name,
      ),
    ).toEqual(["new.txt"]);
  });

  it("releases preview resources and ignores old uploads after changing work context", async () => {
    const revokePreview = vi.fn();
    const NativeUrl = URL;
    vi.stubGlobal(
      "URL",
      class extends NativeUrl {
        static createObjectURL() {
          return "blob:http://localhost/old-context";
        }
        static revokeObjectURL = revokePreview;
      },
    );
    const pending = deferred<MediaReference>();
    const conversation: Conversation = {
      ...firstConversation,
      capability: {
        state: "allowed",
        kinds: ["image"],
        attachments: normalLimits,
      },
    };
    const store = testStore({
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async () => pending.promise,
    });
    await store.dispatch(loadConversations());
    const preparing = store.dispatch(
      addAttachments("conversation-a", [
        new File(["x"], "photo.png", { type: "image/png" }),
      ]),
    );
    store.dispatch(
      resetContext({ workspaceId: "workspace-b", agentId: "agent-b" }),
    );
    pending.resolve({
      id: "old-upload",
      kind: "image",
      name: "photo.png",
      mimeType: "image/png",
      size: 1,
    });
    await preparing;
    expect(revokePreview).toHaveBeenCalledWith(
      "blob:http://localhost/old-context",
    );
    expect(store.getState().inbox.attachments).toEqual({});
    expect(store.getState().inbox.drafts).toEqual({});
  });
});
