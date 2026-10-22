import {
  discardConnectionDraft,
  saveConnection,
  selectConnectionDirty,
} from "@/features/connections";
import { discardDraft, saveEvent, selectDraftDirty } from "@/features/events";
import { discardPlanDraft, savePlan, selectPlanDirty } from "@/features/plans";
import {
  discardScenarioDraft,
  saveScenario,
  selectScenarioDirty,
} from "@/features/scenarios";
import {
  VIEWS,
  type ViewBehavior,
  type ViewEntry,
  type ViewId,
} from "@/stores/app-slice";

/**
 * 组合根的视图行为装配：给 app-slice 的元数据注册表补齐「当前视图草稿」的
 * 脏判定、保存与放弃（App 外层 DraftGuard 消费）。与 store.ts 同层的组合根
 * 职责——全项目仅此处在 app 层 import feature 的运行时导出；app-slice 保持
 * 零 feature 依赖（event-editor 等组件反向 import setView，直接装配会成环）。
 */
const VIEW_BEHAVIORS: Record<ViewId, ViewBehavior> = {
  events: {
    draftName: (root) => root.events.draft?.name ?? null,
    isDirty: (root) => selectDraftDirty(root.events),
    save: (_root, dispatch) => dispatch(saveEvent()).unwrap(),
    discard: (_root, dispatch) => dispatch(discardDraft()),
  },
  scenarios: {
    draftName: (root) => root.scenarios.draft?.name ?? null,
    isDirty: (root) => selectScenarioDirty(root.scenarios),
    save: (_root, dispatch) => dispatch(saveScenario()).unwrap(),
    discard: (_root, dispatch) => dispatch(discardScenarioDraft()),
  },
  plans: {
    draftName: (root) => root.plans.draft?.name ?? null,
    isDirty: (root) => selectPlanDirty(root.plans),
    save: (_root, dispatch) => dispatch(savePlan()).unwrap(),
    discard: (_root, dispatch) => dispatch(discardPlanDraft()),
  },
  // 运行记录无草稿语义：守卫按 dirty=false 直通，保存/放弃不会被触达
  runs: {
    isDirty: () => false,
    save: () => Promise.resolve(),
    discard: () => undefined,
  },
  connections: {
    isDirty: (root) =>
      selectConnectionDirty(root.connections, root.connections.selectedChannel),
    save: (root, dispatch) => {
      const draft = root.connections.drafts?.[root.connections.selectedChannel];
      return draft
        ? dispatch(saveConnection(draft)).unwrap()
        : Promise.resolve();
    },
    discard: (root, dispatch) =>
      dispatch(discardConnectionDraft(root.connections.selectedChannel)),
  },
};

/** 元数据 ∪ 行为位：侧栏导航与 App 外层守卫共用的完整视图注册表 */
export const VIEW_ENTRIES: readonly (ViewEntry & {
  behavior: ViewBehavior;
})[] = VIEWS.map((entry) => ({
  ...entry,
  behavior: VIEW_BEHAVIORS[entry.id],
}));

/** 注册表必命中（view 只能来自受校验的 setView 或初始态） */
export function resolveViewEntry(
  view: ViewId,
): ViewEntry & { behavior: ViewBehavior } {
  const found = VIEW_ENTRIES.find((entry) => entry.id === view);
  if (!found) {
    throw new Error(`视图未注册：${view}`);
  }
  return found;
}
