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
  type TestOutcome,
  testDouyinConnection as testDouyinApi,
} from "../api";

export type TestStatus = "idle" | "testing" | "success" | "failed";

export type TestState = {
  status: TestStatus;
  message: string;
};

export type ConnectionsState = {
  items: Record<string, ConnectionConfig>;
  loaded: boolean;
  test: TestState;
};

/** 原型默认值：本地联调回调地址，凭据留空 */
export const defaultDouyinConnection: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  clientKey: "",
  clientSecret: "",
};

function itemsFrom(list: ConnectionConfig[]): Record<string, ConnectionConfig> {
  return Object.fromEntries(list.map((config) => [config.channel, config]));
}

export const initialConnectionsState: ConnectionsState = {
  items: { douyin: defaultDouyinConnection },
  loaded: false,
  test: { status: "idle", message: "" },
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

export const testConnection = createAsyncThunk(
  "connections/test",
  async (config: ConnectionConfig) => {
    return testDouyinApi(config);
  },
);

export const connectionsSlice = createSlice({
  name: "connections",
  initialState: initialConnectionsState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchConnections.fulfilled, (state, action) => {
        state.items = itemsFrom(action.payload);
        state.loaded = true;
      })
      .addCase(saveConnection.fulfilled, (state, action) => {
        state.items = itemsFrom(action.payload);
      })
      .addCase(testConnection.pending, (state) => {
        state.test = { status: "testing", message: "" };
      })
      .addCase(
        testConnection.fulfilled,
        (state, action: PayloadAction<TestOutcome>) => {
          state.test = {
            status: action.payload.ok ? "success" : "failed",
            message: action.payload.message,
          };
        },
      )
      .addCase(testConnection.rejected, (state, action) => {
        state.test = {
          status: "failed",
          message: action.error.message ?? "测试连接失败",
        };
      });
  },
});

export const connectionsReducer = connectionsSlice.reducer;

/**
 * 「已配置」的内容判定：直发前置条件，发送入口与指引展示共用。
 * 条目存在不等于已配置——目标地址与签名密钥（client_secret）缺一即视为
 * 未配置（含初始默认占位连接、仅存 url 未存密钥的半成品）。
 */
export function isConnectionReady(
  config: ConnectionConfig | undefined,
): config is ConnectionConfig {
  if (!config) {
    return false;
  }
  return config.url.trim() !== "" && config.clientSecret !== "";
}

export function selectConnection(
  state: ConnectionsState,
  channel: ChannelId | string,
) {
  return state.items[channel];
}

export function selectTestState(state: ConnectionsState): TestState {
  return state.test;
}
