import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "../api";
import { defaultWecomConnection } from "../channel-traits";
import {
  connectionsReducer,
  fetchConnections,
  initialConnectionsState,
  isConnectionReady,
  saveConnection,
  selectConnection,
  selectTestState,
  setConnectionChannel,
  setConnectionDraft,
  testConnection,
} from "./connections-slice";

vi.mock("../api", () => ({
  loadConnections: vi.fn(),
  saveConnection: vi.fn(),
  testConnectionInvoke: vi.fn(),
}));

import {
  loadConnections,
  saveConnection as saveApi,
  testConnectionInvoke,
} from "../api";

/**
 * connections slice 行为单测：初始状态/载入/保存/测试状态流转/草稿回归。
 * 按主题拆分（单文件 ≤ 500 行，code-review 退件）：测试连接的按渠道分发与
 * 状态落位在 ./test-connection-dispatch.test.ts。
 */

const savedDouyin: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9099/hook",
  system: "dop",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const savedWecom: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9099/wecom",
  system: "agent",
  corpId: "ww_mock_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "1000002",
};

function makeStore() {
  return configureStore({ reducer: { connections: connectionsReducer } });
}

type Store = ReturnType<typeof makeStore>;
const stateOf = (store: Store) => store.getState().connections;

describe("connections slice", () => {
  it("初始自带抖音默认连接，测试状态为 idle", () => {
    expect(selectConnection(initialConnectionsState, "douyin")?.url).toBe(
      "http://127.0.0.1:8080/webhooks/douyin",
    );
    expect(selectTestState(initialConnectionsState, "douyin").status).toBe(
      "idle",
    );
    expect(initialConnectionsState.loaded).toBe(false);
  });

  it("fetchConnections 成功后用持久化数据覆盖并标记 loaded", async () => {
    vi.mocked(loadConnections).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(fetchConnections());

    expect(stateOf(store).loaded).toBe(true);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("fetchConnections 携带抖音与企微时两条按 channel 各自落位", async () => {
    vi.mocked(loadConnections).mockResolvedValue([savedDouyin, savedWecom]);
    const store = makeStore();

    await store.dispatch(fetchConnections());

    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
    expect(selectConnection(stateOf(store), "wecom")).toEqual(savedWecom);
  });

  it("saveConnection 成功后按 channel 覆盖保存", async () => {
    vi.mocked(saveApi).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(saveConnection(savedDouyin));

    expect(vi.mocked(saveApi)).toHaveBeenCalledWith(savedDouyin);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("saveConnection 保存企微后列表同时保留两条渠道", async () => {
    vi.mocked(saveApi).mockResolvedValue([savedDouyin, savedWecom]);
    const store = makeStore();

    await store.dispatch(saveConnection(savedWecom));

    expect(vi.mocked(saveApi)).toHaveBeenCalledWith(savedWecom);
    expect(selectConnection(stateOf(store), "wecom")).toEqual(savedWecom);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("初始状态自带企微默认占位连接（url 预填、自建应用通道、凭据留空）", () => {
    expect(defaultWecomConnection.channel).toBe("wecom");
    expect(defaultWecomConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/wecom",
    );
    expect(defaultWecomConnection.system).toBe("agent");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "wecom")),
    ).toBe(false);
  });

  it("测试连接状态流转 idle → testing → success/failed 并记录原因", async () => {
    const store = makeStore();
    vi.mocked(testConnectionInvoke).mockResolvedValue({
      ok: true,
      message: "challenge 回显一致",
    });

    const pending = store.dispatch(testConnection(savedDouyin));
    expect(selectTestState(stateOf(store), "douyin").status).toBe("testing");
    await pending;

    expect(selectTestState(stateOf(store), "douyin")).toEqual({
      status: "success",
      message: "challenge 回显一致",
    });

    vi.mocked(testConnectionInvoke).mockResolvedValue({
      ok: false,
      message: "响应 challenge 不一致",
    });
    await store.dispatch(testConnection(savedDouyin));

    expect(selectTestState(stateOf(store), "douyin")).toEqual({
      status: "failed",
      message: "响应 challenge 不一致",
    });
  });

  it("测试连接 IPC 失败时进入 failed 并带上错误信息", async () => {
    vi.mocked(testConnectionInvoke).mockRejectedValue(new Error("后端不可用"));
    const store = makeStore();

    await store.dispatch(testConnection(savedDouyin));

    const test = selectTestState(stateOf(store), "douyin");
    expect(test.status).toBe("failed");
    expect(test.message).toContain("后端不可用");
  });
});

describe("连接草稿回归", () => {
  it("切换平台与重新载入不会覆盖草稿，旧保存回包也不会覆盖继续编辑", async () => {
    const store = makeStore();
    const submitted = {
      ...savedDouyin,
      url: "http://localhost:9090/submitted",
    };
    store.dispatch(setConnectionDraft(submitted));
    store.dispatch(setConnectionChannel("wecom"));
    store.dispatch(
      fetchConnections.fulfilled([savedDouyin, savedWecom], "refetch"),
    );
    expect(stateOf(store).drafts?.douyin).toEqual(submitted);
    let finish!: (configs: ConnectionConfig[]) => void;
    vi.mocked(saveApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.dispatch(saveConnection(submitted));
    const edited = { ...submitted, url: "http://localhost:9090/later" };
    store.dispatch(setConnectionDraft(edited));
    finish([submitted, savedWecom]);
    await pending;
    expect(stateOf(store).drafts?.douyin).toEqual(edited);
    expect(stateOf(store).items.douyin).toEqual(submitted);
  });
});
