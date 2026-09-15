import { MessageCircle, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { type InboxApi, unavailableInboxApi } from "./api";
import { CalmWorkspace } from "./components/calm-workspace";
import { ConnectionBar } from "./components/connection-bar";
import { InboxLoading } from "./components/inbox-state";
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

function InboxSession() {
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
      navigation={
        <Button
          size="icon-lg"
          aria-label="所有会话"
          title="所有会话"
          onClick={() => void dispatch(loadConversations())}
        >
          <MessageCircle />
        </Button>
      }
    >
      <Suspense fallback={<InboxLoading label="正在切换接待布局…" />}>
        {mode === "parallel" ? (
          <ParallelWorkspace />
        ) : mode === "quick" ? (
          <QuickWorkspace />
        ) : (
          <CalmWorkspace />
        )}
      </Suspense>
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
      <ConnectionBar />
    </WorkspaceShell>
  );
}

export function InboxWorkspace({
  api,
  context = defaultContext,
}: {
  api?: InboxApi;
  context?: WorkContext;
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
      <InboxSession />
    </Provider>
  ) : (
    <WorkspaceShell mode={mode} onModeChange={setMode}>
      <InboxLoading label="正在打开工作台…" />
    </WorkspaceShell>
  );
}
