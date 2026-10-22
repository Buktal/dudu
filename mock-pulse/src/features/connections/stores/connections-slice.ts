import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { isEqual } from "lodash-es";

import { type ChannelId, DEFAULT_CHANNEL } from "@/lib/channels";

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
  testsByChannel: {},
  selectedChannel: DEFAULT_CHANNEL,
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
        state.testsByChannel[action.meta.arg.channel] = {
          status: "testing",
          message: "",
        };
      })
      .addCase(testConnection.fulfilled, (state, action) => {
        state.testsByChannel[action.meta.arg.channel] = {
          status: action.payload.ok ? "success" : "failed",
          message: action.payload.message,
        };
      })
      .addCase(testConnection.rejected, (state, action) => {
        state.testsByChannel[action.meta.arg.channel] = {
          status: "failed",
          message: action.error.message ?? "测试连接失败",
        };
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

/** 渠道的连接测试状态（只认渠道：无记录即 idle，无全局兜底态） */
export function selectTestState(
  state: ConnectionsState,
  channel: ChannelId,
): TestState {
  return state.testsByChannel[channel] ?? idleTest;
}

/**
 * 渠道草稿是否有未保存改动（编辑守卫与保存按钮共用）：无草稿即干净，
 * 有草稿且与库内保存值不同才脏。表单展示另有「无草稿回退默认连接」的
 * 兜底链（connections-view），不参与本判定。
 */
export function selectConnectionDirty(
  state: ConnectionsState,
  channel: ChannelId,
): boolean {
  const draft = state.drafts?.[channel];
  return !!draft && !isEqual(draft, state.items[channel]);
}
