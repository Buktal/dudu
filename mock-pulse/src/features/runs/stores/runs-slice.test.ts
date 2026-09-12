import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  connectionsReducer,
  type ConnectionConfig,
  initialConnectionsState,
} from "@/features/connections";
import { eventsReducer, startDraft } from "@/features/events";
import { appReducer } from "@/stores/app-slice";
import type { RootState } from "@/store";
import * as api from "../api";
import type { RunRecord } from "../model";
import {
  clearDispatch,
  directDispatch,
  fetchRuns,
  initialRunsState,
  runsReducer,
  selectLastDispatch,
  selectPanelPhase,
  selectRuns,
} from "./runs-slice";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDouyin: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

const CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
};

const OUTCOME = {
  msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
  signature: "a".repeat(40),
  status: 200,
  elapsedMs: 12,
  body: '{"code":0}',
  error: null,
};

/** 连接态用 preloadedState 注入（不触碰 connections 的模块路径） */
function makeStore(connection?: ConnectionConfig) {
  const items: Record<string, ConnectionConfig> = connection
    ? { douyin: connection }
    : {};
  return configureStore({
    reducer: {
      app: appReducer,
      runs: runsReducer,
      events: eventsReducer,
      connections: connectionsReducer,
    },
    preloadedState: {
      connections: { ...initialConnectionsState, loaded: true, items },
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
      { ...CONNECTION, url: "http://127.0.0.1:8080/webhooks/douyin", clientKey: "", clientSecret: "" },
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
