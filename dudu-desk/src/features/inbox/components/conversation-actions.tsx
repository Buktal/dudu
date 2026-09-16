import { Check, LoaderCircle, RotateCcw, Star } from "lucide-react";
import { WorkspaceAction } from "@/components/workspace-action";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { setConversationStarred } from "../stores/details";
import { selectConversationById } from "../stores/selectors";
import { endReception, focusReply, resumeReception } from "../stores/sending";
import { VisitorInfoToggle } from "./visitor-info-toggle";

export function ConversationStarAction({
  conversationId,
  className,
}: {
  conversationId: string;
  className?: string;
}) {
  const dispatch = useInboxDispatch();
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const busy = useInboxSelector(
    (state) => state.inbox.starUpdates[conversationId]?.status === "saving",
  );
  if (!conversation) return null;
  return (
    <WorkspaceAction
      icon={busy ? LoaderCircle : Star}
      label={
        busy ? "正在保存星标" : conversation.starred ? "取消星标" : "标记星标"
      }
      disabled={busy}
      pressed={conversation.starred}
      className={className}
      iconClassName={cn(
        busy
          ? "animate-spin motion-reduce:animate-none"
          : conversation.starred && "fill-primary text-primary",
      )}
      onClick={() =>
        void dispatch(
          setConversationStarred(conversationId, !conversation.starred),
        )
      }
    />
  );
}

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
      <ConversationStarAction conversationId={conversationId} />
      <WorkspaceAction
        icon={ended ? RotateCcw : Check}
        label={ended ? "继续接待" : "结束本次接待"}
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
        <VisitorInfoToggle
          open={infoOpen}
          onToggle={() => {
            dispatch(focusReply(conversationId));
            onInfo();
          }}
        />
      )}
    </div>
  );
}
