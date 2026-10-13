import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DeskSocket,
  deskSocketUrl,
  subscribeDeskSocket,
} from "./inbox-live-socket";
import { FakeSocket, ORIGIN } from "./inbox-live-test-support";
import type { ConnectionState } from "./types";

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
    const socket = new FakeSocket();
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
    const socket = new FakeSocket();
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
    const socket = new FakeSocket();
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
    const socket = new FakeSocket();
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
    const socket = new FakeSocket();
    const { states } = subscribeWith(socket);

    socket.drop();
    expect(states).toEqual(["disconnected"]);
  });
});

describe("desk live socket reconnect", () => {
  function openedSockets() {
    const sockets: FakeSocket[] = [];
    const states: ConnectionState[] = [];
    const unsubscribe = subscribeDeskSocket({
      origin: ORIGIN,
      token: "stored-token",
      signal: new AbortController().signal,
      onState: (state) => states.push(state),
      onFrame: () => {},
      socket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as DeskSocket;
      },
    });
    return { sockets, states, unsubscribe };
  }

  it("reopens a dropped connection with backoff and reports reconnecting until ready", () => {
    vi.useFakeTimers();
    try {
      const { sockets, states } = openedSockets();
      sockets[0].open();
      sockets[0].receive({ type: "ready" });
      expect(states).toEqual(["connected"]);

      sockets[0].drop();
      expect(states).toEqual(["connected", "disconnected"]);

      // 首次重试在 1 秒后，重试期间上报 reconnecting
      vi.advanceTimersByTime(1000);
      expect(sockets).toHaveLength(2);
      expect(states).toEqual(["connected", "disconnected", "reconnecting"]);

      // 重试仍失败：下一次等待翻倍
      sockets[1].open();
      sockets[1].drop();
      vi.advanceTimersByTime(1999);
      expect(sockets).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(3);

      // 新连接重新认证，ready 后恢复 connected 并重置退避
      sockets[2].open();
      expect(sockets[2].sent).toEqual([
        JSON.stringify({ type: "auth", token: "stored-token" }),
      ]);
      sockets[2].receive({ type: "ready" });
      expect(states).toEqual([
        "connected",
        "disconnected",
        "reconnecting",
        "disconnected",
        "reconnecting",
        "connected",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying when the token is rejected or the subscription is released", () => {
    vi.useFakeTimers();
    try {
      const rejected = openedSockets();
      rejected.sockets[0].receive({
        type: "error",
        code: 10102,
        msg: "登录状态无效，请重新登录",
      });
      vi.advanceTimersByTime(60_000);
      expect(rejected.sockets).toHaveLength(1);
      expect(rejected.states).toEqual(["unavailable"]);
      rejected.unsubscribe();

      // 释放订阅后不再重连：在途的重试计时一并取消
      const controller = new AbortController();
      const sockets: FakeSocket[] = [];
      subscribeDeskSocket({
        origin: ORIGIN,
        token: "stored-token",
        signal: controller.signal,
        onState: () => {},
        onFrame: () => {},
        socket: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket as unknown as DeskSocket;
        },
      });
      sockets[0].drop();
      controller.abort();
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(1);
      expect(sockets[0].closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
