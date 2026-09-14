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
import { plansReducer } from "@/features/plans";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";
import * as api from "../api";
import { runProgress, selectLiveRun } from "./live";
import { runsReducer, selectRuns, selectScenarioRunPhase } from "./runs-slice";
import { startScenarioRun } from "./scenario-run";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDirect: vi.fn(),
  startScenarioRun: vi.fn(),
  stopRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

const CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  system: "dop",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

/** 已保存的抖音事件（dy-text 模板线上形态，两个版本） */
const savedDouyinEvent: EventItem = {
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
    {
      revision: 2,
      savedAt: "2026-09-12T02:00:00.000Z",
      payload: {
        event: "im_receive_msg",
        client_key: "tt_key",
        content: { text: "在吗" },
      },
      expected: { status: 200, body: "", bodyMode: "contains" },
    },
  ],
};

const scenarioDraft: Scenario = {
  id: "scn-1",
  name: "抖音接待",
  channelId: "douyin",
  steps: [
    { eventId: "evt-dy-1", revision: 1 },
    { eventId: "evt-dy-1", revision: 2 },
  ],
};

/** 剧本运行用 store：可注入连接态/剧本草稿/事件库（缺省用标准夹具） */
function makeScenarioStore(overrides?: {
  connection?: ConnectionConfig;
  draft?: Scenario;
  noDraft?: boolean;
  events?: EventItem[];
}) {
  const connection = overrides?.connection;
  const items: Record<string, ConnectionConfig> = connection
    ? { [connection.channel]: connection }
    : {};
  const draft = overrides?.noDraft ? null : (overrides?.draft ?? scenarioDraft);
  return configureStore({
    reducer: {
      app: appReducer,
      runs: runsReducer,
      events: eventsReducer,
      connections: connectionsReducer,
      plans: plansReducer,
      scenarios: scenariosReducer,
    },
    preloadedState: {
      connections: { ...initialConnectionsState, loaded: true, items },
      scenarios: { ...initialScenariosState, draft },
      events: {
        ...initialEventsState,
        items: overrides?.events ?? [savedDouyinEvent],
        loaded: true,
      },
    },
  });
}

function finishedRun(id: string) {
  return {
    id,
    startedAt: "2026-09-12T03:00:00.000Z",
    source: "scenario" as const,
    scenarioName: "抖音接待",
    steps: [],
  };
}

/** run-progress 完成事件携带的步骤快照样本（Rust 产出形态） */
const progressStep = {
  eventName: "新客问价",
  eventId: "evt-dy-1",
  channel: "douyin" as const,
  url: "http://127.0.0.1:9999/webhooks/douyin",
  payload: '{"event":"im_receive_msg"}',
  signature: "a".repeat(40),
  msgId: "m-1",
  receipt: { status: 200, elapsedMs: 8, body: "ok", error: null },
  verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
};

type ScenarioStore = ReturnType<typeof makeScenarioStore>;
const phaseOf = (store: ScenarioStore) =>
  selectScenarioRunPhase(store.getState().runs);
const liveOf = (store: ScenarioStore) => selectLiveRun(store.getState().runs);

