import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import { selectFocusedId } from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { ConversationSidebar } from "./conversation-sidebar";
import { InboxEmpty } from "./inbox-state";
import { VisitorInfoPanel } from "./visitor-info-panel";

export function CalmWorkspace() {
  const activeId = useInboxSelector(selectFocusedId);
  const [showQueue, setShowQueue] = useState(true);
  const info = useVisitorPanel();
  useInboxSearch(() => setShowQueue(true));
  return (
    <div className="flex min-h-0 flex-1 gap-(--workspace-gap) [--workspace-gap:14px] max-[1360px]:[--workspace-gap:10px] max-[760px]:[--workspace-gap:4px]">
      <div
        className={cn(
          "min-h-0 w-[304px] shrink-0 max-[1360px]:w-[274px] max-[1090px]:w-[250px] max-[760px]:w-full",
          activeId && !showQueue && "max-[760px]:hidden",
        )}
      >
        <ConversationSidebar onSelected={() => setShowQueue(false)} />
      </div>
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
            <ArrowLeft data-icon="inline-start" />
            返回会话列表
          </Button>
        )}
        {activeId ? (
          <ConversationPane
            conversationId={activeId}
            onInfo={info.toggle}
            infoOpen={info.open}
          />
        ) : (
          <InboxEmpty />
        )}
      </div>
      <VisitorInfoPanel
        conversationId={activeId}
        open={info.open}
        inline={info.inline}
        onOpenChange={info.setOpen}
      />
    </div>
  );
}
