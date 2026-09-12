import { EmptyState } from "@/components/empty-state";
import { type NavGroup, StudioShell } from "@/components/shell/studio-shell";
import { Button } from "@/components/ui/button";
import { ConnectionsView } from "@/features/connections";
import { EventsView } from "@/features/events";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  type NavSection,
  selectView,
  selectViews,
  setView,
  type ViewId,
  viewEntry,
} from "@/stores/app-slice";

/** 侧栏分组渲染顺序与固定文案（分组数据本身来自 VIEWS 注册表） */
const SECTION_ORDER: readonly NavSection[] = ["build", "monitor", "bottom"];
const SECTION_LABEL: Record<NavSection, string | undefined> = {
  build: "构建与调试",
  monitor: undefined,
  bottom: undefined,
};

function App() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => selectView(state.app));
  const views = useAppSelector((state) => selectViews(state.app));
  const entry = viewEntry(view);

  const navGroups: NavGroup<ViewId>[] = SECTION_ORDER.map((section) => ({
    label: SECTION_LABEL[section],
    pinnedBottom: section === "bottom",
    entries: views
      .filter((item) => item.navSection === section)
      .map((item) => ({ id: item.id, name: item.name, icon: item.icon })),
  }));

  return (
    <StudioShell
      navGroups={navGroups}
      currentView={view}
      currentTitle={entry.name}
      onSelectView={(next) => dispatch(setView(next))}
    >
      {view === "connections" ? (
        <ConnectionsView />
      ) : view === "events" ? (
        <EventsView />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyState
            icon={entry.icon}
            title={`${entry.name} · 未实现`}
            description={`${entry.hint} 该视图在后续版本落地，当前先到事件调试与平台连接。`}
          />
          <div className="flex justify-center pb-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch(setView("events"))}
            >
              前往事件调试
            </Button>
          </div>
        </div>
      )}
    </StudioShell>
  );
}

export default App;
