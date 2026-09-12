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
  setDraftExpected,
  setDraftField,
  startDraft,
} from "@/features/events";
import { plansReducer } from "@/features/plans";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import type { RootState } from "@/store";
import { appReducer } from "@/stores/app-slice";
import * as api from "../api";
import type { RunRecord } from "../model";
import {
  clearDispatch,
  directDispatch,
  fetchRuns,
  initialRunsState,
  onRunProgress,
  runsReducer,
  selectLastDispatch,
  selectLiveRun,
  selectPanelPhase,
  selectRuns,
  selectScenarioRunPhase,
  startScenarioRun,
} from "./runs-slice";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDouyin: vi.fn(),
  dispatchWecom: vi.fn(),
  startScenarioRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

const CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
};

const WECOM_CONNECTION: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9999/webhooks/wecom",
  corpId: "ww_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "218",
};

const OUTCOME = {
  msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
  signature: "a".repeat(40),
  status: 200,
  elapsedMs: 12,
  body: '{"code":0}',
  error: null,
};

const WECOM_OUTCOME = {
  signature: "b".repeat(40),
  timestamp: "1409659813",
  nonce: "1372623149",
  status: 200,
  elapsedMs: 15,
  body: "success",
  reply: null,
  error: null,
};

/** 连接态用 preloadedState 注入（不触碰 connections 的模块路径） */
function makeStore(connection?: ConnectionConfig) {
  const items: Record<string, ConnectionConfig> = connection
    ? { [connection.channel]: connection }
    : {};
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
      scenarios: initialScenariosState,
    },
  });
}

