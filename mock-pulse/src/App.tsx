import { Activity, useEffect, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import { DraftGuard } from "@/components/draft-guard";
import { MaterialPicker } from "@/components/material-picker";
import { Notice } from "@/components/notice";
import { LibraryProvider } from "@/components/resource-workspace";
import {
  type NavGroup,
  WorkspaceShell,
} from "@/components/shell/workspace-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionsView, fetchConnections } from "@/features/connections";
import {
  EventsView,
  fetchEvents,
  fetchFieldDefinitions,
  openEvent,
  useEventDraftGuard,
} from "@/features/events";
import {
  addPlanLane,
  fetchPlans,
  openPlan,
  PlansView,
  usePlanDraftGuard,
} from "@/features/plans";
import {
  DispatchPanel,
  directDispatch,
  fetchRuns,
  isRunBusy,
  RunsView,
  selectDirectDispatchSlot,
  stopRun,
} from "@/features/runs";
import {
  fetchScenarios,
  ScenariosView,
  scenarioNamesReferencingEvent,
} from "@/features/scenarios";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { useDeleteEventGuarded } from "@/hooks/use-delete-event-guarded";
import { useDeleteScenarioGuarded } from "@/hooks/use-delete-scenario-guarded";
import { errorMessage } from "@/lib/errors";
import {
  type NavSection,
  selectView,
  setView,
  type ViewId,
} from "@/stores/app-slice";
import { resolveViewEntry, VIEW_ENTRIES } from "@/view-behavior";

const SECTION_ORDER: readonly NavSection[] = ["build", "monitor", "bottom"];

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <MockPulseApp />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function MockPulseApp() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => selectView(state.app));
  const state = useAppSelector(
    (root) => ({
      app: root.app,
      events: root.events,
      scenarios: root.scenarios,
      plans: root.plans,
      runs: root.runs,
      connections: root.connections,
    }),
    shallowEqual,
  );
  const booted = useRef(false);
  const [loadError, setLoadError] = useState("");
  const [parentScenarioId, setParentScenarioId] = useState<string | null>(null);
  const deleteEvent = useDeleteEventGuarded();
  const deleteScenario = useDeleteScenarioGuarded();
  const eventGuard = useEventDraftGuard();
  const planGuard = usePlanDraftGuard();
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void Promise.allSettled([
      dispatch(fetchEvents()).unwrap(),
      dispatch(fetchFieldDefinitions()).unwrap(),
      dispatch(fetchScenarios()).unwrap(),
      dispatch(fetchPlans()).unwrap(),
      dispatch(fetchRuns()).unwrap(),
      dispatch(fetchConnections()).unwrap(),
    ]).then((results) => {
      setLoadError(
        results
          .filter((result) => result.status === "rejected")
          .map((result) => errorMessage(result.reason))
          .join("；"),
      );
    });
  }, [dispatch]);
  const counts = {
    events: state.events.items.length,
    scenarios: state.scenarios.items.length,
    plans: state.plans.items.length,
    runs: state.runs.items.length,
  };
  const draftId = state.events.draft?.id;
  const referencing = useAppSelector(
    (root) => (draftId ? scenarioNamesReferencingEvent(root, draftId) : []),
    shallowEqual,
  );
  // 直发面板槽位一次算齐（session 单点）：App 只剩一行 dispatch
  const dispatchSlot = selectDirectDispatchSlot(state, draftId);
  // 当前视图行为一次查表：脏判定、草稿名、保存、放弃全部来自注册表条目
  const entry = resolveViewEntry(view);
  const { behavior } = entry;
  const dirty = behavior.isDirty(state);
  const currentName = behavior.draftName?.(state) ?? null;
  const saveCurrent = (): Promise<unknown> => behavior.save(state, dispatch);
  const discardCurrent = () => behavior.discard(state, dispatch);
  const groups: NavGroup<ViewId>[] = SECTION_ORDER.map((section) => ({
    label: section === "build" ? "构建与调试" : undefined,
    pinnedBottom: section === "bottom",
    entries: VIEW_ENTRIES.filter((item) => item.navSection === section).map(
      (item) => ({
        ...item,
        count: item.id === "connections" ? undefined : counts[item.id],
      }),
    ),
  }));
  return (
    <LibraryProvider>
      <DraftGuard
        dirty={dirty}
        name={currentName ?? "平台连接"}
        onSave={saveCurrent}
        onDiscard={discardCurrent}
      >
        {(navigate) => (
          <DraftGuard
            dirty={eventGuard.dirty}
            name={eventGuard.name}
            onSave={eventGuard.save}
            onDiscard={eventGuard.discard}
          >
            {(replaceEvent) => (
              <DraftGuard
                dirty={planGuard.dirty}
                name={planGuard.name}
                onSave={planGuard.save}
                onDiscard={planGuard.discard}
              >
                {(replacePlan) => (
                  <>
                    <WorkspaceShell
                      navGroups={groups}
                      currentView={view}
                      currentTitle={entry.name}
                      onSelectView={(next) => {
                        if (next !== view)
                          navigate(() => dispatch(setView(next)));
                      }}
                    >
                      {loadError ? (
                        <Notice
                          role="alert"
                          className="mb-4"
                          variant="destructive"
                        >
                          载入本地数据失败：{loadError}
                        </Notice>
                      ) : null}
                      <Activity mode={view === "events" ? "visible" : "hidden"}>
                        <EventsView
                          slots={{
                            onDirectDispatch: () =>
                              void dispatch(directDispatch()),
                            dispatchSending: dispatchSlot.sending,
                            dispatchDisabled: isRunBusy(state),
                            dispatchStopping: dispatchSlot.stopping,
                            onStopDispatch: () => {
                              if (dispatchSlot.runId)
                                void dispatch(stopRun(dispatchSlot.runId));
                            },
                            footer: <DispatchPanel />,
                            referencingScenarioNames: referencing,
                            onDeleteEvent: deleteEvent,
                          }}
                        />
                      </Activity>
                      <Activity
                        mode={view === "scenarios" ? "visible" : "hidden"}
                      >
                        <ScenariosView
                          onDeleteScenario={deleteScenario}
                          onEditEvent={(id) =>
                            navigate(() => {
                              const open = () => {
                                if (id !== state.events.draft?.id)
                                  dispatch(openEvent(id));
                                dispatch(setView("events"));
                              };
                              if (id === state.events.draft?.id) open();
                              else replaceEvent(open);
                            })
                          }
                          onAddToPlan={(scenario) =>
                            navigate(() => setParentScenarioId(scenario.id))
                          }
                        />
                      </Activity>
                      <Activity mode={view === "plans" ? "visible" : "hidden"}>
                        <PlansView />
                      </Activity>
                      <Activity mode={view === "runs" ? "visible" : "hidden"}>
                        <RunsView />
                      </Activity>
                      <Activity
                        mode={view === "connections" ? "visible" : "hidden"}
                      >
                        <ConnectionsView />
                      </Activity>
                    </WorkspaceShell>
                    {parentScenarioId ? (
                      <MaterialPicker
                        title="把剧本加入哪个编排？"
                        description="选择后加入目标草稿，保存目标后生效。"
                        items={state.plans.items.map((plan) => ({
                          id: plan.id,
                          name: plan.name,
                          description: `${plan.items.length} 个剧本 · ${plan.mode === "parallel" ? "并行" : "串行"}`,
                        }))}
                        onClose={() => setParentScenarioId(null)}
                        onSelect={(id) => {
                          replacePlan(() => {
                            dispatch(openPlan(id));
                            void dispatch(
                              addPlanLane({ scenarioId: parentScenarioId }),
                            );
                            dispatch(setView("plans"));
                          });
                        }}
                      />
                    ) : null}
                  </>
                )}
              </DraftGuard>
            )}
          </DraftGuard>
        )}
      </DraftGuard>
    </LibraryProvider>
  );
}
