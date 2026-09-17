import { describe, expect, it, vi } from "vitest";

import { runProgress } from "@/features/runs";
import { fetchScenarios } from "@/features/scenarios";
import * as api from "../api";
import { addLane, createPlan, type Plan } from "../model";
import {
  planNamesReferencingEvent,
  planNamesReferencingScenario,
} from "../selectors";
import {
  addPlanLane,
  deletePlan,
  fetchPlans,
  savePlan,
  savePlanAs,
  syncPlanLane,
  togglePlanFavorite,
} from "./plan-library";
import { startPlanRun } from "./plan-run";
import {
  DY_CONNECTION,
  makeStore,
  SAVED_PLAN,
  SCENARIO_ITEMS,
  WC_CONNECTION,
} from "./plan-test-fixtures";
import {
  discardPlanDraft,
  moveDraftLane,
  openPlan,
  selectPlanDirty,
  setPlanDraftFailure,
  setPlanDraftMode,
  setPlanDraftName,
  startPlanDraft,
} from "./plans-slice";

vi.mock("../api", () => ({
  loadPlans: vi.fn(),
  savePlan: vi.fn(),
  deletePlanById: vi.fn(),
  startPlanRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

describe("plans slice 素材库契约", () => {
  it("fetchPlans 装载持久化编排", async () => {
    const store = makeStore();
    apiMock.loadPlans.mockResolvedValueOnce([SAVED_PLAN]);
    await store.dispatch(fetchPlans());
    expect(store.getState().plans.items).toEqual([SAVED_PLAN]);
    expect(store.getState().plans.loaded).toBe(true);
  });

  it("savePlan：校验引用后透传草稿；引用失效拒绝且不调命令", async () => {
    const store = makeStore();
    store.dispatch(startPlanDraft({ name: "新编排", mode: "serial" }));
    await store.dispatch(addPlanLane({ scenarioId: "scn-dy" }));

    apiMock.savePlan.mockResolvedValueOnce([
      store.getState().plans.draft as Plan,
    ]);
    await store.dispatch(savePlan());
    expect(apiMock.savePlan).toHaveBeenCalledTimes(1);
    const saved = apiMock.savePlan.mock.calls[0]?.[0];
    expect(saved.name).toBe("新编排");
    expect(saved.mode).toBe("serial");
    expect(saved.items).toEqual([
      { scenarioId: "scn-dy", snapshot: SCENARIO_ITEMS[0] },
    ]);

    // 引用失效：validatePlan 拒绝，命令不被调用（剧本库中无 scn-gone）
    const broken = makeStore(
      {},
      addLane(createPlan("坏引用", "serial"), "scn-gone"),
    );
    const action = await broken.dispatch(savePlan());
    expect(savePlan.rejected.match(action)).toBe(true);
    expect(apiMock.savePlan).toHaveBeenCalledTimes(1);
  });

  it("addPlanLane：从剧本库引用；剧本不存在 rejected", async () => {
    const store = makeStore();
    store.dispatch(startPlanDraft({ name: "编排", mode: "parallel" }));
    await store.dispatch(addPlanLane({ scenarioId: "scn-dy" }));
    expect(store.getState().plans.draft?.items).toEqual([
      { scenarioId: "scn-dy", snapshot: SCENARIO_ITEMS[0] },
    ]);

    const action = await store.dispatch(
      addPlanLane({ scenarioId: "scn-gone" }),
    );
    expect(addPlanLane.rejected.match(action)).toBe(true);
    expect(store.getState().plans.draft?.items).toEqual([
      { scenarioId: "scn-dy", snapshot: SCENARIO_ITEMS[0] },
    ]);
  });

  it("savePlanAs：以新 id 复制保存，草稿切换为新副本", async () => {
    const store = makeStore();
    store.dispatch(openPlan("非存在 id"));
    store.dispatch(openPlan(SAVED_PLAN.id));
    store.dispatch(setPlanDraftMode("serial"));
    const draftBefore = store.getState().plans.draft as Plan;

    apiMock.savePlan.mockImplementationOnce(async (plan) => [plan]);
    await store.dispatch(savePlanAs());

    const state = store.getState().plans;
    expect(state.draft?.id).not.toBe(draftBefore.id);
    expect(state.draft?.mode).toBe("serial");
    expect(state.selectedId).toBe(state.draft?.id);
    expect(apiMock.savePlan.mock.calls[0]?.[0].id).toBe(state.draft?.id);
  });

  it("deletePlan：出列持久化列表；删除当前打开的编排时清空草稿", async () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.deletePlanById.mockResolvedValueOnce([]);
    await store.dispatch(deletePlan(SAVED_PLAN.id));
    expect(store.getState().plans.items).toEqual([]);
    expect(store.getState().plans.draft).toBeNull();
    expect(store.getState().plans.selectedId).toBeNull();
  });

  it("togglePlanFavorite：翻转星标并持久化，草稿同源同步", async () => {
    const store = makeStore();
    apiMock.savePlan.mockImplementationOnce(async (plan) => [plan]);
    await store.dispatch(togglePlanFavorite(SAVED_PLAN.id));
    expect(apiMock.savePlan.mock.calls[0]?.[0].favorite).toBe(true);
  });

  it("草稿编辑：mode/failure 切换、lane 调序越界无操作、放弃草稿回库内副本", () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));

    store.dispatch(setPlanDraftMode("serial"));
    store.dispatch(setPlanDraftFailure("stop"));
    expect(store.getState().plans.draft?.mode).toBe("serial");
    expect(store.getState().plans.draft?.failure).toBe("stop");

    // 越界：首条上移 / 末条下移 / 索引出界，原样返回
    const before = store.getState().plans.draft?.items;
    store.dispatch(moveDraftLane({ index: 0, delta: -1 }));
    expect(store.getState().plans.draft?.items).toBe(before);
    store.dispatch(moveDraftLane({ index: 1, delta: 1 }));
    expect(store.getState().plans.draft?.items).toBe(before);
    store.dispatch(moveDraftLane({ index: 9, delta: 1 }));
    expect(store.getState().plans.draft?.items).toBe(before);

    // 调序生效
    store.dispatch(moveDraftLane({ index: 1, delta: -1 }));
    expect(
      store.getState().plans.draft?.items.map((i) => i.scenarioId),
    ).toEqual(["scn-wc", "scn-dy"]);

    // 放弃草稿：回库内副本
    store.dispatch(discardPlanDraft());
    expect(
      store.getState().plans.draft?.items.map((i) => i.scenarioId),
    ).toEqual(["scn-dy", "scn-wc"]);
  });
});

