import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import { ConversationPane } from "./conversation-pane";
import { ConversationQueue } from "./conversation-queue";
import { InboxEmpty } from "./inbox-state";
import { QueueTools } from "./queue-tools";
import { VisitorInfo } from "./visitor-info";

export function CalmWorkspace() {
  const activeId = useInboxSelector(
    (state) => state.inbox.replyId ?? state.inbox.activeId,
  );
  const replyId = useInboxSelector((state) => state.inbox.replyId);
  const total = useInboxSelector((state) => state.inbox.queue.total);
  const [showQueue, setShowQueue] = useState(true);
  const info = useVisitorPanel();
  useInboxSearch(() => setShowQueue(true));
  return (
    <div className="flex min-h-0 flex-1 gap-3.5 max-[1360px]:gap-2.5 max-[760px]:gap-1">
      <aside
        className={cn(
          "flex w-[304px] shrink-0 flex-col overflow-hidden rounded-r-3xl bg-card text-card-foreground max-[1360px]:w-[274px] max-[1090px]:w-[250px] max-[760px]:w-full",
          activeId && !showQueue && "max-[760px]:hidden",
        )}
        aria-label="会话队列"
      >
        <div className="flex items-center gap-2 px-4 py-3.5">
          <h1 className="text-lg font-semibold tracking-tight">消息</h1>
          {total !== undefined && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {total}
            </span>
          )}
        </div>
        <QueueTools />
        <ConversationQueue onSelected={() => setShowQueue(false)} />
      </aside>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          showQueue && "max-[760px]:hidden",
        )}
      >
        {activeId && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 justify-start min-[761px]:hidden"
            onClick={() => setShowQueue(true)}
          >
            <ArrowLeft />
            返回会话列表
          </Button>
        )}
        {activeId ? (
          <ConversationPane conversationId={activeId} onInfo={info.toggle} />
        ) : (
          <InboxEmpty />
        )}
      </div>
      {replyId && info.inline && info.open && (
        <aside className="w-[286px] shrink-0 overflow-hidden rounded-l-3xl max-[1360px]:w-[264px]">
          <VisitorInfo
            conversationId={replyId}
            onClose={() => info.setOpen(false)}
          />
        </aside>
      )}
      <Sheet open={info.open && !info.inline} onOpenChange={info.setOpen}>
        <SheetContent className="w-[min(380px,90vw)]" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>访客资料</SheetTitle>
            <SheetDescription>
              当前回复对象的渠道资料与接待记录
            </SheetDescription>
          </SheetHeader>
          {replyId && (
            <VisitorInfo
              conversationId={replyId}
              onClose={() => info.setOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
