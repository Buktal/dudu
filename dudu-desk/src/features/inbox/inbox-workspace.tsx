import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Provider } from "react-redux";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { InboxApi } from "./api";
import { ConnectionStatus } from "./components/connection-status";
import { InboxAssistant } from "./components/inbox-assistant";
import { InboxLoading } from "./components/inbox-state";
import { ReceptionWorkspace } from "./components/reception-shell";
import { WorkspaceHelp } from "./components/workspace-help";
import { useInboxDispatch, useInboxSelector } from "./hooks/use-inbox-store";
import { createHttpInboxApi } from "./http-inbox-api";
import { startInboxUpdates } from "./stores/events";
import { loadConversations } from "./stores/queue";
import { destroyInbox } from "./stores/reading";
import { inboxActions } from "./stores/slice";
import { createInboxStore, type InboxStore } from "./stores/store";
import type { WorkContext } from "./types";

/**
 * 未注入上下文时的独立工作台默认值：workspace 即桌面端本身的 desk 工作区，
 * agent 尚未连接（登录组合层会传入真实会话上下文替换）。
 */
const DEFAULT_DESK_CONTEXT: WorkContext = {
  agentId: "unconnected",
  workspaceId: "desk",
};

function InboxSession({ accountMenu }: { accountMenu?: ReactNode }) {
  const { mode, setMode } = useTheme();
  const dispatch = useInboxDispatch();
  const notice = useInboxSelector((state) => state.inbox.notice);
  useEffect(() => {
    dispatch(startInboxUpdates());
    void dispatch(loadConversations());
    return () => {
      dispatch(destroyInbox());
    };
  }, [dispatch]);
  return (
    <WorkspaceShell
      mode={mode}
      onModeChange={setMode}
      toolbarActions={
        <>
          <ConnectionStatus />
          <WorkspaceHelp />
          {accountMenu}
        </>
      }
    >
      <ReceptionWorkspace mode={mode} />
      <InboxAssistant />
      {notice && (
        <div
          role="status"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-accent px-4 py-2 text-xs text-accent-foreground"
        >
          <span>{notice.message}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="关闭提示"
            onClick={() => dispatch(inboxActions.noticeChanged(null))}
          >
            <X />
          </Button>
        </div>
      )}
    </WorkspaceShell>
  );
}

export function InboxWorkspace({
  api,
  context = DEFAULT_DESK_CONTEXT,
  accountMenu,
  refreshAccess,
}: {
  api?: InboxApi;
  context?: WorkContext;
  accountMenu?: ReactNode;
  /** 权限范围变化时重查身份（账户会话）；缺失时只重查列表，不清理缓存。 */
  refreshAccess?: () => Promise<ReadonlySet<string> | null>;
}) {
  const [store, setStore] = useState<InboxStore>();
  const { mode, setMode } = useTheme();
  // 权限重查经 ref 转发：回调身份变化只换转发目标，不重建工作台
  // （store 重建会销毁全部会话状态），调用时始终取最新回调
  const refreshAccessRef = useRef(refreshAccess);
  refreshAccessRef.current = refreshAccess;
  useEffect(() => {
    // 真实适配器同步构造：未注入时由本组件拥有并在卸载时释放
    const adapter = api ?? createHttpInboxApi();
    const runtimeStore = createInboxStore({
      api: adapter,
      context: {
        agentId: context.agentId,
        workspaceId: context.workspaceId,
      },
      // 回调缺失时解析为 null：与不传时的「只重查列表，不清理缓存」语义一致
      refreshAccess: async () => (await refreshAccessRef.current?.()) ?? null,
    });
    setStore(runtimeStore);
    return () => {
      runtimeStore.dispatch(destroyInbox());
      if (!api) adapter.dispose?.();
    };
  }, [api, context.agentId, context.workspaceId]);
  return store ? (
    <Provider store={store}>
      <InboxSession accountMenu={accountMenu} />
    </Provider>
  ) : (
    <WorkspaceShell
      mode={mode}
      onModeChange={setMode}
      toolbarActions={accountMenu}
    >
      <InboxLoading label="正在打开工作台…" />
    </WorkspaceShell>
  );
}
