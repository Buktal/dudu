import { ArrowLeft, ListFilter, Pin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { hasOpenOverlay, useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  enterParallel,
  focusPane,
  pinConversation,
  type ReceptionPane,
} from "../stores/parallel";
import { ConversationPane } from "./conversation-pane";
import { ConversationQueue } from "./conversation-queue";
import { visitorName } from "./identity";
import { InboxEmpty } from "./inbox-state";
import { ParallelToolbar, PinnedConversationPicker } from "./parallel-toolbar";
import { QueueTools } from "./queue-tools";
import { VisitorInfo } from "./visitor-info";

export function ParallelWorkspace() {
  const dispatch = useInboxDispatch();
  const primaryId = useInboxSelector((state) => state.inbox.activeId);
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const collapsed = useInboxSelector((state) => state.inbox.pinCollapsed);
  const replyId = useInboxSelector((state) => state.inbox.replyId);
  const primary = useInboxSelector((state) =>
    primaryId ? state.inbox.conversations[primaryId] : undefined,
  );
  const pinned = useInboxSelector((state) =>
    pinnedId ? state.inbox.conversations[pinnedId] : undefined,
  );
  const [showQueue, setShowQueue] = useState(
    !primaryId && !pinnedId && !replyId,
  );
  const [showInfo, setShowInfo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pinnedVisible = !!pinned && !collapsed;
  const focusedPane: ReceptionPane =
    replyId === pinnedId && pinnedVisible ? "pinned" : "primary";
  const openQueue = useCallback(() => setShowQueue(true), []);
  useInboxSearch(openQueue);

  useEffect(() => {
    void dispatch(enterParallel());
  }, [dispatch]);

  const activatePane = useCallback(
    (pane: ReceptionPane) => {
      dispatch(focusPane(pane));
      if (!(pane === "primary" ? primaryId : pinnedId)) return;
      setShowQueue(false);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>(
            `[data-parallel-pane="${pane}"] textarea`,
          )
          ?.focus();
      });
    },
    [dispatch, primaryId, pinnedId],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        event.repeat ||
        hasOpenOverlay()
      )
        return;
      if (event.key !== "1" && event.key !== "2") return;
      event.preventDefault();
      activatePane(event.key === "1" ? "primary" : "pinned");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activatePane]);

  return (
    <div className="flex min-h-0 flex-1 gap-3 pb-2 max-[760px]:gap-1">
      <aside
        className={cn(
          "flex w-[264px] shrink-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground max-[1280px]:w-[244px] max-[760px]:w-full",
          !showQueue && "max-[760px]:hidden",
        )}
        aria-label="会话队列"
      >
        <header className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
          <h1 className="text-base font-semibold">会话</h1>
          <ListFilter className="size-4 text-muted-foreground" />
        </header>
        <QueueTools />
        <ConversationQueue
          onSelected={() => setShowQueue(false)}
          onPin={(id) => {
            void dispatch(pinConversation(id));
            setShowQueue(false);
          }}
        />
        <p className="flex items-center gap-1.5 px-5 pb-3 text-[10px] leading-relaxed text-muted-foreground">
          <Pin className="size-3 shrink-0" />
          点击会话切换主窗，固定按钮留在右窗
        </p>
      </aside>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          showQueue && "max-[760px]:hidden",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 justify-start min-[761px]:hidden"
          onClick={openQueue}
        >
          <ArrowLeft data-icon="inline-start" />
          返回会话列表
        </Button>
        <ParallelToolbar
          onPick={() => setPickerOpen(true)}
          onPinned={() => setShowQueue(false)}
        />
        <ToggleGroup
          className="mb-3 w-full min-[1180px]:hidden"
          value={[focusedPane]}
          onValueChange={(values) => {
            if (values[0] === "primary" || values[0] === "pinned")
              activatePane(values[0]);
          }}
          size="sm"
          aria-label="选择并肩接待窗口"
        >
          <ToggleGroupItem
            value="primary"
            disabled={!primary}
            className="min-w-0 flex-1 text-xs"
            title="Alt + 1"
          >
            <span className="truncate">
              主接待
              {primary ? ` · ${visitorName(primary.identity)}` : " · 待选择"}
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="pinned"
            disabled={!pinned}
            className="min-w-0 flex-1 text-xs"
            title="Alt + 2"
          >
            <span className="truncate">
              固定
              {pinned
                ? ` · ${visitorName(pinned.identity)}${collapsed ? "（已收起）" : ""}`
                : " · 待添加"}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 gap-3",
            pinnedVisible && "min-[1180px]:grid-cols-2",
          )}
        >
          <div
            data-parallel-pane="primary"
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              pinnedVisible &&
                focusedPane === "pinned" &&
                "max-[1179px]:hidden",
            )}
          >
            {primaryId ? (
              <ConversationPane
                conversationId={primaryId}
                paneRole="primary"
                onInfo={() => setShowInfo(true)}
              />
            ) : (
              <div className="flex min-h-0 flex-1 rounded-2xl bg-card">
                <InboxEmpty
                  title="选择一位主接待"
                  description={
                    pinnedVisible
                      ? "右窗会保持固定，继续从列表选择另一段会话。"
                      : "从会话列表选择来访用户，开始并肩接待。"
                  }
                />
              </div>
            )}
          </div>
          {pinnedVisible && pinnedId && (
            <div
              data-parallel-pane="pinned"
              className={cn(
                "flex min-h-0 min-w-0 flex-col",
                focusedPane !== "pinned" && "max-[1179px]:hidden",
              )}
            >
              <ConversationPane
                conversationId={pinnedId}
                paneRole="pinned"
                onInfo={() => setShowInfo(true)}
              />
            </div>
          )}
        </div>
      </div>

      {replyId && (
        <aside className="hidden w-[272px] shrink-0 overflow-hidden rounded-2xl bg-card min-[1680px]:block">
          <VisitorInfo conversationId={replyId} />
        </aside>
      )}
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent className="w-[min(380px,90vw)]" showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>来访资料</SheetTitle>
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
      <PinnedConversationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPinned={() => setShowQueue(false)}
      />
    </div>
  );
}
