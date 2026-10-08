import { RotateCcw } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { fullTime, messageTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { InboxMessage, VisitorIdentity } from "../types";
import { VisitorAvatar } from "./identity";
import { MessageBody } from "./message-body";

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
  const needsAttention =
    message.delivery?.state === "failed" ||
    message.delivery?.state === "unconfirmed";
  return (
    <Message
      align={outgoing ? "end" : "start"}
      role="group"
      aria-label={outgoing ? "客服消息" : "访客消息"}
      tabIndex={0}
      className="items-start gap-2 rounded-lg pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring [--message-shadow:0_2px_6px_color-mix(in_srgb,light-dark(var(--foreground),var(--background))_2%,transparent)]"
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
          "w-fit max-w-[min(100%,560px)] items-start gap-1",
          outgoing && "items-end",
        )}
      >
        <div
          className={cn(
            "flex max-w-full min-w-0 items-end gap-2",
            outgoing && "flex-row-reverse",
          )}
        >
          <Bubble
            variant="outline"
            align={outgoing ? "end" : "start"}
            className={cn(
              "max-w-[calc(100%-40px)]",
              outgoing
                ? "[--background:var(--accent)]"
                : "[--background:var(--card)]",
            )}
          >
            <BubbleContent
              className={cn(
                "rounded-xl px-3 py-2 shadow-(--message-shadow)",
                outgoing ? "rounded-tr-sm" : "rounded-tl-sm",
              )}
            >
              <div
                className={cn(
                  "min-w-0 max-w-full text-sm leading-[1.65] [overflow-wrap:anywhere] max-[760px]:text-[13px]",
                  outgoing ? "text-accent-foreground" : "text-foreground",
                )}
              >
                <MessageBody body={message.body} />
              </div>
            </BubbleContent>
          </Bubble>
          <MessageFooter className="w-8 shrink-0 px-0 pb-2.5 opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
            <time
              dateTime={message.createdAt}
              title={fullTime(message.createdAt)}
              className={cn(
                "w-full whitespace-nowrap text-[10px] leading-3.5 font-normal tabular-nums",
                outgoing ? "text-right" : "text-left",
              )}
            >
              {messageTime(message.createdAt)}
            </time>
          </MessageFooter>
        </div>
        {needsAttention && message.delivery && (
          <MessageFooter className="flex-wrap gap-2 px-0 text-[11px]">
            <span
              className={cn(
                message.delivery?.state === "failed" && "text-destructive",
              )}
              title={message.delivery?.reason}
            >
              {message.delivery.state === "failed" ? "发送失败" : "结果未确认"}
            </span>
            {message.delivery?.state === "failed" && onRetry && (
              <Button
                size="xs"
                variant="link"
                className="h-auto gap-1 p-0 has-data-[icon=inline-start]:pl-0 [--primary:var(--destructive)]"
                onClick={onRetry}
              >
                <RotateCcw data-icon="inline-start" />
                <span className="text-[11px]">重试原消息</span>
              </Button>
            )}
            {message.delivery?.state === "unconfirmed" && (
              <span>请等待回执，避免重复发送</span>
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}
