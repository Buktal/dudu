import { ArrowLeft } from "lucide-react";
import { useIsPresent } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspacePanel } from "@/components/workspace-motion";
import { cn } from "@/lib/utils";
import { hasOpenOverlay, useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import {
  enterParallel,
  focusPane,
  pinConversation,
  type ReceptionPane,
} from "../stores/parallel";
import { ConversationPane } from "./conversation-pane";
import { ConversationSidebar } from "./conversation-sidebar";
import { visitorName } from "./identity";
import { InboxEmpty } from "./inbox-state";
import { ParallelToolbar } from "./parallel-toolbar";
import { PinnedConversationPicker } from "./pin-picker";
import { VisitorInfoPanel } from "./visitor-info-panel";

export function ParallelWorkspace() {
  const present = useIsPresent();
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
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const info = useVisitorPanel();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pinnedVisible = !!pinned && !collapsed;
  const focusedPane: ReceptionPane =
    replyId === pinnedId && pinnedVisible ? "pinned" : "primary";
  const openQueue = useCallback(() => {
    setQueueCollapsed(false);
    setShowQueue(true);
  }, []);
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
    if (!present) return;
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
  }, [activatePane, present]);

  return (
    <div className="relative flex min-h-0 flex-1 gap-(--workspace-gap) [--workspace-gap:14px] max-[1360px]:[--workspace-gap:10px] max-[760px]:[--workspace-gap:0px]">
      <WorkspacePanel
        side="left"
        open={!queueCollapsed || info.narrow}
        className={cn(
          "[--workspace-panel-width:246px] max-[1360px]:[--workspace-panel-width:224px] max-[1090px]:[--workspace-panel-width:225px] max-[760px]:[--workspace-panel-width:100vw]",
          !showQueue && "max-[760px]:hidden",
        )}
      >
        <ConversationSidebar
          onSelected={() => setShowQueue(false)}
          onPin={(id) => {
            void dispatch(pinConversation(id));
            setShowQueue(false);
          }}
        />
      </WorkspacePanel>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col pt-2 max-[760px]:pt-[5px] max-[760px]:pr-0.5 max-[760px]:pl-2.5",
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
          queueCollapsed={queueCollapsed}
          onToggleQueue={() => setQueueCollapsed((collapsed) => !collapsed)}
          onPick={() => setPickerOpen(true)}
          onPinned={() => setShowQueue(false)}
        />
        <ToggleGroup
          className="mb-2 w-full min-[761px]:hidden"
          value={[focusedPane]}
          onValueChange={(values) => {
            if (values[0] === "primary" || values[0] === "pinned")
              activatePane(values[0]);
          }}
          size="sm"
          aria-label="选择并排接待窗口"
        >
          <ToggleGroupItem
            value="primary"
            disabled={!primary}
            className="min-w-0 flex-1"
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
            className="min-w-0 flex-1"
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
            pinnedVisible && "min-[761px]:grid-cols-2",
          )}
        >
          <div
            data-parallel-pane="primary"
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              pinnedVisible && focusedPane === "pinned" && "max-[760px]:hidden",
            )}
          >
            {primaryId ? (
              <ConversationPane
                conversationId={primaryId}
                paneRole="primary"
                infoOpen={info.open && replyId === primaryId}
                onInfo={() => info.setOpen(!info.open || replyId !== primaryId)}
              />
            ) : (
              <div className="flex min-h-0 flex-1 rounded-2xl bg-card">
                <InboxEmpty
                  title="选择一位主接待"
                  description={
                    pinnedVisible
                      ? "右窗会保持固定，继续从列表选择另一段会话。"
                      : "从会话列表选择来访用户，开始并排接待。"
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
                focusedPane !== "pinned" && "max-[760px]:hidden",
              )}
            >
              <ConversationPane
                conversationId={pinnedId}
                paneRole="pinned"
                infoOpen={info.open && replyId === pinnedId}
                onInfo={() => info.setOpen(!info.open || replyId !== pinnedId)}
              />
            </div>
          )}
        </div>
      </div>

      <VisitorInfoPanel
        conversationId={replyId}
        open={info.open}
        inline={info.inline}
        onOpenChange={info.setOpen}
      />
      <PinnedConversationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPinned={() => setShowQueue(false)}
      />
    </div>
  );
}
