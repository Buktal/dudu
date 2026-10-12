import { beforeEach, describe, expect, it, vi } from "vitest";
import { DESK_SESSION_KEY } from "@/lib/desk-session";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  type DeskSocket,
  deskSocketUrl,
  subscribeDeskSocket,
} from "./inbox-live-socket";
import type { ConnectionState, InboxEvent } from "./types";

const ORIGIN = "https://desk.example.test";
const CONTEXT = { agentId: "agent-a", workspaceId: "workspace-a" };

// 独立于实现写出的会话报文：结束接待后服务端保存的 closed 会话
const SERVER_CONVERSATION = {
  id: "41",
  identity: {
    id: "41",
    externalUserId: "external-a",
    channelId: "wechat",
    channelName: "微信",
    accountId: "51",
    accountName: "公众号",
  },
  status: "closed",
  preview: "还想问问保修",
  updatedAt: "2026-10-12 09:40:00",
  messageCount: 36,
  version: 4,
  capability: { state: "restricted", kinds: [] },
};

class FakeSocket {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  receive(frame: unknown) {
    this.onmessage?.({
      data: typeof frame === "string" ? frame : JSON.stringify(frame),
    });
  }

  drop() {
    this.onclose?.();
  }
}

// 独立于实现写出的名片报文：渠道资料三态与共享标签/备注
const SERVER_PROFILE = {
  conversationId: "41",
  version: 3,
  fields: [
    { label: "备注名", value: { state: "available", value: "张先生" } },
    { label: "手机", value: { state: "empty" } },
    { label: "公司", value: { state: "not-provided" } },
  ],
  tags: ["重点客户", "VIP"],
  note: "记得跟进\n已下单",
};

function fakeSocket(): FakeSocket {
  return new FakeSocket();
}

function subscribeWith(
  socket: FakeSocket,
  input: { signal?: AbortSignal; onFrame?: () => void } = {},
) {
  const states: ConnectionState[] = [];
  const unsubscribe = subscribeDeskSocket({
    origin: ORIGIN,
    token: "stored-token",
    signal: input.signal ?? new AbortController().signal,
    onState: (state) => states.push(state),
    onFrame: () => input.onFrame?.(),
    socket: () => socket as unknown as DeskSocket,
  });
  return { states, unsubscribe };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("desk live socket protocol", () => {
  it("builds the socket url from the resolved origin", () => {
    expect(deskSocketUrl("https://desk.example.test")).toBe(
      "wss://desk.example.test/ws/desk",
    );
    // 开发同源（Vite 代理 /ws）
    expect(deskSocketUrl("")).toBe(`ws://${location.host}/ws/desk`);
  });

  it("sends the auth frame on open and reports connected only after ready", () => {
    const socket = fakeSocket();
    const onFrame = vi.fn();
    const { states } = subscribeWith(socket, { onFrame });

    socket.open();
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "auth", token: "stored-token" }),
    ]);
    expect(states).toEqual([]);

    // 未就绪的业务报文不进入上层
    socket.receive({ type: "message", message: {} });
    expect(onFrame).not.toHaveBeenCalled();

    socket.receive({ type: "ready" });
    expect(states).toEqual(["connected"]);
  });

  it("reports unavailable and closes when the server rejects the token", () => {
    const socket = fakeSocket();
    const { states } = subscribeWith(socket);

    socket.receive({
      type: "error",
      code: 10102,
      msg: "登录状态无效，请重新登录",
    });
    expect(states).toEqual(["unavailable"]);
    expect(socket.closed).toBe(true);

    // 认证失败后的关闭不覆盖 unavailable 状态
    socket.drop();
    expect(states).toEqual(["unavailable"]);
  });

  it("ignores malformed frames and reports a dropped connection after ready", () => {
    const socket = fakeSocket();
    const onFrame = vi.fn();
    const { states } = subscribeWith(socket, { onFrame });

    socket.receive({ type: "ready" });
    socket.receive("not json");
    socket.receive({ type: "conversation" });
    expect(onFrame).toHaveBeenCalledTimes(1);

    socket.drop();
    expect(states).toEqual(["connected", "disconnected"]);
  });

  it("closes the socket when the subscription is released", () => {
    const socket = fakeSocket();
    const controller = new AbortController();
    const { unsubscribe } = subscribeWith(socket, {
      signal: controller.signal,
    });

    controller.abort();
    expect(socket.closed).toBe(true);
    unsubscribe();
    expect(socket.closed).toBe(true);
  });

  it("reports a failed connect without a ready frame", () => {
    const socket = fakeSocket();
    const { states } = subscribeWith(socket);

    socket.drop();
    expect(states).toEqual(["disconnected"]);
  });
});