describe("跨 feature 窄 selector", () => {
  it("planNamesReferencingScenario：RootState 形状与 PlansState 形状皆可查", () => {
    const store = makeStore();
    expect(planNamesReferencingScenario(store.getState(), "scn-dy")).toEqual([
      "双平台接待回归",
    ]);
    expect(
      planNamesReferencingScenario(store.getState().plans, "scn-dy"),
    ).toEqual(["双平台接待回归"]);
    expect(planNamesReferencingScenario(store.getState(), "scn-gone")).toEqual(
      [],
    );
  });
});

describe("编排快照与异步草稿回归", () => {
  it("保存旧编排补齐剧本快照并清除脏状态", async () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.savePlan.mockImplementationOnce(async (plan) => [plan]);
    await store.dispatch(savePlan()).unwrap();
    expect(store.getState().plans.draft?.items[0].snapshot).toEqual(
      SCENARIO_ITEMS[0],
    );
    expect(selectPlanDirty(store.getState().plans)).toBe(false);
  });

  it("来源修改后保持旧快照，只有显式同步才更新", async () => {
    const store = makeStore();
    store.dispatch(startPlanDraft({ name: "固定版本", mode: "serial" }));
    await store.dispatch(addPlanLane({ scenarioId: "scn-dy" }));
    const changed = {
      ...SCENARIO_ITEMS[0],
      name: "来源已经修改",
      revision: 2,
      steps: [],
    };
    store.dispatch(fetchScenarios.fulfilled([changed], "refetch"));
    expect(store.getState().plans.draft?.items[0].snapshot).toEqual(
      SCENARIO_ITEMS[0],
    );
    apiMock.savePlan.mockImplementationOnce(async (plan) => [plan]);
    await store.dispatch(savePlan()).unwrap();
    expect(
      planNamesReferencingEvent(store.getState().plans, "evt-dy-1"),
    ).toEqual(["固定版本"]);
    await store.dispatch(syncPlanLane(0)).unwrap();
    expect(store.getState().plans.draft?.items[0].snapshot).toEqual(changed);
  });

  it("另存为返回不覆盖其间编辑的草稿", async () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));
    let finish!: (plans: Plan[]) => void;
    let copy!: Plan;
    apiMock.savePlan.mockImplementationOnce((plan) => {
      copy = plan;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = store.dispatch(savePlanAs("副本"));
    store.dispatch(setPlanDraftName("尚未保存的后续修改"));
    finish([SAVED_PLAN, copy]);
    await pending;
    expect(store.getState().plans.draft?.name).toBe("尚未保存的后续修改");
    expect(store.getState().plans.draft?.id).toBe(SAVED_PLAN.id);
  });

  it("删除其他编排保留新草稿", () => {
    const store = makeStore();
    store.dispatch(startPlanDraft({ name: "未保存", mode: "parallel" }));
    const before = store.getState().plans.draft;
    store.dispatch(deletePlan.fulfilled([], "delete-request", SAVED_PLAN.id));
    expect(store.getState().plans.draft).toEqual(before);
  });

  it("完成事件先于启动命令返回时不复活运行", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockImplementationOnce(async (snapshot) => {
      expect(store.getState().runs.live?.runId).toBe(snapshot.runId);
      store.dispatch(
        runProgress({ runId: snapshot.runId, index: 0, status: "finished" }),
      );
      return snapshot.runId;
    });
    await store.dispatch(startPlanRun()).unwrap();
    expect(store.getState().runs.live).toBeNull();
    expect(store.getState().plans.planRunPhase).toBe("idle");
    expect(store.getState().plans.activeRunId).toBeNull();
  });
});
