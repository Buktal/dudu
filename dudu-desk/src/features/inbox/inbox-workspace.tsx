import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { type InboxApi, unavailableInboxApi } from "./api";
import { ConnectionStatus } from "./components/connection-status";
import { InboxLoading } from "./components/inbox-state";
import { ReceptionWorkspace } from "./components/reception-shell";
import { WorkspaceHelp } from "./components/workspace-help";
import { useInboxDispatch, useInboxSelector } from "./hooks/use-inbox-store";
import { loadInboxApi } from "./runtime";
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
  useEffect(() => {
    let active = true;
    let runtimeStore: InboxStore | undefined;
    let ownedAdapter: InboxApi | undefined;
    setStore(undefined);
    void (api ? Promise.resolve(api) : loadInboxApi())
      .catch(() => unavailableInboxApi)
      .then((adapter) => {
        if (!active) {
          if (!api) adapter.dispose?.();
          return;
        }
        if (!api) ownedAdapter = adapter;
        runtimeStore = createInboxStore({
          api: adapter,
          context: {
            agentId: context.agentId,
            workspaceId: context.workspaceId,
          },
          refreshAccess,
        });
        setStore(runtimeStore);
      });
    return () => {
      active = false;
      runtimeStore?.dispatch(destroyInbox());
      ownedAdapter?.dispose?.();
    };
  }, [api, context.agentId, context.workspaceId, refreshAccess]);
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
