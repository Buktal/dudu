import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  connectionsReducer,
  initialConnectionsState,
} from "@/features/connections";
import {
  type EventItem,
  eventsReducer,
  initialEventsState,
} from "@/features/events";
import {
  runProgress,
  runsReducer,
  selectLiveRun,
  selectLiveRunFor,
  selectRuns,
} from "@/features/runs";
import {
  fetchScenarios,
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";
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
  discardPlanDraft,
  initialPlansState,
  moveDraftLane,
  openPlan,
  plansReducer,
  selectPlanDirty,
  selectPlanRunPhase,
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

const DY_CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
};

const WC_CONNECTION: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9999/webhooks/wecom",
  corpId: "ww_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "218",
};

const SCENARIO_ITEMS: Scenario[] = [
  {
    id: "scn-dy",
    name: "抖音接待",
    channelId: "douyin",
    steps: [
      { eventId: "evt-dy-1", revision: 1 },
      { eventId: "evt-dy-1", revision: 2 },
    ],
  },
  {
    id: "scn-wc",
    name: "企微接待",
    channelId: "wecom",
    steps: [{ eventId: "evt-wc-1", revision: 1 }],
  },
];

/** 抖音事件（dy-text）：两个版本，物化明文的引用事实源 */
function douyinEvent(): EventItem {
  const version = (revision: number, text: string) => ({
    revision,
    savedAt: `2026-09-12T0${revision}:00:00.000Z`,
    payload: {
      event: "im_receive_msg",
      client_key: "tt_key",
      from_user_id: "user-1",
      content: { text, conversation_type: 1 },
    },
    expected: { status: 200, body: "", bodyMode: "contains" as const },
  });
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [version(1, "你好"), version(2, "在吗")],
  };
}

function wecomEvent(): EventItem {
  return {
    id: "evt-wc-1",
    name: "企微文本",
    channelId: "wecom",
    schemaId: "wc-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: {
          ToUserName: "ww_corp",
          FromUserName: "member1",
          CreateTime: "1348831860",
          MsgType: "text",
          Content: "你好，企业微信",
          MsgId: "7151772163216742434",
          AgentID: "218",
        },
        expected: { status: 200, body: "success", bodyMode: "wecomReply" },
      },
    ],
  };
}

const SAVED_PLAN: Plan = addLane(
  addLane(createPlan("双平台接待回归", "parallel"), "scn-dy"),
  "scn-wc",
);

/** 剧本库 + 事件库 + 连接态注入（plans 运行链路的全部依赖；
 *  reducer 形状对齐全局 RootState，startPlanRun 的 state 泛型才可派发） */
function makeStore(
  connections: Record<string, ConnectionConfig> = {},
  draft: Plan | null = null,
) {
  return configureStore({
    reducer: {
      app: appReducer,
      plans: plansReducer,
      scenarios: scenariosReducer,
      events: eventsReducer,
      runs: runsReducer,
      connections: connectionsReducer,
    },
    preloadedState: {
      plans: { ...initialPlansState, items: [SAVED_PLAN], draft },
      scenarios: { ...initialScenariosState, items: SCENARIO_ITEMS },
      events: {
        ...initialEventsState,
        items: [douyinEvent(), wecomEvent()],
        loaded: true,
      },
      connections: {
        ...initialConnectionsState,
        loaded: true,
        items: connections,
      },
    },
  });
}

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

