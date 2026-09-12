import { EmptyState } from "@/components/empty-state";
import { type NavGroup, StudioShell } from "@/components/shell/studio-shell";
import { Button } from "@/components/ui/button";
import { ConnectionsView } from "@/features/connections";
import { EventsView } from "@/features/events";
import {
  DispatchPanel,
  directDispatch,
  RunsView,
  selectPanelPhase,
} from "@/features/runs";
import {
  ScenariosView,
  scenarioNamesReferencingEvent,
} from "@/features/scenarios";
import { useDeleteEventGuarded } from "@/hooks/use-delete-event-guarded";
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

  // 组合根编排：跨 feature 槽位在此装配（feature 间不互相反向引用）
  const deleteEventGuarded = useDeleteEventGuarded();
  const draftId = useAppSelector((state) => state.events.draft?.id ?? null);
  const referencingScenarioNames = useAppSelector((state) =>
    draftId ? scenarioNamesReferencingEvent(state, draftId) : [],
  );
  const dispatchSending = useAppSelector(
    (state) => selectPanelPhase(state.runs) === "sending",
  );

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
        <EventsView
          slots={{
            onDirectDispatch: () => void dispatch(directDispatch()),
            dispatchSending,
            footer: <DispatchPanel />,
            referencingScenarioNames,
            onDeleteEvent: (eventId) => void deleteEventGuarded(eventId),
          }}
        />
      ) : view === "runs" ? (
        <RunsView />
      ) : view === "scenarios" ? (
        <ScenariosView />
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
