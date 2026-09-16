import { X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { WorkspaceView } from "@/components/workspace-motion";
import { WorkspaceShell } from "@/components/workspace-shell";
import { type InboxApi, unavailableInboxApi } from "./api";
import { CalmWorkspace } from "./components/calm-workspace";
import { ConnectionStatus } from "./components/connection-status";
import { InboxLoading } from "./components/inbox-state";
import { WorkspaceHelp } from "./components/workspace-help";
import { useInboxDispatch, useInboxSelector } from "./hooks/use-inbox-store";
import { loadInboxApi } from "./runtime";
import { startInboxUpdates } from "./stores/events";
import { destroyInbox, loadConversations } from "./stores/reading";
import { inboxActions } from "./stores/slice";
import { createInboxStore, type InboxStore } from "./stores/store";
import type { WorkContext } from "./types";

const defaultContext = { agentId: "unconnected", workspaceId: "desk" };
const ParallelWorkspace = lazy(() =>
  import("./components/parallel-workspace").then((module) => ({
    default: module.ParallelWorkspace,
  })),
);
const QuickWorkspace = lazy(() =>
  import("./components/quick-workspace").then((module) => ({
    default: module.QuickWorkspace,
  })),
);

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
      <AnimatePresence initial={false} mode="wait">
        <WorkspaceView key={mode}>
          <Suspense fallback={<InboxLoading label="正在切换接待布局…" />}>
            {mode === "parallel" ? (
              <ParallelWorkspace />
            ) : mode === "quick" ? (
              <QuickWorkspace />
            ) : (
              <CalmWorkspace />
            )}
          </Suspense>
        </WorkspaceView>
      </AnimatePresence>
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
  context = defaultContext,
  accountMenu,
}: {
  api?: InboxApi;
  context?: WorkContext;
  accountMenu?: ReactNode;
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
        });
        setStore(runtimeStore);
      });
    return () => {
      active = false;
      runtimeStore?.dispatch(destroyInbox());
      ownedAdapter?.dispose?.();
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