describe("plans slice 编排运行状态流转", () => {
  it("startPlanRun：物化编排快照→调 Rust 命令→runs 域投影实况（每 lane 每步 pending）", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");

    await store.dispatch(startPlanRun());

    // Rust 命令收到编排快照与去重后的连接列表
    const call = apiMock.startPlanRun.mock.calls[0];
    const snapshot = call?.[0];
    expect(snapshot.mode).toBe("parallel");
    expect(snapshot.failure).toBe("continue");
    expect(snapshot.planName).toBe("双平台接待回归");
    expect(snapshot.scenarios.map((s) => s.scenarioId)).toEqual([
      "scn-dy",
      "scn-wc",
    ]);
    expect(call?.[1]).toEqual([DY_CONNECTION, WC_CONNECTION]);

    expect(selectPlanRunPhase(store.getState().plans)).toBe("running");
    const planId = store.getState().plans.draft?.id as string;
    const live = selectLiveRunFor(store.getState().runs, "plan", planId);
    expect(live?.runId).toBe(snapshot.runId);
    expect(live?.kind).toBe("plan");
    expect(live?.lanes).toHaveLength(2);
    expect(live?.lanes[0].name).toBe("抖音接待");
    expect(live?.lanes[0].steps.map((step) => step.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(live?.lanes[1].steps[0].status).toBe("pending");
  });

  it("未配置连接：不物化不调命令，phase 指引并带缺失渠道", async () => {
    const store = makeStore({ douyin: DY_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    await store.dispatch(startPlanRun());

    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("needConnection");
    expect(selectLiveRun(store.getState().runs)).toBeNull();
  });

  it("物化失败（引用剧本不在库）：rejected 且给可读错误，不调命令", async () => {
    // 草稿直接注入悬空引用（addPlanLane 正常流程会拦下，此处测运行前兜底校验）
    const store = makeStore(
      { douyin: DY_CONNECTION, wecom: WC_CONNECTION },
      addLane(addLane(createPlan("坏引用", "serial"), "scn-dy"), "scn-gone"),
    );

    const action = await store.dispatch(startPlanRun());
    expect(startPlanRun.rejected.match(action)).toBe(true);
    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("error");
  });

  it("没有草稿时为空操作", async () => {
    const store = makeStore({ douyin: DY_CONNECTION });
    await store.dispatch(startPlanRun());
    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("idle");
  });

  it("runProgress 投影 + selectLiveRunFor 派生：按 runId 过滤、按 lane 路由步骤实况", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");
    await store.dispatch(startPlanRun());
    const planId = store.getState().plans.draft?.id as string;
    const runId = selectLiveRun(store.getState().runs)?.runId as string;

    // lane 0 第 1 步 waiting → success（带步骤快照）
    store.dispatch(
      runProgress({ runId, index: 0, status: "waiting", lane: 0 }),
    );
    store.dispatch(
      runProgress({
        runId,
        index: 0,
        status: "success",
        lane: 0,
        step: {
          eventName: "新客问价",
          eventId: "evt-dy-1",
          channel: "douyin",
          url: "http://127.0.0.1/hook",
          payload: "{}",
          signature: "a",
          msgId: "m-1",
          receipt: { status: 200, elapsedMs: 5, body: "ok", error: null },
          verdict: { passed: true, reason: "ok" },
        },
      }),
    );
    // lane 1 第 1 步 skipped（串行失败即停的未启动剧本）
    store.dispatch(
      runProgress({ runId, index: 0, status: "skipped", lane: 1 }),
    );

    const live = selectLiveRunFor(store.getState().runs, "plan", planId);
    expect(live?.lanes[0].steps[0]).toMatchObject({
      status: "success",
      step: { msgId: "m-1" },
    });
    expect(live?.lanes[0].steps[1].status).toBe("pending");
    expect(live?.lanes[1].steps[0].status).toBe("skipped");

    // runId 不匹配（其他运行）与 lane 缺失（剧本事件）都不影响本编排实况
    store.dispatch(
      runProgress({
        runId: "run-other",
        index: 0,
        status: "failed",
        lane: 0,
      }),
    );
    store.dispatch(runProgress({ runId, index: 1, status: "failed" }));
    expect(live?.lanes[0].steps[1].status).toBe("pending");
    expect(live?.lanes[0].steps[0].status).toBe("success");
  });

  it("runProgress finished：清空实况并收束阶段（历史入列在 runs 域）", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");
    await store.dispatch(startPlanRun());
    const planId = store.getState().plans.draft?.id as string;
    const runId = selectLiveRun(store.getState().runs)?.runId as string;

    const finishedRecord = {
      id: runId,
      startedAt: "2026-09-12T04:00:00.000Z",
      source: "plan" as const,
      planName: "双平台接待回归",
      steps: [],
    };
    store.dispatch(
      runProgress({
        runId,
        index: 0,
        status: "finished",
        run: finishedRecord,
      }),
    );
    expect(selectLiveRunFor(store.getState().runs, "plan", planId)).toBeNull();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("idle");
    expect(store.getState().plans.activeRunId).toBeNull();
    // plans 域不收纳历史记录（runs 域消费同一事件入列）
    expect(store.getState().plans.items).toEqual([SAVED_PLAN]);
    expect(selectRuns(store.getState().runs)).toEqual([finishedRecord]);
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
