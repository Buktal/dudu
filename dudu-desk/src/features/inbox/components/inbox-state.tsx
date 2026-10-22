import { Inbox, RefreshCw, Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { ApiFailure } from "@/lib/api-response";
import type { LoadState } from "../types";

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
      <Spinner className="size-4" />
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

/** The load-state shape a list phase reads: queue and history reads. */
type ListPhaseRead = Pick<LoadState, "hasLoaded" | "status">;

type ListPhaseCopy = { title: string; description: string };

/**
 * The first-read rule behind every inbox list: only a read with nothing
 * settled yet claims the full-surface loading phase, so re-reads and
 * continuations keep content mounted. The single interpretation of the
 * hasLoaded × status pair.
 */
export function isInitialRead(read: ListPhaseRead | undefined): boolean {
  return !read?.hasLoaded && read?.status === "loading";
}

export type InboxListPhaseProps = {
  /** Load-state shape (queue, history); undefined reads as idle with no error. */
  read?: ListPhaseRead;
  /** Readers without a LoadState pass their in-flight flag instead of `read`;
   *  their loading phase also requires an empty list. */
  loading?: boolean;
  error: ApiFailure | null;
  count: number;
  onRetry: () => void;
  loadingLabel?: string;
  empty: ListPhaseCopy;
  /** Wrapper for the compact bar when the content layout needs one. */
  compactClassName?: string;
  /** Content-phase accessory, e.g. a continuation indicator. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * List phase presentation: maps a list read (load state + entry count) onto
 * the loading / error+retry / empty / content branches, and keeps the compact
 * error bar beside the content when a settled list later fails. Callers keep
 * only the content branch, their own copy and their retry command.
 */
export function InboxListPhase({
  read,
  loading = false,
  error,
  count,
  onRetry,
  loadingLabel,
  empty,
  compactClassName,
  footer,
  children,
}: InboxListPhaseProps) {
  const initial = read ? isInitialRead(read) : false;
  // A first read claims the full surface even when Live events already
  // filled the list; flag readers (no LoadState) add the empty-list guard.
  if (initial || (loading && !count))
    return <InboxLoading label={loadingLabel} />;
  if (!count && error) return <InboxError error={error} onRetry={onRetry} />;
  if (!count)
    return <InboxEmpty title={empty.title} description={empty.description} />;
  const bar = error ? (
    <InboxError compact error={error} onRetry={onRetry} />
  ) : null;
  return (
    <>
      {children}
      {bar &&
        (compactClassName ? (
          <div className={compactClassName}>{bar}</div>
        ) : (
          bar
        ))}
      {footer}
    </>
  );
}
