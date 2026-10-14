import type { ConnectionState, Conversation, SendKind } from "../types";

/**
 * 服务端能力只有两态（DeskConversationViews.capability）：可发 allowed+["text"]，
 * 受限 restricted 带原因文案。受限但缺文案时回落到通用提示，不猜其他形态。
 */
export function sendRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  kinds: SendKind[],
): string | null {
  if (!conversation) return "这段会话已不可用，请选择仍有效的会话";
  if (connection !== "connected") return "接待服务未连接，回复暂不可用";
  if (conversation.status === "closed") return "本次接待已结束";
  const capability = conversation.capability;
  if (capability.state !== "allowed")
    return capability.reason || "当前渠道不允许回复";
  if (kinds.some((kind) => !capability.kinds.includes(kind)))
    return "当前会话不支持此类回复";
  return null;
}
