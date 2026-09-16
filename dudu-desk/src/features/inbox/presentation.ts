import type { ConversationStatus } from "./types";

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  "needs-reply": "待回复",
  waiting: "等待中",
  closed: "已结束",
};

export const queueStatuses = [
  { value: "active", label: "全部", count: "active" },
  {
    value: "needs-reply",
    label: conversationStatusLabels["needs-reply"],
    count: "needsReply",
  },
  {
    value: "waiting",
    label: conversationStatusLabels.waiting,
    count: "waiting",
  },
  { value: "closed", label: conversationStatusLabels.closed, count: "closed" },
] as const;

export const queueOrders = [
  { value: "wait", label: "等待最久" },
  { value: "messages", label: "消息最多" },
] as const;

export function queueCountLabel(count: number) {
  return count > 999 ? "999+" : String(count);
}
