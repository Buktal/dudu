import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "./api";
import { createDevelopmentFixtures, type DevelopmentFixtures } from "./mocks";
import type {
  ConnectionState,
  DeliveryState,
  InboxEvent,
  InboxMessage,
  MediaReference,
  ReplyCapability,
  RequestOptions,
  SendSubmission,
  SendTarget,
  WorkContext,
} from "./types";

type EventData<T = InboxEvent> = T extends InboxEvent
  ? Omit<T, "id" | "cursor" | "context">
  : never;
type Subscription = Parameters<InboxApi["subscribe"]>[0] & {
  checkpoint: number;
};
export type DevelopmentOperation = Exclude<
  keyof InboxApi,
  "subscribe" | "dispose"
>;
const developmentScenarioKeys = [
  "default",
  "send-rejected",
  "send-unconfirmed",
  "list-error",
  "read-error",
  "profile-error",
  "upload-error",
  "auth-expired",
  "offline",
  "empty",
] as const;
export type DevelopmentScenario = (typeof developmentScenarioKeys)[number];

export function resolveDevelopmentScenario(value: string): DevelopmentScenario {
  return (
    developmentScenarioKeys.find((scenario) => scenario === value) ?? "default"
  );
}

/** Fail-loud guard for the dev/prod seam: a typo'd scenario must not boot. */
export function isDevelopmentScenario(
  value: string,
): value is DevelopmentScenario {
  return developmentScenarioKeys.some((scenario) => scenario === value);
}

export type DevelopmentSession = DevelopmentFixtures & {
  submissions: Map<
    string,
    { submission: SendSubmission; message: InboxMessage }
  >;
  readThrough: Map<string, number>;
  receptionCapabilities: Map<string, ReplyCapability>;
  events: InboxEvent[];
  subscribers: Set<Subscription>;
  failures: Map<DevelopmentOperation, DeskApiError[]>;
  unconfirmedSend: boolean;
  uploads: Map<string, { target: SendTarget; media: MediaReference }>;
  holds: Map<DevelopmentOperation, Promise<void>[]>;
  connection: ConnectionState;
  transportOffline: boolean;
};

