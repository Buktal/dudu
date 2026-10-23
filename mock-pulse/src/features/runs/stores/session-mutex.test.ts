import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  connectionsReducer,
  initialConnectionsState,
} from "@/features/connections";
import {
  definitionsReducer,
  type EventItem,
  eventsReducer,
  initialEventsState,
  startDraft,
} from "@/features/events";
import {
  initialPlansState,
  openPlan,
  plansReducer,
  startPlanRun,
} from "@/features/plans";
import * as plansApi from "@/features/plans/api";
import { addLane, createPlan, type Plan } from "@/features/plans/model";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";
import * as api from "../api";
import type { RunStep } from "../model";
import { directDispatch } from "./direct-dispatch";
import { runProgress, selectLiveRun } from "./live";
import { initialRunsState, runsReducer, selectPanelPhase } from "./runs-slice";
import { startScenarioRun } from "./scenario-run";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDirect: vi.fn(),
  startScenarioRun: vi.fn(),
  stopRun: vi.fn(),
}));

vi.mock("@/features/plans/api", () => ({
  loadPlans: vi.fn(),
  savePlan: vi.fn(),
  deletePlanById: vi.fn(),
  startPlanRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);
const plansApiMock = vi.mocked(plansApi, true);

/**
 * 跨域互斥矩阵（此前 0 用例）：剧本运行中直发被拒、编排运行中剧本被拒、
 * 直发中编排与第二次直发被拒、运行结束后放行。三个 thunk condition 全部
 * 收敛到运行会话 canStartRun，这里在完整 RootState 上打穿真实派发路径。
 */

const DY_CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  system: "dop",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const WC_CONNECTION: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9999/webhooks/wecom",
  system: "agent",
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
    steps: [{ eventId: "evt-dy-1", revision: 1 }],
  },
  {
    id: "scn-wc",
    name: "企微接待",
    channelId: "wecom",
    steps: [{ eventId: "evt-wc-1", revision: 1 }],
  },
];

function douyinEvent(): EventItem {
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: {
          event: "im_receive_msg",
          client_key: "tt_key",
          content: { text: "你好" },
        },
        expected: { status: 200, body: "", bodyMode: "contains" },
      },
    ],
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

/** Rust 直发命令返回的成品单步快照 */
function directStep(): RunStep {
  return {
    eventName: "新客问价",
    eventId: "evt-dy-1",
    channel: "douyin",
    url: DY_CONNECTION.url,
    payload: '{"event":"im_receive_msg"}',
    expected: { status: 200, body: "", bodyMode: "contains" },
    signature: "a".repeat(40),
    msgId: "m-1",
    receipt: { status: 200, elapsedMs: 12, body: '{"code":0}', error: null },
    verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
  };
}

/** 全域 store：互斥矩阵的三个 condition 都在完整 RootState 上裁决 */
function makeStore() {
  return configureStore({
    reducer: {
      app: appReducer,
      runs: runsReducer,
      events: eventsReducer,
      definitions: definitionsReducer,
      connections: connectionsReducer,
      plans: plansReducer,
      scenarios: scenariosReducer,
    },
    preloadedState: {
      connections: {
        ...initialConnectionsState,
        loaded: true,
        items: { douyin: DY_CONNECTION, wecom: WC_CONNECTION },
      },
      events: {
        ...initialEventsState,
        items: [douyinEvent(), wecomEvent()],
        loaded: true,
      },
      scenarios: {
        ...initialScenariosState,
        items: SCENARIO_ITEMS,
        loaded: true,
      },
      plans: { ...initialPlansState, items: [SAVED_PLAN] },
      runs: initialRunsState,
    },
  });
}

describe("运行会话：跨域互斥矩阵（thunk condition 收敛到 canStartRun）", () => {
  it("剧本运行中：直发被拒；剧本结束后直发放行", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "直发", schemaId: "dy-text" }));
    apiMock.startScenarioRun.mockResolvedValueOnce("run-s1");
    await store.dispatch(startScenarioRun({ scenario: SCENARIO_ITEMS[0] }));
    // 实况 runId 来自物化快照（启动即投影），不取命令返回值
    const runId = selectLiveRun(store.getState().runs)?.runId as string;
    expect(runId).toBeTruthy();

    void store.dispatch(directDispatch());
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(selectPanelPhase(store.getState().runs)).toBe("idle");

    // 剧本运行 finished 收束后，直发放行
    store.dispatch(runProgress({ runId, index: 0, status: "finished" }));
    apiMock.dispatchDirect.mockResolvedValueOnce({
      step: directStep(),
      cancelled: false,
    });
    apiMock.saveRun.mockResolvedValueOnce([]);
    await store.dispatch(directDispatch());
    expect(apiMock.dispatchDirect).toHaveBeenCalledTimes(1);
  });

  it("编排运行中：剧本被拒；编排 finished 收束后剧本放行", async () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));
    plansApiMock.startPlanRun.mockResolvedValueOnce("run-p1");
    await store.dispatch(startPlanRun());
    expect(selectLiveRun(store.getState().runs)?.kind).toBe("plan");

    void store.dispatch(startScenarioRun({ scenario: SCENARIO_ITEMS[0] }));
    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(store.getState().runs.scenarioRunPhase).toBe("idle");

    const runId = selectLiveRun(store.getState().runs)?.runId ?? "";
    store.dispatch(runProgress({ runId, index: 0, status: "finished" }));
    apiMock.startScenarioRun.mockResolvedValueOnce("run-s1");
    await store.dispatch(startScenarioRun({ scenario: SCENARIO_ITEMS[0] }));
    expect(apiMock.startScenarioRun).toHaveBeenCalledTimes(1);
  });

  it("直发在途：编排与第二次直发都被拒；直发完成后编排放行", async () => {
    const store = makeStore();
    store.dispatch(openPlan(SAVED_PLAN.id));
    store.dispatch(startDraft({ name: "直发", schemaId: "dy-text" }));
    let finish!: (outcome: { step: RunStep; cancelled: boolean }) => void;
    apiMock.dispatchDirect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.dispatch(directDispatch());
    expect(selectPanelPhase(store.getState().runs)).toBe("sending");

    void store.dispatch(startPlanRun());
    expect(plansApiMock.startPlanRun).not.toHaveBeenCalled();
    void store.dispatch(directDispatch());
    expect(apiMock.dispatchDirect).toHaveBeenCalledTimes(1);

    finish({ step: directStep(), cancelled: false });
    await pending;
    plansApiMock.startPlanRun.mockResolvedValueOnce("run-p1");
    await store.dispatch(startPlanRun());
    expect(plansApiMock.startPlanRun).toHaveBeenCalledTimes(1);
  });

  it("直发在途时 activeRun 指向直发运行，完成后归零", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "直发", schemaId: "dy-text" }));
    let finish!: (outcome: { step: RunStep; cancelled: boolean }) => void;
    apiMock.dispatchDirect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.dispatch(directDispatch());
    expect(store.getState().runs.directLive).not.toBeNull();

    finish({ step: directStep(), cancelled: false });
    await pending;
    expect(store.getState().runs.directLive).toBeNull();
    expect(selectPanelPhase(store.getState().runs)).toBe("done");
  });
});
