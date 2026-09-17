import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import {
  type ConnectionConfig,
  loadConnections,
  saveConnection as saveConnectionApi,
  testConnectionInvoke,
} from "../api";
import { DEFAULT_CONNECTIONS } from "../channel-traits";

export type TestStatus = "idle" | "testing" | "success" | "failed";

export type TestState = {
  status: TestStatus;
  message: string;
};

export type ConnectionsState = {
  items: Record<string, ConnectionConfig>;
  loaded: boolean;
  test: TestState;
  testsByChannel: Partial<Record<ChannelId, TestState>>;
  selectedChannel: ChannelId;
  drafts?: Partial<Record<ChannelId, ConnectionConfig>>;
};

function itemsFrom(list: ConnectionConfig[]): Record<string, ConnectionConfig> {
  return Object.fromEntries(list.map((config) => [config.channel, config]));
}

export const initialConnectionsState: ConnectionsState = {
  // 初始占位连接按渠道描述表逐行铺开（url 预填本地联调地址、凭据留空，
  // 定义见 ../channel-traits，由各行 defaultConnection 派生）
  items: { ...DEFAULT_CONNECTIONS },
  loaded: false,
  test: { status: "idle", message: "" },
  testsByChannel: {},
  selectedChannel: "douyin",
  drafts: {},
};

export const fetchConnections = createAsyncThunk(
  "connections/fetch",
  async () => {
    return loadConnections();
  },
);

export const saveConnection = createAsyncThunk(
  "connections/save",
  async (config: ConnectionConfig) => {
    return saveConnectionApi(config);
  },
);

/**
 * 测试连接：握手入口在 Rust 侧已收敛为单个 connections_test 命令
 * （testConnectionInvoke 直调，渠道差异由适配器注册表路由）。
 * 运行时未知渠道由分发器 fail-safe 拒绝，不静默走错协议。
 */
export const testConnection = createAsyncThunk(
  "connections/test",
  async (config: ConnectionConfig) => {
    return testConnectionInvoke(config);
  },
);

export const connectionsSlice = createSlice({
  name: "connections",
  initialState: initialConnectionsState,
  reducers: {
    setConnectionChannel(state, action: PayloadAction<ChannelId>) {
      state.selectedChannel = action.payload;
    },
    setConnectionDraft(state, action: PayloadAction<ConnectionConfig>) {
      state.drafts ??= {};
      state.drafts[action.payload.channel] = action.payload;
    },
    discardConnectionDraft(state, action: PayloadAction<ChannelId>) {
      if (state.drafts) delete state.drafts[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConnections.fulfilled, (state, action) => {
        state.items = itemsFrom(action.payload);
        state.loaded = true;
      })
      .addCase(saveConnection.fulfilled, (state, action) => {
        state.items = itemsFrom(action.payload);
        if (
          state.drafts &&
          JSON.stringify(state.drafts[action.meta.arg.channel]) ===
            JSON.stringify(action.meta.arg)
        )
          delete state.drafts[action.meta.arg.channel];
      })
      .addCase(testConnection.pending, (state, action) => {
        state.test = { status: "testing", message: "" };
        state.testsByChannel[action.meta.arg.channel] = state.test;
      })
      .addCase(testConnection.fulfilled, (state, action) => {
        state.test = {
          status: action.payload.ok ? "success" : "failed",
          message: action.payload.message,
        };
        state.testsByChannel[action.meta.arg.channel] = state.test;
      })
      .addCase(testConnection.rejected, (state, action) => {
        state.test = {
          status: "failed",
          message: action.error.message ?? "测试连接失败",
        };
        state.testsByChannel[action.meta.arg.channel] = state.test;
      });
  },
});

export const connectionsReducer = connectionsSlice.reducer;
export const {
  setConnectionChannel,
  setConnectionDraft,
  discardConnectionDraft,
} = connectionsSlice.actions;

/**
 * 「已配置」的内容判定（isConnectionReady）：直发前置条件，发送入口与指引
 * 展示共用。实现收敛在 ../channel-traits（C1 深化：url 公共前置 + 行内必填集
 * 查表），此处仅保持既有导入路径稳定。
 */
export { isConnectionReady } from "../channel-traits";

/** 按渠道字面量取对应形状的连接配置类型 */
type ConfigOfChannel<C extends ChannelId> = Extract<
  ConnectionConfig,
  { channel: C }
>;

export function selectConnection<C extends ChannelId>(
  state: ConnectionsState,
  channel: C,
): ConfigOfChannel<C> | undefined {
  return state.items[channel] as ConfigOfChannel<C> | undefined;
}

const idleTest: TestState = { status: "idle", message: "" };

export function selectTestState(
  state: ConnectionsState,
  channel?: ChannelId,
): TestState {
  return channel ? (state.testsByChannel[channel] ?? idleTest) : state.test;
}