describe("http inbox live subscription", () => {
  function seed(token: string) {
    sessionStorage.setItem(
      DESK_SESSION_KEY,
      JSON.stringify({ origin: ORIGIN, token }),
    );
  }

  it("connects with the stored credential and maps message frames to inbox events", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const open = vi.fn(() => socket as unknown as DeskSocket);
    const api = createHttpInboxApi({ origin: ORIGIN, socket: open });
    const states: ConnectionState[] = [];
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: (state) => states.push(state),
      onEvent: (event) => events.push(event),
    });

    expect(open).toHaveBeenCalledWith("wss://desk.example.test/ws/desk");
    socket.open();
    socket.receive({ type: "ready" });
    socket.receive({
      type: "message",
      message: {
        id: "9001",
        conversationId: "41",
        direction: "incoming",
        body: { type: "text", text: "还想问问保修" },
        createdAt: "2026-10-12 09:36:00",
        sequence: 36,
        version: 1,
      },
      conversation: {
        id: "41",
        identity: {
          id: "41",
          externalUserId: "external-a",
          channelId: "wechat",
          channelName: "微信",
          accountId: "51",
          accountName: "公众号",
        },
        status: "needs-reply",
        preview: "还想问问保修",
        updatedAt: "2026-10-12 09:36:00",
        waitingSince: "2026-10-12 09:36:00",
        messageCount: 36,
        version: 2,
        capability: { state: "restricted", kinds: [] },
      },
    });

    expect(states).toEqual(["connected"]);
    expect(events).toEqual([
      {
        type: "message",
        context: CONTEXT,
        message: {
          id: "9001",
          conversationId: "41",
          direction: "incoming",
          body: { type: "text", text: "还想问问保修" },
          createdAt: "2026-10-12 09:36:00",
          sequence: 36,
          version: 1,
        },
        conversation: expect.objectContaining({
          id: "41",
          preview: "还想问问保修",
          messageCount: 36,
          version: 2,
          unread: 0,
        }),
      },
    ]);
  });

  it("drops an incomplete message frame without breaking the connection", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const api = createHttpInboxApi({
      origin: ORIGIN,
      socket: () => socket as unknown as DeskSocket,
    });
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: () => {},
      onEvent: (event) => events.push(event),
    });
    socket.receive({ type: "ready" });
    socket.receive({ type: "message", message: { id: "9001" } });
    expect(events).toEqual([]);
  });

  it("maps a live message frame with a non-text body exactly like history", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const api = createHttpInboxApi({
      origin: ORIGIN,
      socket: () => socket as unknown as DeskSocket,
    });
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: () => {},
      onEvent: (event) => events.push(event),
    });
    socket.receive({ type: "ready" });
    socket.receive({
      type: "message",
      message: {
        id: "9003",
        conversationId: "41",
        direction: "incoming",
        body: {
          type: "image",
          media: {
            kind: "image",
            id: "MEDIA_IMAGE",
            url: "https://mmbiz.qpic.cn/pic",
          },
        },
        createdAt: "2026-10-12 09:38:00",
        sequence: 38,
        version: 1,
      },
    });

    // 实时与历史共用同一消息体解析：可选字段缺失时省略，不填假值
    expect(events).toEqual([
      {
        type: "message",
        context: CONTEXT,
        message: {
          id: "9003",
          conversationId: "41",
          direction: "incoming",
          body: {
            type: "image",
            media: {
              kind: "image",
              id: "MEDIA_IMAGE",
              url: "https://mmbiz.qpic.cn/pic",
            },
          },
          createdAt: "2026-10-12 09:38:00",
          sequence: 38,
          version: 1,
        },
        conversation: undefined,
      },
    ]);
  });

  it("maps conversation frames to conversation events and drops malformed ones", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const api = createHttpInboxApi({
      origin: ORIGIN,
      socket: () => socket as unknown as DeskSocket,
    });
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: () => {},
      onEvent: (event) => events.push(event),
    });
    socket.receive({ type: "ready" });
    socket.receive({ type: "conversation", conversation: SERVER_CONVERSATION });
    // 不完整的 conversation 帧与其他报文类型不产生事件，连接不受影响
    socket.receive({ type: "conversation" });
    socket.receive({ type: "profile", profile: { conversationId: "41" } });

    expect(events).toEqual([
      {
        type: "conversation",
        context: CONTEXT,
        conversation: expect.objectContaining({
          id: "41",
          status: "closed",
          version: 4,
          unread: 0,
        }),
      },
    ]);
  });

  it("maps a profile frame to a profile event with all three channel field states", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const api = createHttpInboxApi({
      origin: ORIGIN,
      socket: () => socket as unknown as DeskSocket,
    });
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: () => {},
      onEvent: (event) => events.push(event),
    });
    socket.receive({ type: "ready" });
    socket.receive({ type: "profile", profile: SERVER_PROFILE });

    expect(events).toEqual([
      {
        type: "profile",
        context: CONTEXT,
        // 三态渠道资料原样进入事件，不猜测缺失项
        profile: {
          conversationId: "41",
          version: 3,
          fields: [
            { label: "备注名", value: { state: "available", value: "张先生" } },
            { label: "手机", value: { state: "empty" } },
            { label: "公司", value: { state: "not-provided" } },
          ],
          tags: ["重点客户", "VIP"],
          note: "记得跟进\n已下单",
        },
      },
    ]);
  });

  it("maps an access-changed frame to a workspace reload event", () => {
    seed("stored-token");
    const socket = fakeSocket();
    const api = createHttpInboxApi({
      origin: ORIGIN,
      socket: () => socket as unknown as DeskSocket,
    });
    const events: InboxEvent[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: () => {},
      onEvent: (event) => events.push(event),
    });
    socket.receive({ type: "ready" });
    socket.receive({ type: "access-changed" });

    // 报文只有类型：事件不带任何快照，重查由工作区完成
    expect(events).toEqual([{ type: "access-changed", context: CONTEXT }]);
  });

  it("stays unavailable without a stored credential and opens no socket", () => {
    const open = vi.fn();
    const api = createHttpInboxApi({ origin: ORIGIN, socket: open });
    const states: ConnectionState[] = [];

    api.subscribe({
      context: CONTEXT,
      signal: new AbortController().signal,
      onConnection: (state) => states.push(state),
      onEvent: () => {},
    });

    expect(states).toEqual(["unavailable"]);
    expect(open).not.toHaveBeenCalled();
  });
});