export function createDevelopmentDriver(
  now: () => string,
  scenario: DevelopmentScenario,
) {
  const sessions = new Map<string, DevelopmentSession>();
  const unsubscribers = new Set<() => void>();
  const releases = new Set<() => void>();
  let disposed = false;
  function session(context: WorkContext) {
    if (disposed) throw new DeskApiError("aborted", "操作已取消");
    const key = JSON.stringify([context.workspaceId, context.agentId]);
    let fixtures = sessions.get(key);
    if (!fixtures) {
      fixtures = {
        ...createDevelopmentFixtures(now()),
        submissions: new Map(),
        readThrough: new Map(),
        receptionCapabilities: new Map(),
        events: [],
        subscribers: new Set(),
        failures: new Map(),
        unconfirmedSend: scenario === "send-unconfirmed",
        uploads: new Map(),
        holds: new Map(),
        connection: scenario === "offline" ? "disconnected" : "connected",
        transportOffline: scenario === "offline",
      };
      configureDevelopmentScenario(fixtures, scenario);
      sessions.set(key, fixtures);
    }
    return fixtures;
  }

  function emit(context: WorkContext, payload: EventData) {
    const fixtures = session(context);
    const cursor = String(fixtures.events.length + 1);
    const event: InboxEvent = {
      ...structuredClone(payload),
      id: `dev-event-${cursor}`,
      context: { ...context },
      cursor,
    };
    fixtures.events.push(event);
    if (fixtures.connection !== "connected") return;
    for (const subscriber of [...fixtures.subscribers]) {
      if (!subscriber.signal.aborted) {
        subscriber.checkpoint = Number(event.cursor);
        subscriber.onEvent(structuredClone(event));
      }
    }
  }

  const subscribe: InboxApi["subscribe"] = (input) => {
    if (input.signal.aborted) return () => {};
    const fixtures = session(input.context);
    const subscriber = { ...input, checkpoint: Number(input.cursor ?? 0) };
    fixtures.subscribers.add(subscriber);
    input.onConnection(fixtures.connection);
    if (fixtures.connection === "connected") replay(fixtures, subscriber);
    const unsubscribe = () => {
      fixtures.subscribers.delete(subscriber);
      input.signal.removeEventListener("abort", unsubscribe);
      unsubscribers.delete(unsubscribe);
    };
    unsubscribers.add(unsubscribe);
    input.signal.addEventListener("abort", unsubscribe, { once: true });
    return unsubscribe;
  };

  const controls = {
    connection(context: WorkContext, state: ConnectionState) {
      const fixtures = session(context);
      fixtures.connection = state;
      if (state === "connected") fixtures.transportOffline = false;
      for (const subscriber of [...fixtures.subscribers]) {
        if (subscriber.signal.aborted) continue;
        subscriber.onConnection(state);
        if (state === "connected") replay(fixtures, subscriber);
      }
    },
    replay(context: WorkContext, cursor: string) {
      const fixtures = session(context);
      const event = fixtures.events.find((item) => item.cursor === cursor);
      if (!event || fixtures.connection !== "connected") return;
      for (const subscriber of [...fixtures.subscribers]) {
        if (!subscriber.signal.aborted)
          subscriber.onEvent(structuredClone(event));
      }
    },
    capability(
      context: WorkContext,
      conversationId: string,
      capability: ReplyCapability,
    ) {
      const fixtures = session(context);
      const conversation = findDevelopmentConversation(
        fixtures,
        conversationId,
      );
      conversation.capability = structuredClone(capability);
      if (conversation.status === "closed")
        fixtures.receptionCapabilities.set(
          conversationId,
          structuredClone(capability),
        );
      conversation.version += 1;
      emit(context, {
        type: "capability",
        conversationId,
        capability,
        version: conversation.version,
      });
    },
    remove(context: WorkContext, conversationId: string) {
      const fixtures = session(context);
      const conversation = findDevelopmentConversation(
        fixtures,
        conversationId,
      );
      fixtures.conversations = fixtures.conversations.filter(
        (item) => item.id !== conversationId,
      );
      delete fixtures.messages[conversationId];
      delete fixtures.profiles[conversationId];
      fixtures.receptionCapabilities.delete(conversationId);
      emit(context, {
        type: "removed",
        conversationId,
        version: conversation.version + 1,
      });
    },
    failNext(
      context: WorkContext,
      operation: DevelopmentOperation,
      failure: DeskApiError,
    ) {
      const fixtures = session(context);
      fixtures.failures.set(operation, [
        ...(fixtures.failures.get(operation) ?? []),
        failure,
      ]);
    },
    holdNext(context: WorkContext, operation: DevelopmentOperation) {
      const fixtures = session(context);
      let resolveGate = () => {};
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
      const release = () => {
        releases.delete(release);
        resolveGate();
      };
      releases.add(release);
      fixtures.holds.set(operation, [
        ...(fixtures.holds.get(operation) ?? []),
        gate,
      ]);
      return release;
    },
    receive(context: WorkContext, conversationId: string, text: string) {
      const fixtures = session(context);
      const conversation = findDevelopmentConversation(
        fixtures,
        conversationId,
      );
      const messages = fixtures.messages[conversationId];
      const sequence = messages.length + 1;
      const message: InboxMessage = {
        id: `${conversationId}-incoming-${sequence}`,
        conversationId,
        direction: "incoming",
        body: { type: "text", text },
        createdAt: now(),
        sequence,
        version: 1,
      };
      messages.push(message);
      const capability = fixtures.receptionCapabilities.get(conversationId);
      if (capability) conversation.capability = capability;
      fixtures.receptionCapabilities.delete(conversationId);
      conversation.unread += 1;
      if (conversation.status !== "needs-reply" || !conversation.waitingSince)
        conversation.waitingSince = message.createdAt;
      conversation.messageCount = messages.length;
      conversation.status = "needs-reply";
      conversation.preview = text;
      conversation.updatedAt = message.createdAt;
      conversation.version += 1;
      emit(context, { type: "message", message });
      emit(context, { type: "conversation", conversation });
      return structuredClone(message);
    },
    receipt(
      context: WorkContext,
      input: {
        conversationId: string;
        messageId: string;
        state: DeliveryState;
        reason?: string;
      },
    ) {
      const fixtures = session(context);
      const message = fixtures.messages[input.conversationId]?.find(
        (item) => item.id === input.messageId,
      );
      if (!message) throw new DeskApiError("business", "消息不存在", 13004);
      message.version += 1;
      message.delivery = { state: input.state, reason: input.reason };
      emit(context, {
        type: "receipt",
        conversationId: message.conversationId,
        messageId: message.id,
        clientRequestId: message.clientRequestId,
        version: message.version,
        delivery: message.delivery,
      });
    },
  };

  return {
    session,
    emit,
    subscribe,
    controls,
    dispose() {
      disposed = true;
      for (const unsubscribe of [...unsubscribers]) unsubscribe();
      for (const release of [...releases]) release();
      sessions.clear();
    },
    async request(
      { context, signal }: RequestOptions,
      operation: DevelopmentOperation,
    ) {
      if (signal.aborted) throw new DeskApiError("aborted", "操作已取消");
      const fixtures = session(context);
      await waitForDevelopmentGate(
        fixtures.holds.get(operation)?.shift() ?? Promise.resolve(),
        signal,
      );
      if (signal.aborted || disposed)
        throw new DeskApiError("aborted", "操作已取消");
      if (fixtures.transportOffline)
        throw new DeskApiError("network", "网络连接已断开");
      const failure = fixtures.failures.get(operation)?.shift();
      if (failure) throw failure;
      return fixtures;
    },
  };
}

