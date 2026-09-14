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
  testsByChannel: Partial<Record<ChannelId, TestState>>;
  selectedChannel: ChannelId;
  drafts?: Partial<Record<ChannelId, ConnectionConfig>>;
};

/** 原型默认值：本地联调回调地址，凭据留空（dop 体系起步） */
export const defaultDouyinConnection: DouyinConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  system: "dop",
  clientKey: "",
  clientSecret: "",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
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
 * 「已配置」的内容判定：直发前置条件，发送入口与指引展示共用。
 * 条目存在不等于已配置——按渠道核必填集，缺一即视为未配置
 * （含初始默认占位连接、仅存 url 未存凭据的半成品）。
 * - 抖音按推送体系核（验签密钥是直发前置）：
 *   dop/生活服务 = url + clientSecret（clientKey 仅标识）；
 *   小游戏 = url + miniGameToken（x-signature 参与）；
 *   服务商 = url + isvToken（MsgSignature 参与；isv_key 暂不参与验签，可空）
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
      return config.url.trim() !== "" && douyinSystemReady(config);
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

/** 抖音按推送体系核验签密钥（体系内标兜底走 clientSecret，兼容旧数据） */
function douyinSystemReady(config: DouyinConnectionConfig): boolean {
  switch (config.system) {
    case "mini_game":
      return config.miniGameToken !== "";
    case "isv":
      return config.isvToken !== "";
    case "dop":
    case "life_service":
      return config.clientSecret !== "";
    default: {
      // 穷尽守卫：新增体系漏配必填集时编译期报错；未知体系视为未配置
      const exhaustive: never = config.system;
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

const idleTest: TestState = { status: "idle", message: "" };

export function selectTestState(
  state: ConnectionsState,
  channel?: ChannelId,
): TestState {
  return channel ? (state.testsByChannel[channel] ?? idleTest) : state.test;
}
