import { Check, CheckCheck, RotateCcw } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { fullTime, messageTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DeliveryState, InboxMessage, VisitorIdentity } from "../types";
import { VisitorAvatar } from "./identity";
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
  identity,
  onRetry,
}: {
  message: InboxMessage;
  identity?: VisitorIdentity;
  onRetry?: () => void;
}) {
  const outgoing = message.direction === "outgoing";
  return (
    <Message
      align={outgoing ? "end" : "start"}
      className="items-start gap-2.5 pb-[15px] [--message-shadow:0_2px_6px_color-mix(in_srgb,light-dark(var(--foreground),var(--background))_2%,transparent)]"
    >
      {message.direction === "incoming" && identity && (
        <VisitorAvatar
          identity={identity}
          size="small"
          badge={false}
          className="mt-px max-[760px]:hidden"
        />
      )}
      <MessageContent
        className={cn(
          "w-fit max-w-[min(80%,520px)] items-start gap-1.5 max-[760px]:max-w-[94%]",
          outgoing && "items-end",
        )}
      >
        <Bubble
          variant="outline"
          align={outgoing ? "end" : "start"}
          className={cn(
            "max-w-full",
            outgoing
              ? "[--background:var(--accent)]"
              : "[--background:var(--card)]",
          )}
        >
          <BubbleContent
            className={cn(
              "rounded-xl px-[15px] py-[11px] shadow-(--message-shadow) max-[760px]:px-3 max-[760px]:py-[9px]",
              outgoing ? "rounded-tr-sm" : "rounded-tl-sm",
            )}
          >
            <div
              className={cn(
                "text-sm leading-[1.85] [overflow-wrap:anywhere] max-[760px]:text-[13px]",
                outgoing ? "text-accent-foreground" : "text-foreground",
              )}
            >
              <MessageBody body={message.body} />
            </div>
          </BubbleContent>
        </Bubble>
        <MessageFooter className="mx-px px-0">
          <div
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-[5px] text-[10px] font-normal tabular-nums",
              outgoing && "justify-end",
            )}
          >
            <time
              dateTime={message.createdAt}
              title={fullTime(message.createdAt)}
            >
              {messageTime(message.createdAt)}
            </time>
            {message.delivery && (
              <span
                className={cn(
                  "inline-flex items-center gap-[5px]",
                  message.delivery.state === "failed" && "text-destructive",
                )}
                title={message.delivery.reason}
              >
                {message.delivery.state === "sent" && (
                  <Check className="size-3" aria-hidden="true" />
                )}
                {(message.delivery.state === "delivered" ||
                  message.delivery.state === "read") && (
                  <CheckCheck className="size-3" aria-hidden="true" />
                )}
                {deliveryLabels[message.delivery.state]}
              </span>
            )}
            {message.delivery?.state === "failed" && onRetry && (
              <Button
                size="xs"
                variant="link"
                className="ml-1 h-auto gap-1 p-0 has-data-[icon=inline-start]:pl-0 [--primary:var(--destructive)]"
                onClick={onRetry}
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                <span className="text-[10px]">重试原消息</span>
              </Button>
            )}
            {message.delivery?.state === "unconfirmed" && (
              <span>请等待回执，避免重复发送</span>
            )}
          </div>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
