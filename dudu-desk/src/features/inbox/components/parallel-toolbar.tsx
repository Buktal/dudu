import { Pin, PinOff, Plus } from "lucide-react";
import {
  WorkspaceAction,
  WorkspacePanelToggle,
} from "@/components/workspace-action";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  collapsePinned,
  pinConversation,
  restorePinned,
  unpinConversation,
} from "../stores/parallel";
import { visitorName } from "./identity";

export function ParallelToolbar({
  queueCollapsed,
  onToggleQueue,
  onPick,
  onPinned,
}: {
  queueCollapsed: boolean;
  onToggleQueue: () => void;
  onPick: () => void;
  onPinned: () => void;
}) {
  const dispatch = useInboxDispatch();
  const primary = useInboxSelector((state) =>
    state.inbox.activeId
      ? state.inbox.conversations[state.inbox.activeId]
      : undefined,
  );
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const collapsed = useInboxSelector((state) => state.inbox.pinCollapsed);
  const reply = useInboxSelector((state) =>
    state.inbox.replyId
      ? state.inbox.conversations[state.inbox.replyId]
      : undefined,
  );

  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 pb-2.5">
        <p
          className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
          title={
            reply
              ? `${visitorName(reply.identity)} · ${reply.identity.channelName} · ${reply.identity.accountName}`
              : undefined
          }
        >
          <span className="size-[5px] shrink-0 rounded-full bg-primary" />
          <span className="shrink-0">当前回复：</span>
          <strong className="truncate font-semibold text-primary">
            {reply ? visitorName(reply.identity) : "尚未选择"}
          </strong>
          {reply && (
            <span className="hidden truncate text-[10px] min-[1440px]:inline">
              {reply.identity.channelName} · {reply.identity.accountName}
            </span>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <WorkspacePanelToggle
            side="left"
            open={!queueCollapsed}
            label="会话列表"
            className="max-[760px]:hidden"
            onToggle={onToggleQueue}
          />
          <WorkspaceAction
            icon={Plus}
            label={pinnedId ? "更换固定会话" : "添加并排对话"}
            onClick={onPick}
            showLabel
          />
          {pinnedId && (
            <WorkspacePanelToggle
              side="right"
              open={!collapsed}
              label="固定窗"
              showLabel
              onToggle={() => {
                if (collapsed) {
                  void dispatch(restorePinned());
                  onPinned();
                } else dispatch(collapsePinned());
              }}
            />
          )}
          <WorkspaceAction
            icon={Pin}
            disabled={!primary || primary.status === "closed"}
            label="将主接待固定到右窗"
            onClick={() => {
              if (primary) {
                void dispatch(pinConversation(primary.id));
                onPinned();
              }
            }}
          />
          {pinnedId && (
            <WorkspaceAction
              icon={PinOff}
              label="解除固定会话"
              onClick={() => dispatch(unpinConversation())}
            />
          )}
        </div>
      </div>
    </div>
  );
}