describe("runs slice 直发状态流转", () => {
  it("fetchRuns 装载持久化运行记录", async () => {
    const store = makeStore(CONNECTION);
    const run: RunRecord = {
      id: "run-001",
      startedAt: "2026-09-12T01:00:00.000Z",
      source: "direct",
      steps: [],
    };
    apiMock.loadRuns.mockResolvedValueOnce([run]);
    await store.dispatch(fetchRuns());
    expect(selectRuns(store.getState().runs)).toEqual([run]);
  });

  it("直发成功：拼明文→发送→比对→记运行记录→回执面板就绪", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));
    const draftId = store.getState().events.draft?.id;

    apiMock.dispatchDouyin.mockResolvedValueOnce(OUTCOME);
    apiMock.saveRun.mockImplementationOnce(async (run) => [run]);

    await store.dispatch(directDispatch());

    // 发送 api 收到连接配置与确定性明文（dy-text 模板黄金样本序列化）
    const call = apiMock.dispatchDouyin.mock.calls[0];
    expect(call?.[0]).toEqual(CONNECTION);
    const sentBody = call?.[1] ?? "";
    expect(sentBody).toContain('"event":"im_receive_msg"');
    expect(sentBody).toContain("捷途70");
    // 明文为紧凑规范形：解析再序列化逐字节一致
    expect(sentBody).toBe(JSON.stringify(JSON.parse(sentBody)));

    // 单步运行记录已保存
    const saved = apiMock.saveRun.mock.calls[0]?.[0];
    expect(saved.source).toBe("direct");
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0].payload).toBe(sentBody);
    expect(saved.steps[0].signature).toBe(OUTCOME.signature);
    expect(saved.steps[0].receipt.status).toBe(200);
    expect(saved.steps[0].verdict.passed).toBe(true);

    // 状态：运行记录入列 + 面板 done + 结果快照
    expect(selectRuns(store.getState().runs)).toEqual([saved]);
    expect(selectPanelPhase(store.getState().runs)).toBe("done");
    const result = selectLastDispatch(store.getState().runs);
    expect(result?.eventId).toBe(draftId);
    expect(result?.step.receipt.elapsedMs).toBe(12);
  });

  it.each([
    ["无连接条目", undefined],
    [
      "初始默认占位（url 有值但凭据为空）",
      {
        ...CONNECTION,
        url: "http://127.0.0.1:8080/webhooks/douyin",
        clientKey: "",
        clientSecret: "",
      },
    ],
    ["url 为空", { ...CONNECTION, url: "" }],
    ["clientSecret 为空", { ...CONNECTION, clientSecret: "" }],
  ] as const)(
    "未配置连接（%s）：不发请求不记运行，面板给指引状态",
    async (_name, connection) => {
      const store = makeStore(connection);
      store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));

      await store.dispatch(directDispatch());

      expect(apiMock.dispatchDouyin).not.toHaveBeenCalled();
      expect(apiMock.saveRun).not.toHaveBeenCalled();
      expect(selectPanelPhase(store.getState().runs)).toBe("needConnection");
      expect(selectRuns(store.getState().runs)).toEqual([]);
    },
  );

  it("发送失败（invoke 抛错）：面板呈现错误，不记运行记录", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));

    apiMock.dispatchDouyin.mockRejectedValueOnce(new Error("命令执行失败"));
    await store.dispatch(directDispatch());

    expect(selectPanelPhase(store.getState().runs)).toBe("error");
    expect(selectLastDispatch(store.getState().runs)).toBeNull();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("没有草稿时直发为空操作", async () => {
    const store = makeStore(CONNECTION);
    await store.dispatch(directDispatch());
    expect(apiMock.dispatchDouyin).not.toHaveBeenCalled();
    expect(selectPanelPhase(store.getState().runs)).toBe("idle");
  });

  it("企微直发成功：拼 XML 明文→加密命令→企微语义比对→解密明文入运行记录", async () => {
    const store = makeStore(WECOM_CONNECTION);
    store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));
    store.dispatch(
      setDraftExpected({ bodyMode: "wecomReply", body: "success" }),
    );
    // MsgId 大数字符串在草稿里编辑
    store.dispatch(
      setDraftField({ path: "MsgId", value: "7151772163216742434" }),
    );

    const replyEnvelopeOutcome = {
      ...WECOM_OUTCOME,
      body: "<xml><Encrypt><![CDATA[RypEvHKD…]]></Encrypt></xml>",
      reply: "<xml><Content><![CDATA[hi]]></Content></xml>",
    };
    apiMock.dispatchWecom.mockResolvedValueOnce(replyEnvelopeOutcome);
    apiMock.saveRun.mockImplementationOnce(async (run) => [run]);

    await store.dispatch(directDispatch());

    // 发送 api 收到企微连接与确定性 XML 明文
    const call = apiMock.dispatchWecom.mock.calls[0];
    expect(call?.[0]).toEqual(WECOM_CONNECTION);
    const sentBody = call?.[1] ?? "";
    expect(sentBody).toContain("<MsgType><![CDATA[text]]></MsgType>");
    expect(sentBody).toContain("<MsgId>7151772163216742434</MsgId>");
    // XML 明文逐字节稳定：拼装两次一致
    expect(sentBody).toBe(apiMock.dispatchWecom.mock.calls[0]?.[1]);

    // 运行记录：渠道/签名/时间戳/nonce 快照 + 解密明文入记录 + 企微语义结论
    const saved = apiMock.saveRun.mock.calls[0]?.[0];
    expect(saved.source).toBe("direct");
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0].channel).toBe("wecom");
    expect(saved.steps[0].payload).toBe(sentBody);
    expect(saved.steps[0].signature).toBe(replyEnvelopeOutcome.signature);
    expect(saved.steps[0].timestamp).toBe(replyEnvelopeOutcome.timestamp);
    expect(saved.steps[0].msgId).toBe(replyEnvelopeOutcome.nonce);
    expect(saved.steps[0].receipt.body).toBe(replyEnvelopeOutcome.body);
    expect(saved.steps[0].receipt.reply).toBe(replyEnvelopeOutcome.reply);
    // 期望 success 但回执是加密包：企微三形态判定不通过
    expect(saved.steps[0].verdict.passed).toBe(false);

    expect(selectPanelPhase(store.getState().runs)).toBe("done");
  });

  it.each([
    ["无连接条目", undefined],
    [
      "初始默认占位（url 有值但凭据为空）",
      {
        ...WECOM_CONNECTION,
        url: "http://127.0.0.1:8080/webhooks/wecom",
        corpId: "",
        token: "",
        encodingAesKey: "",
      },
    ],
    ["token 为空", { ...WECOM_CONNECTION, token: "" }],
    ["encodingAesKey 为空", { ...WECOM_CONNECTION, encodingAesKey: "" }],
    ["corpId 为空", { ...WECOM_CONNECTION, corpId: "" }],
  ] as const)(
    "企微未配置连接（%s）：不发请求不记运行，面板给指引状态",
    async (_name, connection) => {
      const store = makeStore(connection);
      store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));

      await store.dispatch(directDispatch());

      expect(apiMock.dispatchWecom).not.toHaveBeenCalled();
      expect(apiMock.saveRun).not.toHaveBeenCalled();
      expect(selectPanelPhase(store.getState().runs)).toBe("needConnection");
      expect(selectRuns(store.getState().runs)).toEqual([]);
    },
  );

  it("企微发送失败（invoke 抛错）：面板呈现错误，不记运行记录", async () => {
    const store = makeStore(WECOM_CONNECTION);
    store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));

    apiMock.dispatchWecom.mockRejectedValueOnce(new Error("命令执行失败"));
    await store.dispatch(directDispatch());

    expect(selectPanelPhase(store.getState().runs)).toBe("error");
    expect(selectLastDispatch(store.getState().runs)).toBeNull();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("clearDispatch 复位面板（切换编辑对象时由编辑器调用）", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));

    apiMock.dispatchDouyin.mockResolvedValueOnce(OUTCOME);
    apiMock.saveRun.mockImplementationOnce(async (run) => [run]);
    await store.dispatch(directDispatch());
    expect(selectPanelPhase(store.getState().runs)).toBe("done");

    store.dispatch(clearDispatch());
    expect(selectPanelPhase(store.getState().runs)).toBe("idle");
    expect(selectLastDispatch(store.getState().runs)).toBeNull();
    // 运行记录不受影响
    expect(selectRuns(store.getState().runs)).toHaveLength(1);
  });
});

