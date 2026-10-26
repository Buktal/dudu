import { ArrowLeftRight, Pin, PinOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { pinConversation, type ReceptionPane } from "../stores/parallel";
import { selectConversationById } from "../stores/selectors";
import { inboxActions } from "../stores/slice";
import { visitorName } from "./identity";

export function ParallelPaneActions({
  conversationId,
  paneRole,
  onPick,
}: {
  conversationId: string;
  paneRole: ReceptionPane;
  onPick: () => void;
}) {
  const dispatch = useInboxDispatch();
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  if (!conversation) return null;
  const pinned = paneRole === "pinned";
  const name = visitorName(conversation.identity);

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="h-7 rounded-md"
        disabled={!pinned && conversation.status === "closed"}
        aria-label={pinned ? `取消固定 ${name}` : `将 ${name} 固定到右窗`}
        onClick={() => {
          if (pinned) dispatch(inboxActions.pinnedReleased());
          else void dispatch(pinConversation(conversationId));
        }}
      >
        {pinned ? (
          <PinOff data-icon="inline-start" />
        ) : (
          <Pin data-icon="inline-start" />
        )}
        {pinned ? "取消固定" : "固定到右窗"}
      </Button>
      {(pinned || !pinnedId) && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-7 rounded-md"
          aria-label={pinned ? "更换固定会话" : "添加并排对话"}
          title={pinned ? "更换固定会话" : "添加并排对话"}
          onClick={onPick}
        >
          {pinned ? <ArrowLeftRight /> : <Plus />}
        </Button>
      )}
    </>
  );
}
