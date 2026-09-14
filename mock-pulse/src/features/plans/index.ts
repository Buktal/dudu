// 模块图说明：本域单向依赖 runs | scenarios | events | connections（经对方
// index.ts，类型为主）→ lib；不反向被它们引用。「先查编排引用再删剧本」的
// 编排在组合根（src/hooks/use-delete-scenario-guarded.ts），本域只保留
// 引用查询能力（planNamesReferencing* 窄 selector）。
// 运行实况投影在 runs 域：本域经 plan-run 的 selectPlanLiveRun 派生编排实况，
// 经 runs 的运行会话模块裁决启动互斥，不复制实况状态。

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
  planNamesReferencingEvent,
  planNamesReferencingScenario,
  planStats,
} from "./selectors";
export {
  addPlanLane,
  deletePlan,
  fetchPlans,
  savePlan,
  savePlanAs,
  syncPlanLane,
  togglePlanFavorite,
} from "./stores/plan-library";
export {
  selectPlanLiveRun,
  startPlanRun,
} from "./stores/plan-run";
export {
  discardPlanDraft,
  initialPlansState,
  moveDraftLane,
  openPlan,
  type PlanRunPhase,
  plansReducer,
  removeDraftLane,
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
  toggleDraftFavorite,
} from "./stores/plans-slice";
