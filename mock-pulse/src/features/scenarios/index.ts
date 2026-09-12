// 模块图说明：本域 slice 运行时依赖 @/features/events（事件删除守卫转发
// deleteEvent），events 的编辑器又依赖本域守卫——形成 feature 间环。
// 环安全靠两条不变量：feature 组件只 type-only 引 @/store（项目既有约定）；
// 跨 feature 的运行时引用一律在回调内惰性使用，不在模块求值期取值。

export { ScenariosView } from "./components/scenarios-view";
export {
  type Scenario,
  type ScenarioStep,
  scenariosReferencingEvent,
} from "./model";
export {
  filterScenarios,
  PAGE_SIZE,
  paginateScenarios,
  resolveSteps,
  type ScenarioFilters,
  type ScenarioPage,
  type ScenarioRow,
  type StepRow,
} from "./selectors";
export {
  addScenarioStep,
  deleteEventGuarded,
  deleteScenario,
  discardScenarioDraft,
  fetchScenarios,
  initialScenariosState,
  moveDraftStep,
  openScenario,
  removeDraftStep,
  type ScenariosState,
  saveScenario,
  scenarioNamesReferencingEvent,
  scenariosReducer,
  selectScenarioDraft,
  selectScenarioFilters,
  selectScenarioPage,
  selectScenarios,
  setDraftChannel,
  setDraftName,
  setFilters,
  setPage,
  startScenarioDraft,
  syncAllScenarioSteps,
  syncScenarioStep,
} from "./stores/scenarios-slice";