function configureDevelopmentScenario(
  fixtures: DevelopmentSession,
  scenario: DevelopmentScenario,
) {
  const failures: Partial<
    Record<DevelopmentScenario, [DevelopmentOperation, DeskApiError]>
  > = {
    "send-rejected": [
      "send",
      new DeskApiError(
        "business",
        "渠道拒绝了本次回复，可保留内容后重试",
        14001,
      ),
    ],
    "list-error": [
      "listConversations",
      new DeskApiError("network", "会话列表暂时读取失败"),
    ],
    "read-error": [
      "listMessages",
      new DeskApiError("network", "消息历史暂时读取失败"),
    ],
    "profile-error": [
      "readProfile",
      new DeskApiError("network", "来访资料暂时读取失败"),
    ],
    "upload-error": [
      "prepareAttachment",
      new DeskApiError("network", "附件上传中断，请重试"),
    ],
    "auth-expired": [
      "listConversations",
      new DeskApiError("authentication", "登录已过期", 10101),
    ],
  };
  const failure = failures[scenario];
  if (failure) fixtures.failures.set(failure[0], [failure[1]]);
  if (scenario === "empty") {
    fixtures.conversations = [];
    fixtures.messages = {};
    fixtures.profiles = {};
  }
}

function replay(fixtures: DevelopmentSession, subscriber: Subscription) {
  for (const event of [...fixtures.events]) {
    if (subscriber.signal.aborted) return;
    if (Number(event.cursor) > subscriber.checkpoint) {
      subscriber.checkpoint = Number(event.cursor);
      subscriber.onEvent(structuredClone(event));
    }
  }
}

function waitForDevelopmentGate(
  gate: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DeskApiError("aborted", "操作已取消"));
    };
    signal.addEventListener("abort", abort, { once: true });
    gate.then(() => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) abort();
      else resolve();
    });
    if (signal.aborted) abort();
  });
}

export function findDevelopmentConversation(
  fixtures: DevelopmentFixtures,
  id: string,
) {
  const conversation = fixtures.conversations.find((item) => item.id === id);
  if (!conversation) throw new DeskApiError("business", "会话已失效", 13004);
  return conversation;
}