describe("runs slice 初始态与选择器", () => {
  it("初始态", () => {
    expect(initialRunsState.items).toEqual([]);
    expect(initialRunsState.loaded).toBe(false);
    expect(selectPanelPhase(initialRunsState)).toBe("idle");
    expect(selectLastDispatch(initialRunsState)).toBeNull();
  });

  it("runs 挂到 RootState（编译期契约）", () => {
    const store = makeStore();
    const state: RootState = store.getState();
    expect(state.runs).toBeDefined();
  });
});

// ---- 剧本运行：startScenarioRun thunk + onRunProgress 事件驱动 ----

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

/** 剧本运行用 store：注入剧本草稿 + 已保存事件 + 连接态 */
function makeScenarioStore(connection?: ConnectionConfig) {
  const items: Record<string, ConnectionConfig> = connection
    ? { [connection.channel]: connection }
    : {};
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
      scenarios: { ...initialScenariosState, draft: scenarioDraft },
      events: {
        ...initialEventsState,
        items: [savedDouyinEvent],
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

describe("runs slice 剧本运行状态流转", () => {
  it("startScenarioRun：物化快照→调 Rust 命令→live run 就绪（每步 pending）", async () => {
    const store = makeScenarioStore(CONNECTION);
    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );

    await store.dispatch(startScenarioRun());

    // Rust 命令收到物化快照（引用版本物化的明文）与连接列表
    const call = apiMock.startScenarioRun.mock.calls[0];
    const snapshot = call?.[0];
    expect(snapshot.scenarioId).toBe("scn-1");
    expect(snapshot.scenarioName).toBe("抖音接待");
    expect(snapshot.steps).toHaveLength(2);
    expect(snapshot.steps[0].body).toContain("你好");
    expect(snapshot.steps[1].body).toContain("在吗");
    expect(call?.[1]).toEqual([CONNECTION]);

    // live run：两步 pending，携带事件名与渠道
    expect(selectScenarioRunPhase(store.getState().runs)).toBe("running");
    const live = selectLiveRun(store.getState().runs);
    expect(live?.runId).toBe(snapshot.runId);
    expect(live?.scenarioName).toBe("抖音接待");
    expect(live?.channel).toBe("douyin");
    expect(live?.steps.map((step) => step.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(live?.steps[0].eventName).toBe("新客问价");
  });

  it("未配置连接：不物化不调命令，phase 指引", async () => {
    const store = makeScenarioStore(undefined);
    await store.dispatch(startScenarioRun());

    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(selectScenarioRunPhase(store.getState().runs)).toBe(
      "needConnection",
    );
    expect(selectLiveRun(store.getState().runs)).toBeNull();
  });

  it("物化失败（悬空引用）：rejected 且给可读错误，不调命令", async () => {
    // 注入悬空步骤：事件库为空但剧本引用 evt-gone
    const broken = configureStore({
      reducer: {
        app: appReducer,
        runs: runsReducer,
        events: eventsReducer,
        connections: connectionsReducer,
        plans: plansReducer,
        scenarios: scenariosReducer,
      },
      preloadedState: {
        connections: {
          ...initialConnectionsState,
          loaded: true,
          items: { douyin: CONNECTION },
        },
        scenarios: {
          ...initialScenariosState,
          draft: {
            ...scenarioDraft,
            steps: [{ eventId: "evt-gone", revision: 1 }],
          },
        },
        events: { ...initialEventsState, items: [], loaded: true },
      },
    });

    const action = await broken.dispatch(startScenarioRun());
    expect(startScenarioRun.rejected.match(action)).toBe(true);
    if (startScenarioRun.rejected.match(action)) {
      expect(action.error.message).toMatch(/第 1 步引用的事件不存在：evt-gone/);
    }
    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(selectScenarioRunPhase(broken.getState().runs)).toBe("error");
  });

  it("没有剧本草稿时为空操作", async () => {
    const empty = configureStore({
      reducer: {
        app: appReducer,
        runs: runsReducer,
        events: eventsReducer,
        connections: connectionsReducer,
        plans: plansReducer,
        scenarios: scenariosReducer,
      },
      preloadedState: {
        connections: {
          ...initialConnectionsState,
          loaded: true,
          items: { douyin: CONNECTION },
        },
        scenarios: initialScenariosState,
        events: {
          ...initialEventsState,
          items: [savedDouyinEvent],
          loaded: true,
        },
      },
    });

    await empty.dispatch(startScenarioRun());
    expect(apiMock.startScenarioRun).not.toHaveBeenCalled();
    expect(selectScenarioRunPhase(empty.getState().runs)).toBe("idle");
  });

  it("onRunProgress：waiting→success/failed/skipped 逐事件驱动 live 状态", async () => {
    const store = makeScenarioStore(CONNECTION);
    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );
    await store.dispatch(startScenarioRun());
    const runId = selectLiveRun(store.getState().runs)?.runId ?? "";

    store.dispatch(onRunProgress({ runId, index: 0, status: "waiting" }));
    expect(selectLiveRun(store.getState().runs)?.steps[0].status).toBe(
      "waiting",
    );

    const doneStep = {
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
    store.dispatch(
      onRunProgress({ runId, index: 0, status: "success", step: doneStep }),
    );
    const live = selectLiveRun(store.getState().runs);
    expect(live?.steps[0].status).toBe("success");
    expect(live?.steps[0].step?.msgId).toBe("m-1");
    expect(live?.steps[1].status).toBe("pending");

    const failedStep = {
      ...doneStep,
      verdict: { passed: false, reason: "HTTP 500，期望 HTTP 200" },
    };
    store.dispatch(
      onRunProgress({ runId, index: 1, status: "failed", step: failedStep }),
    );
    expect(selectLiveRun(store.getState().runs)?.steps[1].status).toBe(
      "failed",
    );
  });

  it("onRunProgress：skipped 标记 + finished 落记录并清 live", async () => {
    const store = makeScenarioStore(CONNECTION);
    store.dispatch(
      onRunProgress({
        runId: "run-unknown",
        index: 0,
        status: "waiting",
      }),
    );
    expect(selectLiveRun(store.getState().runs)).toBeNull();

    apiMock.startScenarioRun.mockImplementationOnce(
      async (snapshot) => snapshot.runId,
    );
    await store.dispatch(startScenarioRun());
    const runId = selectLiveRun(store.getState().runs)?.runId ?? "";

    store.dispatch(onRunProgress({ runId, index: 1, status: "skipped" }));
    expect(selectLiveRun(store.getState().runs)?.steps[1].status).toBe(
      "skipped",
    );

    const record = finishedRun(runId);
    store.dispatch(
      onRunProgress({ runId, index: 2, status: "finished", run: record }),
    );
    // 记录入列（时间升序）+ live 清空 + phase 回 idle
    expect(selectRuns(store.getState().runs)).toEqual([record]);
    expect(selectLiveRun(store.getState().runs)).toBeNull();
    expect(selectScenarioRunPhase(store.getState().runs)).toBe("idle");
  });

  it("runs 初始态含剧本运行字段", () => {
    expect(initialRunsState.scenarioRunPhase).toBe("idle");
    expect(initialRunsState.live).toBeNull();
  });
});
