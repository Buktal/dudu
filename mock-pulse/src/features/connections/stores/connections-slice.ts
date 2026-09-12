import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import {
  type ConnectionConfig,
  type DouyinConnectionConfig,
  loadConnections,
  saveConnection as saveConnectionApi,
  type TestOutcome,
  testDouyinConnection as testDouyinApi,
  testWecomConnection as testWecomApi,
  type WecomConnectionConfig,
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
export const defaultDouyinConnection: DouyinConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  clientKey: "",
  clientSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空 */
export const defaultWecomConnection: WecomConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:8080/webhooks/wecom",
  corpId: "",
  token: "",
  encodingAesKey: "",
  agentId: "",
};

function itemsFrom(list: ConnectionConfig[]): Record<string, ConnectionConfig> {
  return Object.fromEntries(list.map((config) => [config.channel, config]));
}

export const initialConnectionsState: ConnectionsState = {
  items: {
    douyin: defaultDouyinConnection,
    wecom: defaultWecomConnection,
  },
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

/** 测试连接按渠道路由到对应协议命令（抖音 challenge / 企微 echostr）。
 *  switch 穷尽：新增渠道漏配路由时编译期报错；运行时未知渠道 fail-safe 拒绝。 */
export const testConnection = createAsyncThunk(
  "connections/test",
  async (config: ConnectionConfig) => {
    switch (config.channel) {
      case "douyin":
        return testDouyinApi(config);
      case "wecom":
        return testWecomApi(config);
      default: {
        const exhaustive: never = config;
        throw new Error(`未知渠道，无法路由测试命令：${String(exhaustive)}`);
      }
    }
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
 * 条目存在不等于已配置——按渠道核必填集，缺一即视为未配置
 * （含初始默认占位连接、仅存 url 未存凭据的半成品）。
 * - 抖音：url + clientSecret（签名必需；clientKey 仅标识）
 * - 企微：url + token + encodingAesKey + corpId（加密/签名/明文结构必需；
 *   agentId 不参与握手加密，可空）
 */
export function isConnectionReady(
  config: ConnectionConfig | undefined,
): config is ConnectionConfig {
  if (!config) {
    return false;
  }
  switch (config.channel) {
    case "douyin":
      return config.url.trim() !== "" && config.clientSecret !== "";
    case "wecom":
      return (
        config.url.trim() !== "" &&
        config.token !== "" &&
        config.encodingAesKey !== "" &&
        config.corpId !== ""
      );
    default: {
      // 穷尽守卫：新增渠道漏配必填集时编译期报错；运行时未知渠道一律视为未配置
      const exhaustive: never = config;
      void exhaustive;
      return false;
    }
  }
}

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

export function selectTestState(state: ConnectionsState): TestState {
  return state.test;
}