describe("runs 剧本运行状态流转（scenario-run）", () => {
  it("startScenarioRun：调用方传入用例数据→物化快照→调 Rust 命令→实况就绪", async () => {
    const store = makeScenarioStore({ connection: CONNECTION });
    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );

    await store.dispatch(startScenarioRun({ scenario: scenarioDraft }));

    // Rust 命令收到物化快照（引用版本物化的明文）与连接列表
    const call = apiMock.startScenarioRun.mock.calls[0];
    const snapshot = call?.[0];
    expect(snapshot.scenarioId).toBe("scn-1");
    expect(snapshot.scenarioName).toBe("抖音接待");
    expect(snapshot.steps).toHaveLength(2);
    expect(snapshot.steps[0].body).toContain("你好");
    expect(snapshot.steps[1].body).toContain("在吗");
    expect(call?.[1]).toEqual([CONNECTION]);

    // 实况（runs 域投影）：单 lane 两步 pending，携带事件名与渠道
    expect(phaseOf(store)).toBe("running");
    const live = liveOf(store);
    expect(live?.runId).toBe(snapshot.runId);
    expect(live?.kind).toBe("scenario");
    expect(live?.name).toBe("抖音接待");
    expect(live?.lanes[0].channel).toBe("douyin");
    expect(live?.lanes[0].steps.map((step) => step.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(live?.lanes[0].steps[0].eventName).toBe("新客问价");
  });

  it("单步运行（stepIndex）：只物化该步且等待清零", async () => {
    const store = makeScenarioStore({ connection: CONNECTION });
    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );

    await store.dispatch(
      startScenarioRun({ scenario: scenarioDraft, stepIndex: 1 }),
    );

    const snapshot = apiMock.startScenarioRun.mock.calls[0]?.[0];
    expect(snapshot.steps).toHaveLength(1);
    expect(snapshot.steps[0].body).toContain("在吗");
    expect(snapshot.steps[0].wait).toBe(0);
    expect(liveOf(store)?.lanes[0].steps).toHaveLength(1);
  });

  it("未配置连接：不物化不调命令，phase 指引", async () => {
    const store = makeScenarioStore();
    await store.dispatch(startScenarioRun({ scenario: scenarioDraft }));

    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(phaseOf(store)).toBe("needConnection");
    expect(liveOf(store)).toBeNull();
  });

  it("物化失败（悬空引用）：rejected 且给可读错误，不调命令", async () => {
    const broken = makeScenarioStore({ connection: CONNECTION, events: [] });

    const action = await broken.dispatch(
      startScenarioRun({
        scenario: {
          ...scenarioDraft,
          steps: [{ eventId: "evt-gone", revision: 1 }],
        },
      }),
    );
    expect(startScenarioRun.rejected.match(action)).toBe(true);
    if (startScenarioRun.rejected.match(action)) {
      expect(action.error.message).toMatch(/第 1 步引用的事件不存在：evt-gone/);
    }
    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(phaseOf(broken)).toBe("error");
  });

  it("无 payload（调用方无草稿）时为空操作", async () => {
    const empty = makeScenarioStore({ noDraft: true });

    await empty.dispatch(startScenarioRun());
    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(selectScenarioRunPhase(empty.getState().runs)).toBe("idle");
  });

  it("runProgress 投影：waiting→success/failed/skipped 逐事件驱动实况", async () => {
    const store = makeScenarioStore({ connection: CONNECTION });
    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );
    await store.dispatch(startScenarioRun({ scenario: scenarioDraft }));
    const runId = liveOf(store)?.runId ?? "";

    store.dispatch(runProgress({ runId, index: 0, status: "waiting" }));
    expect(liveOf(store)?.lanes[0].steps[0].status).toBe("waiting");

    store.dispatch(
      runProgress({ runId, index: 0, status: "success", step: progressStep }),
    );
    const live = liveOf(store);
    expect(live?.lanes[0].steps[0].status).toBe("success");
    expect(live?.lanes[0].steps[0].step?.msgId).toBe("m-1");
    expect(live?.lanes[0].steps[1].status).toBe("pending");

    const failedStep = {
      ...progressStep,
      verdict: { passed: false, reason: "HTTP 500，期望 HTTP 200" },
    };
    store.dispatch(
      runProgress({ runId, index: 1, status: "failed", step: failedStep }),
    );
    expect(liveOf(store)?.lanes[0].steps[1].status).toBe("failed");
  });

  it("runProgress：skipped 标记 + finished 落记录并清实况", async () => {
    const store = makeScenarioStore({ connection: CONNECTION });
    store.dispatch(
      runProgress({
        runId: "run-unknown",
        index: 0,
        status: "waiting",
      }),
    );
    expect(liveOf(store)).toBeNull();

    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );
    await store.dispatch(startScenarioRun({ scenario: scenarioDraft }));
    const runId = liveOf(store)?.runId ?? "";

    store.dispatch(runProgress({ runId, index: 1, status: "skipped" }));
    expect(liveOf(store)?.lanes[0].steps[1].status).toBe("skipped");

    const record = finishedRun(runId);
    store.dispatch(
      runProgress({ runId, index: 2, status: "finished", run: record }),
    );
    // 记录入列（时间升序）+ 实况清空 + phase 回 idle
    expect(selectRuns(store.getState().runs)).toEqual([record]);
    expect(liveOf(store)).toBeNull();
    expect(phaseOf(store)).toBe("idle");
  });

  it("完成事件先于启动 IPC 返回不会复活实况，重复完成事件不重复入列", async () => {
    const store = makeScenarioStore({ connection: CONNECTION });
    apiMock.startScenarioRun.mockImplementationOnce(async (snapshot) => {
      expect(store.getState().runs.live?.runId).toBe(snapshot.runId);
      store.dispatch(
        runProgress({ runId: snapshot.runId, index: 0, status: "waiting" }),
      );
      expect(store.getState().runs.live?.lanes[0].steps[0].status).toBe(
        "waiting",
      );
      const event = {
        runId: snapshot.runId,
        index: 2,
        status: "finished" as const,
        run: finishedRun(snapshot.runId),
      };
      store.dispatch(runProgress(event));
      store.dispatch(runProgress(event));
      return snapshot.runId;
    });
    await store
      .dispatch(startScenarioRun({ scenario: scenarioDraft }))
      .unwrap();
    expect(store.getState().runs.live).toBeNull();
    expect(store.getState().runs.scenarioRunPhase).toBe("idle");
    expect(store.getState().runs.items).toHaveLength(1);
  });
});
