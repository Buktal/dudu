// 模块图说明：本域单向依赖 events | connections（经对方 index.ts，类型 +
// 连接就绪判定）→ lib；不反向被它们引用。运行实况投影（live.ts）与运行
// 会话（session.ts，互斥/在途/连接门/停止态的唯一出口）都在本域，plans 域
// 经本入口消费它们。

export type {
  DirectDispatchPayload,
  DirectSendOutcome,
} from "./api";
export { DispatchPanel } from "./components/dispatch-panel";
export { RunPersistenceNotice } from "./components/run-persistence-notice";
export { RunStepDetail, StepVerdictBadge } from "./components/run-step-detail";
export {
  liveLanes,
  RunLanes,
  RunSummary,
  recordLanes,
  StatusBadge,
  type TimelineLane,
} from "./components/run-visualization";
export { RunsView } from "./components/runs-view";
export type {
  ReceiptSnapshot,
  RunRecord,
  RunStep,
  RunVerdict,
} from "./model";
export {
  filterRuns,
  type LaneGroup,
  laneGroups,
  type RunFilters,
  type RunRow,
  runStatus,
} from "./selectors";
export {
  materializeRunSnapshot,
  type RunSnapshot,
  type RunStepSnapshot,
  type SnapshotSource,
} from "./snapshot";
export {
  type DispatchPanelPhase,
  type DispatchResult,
  directDispatch,
} from "./stores/direct-dispatch";
export {
  applyLiveProgress,
  type LiveLane,
  type LiveRun,
  type LiveRunKind,
  type LiveRunSeed,
  type LiveStep,
  type LiveStepStatus,
  liveCleared,
  liveRunFromLanes,
  liveStarted,
  type RunProgressPayload,
  runProgress,
  selectLiveRun,
  selectLiveRunFor,
} from "./stores/live";
export {
  clearDispatch,
  fetchRuns,
  initialRunsState,
  retrySaveRun,
  runsReducer,
  selectLastDispatch,
  selectPanelMessage,
  selectPanelPhase,
  selectRun,
  selectRuns,
  selectScenarioRunMessage,
  selectScenarioRunPhase,
  stopRun,
} from "./stores/runs-slice";
export {
  type ScenarioRunPhase,
  type StartScenarioRunPayload,
  startScenarioRun,
} from "./stores/scenario-run";
export {
  type ActiveRun,
  activeRun,
  canStartRun,
  isRunBusy,
  isStoppingRun,
  missingConnections,
  type PlanRunSliceLike,
  type RunKind,
  type RunPhase,
  type RunSessionState,
  type RunStartCheck,
  stoppingRunId,
} from "./stores/session";
