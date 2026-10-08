import { isTimeAfter } from "@/lib/time";
import type { ConnectionState, Conversation, SendKind } from "../types";

export function sendRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  kinds: SendKind[],
  now: string,
): string | null {
  if (!conversation) return "这段会话已不可用，请选择仍有效的会话";
  if (connection !== "connected") return "接待服务未连接，回复暂不可用";
  if (conversation.status === "closed") return "本次接待已结束";
  const capability = conversation.capability;
  if (capability.state !== "allowed")
    return (
      capability.reason ||
      (capability.state === "unknown"
        ? "渠道回复能力尚未确认"
        : "当前渠道不允许回复")
    );
  if (capability.expiresAt !== undefined) {
    const available = isTimeAfter(capability.expiresAt, now);
    if (available === null) return "渠道回复窗口尚未确认";
    if (!available) return "当前回复窗口已结束";
  }
  if (capability.remaining !== undefined && capability.remaining <= 0)
    return "当前可回复额度已用完";
  if (kinds.some((kind) => !capability.kinds.includes(kind)))
    return "当前会话不支持此类回复";
  return null;
}
