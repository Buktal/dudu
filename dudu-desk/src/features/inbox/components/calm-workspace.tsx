import { ArrowLeft, ListFilter } from "lucide-react";
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
  const [showQueue, setShowQueue] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  useInboxSearch(() => setShowQueue(true));
  return (
    <div className="flex min-h-0 flex-1 gap-3 pb-2 max-[760px]:gap-1">
      <aside
        className={cn(
          "flex w-[290px] shrink-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground max-[1000px]:w-[254px] max-[760px]:w-full",
          activeId && !showQueue && "max-[760px]:hidden",
        )}
        aria-label="会话队列"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h1 className="text-base font-semibold">会话</h1>
          <ListFilter className="size-4 text-muted-foreground" />
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
          <ConversationPane
            conversationId={activeId}
            onInfo={() => setShowInfo(true)}
          />
        ) : (
          <InboxEmpty />
        )}
      </div>
      {replyId && (
        <aside className="hidden w-[276px] shrink-0 overflow-hidden rounded-2xl bg-card text-card-foreground min-[1380px]:block">
          <VisitorInfo conversationId={replyId} />
        </aside>
      )}
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent className="w-[min(380px,90vw)]">
          <SheetHeader>
            <SheetTitle>访客资料</SheetTitle>
            <SheetDescription>
              当前回复对象的渠道资料与接待记录
            </SheetDescription>
          </SheetHeader>
          {replyId && (
            <VisitorInfo
              conversationId={replyId}
              onClose={() => setShowInfo(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
