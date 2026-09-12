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
import { initialScenariosState, scenariosReducer } from "@/features/scenarios";
import type { RootState } from "@/store";
import { appReducer } from "@/stores/app-slice";
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
  dispatchWecom: vi.fn(),
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
