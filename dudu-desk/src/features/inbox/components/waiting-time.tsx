import { useSyncExternalStore } from "react";
import { elapsedSeconds, fullTime, messageTime, nowIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Conversation } from "../types";

const listeners = new Set<() => void>();
let clock = nowIso();
let timer: ReturnType<typeof setInterval> | undefined;
const snapshot = () => clock;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    clock = nowIso();
    timer = setInterval(() => {
      clock = nowIso();
      for (const notify of listeners) notify();
    }, 15000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function WaitingDuration({ since }: { since: string }) {
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  const seconds = elapsedSeconds(since, now);
  if (seconds === undefined)
    return <span className="text-[10px] text-muted-foreground">待回复</span>;
  const duration =
    seconds >= 3600
      ? `${Math.floor(seconds / 3600)} 小时`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)} 分`
        : `${seconds} 秒`;
  return (
    <time
      dateTime={since}
      title={`从 ${fullTime(since)} 开始等待回复`}
      className={cn(
        "shrink-0 text-[10px] whitespace-nowrap tabular-nums",
        seconds >= 180 ? "text-warning-foreground" : "text-muted-foreground",
      )}
    >
      等待 {duration}
    </time>
  );
}

export function WaitingTime({ conversation }: { conversation: Conversation }) {
  return conversation.status === "needs-reply" && conversation.waitingSince ? (
    <WaitingDuration since={conversation.waitingSince} />
  ) : (
    <time
      dateTime={conversation.updatedAt}
      title={fullTime(conversation.updatedAt)}
      className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
    >
      {conversation.status === "needs-reply"
        ? "待回复"
        : messageTime(conversation.updatedAt)}
    </time>
  );
}
