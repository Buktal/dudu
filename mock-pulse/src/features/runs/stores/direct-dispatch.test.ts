import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  connectionsReducer,
  initialConnectionsState,
} from "@/features/connections";
import {
  eventsReducer,
  setDraftExpected,
  setDraftField,
  startDraft,
} from "@/features/events";
import { plansReducer } from "@/features/plans";
import { initialScenariosState, scenariosReducer } from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";
import { expectNeedConnection } from "@/test/thunk-outcomes";
import * as api from "../api";
import type { RunStep } from "../model";
import { directDispatch } from "./direct-dispatch";
import { runsReducer, selectPanelPhase, selectRuns } from "./runs-slice";

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

const WECOM_CONNECTION: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9999/webhooks/wecom",
  system: "agent",
  corpId: "ww_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "218",
};

/** Rust 直发命令返回的成品单步快照（期望比对已在 Rust 完成） */
function directStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    eventName: "新客问价",
    eventId: "evt-001",
    channel: "douyin",
    url: CONNECTION.url,
    payload: '{"event":"im_receive_msg"}',
    requestBody: '{"event":"im_receive_msg"}',
    expected: { status: 200, body: "", bodyMode: "contains" },
    signature: "a".repeat(40),
    msgId: "m-1",
    receipt: { status: 200, elapsedMs: 12, body: '{"code":0}', error: null },
    verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    ...overrides,
  };
}

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

/** 落盘成功桩：saveRun 原样返回记录 */
function stubSaveRun() {
  apiMock.saveRun.mockImplementationOnce(async (run) => [run]);
}

