import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { fullTime, messageTime } from "@/lib/time";
import type { DeliveryState, InboxMessage } from "../types";
import { MessageBody } from "./message-body";

export const deliveryLabels: Record<DeliveryState, string> = {
  sending: "发送中",
  accepted: "已受理",
  sent: "已发出",
  delivered: "已送达",
  read: "已读",
  failed: "发送失败",
  unconfirmed: "结果未确认",
};

export function MessageView({
  message,
  onRetry,
}: {
  message: InboxMessage;
  onRetry?: () => void;
}) {
  const outgoing = message.direction === "outgoing";
  return (
    <Message align={outgoing ? "end" : "start"} className="px-5 py-2.5">
      <MessageContent>
        <Bubble
          variant={outgoing ? "secondary" : "outline"}
          align={outgoing ? "end" : "start"}
          className="max-w-[88%]"
        >
          <BubbleContent className="rounded-2xl">
            <MessageBody body={message.body} />
          </BubbleContent>
        </Bubble>
        <MessageFooter className="flex-wrap gap-2 text-[10px] font-normal">
          <time
            dateTime={message.createdAt}
            title={fullTime(message.createdAt)}
          >
            {messageTime(message.createdAt)}
          </time>
          {message.delivery && (
            <span
              className={
                message.delivery.state === "failed"
                  ? "text-destructive"
                  : undefined
              }
              title={message.delivery.reason}
            >
              {deliveryLabels[message.delivery.state]}
            </span>
          )}
          {message.delivery?.state === "failed" && onRetry && (
            <Button size="xs" variant="ghost" onClick={onRetry}>
              重试原消息
            </Button>
          )}
          {message.delivery?.state === "unconfirmed" && (
            <span>请等待回执，避免重复发送</span>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
