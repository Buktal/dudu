import { PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty } from "./inbox-state";
import { MessageTimeline } from "./message-timeline";

export function ChatPanel({
  conversationId,
  focused = true,
  paneRole,
  onFocus,
  onInfo,
  composer,
  actions,
  onRetry,
  onAtBottom,
}: {
  conversationId: string;
  focused?: boolean;
  paneRole?: "primary" | "pinned";
  onFocus?: () => void;
  onInfo?: () => void;
  composer: ReactNode;
  actions?: ReactNode;
  onRetry?: (id: string) => void;
  onAtBottom?: (sequence: number) => void;
}) {
  const conversation = useInboxSelector(
    (state) => state.inbox.conversations[conversationId],
  );
  if (!conversation)
    return (
      <InboxEmpty
        title="这段会话已不可用"
        description="请从会话列表选择仍有效的接待。"
      />
    );
  const name = visitorName(conversation.identity);
  return (
    <section
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground",
        paneRole && focused && "ring-1 ring-ring/30",
      )}
      aria-label={`${name} 的聊天`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-5 py-4 max-[760px]:gap-2 max-[760px]:px-3 max-[760px]:py-2.5">
        <VisitorAvatar identity={conversation.identity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            <span className="text-[10px] text-muted-foreground">
              {paneRole
                ? paneRole === "primary"
                  ? "主接待"
                  : "固定接待"
                : conversation.status === "closed"
                  ? "已结束"
                  : conversation.status === "waiting"
                    ? "等待来访回复"
                    : "待回复"}
            </span>
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-2">
            <SourceBadge identity={conversation.identity} />
            <span className="truncate text-xs text-muted-foreground">
              {conversation.identity.accountName}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {paneRole && (
            <Button
              size="xs"
              variant={focused ? "secondary" : "ghost"}
              aria-pressed={focused}
              onClick={onFocus}
            >
              {focused ? "当前回复" : "切换回复"}
            </Button>
          )}
          {actions}
          {onInfo && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`查看 ${name} 的访客资料`}
              onClick={() => {
                onFocus?.();
                onInfo();
              }}
            >
              <PanelRight />
            </Button>
          )}
        </div>
      </header>
      <MessageTimeline
        conversationId={conversationId}
        onRetry={onRetry}
        onAtBottom={onAtBottom}
      />
      {composer}
    </section>
  );
}