describe("runs 直发状态流转（direct-dispatch）", () => {
  it("直发成功：前置检查→invoke Rust 直发→记录入列落盘→面板就绪", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));
    const draftId = store.getState().events.draft?.id;
    const step = directStep({ eventId: draftId });

    apiMock.dispatchDirect.mockResolvedValueOnce({ step, cancelled: false });
    stubSaveRun();

    await store.dispatch(directDispatch());

    // 直发命令收到连接配置、确定性明文与事件/期望快照
    const call = apiMock.dispatchDirect.mock.calls[0];
    expect(call?.[0]).toEqual(CONNECTION);
    const payload = call?.[1] ?? "";
    expect(payload.eventName).toBe("新客问价");
    expect(payload.eventId).toBe(draftId);
    expect(payload.expected).toEqual({
      status: 200,
      body: "",
      bodyMode: "contains",
    });
    const sentBody = payload.body;
    expect(sentBody).toContain('"event":"im_receive_msg"');
    expect(sentBody).toContain("捷途70");
    // 明文为紧凑规范形：解析再序列化逐字节一致
    expect(sentBody).toBe(JSON.stringify(JSON.parse(sentBody)));

    // 单步运行记录已保存：runId 与直发命令一致，Rust 成品步骤原样入列
    const saved = apiMock.saveRun.mock.calls[0]?.[0];
    expect(saved.id).toBe(payload.runId);
    expect(saved.source).toBe("direct");
    expect(saved.cancelled).toBe(false);
    expect(saved.sourceId).toBe(draftId);
    expect(saved.steps).toEqual([step]);

    // 状态：运行记录入列 + 面板 done + 结果快照
    expect(selectRuns(store.getState().runs)).toEqual([saved]);
    expect(selectPanelPhase(store.getState().runs)).toBe("done");
    const result = store.getState().runs.result;
    expect(result?.eventId).toBe(draftId);
    expect(result?.step.receipt.elapsedMs).toBe(12);
  });

  // 连接就绪判定的逐字段用例见 connections-slice.test.ts，这里只验证路由
  it.each([
    ["抖音无连接条目", undefined, "dy-text"],
    [
      "抖音初始默认占位（凭据为空）",
      { ...CONNECTION, clientKey: "", clientSecret: "" },
      "dy-text",
    ],
    ["企微无连接条目", undefined, "wc-text"],
    [
      "企微初始默认占位（凭据为空）",
      { ...WECOM_CONNECTION, corpId: "", token: "", encodingAesKey: "" },
      "wc-text",
    ],
  ] as const)(
    "未配置连接（%s）：不调直发命令不记运行，面板给指引状态",
    async (_name, connection, schemaId) => {
      const store = makeStore(connection);
      store.dispatch(startDraft({ name: "直发指引", schemaId }));

      await store.dispatch(directDispatch());

      expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
      expect(apiMock.saveRun).not.toHaveBeenCalled();
      expect(selectPanelPhase(store.getState().runs)).toBe("needConnection");
      expect(selectRuns(store.getState().runs)).toEqual([]);
    },
  );

  it("未配置连接的 outcome 携带缺失渠道（统一词汇）", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "直发指引", schemaId: "dy-text" }));

    const action = await store.dispatch(directDispatch());

    expectNeedConnection((a) => directDispatch.fulfilled.match(a), action, [
      "douyin",
    ]);
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(selectPanelPhase(store.getState().runs)).toBe("needConnection");
  });

  it("直发命令抛错（invoke rejected）：面板呈现错误，不记运行记录", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));

    apiMock.dispatchDirect.mockRejectedValueOnce(new Error("命令执行失败"));
    await store.dispatch(directDispatch());

    expect(selectPanelPhase(store.getState().runs)).toBe("error");
    expect(store.getState().runs.result).toBeNull();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("没有草稿时直发为空操作", async () => {
    const store = makeStore(CONNECTION);
    await store.dispatch(directDispatch());
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(selectPanelPhase(store.getState().runs)).toBe("idle");
  });

  it("企微直发：拼 XML 明文传给直发命令，Rust 企微语义步骤原样入列", async () => {
    const store = makeStore(WECOM_CONNECTION);
    store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));
    store.dispatch(
      setDraftExpected({ bodyMode: "wecomReply", body: "success" }),
    );
    // MsgId 大数字符串在草稿里编辑
    store.dispatch(
      setDraftField({ path: "MsgId", value: "7151772163216742434" }),
    );

    // Rust 侧判定（期望 success 但回执是加密包 → 不通过）以成品步骤返回
    const step = directStep({
      eventId: store.getState().events.draft?.id,
      channel: "wecom",
      url: WECOM_CONNECTION.url,
      expected: { status: 200, body: "success", bodyMode: "wecomReply" },
      signature: "b".repeat(40),
      msgId: "1372623149",
      timestamp: "1409659813",
      payload: "<xml><MsgType><![CDATA[text]]></MsgType></xml>",
      requestBody: "<xml><Encrypt><![CDATA[RypEvHKD…]]></Encrypt></xml>",
      receipt: {
        status: 200,
        elapsedMs: 15,
        body: "<xml><Encrypt><![CDATA[RypEvHKD…]]></Encrypt></xml>",
        reply: "<xml><Content><![CDATA[hi]]></Content></xml>",
        error: null,
      },
      verdict: {
        passed: false,
        reason: "HTTP 200，期望逐字 success，实际「<xml>…」",
      },
    });
    apiMock.dispatchDirect.mockResolvedValueOnce({ step, cancelled: false });
    stubSaveRun();

    await store.dispatch(directDispatch());

    // 直发命令收到企微连接与确定性 XML 明文（逐字节稳定：拼装两次一致）
    const call = apiMock.dispatchDirect.mock.calls[0];
    expect(call?.[0]).toEqual(WECOM_CONNECTION);
    const sentBody = call?.[1].body ?? "";
    expect(sentBody).toContain("<MsgType><![CDATA[text]]></MsgType>");
    expect(sentBody).toContain("<MsgId>7151772163216742434</MsgId>");
    expect(sentBody).toBe(call?.[1].body);
    expect(call?.[1].expected).toEqual(step.expected);

    // 运行记录：Rust 成品步骤（含签名/时间戳/nonce/解密明文/企微结论）原样入列
    const saved = apiMock.saveRun.mock.calls[0]?.[0];
    expect(saved.steps).toEqual([step]);
    expect(selectPanelPhase(store.getState().runs)).toBe("done");
  });

  // 模板直发（ADR-0009）：以模板开草稿 → 临时编辑 → 走同一直发链路，不落素材
  it("模板直发：名字默认取模板名，期望回执默认带模板渠道真实应答，即改即发", async () => {
    const store = makeStore(WECOM_CONNECTION);
    store.dispatch(startDraft({ name: "点击菜单按钮", schemaId: "wc-click" }));

    // 草稿名默认取模板名（列表即目录的「点模板 = 以模板开草稿」路径）
    const draft = store.getState().events.draft;
    expect(draft?.name).toBe("点击菜单按钮");
    expect(draft?.schemaId).toBe("wc-click");
    // 期望回执默认 = 模板渠道真实应答（企微：200 + 企微回执形态、正文留空）
    expect(draft?.expected).toEqual({
      status: 200,
      body: "",
      bodyMode: "wecomReply",
    });

    // 临时编辑不落库，直发改动后的字段
    store.dispatch(setDraftField({ path: "EventKey", value: "CUSTOM_KEY" }));
    const step = directStep({
      eventId: store.getState().events.draft?.id,
      channel: "wecom",
      url: WECOM_CONNECTION.url,
    });
    apiMock.dispatchDirect.mockResolvedValueOnce({ step, cancelled: false });
    stubSaveRun();

    await store.dispatch(directDispatch());

    const call = apiMock.dispatchDirect.mock.calls[0];
    expect(call?.[1].eventName).toBe("点击菜单按钮");
    expect(call?.[1].expected).toEqual(draft?.expected);
    expect(call?.[1].body).toContain(
      "<EventKey><![CDATA[CUSTOM_KEY]]></EventKey>",
    );
    expect(apiMock.saveRun).toHaveBeenCalledTimes(1);
    expect(selectPanelPhase(store.getState().runs)).toBe("done");
    // 模板草稿不落素材库
    expect(store.getState().events.items).toEqual([]);
  });
});
