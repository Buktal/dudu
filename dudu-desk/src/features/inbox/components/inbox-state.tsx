import { Inbox, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ApiFailure } from "@/lib/api-response";

export function InboxEmpty({
  title = "选择一段会话，开始接待",
  description = "每一位来访，都值得认真回应。",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty className="px-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function InboxLoading({ label = "正在读取会话…" }: { label?: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}

export function InboxError({
  error,
  onRetry,
  compact = false,
}: {
  error: ApiFailure;
  onRetry: () => void;
  compact?: boolean;
}) {
  const unavailable = error.kind === "unavailable";
  if (compact)
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-xs"
        role="status"
      >
        <span>{error.message}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RefreshCw />
          重试
        </Button>
      </div>
    );
  return (
    <Empty className="px-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {unavailable ? <Unplug /> : <RefreshCw />}
        </EmptyMedia>
        <EmptyTitle>
          {unavailable ? "接待服务未连接" : "暂时无法读取"}
        </EmptyTitle>
        <EmptyDescription>
          {unavailable ? "连接可用后，会话和来信会显示在这里。" : error.message}
        </EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        重新连接
      </Button>
    </Empty>
  );
}
