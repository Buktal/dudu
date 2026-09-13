// 模块图说明：本域单向依赖 runs | scenarios | events | connections（经对方
// index.ts，类型为主）→ lib；不反向被它们引用。「先查编排引用再删剧本」的
// 编排在组合根（src/hooks/use-delete-scenario-guarded.ts），本域只保留
// 引用查询能力（plansReferencingScenario + slice 的窄 selector）。

export { PlansView } from "./components/plans-view";
export { materializePlanRun, type PlanRunSnapshot } from "./materialize";
export {
  newPlanId,
  type Plan,
  type PlanFailure,
  type PlanItem,
  type PlanMode,
  planModeLabel,
  plansReferencingScenario,
  validatePlan,
} from "./model";
export {
  filterPlans,
  PAGE_SIZE,
  type PlanFilters,
  type PlanPage,
  type PlanRow,
  paginatePlans,
  planStats,
} from "./selectors";
export {
  addPlanLane,
  deletePlan,
  discardPlanDraft,
  fetchPlans,
  initialPlansState,
  type LivePlanLane,
  type LivePlanRun,
  type LivePlanStep,
  moveDraftLane,
  onPlanProgress,
  openPlan,
  type PlanRunPhase,
  planNamesReferencingEvent,
  planNamesReferencingScenario,
  plansReducer,
  removeDraftLane,
  savePlan,
  savePlanAs,
  selectLivePlanRun,
  selectPlanDirty,
  selectPlanDraft,
  selectPlanFilters,
  selectPlanPage,
  selectPlanRunMessage,
  selectPlanRunPhase,
  selectPlans,
  setFilters,
  setPage,
  setPlanDraftFailure,
  setPlanDraftMode,
  setPlanDraftName,
  startPlanDraft,
  startPlanRun,
  togglePlanFavorite,
} from "./stores/plans-slice";
