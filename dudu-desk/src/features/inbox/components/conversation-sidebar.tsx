import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { queueCountLabel } from "../presentation";
import { ConversationQueue } from "./conversation-queue";
import { QueueTools } from "./queue-tools";

export function QueueHeading({ className }: { className?: string }) {
  const total = useInboxSelector((state) => state.inbox.queue.total);
  return (
    <header
      className={cn("flex h-12 shrink-0 items-center gap-2 px-4", className)}
    >
      <h1 className="text-sm font-semibold">我的会话</h1>
      {total !== undefined && (
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title={`${total.toLocaleString("zh-CN")} 个会话`}
        >
          {queueCountLabel(total)}
        </span>
      )}
    </header>
  );
}

export function ConversationSidebar({
  className,
  onSelected,
  onPin,
}: {
  className?: string;
  onSelected: () => void;
  onPin?: (id: string) => void;
}) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-r-3xl bg-card text-card-foreground",
        className,
      )}
      aria-label="会话队列"
    >
      <div className="flex h-11 shrink-0 items-center pr-3">
        <QueueHeading className="h-11 flex-1" />
        <QueueTools />
      </div>
      <Separator className="mx-3 mb-1 w-auto" />
      <ConversationQueue onSelected={onSelected} onPin={onPin} />
    </aside>
  );
}
