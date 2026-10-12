import type { ConnectionState } from "./types";

/**
 * Desk 实时通道（契约第 5 节）：连接 /ws/desk 后先发 auth 报文，收到 ready 才报告
 * connected 并接收业务报文；error 报文按登录状态无效上报 unavailable 并关闭。
 * 没有 eventId、ack 或持久游标，断线只上报状态，重连刷新由上层流程负责。
 * token 由账户适配器写入会话后在此读取，不进入 store 或 UI。
 */
export type DeskSocket = Pick<
  WebSocket,
  "send" | "close" | "onopen" | "onmessage" | "onerror" | "onclose"
>;

export type DeskSocketInput = {
  /** 解析后的 API 源地址；开发为空串表示同源（Vite 代理 /ws）。 */
  origin: string;
  token: string;
  signal: AbortSignal;
  onState: (state: ConnectionState) => void;
  onFrame: (frame: unknown) => void;
  /** 测试注入的 WebSocket 替身；生产使用浏览器 WebSocket。 */
  socket?: (url: string) => DeskSocket;
};

/** 开发同源（由 Vite 代理转发），生产指向构建注入的源地址；协议随页面地址升级到 wss。 */
export function deskSocketUrl(origin: string): string {
  const target = origin
    ? new URL(origin)
    : new URL(`${location.protocol}//${location.host}`);
  return `${target.protocol === "https:" ? "wss:" : "ws:"}//${target.host}/ws/desk`;
}

export function subscribeDeskSocket(input: DeskSocketInput): () => void {
  const open = input.socket ?? ((url: string) => new WebSocket(url));
  const socket = open(deskSocketUrl(input.origin));
  let cancelled = false;
  let authFailed = false;
  let last: ConnectionState | null = null;

  const report = (state: ConnectionState) => {
    if (cancelled || state === last) return;
    last = state;
    input.onState(state);
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    try {
      socket.close();
    } catch {
      /* 已关闭或环境不支持时忽略。 */
    }
  };

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "auth", token: input.token }));
  };
  socket.onmessage = (event) => {
    const frame = parseFrame(event.data);
    if (frame === undefined) return;
    const type =
      typeof frame === "object" && frame !== null && "type" in frame
        ? (frame as { type?: unknown }).type
        : undefined;
    if (type === "ready") {
      report("connected");
      return;
    }
    if (type === "error") {
      authFailed = true;
      report("unavailable");
      cancel();
      return;
    }
    // 未认证不订阅业务数据；非报文帧（心跳等）与未知类型直接忽略
    if (last !== "connected") return;
    input.onFrame(frame);
  };
  socket.onerror = () => report("disconnected");
  socket.onclose = () => {
    // 认证失败的关闭不覆盖 unavailable 状态
    if (!authFailed) report("disconnected");
  };
  input.signal.addEventListener("abort", cancel, { once: true });

  return () => {
    input.signal.removeEventListener("abort", cancel);
    cancel();
  };
}

function parseFrame(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}
