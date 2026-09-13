import { type NavGroup, StudioShell } from "@/components/shell/studio-shell";
import { ConnectionsView } from "@/features/connections";
import { EventsView } from "@/features/events";
import { PlansView } from "@/features/plans";
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
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { useDeleteEventGuarded } from "@/hooks/use-delete-event-guarded";
import { useDeleteScenarioGuarded } from "@/hooks/use-delete-scenario-guarded";
import {
  type NavSection,
  selectView,
  setView,
  VIEWS,
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
  const entry = viewEntry(view);

  // 组合根编排：跨 feature 槽位在此装配（feature 间不互相反向引用）
  const deleteEventGuarded = useDeleteEventGuarded();
  const deleteScenarioGuarded = useDeleteScenarioGuarded();
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
    entries: VIEWS.filter((item) => item.navSection === section).map(
      (item) => ({ id: item.id, name: item.name, icon: item.icon }),
    ),
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
        <ScenariosView onDeleteScenario={deleteScenarioGuarded} />
      ) : (
        <PlansView />
      )}
    </StudioShell>
  );
}

export default App;
