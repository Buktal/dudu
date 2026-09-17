import { isEqual } from "lodash-es";
import { DeskApiError } from "@/lib/api-response";
import { nowIso } from "@/lib/time";
import type { InboxApi } from "./api";
import {
  attachmentBatchRestriction,
  attachmentKind,
  attachmentRestriction,
} from "./attachment-rules";
import {
  compareConversations,
  matchesConversationFilters,
  matchesConversationText,
} from "./conversation-query";
import {
  createDevelopmentDriver,
  findDevelopmentConversation as findConversation,
  isDevelopmentScenario,
  resolveDevelopmentScenario,
} from "./development-scenarios";
import { messageSummary } from "./message-text";
import type { InboxMessage, MediaReference, SendTarget } from "./types";

export { isDevelopmentScenario };

/**
 * Development inbox adapter (dev-only, never ships): method semantics over
 * the driver below. Every method opens with the session gate, so holds,
 * offline, injected failures and disposal behave identically across methods.
 * Kept separate from the driver because merging would breach the single-file
 * line limit; the seam is state-behind-gates (driver) vs method semantics.
 */
export function createDevelopmentInboxApi({
  now = nowIso,
  scenario = "default",
}: {
  now?: () => string;
  scenario?: string;
} = {}) {
  const driver = createDevelopmentDriver(
    now,
    resolveDevelopmentScenario(scenario),
  );
  const session = driver.request;
  return {
    controls: driver.controls,
    dispose: driver.dispose,
    api: {
      dispose: driver.dispose,
      listConversations: async (input) => {
        const fixtures = await session(input, "listConversations");
        const { cursor, query } = input;
        const start = Number(cursor ?? 0);
        const items = fixtures.conversations.filter(
          (conversation) =>
            matchesConversationFilters(conversation, query) &&
            matchesConversationText(conversation, query.search, [
              ...(fixtures.profiles[conversation.id]?.tags ?? []),
              ...fixtures.messages[conversation.id].map((message) =>
                messageSummary(message.body),
              ),
            ]),
        );
        items.sort(compareConversations(query.order));
        const all = fixtures.conversations;
        return {
          items: structuredClone(items.slice(start, start + 12)),
          nextCursor: start + 12 < items.length ? String(start + 12) : null,
          total: items.length,
          counts: {
            active: all.filter((item) => item.status !== "closed").length,
            needsReply: all.filter((item) => item.status === "needs-reply")
              .length,
            waiting: all.filter((item) => item.status === "waiting").length,
            closed: all.filter((item) => item.status === "closed").length,
            starred: all.filter((item) => item.starred).length,
          },
          channels: Array.from(
            new Map(
              all.map(({ identity }) => [
                identity.channelId,
                identity.channelName,
              ]),
            ),
            ([id, name]) => ({ id, name }),
          ),
        };
      },
      listMessages: async (input) => {
        const fixtures = await session(input, "listMessages");
        const { conversationId, cursor } = input;
        const messages = fixtures.messages[conversationId];
        if (!messages) throw new DeskApiError("business", "会话已失效", 13004);
        const end = Number(cursor ?? messages.length);
        const start = Math.max(0, end - 20);
        return {
          items: structuredClone(messages.slice(start, end)),
          nextCursor: start > 0 ? String(start) : null,
        };
      },
      readProfile: async (input) => {
        const fixtures = await session(input, "readProfile");
        const { conversationId } = input;
        const profile = fixtures.profiles[conversationId];
        if (!profile) throw new DeskApiError("business", "会话已失效", 13004);
        return structuredClone(profile);
      },
      getCapability: async (input) => {
        const fixtures = await session(input, "getCapability");
        return structuredClone(
          findConversation(fixtures, input.conversationId).capability,
        );
      },
      markRead: async (input) => {
        const fixtures = await session(input, "markRead");
        const conversation = findConversation(fixtures, input.conversationId);
        const incoming = fixtures.messages[conversation.id].filter(
          (message) => message.direction === "incoming",
        );
        const previous =
          fixtures.readThrough.get(conversation.id) ??
          incoming[incoming.length - conversation.unread - 1]?.sequence ??
          0;
        const through = Math.max(previous, input.throughSequence);
        fixtures.readThrough.set(conversation.id, through);
        conversation.unread = incoming.filter(
          (message) => message.sequence > through,
        ).length;
        conversation.version += 1;
        driver.emit(input.context, { type: "conversation", conversation });
        return structuredClone(conversation);
      },
      setStarred: async (input) => {
        const fixtures = await session(input, "setStarred");
        const conversation = findConversation(fixtures, input.conversationId);
        conversation.starred = input.starred;
        conversation.version += 1;
        driver.emit(input.context, { type: "conversation", conversation });
        return structuredClone(conversation);
      },
      endConversation: async (input) => {
        const fixtures = await session(input, "endConversation");
        const conversation = findConversation(fixtures, input.conversationId);
        if (conversation.status === "closed")
          return structuredClone(conversation);
        fixtures.receptionCapabilities.set(
          conversation.id,
          structuredClone(conversation.capability),
        );
        conversation.status = "closed";
        conversation.capability = {
          state: "restricted",
          kinds: [],
          reason: "会话已结束",
          nextStep: "等待来访用户重新发起咨询",
        };
        conversation.version += 1;
        driver.emit(input.context, { type: "conversation", conversation });
        return structuredClone(conversation);
      },
      resumeConversation: async (input) => {
        const fixtures = await session(input, "resumeConversation");
        const conversation = findConversation(fixtures, input.conversationId);
        if (conversation.status !== "closed")
          return structuredClone(conversation);
        const capability = fixtures.receptionCapabilities.get(conversation.id);
        if (capability) conversation.capability = capability;
        fixtures.receptionCapabilities.delete(conversation.id);
        conversation.status = "needs-reply";
        conversation.waitingSince ??= now();
        conversation.version += 1;
        driver.emit(input.context, { type: "conversation", conversation });
        return structuredClone(conversation);
      },
      saveProfile: async (input) => {
        const fixtures = await session(input, "saveProfile");
        const profile = fixtures.profiles[input.conversationId];
        if (!profile) throw new DeskApiError("business", "会话已失效", 13004);
        if (input.version !== profile.version) {
          throw new DeskApiError(
            "business",
            "资料已更新，请重新读取后再保存",
            13009,
          );
        }
        profile.note = input.note;
        profile.tags = [
          ...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
        ];
        profile.version += 1;
        return structuredClone(profile);
      },
      prepareAttachment: async (input) => {
        const fixtures = await session(input, "prepareAttachment");
        const conversation = findConversation(
          fixtures,
          input.target.conversationId,
        );
        checkTarget(conversation.identity, input.target);
        const { file } = input;
        const kind = attachmentKind(file.type);
        const restriction = attachmentRestriction(
          conversation,
          "connected",
          { name: file.name, size: file.size, mimeType: file.type },
          1,
          now(),
        );
        if (restriction) throw new DeskApiError("business", restriction, 14002);
        const url = await readDevelopmentFile(file, input.signal);
        const media: MediaReference = {
          id: `dev-upload-${fixtures.uploads.size + 1}`,
          kind,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          url,
        };
        fixtures.uploads.set(media.id, {
          target: structuredClone(input.target),
          media,
        });
        return structuredClone(media);
      },
      send: async (input) => {
        const fixtures = await session(input, "send");
        const { clientRequestId, target, text, attachments } = input;
        const submission = { clientRequestId, target, text, attachments };
        const previous = fixtures.submissions.get(clientRequestId);
        if (previous) {
          if (!isEqual(previous.submission, submission)) {
            throw new DeskApiError(
              "business",
              "同一次发送不能更换目标或内容",
              13009,
            );
          }
          return structuredClone(previous.message);
        }
        const conversation = findConversation(fixtures, target.conversationId);
        checkTarget(conversation.identity, target);
        if (
          conversation.status === "closed" ||
          conversation.capability.state !== "allowed"
        ) {
          throw new DeskApiError(
            "business",
            conversation.capability.reason ?? "当前会话暂不允许回复",
            14001,
          );
        }
        if (
          (!text.trim() && !attachments.length) ||
          (text.trim() && !conversation.capability.kinds.includes("text")) ||
          attachments.some(
            (item) => !conversation.capability.kinds.includes(item.kind),
          )
        ) {
          throw new DeskApiError(
            "business",
            "当前渠道不支持这类回复内容",
            14002,
          );
        }
        const attachmentRestriction = attachmentBatchRestriction(
          conversation,
          "connected",
          attachments,
          now(),
        );
        if (attachmentRestriction)
          throw new DeskApiError("business", attachmentRestriction, 14002);
        if (
          attachments.some((attachment) => {
            const prepared = fixtures.uploads.get(attachment.id);
            return (
              !prepared ||
              !isEqual(prepared.target, target) ||
              !isEqual(prepared.media, attachment)
            );
          })
        ) {
          throw new DeskApiError(
            "business",
            "附件尚未就绪或不属于当前回复目标",
            14002,
          );
        }
        const messages = fixtures.messages[conversation.id];
        const sequence = messages.length + 1;
        const message: InboxMessage = {
          id: `${conversation.id}-sent-${sequence}`,
          serverId: `${conversation.id}-sent-${sequence}`,
          clientRequestId,
          conversationId: conversation.id,
          direction: "outgoing",
          body: attachments.length
            ? { type: "reply", text, attachments: structuredClone(attachments) }
            : { type: "text", text },
          createdAt: now(),
          sequence,
          version: 1,
          delivery: { state: "accepted" },
        };
        messages.push(message);
        fixtures.submissions.set(clientRequestId, {
          submission: structuredClone(submission),
          message,
        });
        conversation.status = "waiting";
        delete conversation.waitingSince;
        conversation.messageCount = messages.length;
        conversation.preview = text || "[附件]";
        conversation.updatedAt = message.createdAt;
        conversation.version += 1;
        if (fixtures.unconfirmedSend) {
          fixtures.unconfirmedSend = false;
          throw new DeskApiError(
            "network",
            "发送结果暂未确认，请稍后查看发送状态",
          );
        }
        driver.emit(input.context, { type: "message", message });
        driver.emit(input.context, { type: "conversation", conversation });
        return structuredClone(message);
      },
      subscribe: driver.subscribe,
    } satisfies InboxApi,
  };
}

function checkTarget(
  identity: {
    id: string;
    externalUserId: string;
    channelId: string;
    accountId: string;
  },
  target: SendTarget,
) {
  if (
    target.visitorId !== identity.id ||
    target.externalUserId !== identity.externalUserId ||
    target.channelId !== identity.channelId ||
    target.accountId !== identity.accountId
  ) {
    throw new DeskApiError(
      "business",
      "回复目标身份不一致，请重新选择会话",
      13004,
    );
  }
}

function readDevelopmentFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      reader.abort();
      cleanup();
      reject(new DeskApiError("aborted", "操作已取消"));
    };
    reader.onload = () => {
      cleanup();
      if (signal.aborted) reject(new DeskApiError("aborted", "操作已取消"));
      else if (typeof reader.result === "string") resolve(reader.result);
      else reject(new DeskApiError("invalid-response", "无法读取附件"));
    };
    reader.onerror = () => {
      cleanup();
      reject(new DeskApiError("business", "无法读取附件，请重新选择", 11001));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else reader.readAsDataURL(file);
  });
}
