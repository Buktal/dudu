// 模块图说明：本域单向依赖 @/features/events（类型 + 装载事件库），
// 不反向被 events 引用。「先查引用再删事件」的编排在组合根
// （src/hooks/use-delete-event-guarded.ts），本域只保留引用查询能力。

export { ScenariosView } from "./components/scenarios-view";
export {
  addTemplateStep,
  type EventStep,
  isTemplateStep,
  type Scenario,
  type ScenarioStep,
  scenariosReferencingEvent,
  type TemplateStep,
} from "./model";
export {
  filterScenarios,
  paginateScenarios,
  resolveSteps,
  type ScenarioFilters,
  type ScenarioPage,
  type ScenarioRow,
  type StepRow,
} from "./selectors";
export {
  addScenarioStep,
  addScenarioTemplateStep,
  deleteScenario,
  discardScenarioDraft,
  fetchScenarios,
  initialScenariosState,
  moveDraftStep,
  openScenario,
  removeDraftStep,
  replaceScenarioTemplateStep,
  type ScenariosState,
  saveScenario,
  scenarioNamesReferencingEvent,
  scenariosReducer,
  selectScenarioDirty,
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
