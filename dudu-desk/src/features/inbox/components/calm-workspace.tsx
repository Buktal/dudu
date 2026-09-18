import { cn } from "@/lib/utils";
import { useInboxSelector } from "../hooks/use-inbox-store";
import { useVisitorPanel } from "../hooks/use-visitor-panel";
import { selectFocusedId } from "../stores/selectors";
import { ConversationPane } from "./conversation-pane";
import { ConversationSidebar } from "./conversation-sidebar";
import { InboxEmpty } from "./inbox-state";
import { ReceptionBackButton, useListPane } from "./reception-shell";
import { VisitorInfoPanel } from "./visitor-info-panel";

export function CalmWorkspace() {
  const activeId = useInboxSelector(selectFocusedId);
  const [showQueue, setShowQueue] = useListPane({ initial: true });
  const info = useVisitorPanel();
  return (
    <div className="flex min-h-0 flex-1 gap-(--workspace-gap) [--workspace-gap:16px] max-[1360px]:[--workspace-gap:12px] max-[760px]:[--workspace-gap:4px]">
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
        {activeId && <ReceptionBackButton onBack={() => setShowQueue(true)} />}
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
