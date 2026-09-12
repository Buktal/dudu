import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  connectionsReducer,
  fetchConnections,
  initialConnectionsState,
  saveConnection,
  selectConnection,
  selectTestState,
  testConnection,
} from "./connections-slice";

vi.mock("../api", () => ({
  loadConnections: vi.fn(),
  saveConnection: vi.fn(),
  testDouyinConnection: vi.fn(),
}));

import {
  loadConnections,
  saveConnection as saveApi,
  testDouyinConnection,
} from "../api";

const savedDouyin: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9099/hook",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
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
    expect(selectTestState(initialConnectionsState).status).toBe("idle");
    expect(initialConnectionsState.loaded).toBe(false);
  });

  it("fetchConnections 成功后用持久化数据覆盖并标记 loaded", async () => {
    vi.mocked(loadConnections).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(fetchConnections());

    expect(stateOf(store).loaded).toBe(true);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("saveConnection 成功后按 channel 覆盖保存", async () => {
    vi.mocked(saveApi).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(saveConnection(savedDouyin));

    expect(vi.mocked(saveApi)).toHaveBeenCalledWith(savedDouyin);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("测试连接状态流转 idle → testing → success/failed 并记录原因", async () => {
    const store = makeStore();
    vi.mocked(testDouyinConnection).mockResolvedValue({
      ok: true,
      message: "challenge 回显一致",
    });

    const pending = store.dispatch(testConnection(savedDouyin));
    expect(selectTestState(stateOf(store)).status).toBe("testing");
    await pending;

    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "challenge 回显一致",
    });

    vi.mocked(testDouyinConnection).mockResolvedValue({
      ok: false,
      message: "响应 challenge 不一致",
    });
    await store.dispatch(testConnection(savedDouyin));

    expect(selectTestState(stateOf(store))).toEqual({
      status: "failed",
      message: "响应 challenge 不一致",
    });
  });

  it("测试连接 IPC 失败时进入 failed 并带上错误信息", async () => {
    vi.mocked(testDouyinConnection).mockRejectedValue(new Error("后端不可用"));
    const store = makeStore();

    await store.dispatch(testConnection(savedDouyin));

    const test = selectTestState(stateOf(store));
    expect(test.status).toBe("failed");
    expect(test.message).toContain("后端不可用");
  });
});
