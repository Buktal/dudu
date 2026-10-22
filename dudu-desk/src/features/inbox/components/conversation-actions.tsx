import { Check, RotateCcw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  WorkspaceAction,
  WorkspacePanelToggle,
} from "@/components/workspace-action";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { selectConversationById } from "../stores/selectors";
import { endReception, focusReply, resumeReception } from "../stores/sending";

export function ConversationActions({
  conversationId,
  infoOpen,
  onInfo,
}: {
  conversationId: string;
  infoOpen: boolean;
  onInfo?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const ended =
    useInboxSelector((state) => selectConversationById(state, conversationId))
      ?.status === "closed";
  const ending = useInboxSelector(
    (state) => state.inbox.ending[conversationId]?.status === "saving",
  );
  const connected = useInboxSelector(
    (state) => state.inbox.connection === "connected",
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <WorkspaceAction
        icon={ending ? Spinner : ended ? RotateCcw : Check}
        label={
          ending
            ? ended
              ? "正在恢复接待"
              : "正在结束接待"
            : ended
              ? "继续接待"
              : "结束本次接待"
        }
        disabled={ending || !connected}
        onClick={() =>
          void dispatch(
            ended
              ? resumeReception(conversationId)
              : endReception(conversationId),
          )
        }
      />
      {onInfo && (
        <WorkspacePanelToggle
          side="right"
          open={infoOpen}
          label="来访资料"
          onToggle={() => {
            dispatch(focusReply(conversationId));
            onInfo();
          }}
        />
      )}
    </div>
  );
}
