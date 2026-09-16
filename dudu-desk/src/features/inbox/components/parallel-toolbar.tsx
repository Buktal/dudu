import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-[760px]:hidden"
            aria-expanded={!queueCollapsed}
            aria-label={queueCollapsed ? "展开会话列表" : "收起会话列表"}
            title={queueCollapsed ? "展开会话列表" : "收起会话列表"}
            onClick={onToggleQueue}
          >
            {queueCollapsed ? (
              <PanelLeftOpen data-icon="inline-start" />
            ) : (
              <PanelLeftClose data-icon="inline-start" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onPick}>
            <Plus data-icon="inline-start" />
            {pinnedId ? "更换固定会话" : "添加并排对话"}
          </Button>
          {pinnedId && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={!collapsed}
              onClick={() => {
                if (collapsed) {
                  void dispatch(restorePinned());
                  onPinned();
                } else dispatch(collapsePinned());
              }}
            >
              {collapsed ? (
                <PanelRightOpen data-icon="inline-start" />
              ) : (
                <PanelRightClose data-icon="inline-start" />
              )}
              {collapsed ? "展开固定窗" : "收起固定窗"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!primary || primary.status === "closed"}
            aria-label="将主接待固定到右窗"
            title="将主接待固定到右窗"
            onClick={() => {
              if (primary) {
                void dispatch(pinConversation(primary.id));
                onPinned();
              }
            }}
          >
            <Pin data-icon="inline-start" />
          </Button>
          {pinnedId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="解除固定会话"
              title="解除固定会话"
              onClick={() => dispatch(unpinConversation())}
            >
              <PinOff data-icon="inline-start" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
