// 模块图说明：本域单向依赖 events | connections（经对方 index.ts，类型 +
// 连接就绪判定）→ lib；不反向被它们引用。运行实况投影（live.ts）、运行
// 会话（session.ts，互斥/在途/连接门/停止态的唯一出口）、运行区编排
// （run-section.tsx，剧本/编排编辑器共用的按钮/连接指引/运行块）与
// 「最近一次运行」查询（selectors 的 lastRunFor）都在本域，plans /
// scenarios 域经本入口消费。门面只保留有跨域消费者的导出。

export { DispatchPanel } from "./components/dispatch-panel";
export { RunPersistenceNotice } from "./components/run-persistence-notice";
export {
  RunButton,
  RunConnectionNotice,
  RunSection,
} from "./components/run-section";
export {
  liveLanes,
  RunLanes,
  RunSummary,
  recordLanes,
} from "./components/run-visualization";
export { RunsView } from "./components/runs-view";
export { lastRunFor } from "./selectors";
export { materializeRunSnapshot, type RunSnapshot } from "./snapshot";
export { directDispatch } from "./stores/direct-dispatch";
export {
  type LaunchState,
  type LaunchStore,
  launchDirectRun,
  launchProjectedRun,
  type ProjectedLaunch,
  type ProjectedOutcome,
} from "./stores/launch";
export {
  type LiveRun,
  liveFromPlanSnapshot,
  liveStarted,
  type PlanRunSnapshotLike,
  type RunProgressPayload,
  runProgress,
  selectLiveRun,
  selectLiveRunFor,
  startLiveRun,
} from "./stores/live";
export {
  fetchRuns,
  runsReducer,
  selectPanelPhase,
  selectRun,
  selectRuns,
  stopRun,
} from "./stores/runs-slice";
export { startScenarioRun } from "./stores/scenario-run";
export {
  canStartRun,
  isRunBusy,
  isStoppingRun,
  missingConnections,
  type RunPhase,
} from "./stores/session";
