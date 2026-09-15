import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import {
  type AlipayConnectionConfig,
  type BilibiliConnectionConfig,
  type ConnectionConfig,
  type DingtalkConnectionConfig,
  type DouyinConnectionConfig,
  type ElemeConnectionConfig,
  type FeishuConnectionConfig,
  type JingdongConnectionConfig,
  type KuaishouConnectionConfig,
  loadConnections,
  type MeituanConnectionConfig,
  type PinduoduoConnectionConfig,
  type QqConnectionConfig,
  saveConnection as saveConnectionApi,
  type TaobaoConnectionConfig,
  type TelegramConnectionConfig,
  testAlipayConnection as testAlipayApi,
  testBilibiliConnection as testBilibiliApi,
  testDingtalkConnection as testDingtalkApi,
  testDouyinConnection as testDouyinApi,
  testElemeConnection as testElemeApi,
  testFeishuConnection as testFeishuApi,
  testJingdongConnection as testJingdongApi,
  testKuaishouConnection as testKuaishouApi,
  testMeituanConnection as testMeituanApi,
  testPinduoduoConnection as testPinduoduoApi,
  testQqConnection as testQqApi,
  testTaobaoConnection as testTaobaoApi,
  testTelegramConnection as testTelegramApi,
  testWechatMiniConnection as testWechatMiniApi,
  testWechatMpConnection as testWechatMpApi,
  testWecomConnection as testWecomApi,
  testWeiboConnection as testWeiboApi,
  testWhatsappConnection as testWhatsappApi,
  testXiaohongshuConnection as testXiaohongshuApi,
  type WechatMiniConnectionConfig,
  type WechatMpConnectionConfig,
  type WecomConnectionConfig,
  type WeiboConnectionConfig,
  type WhatsappConnectionConfig,
  type XiaohongshuConnectionConfig,
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

/** 原型默认值：本地联调回调地址，凭据留空（自建应用 XML 通道起步） */
export const defaultWecomConnection: WecomConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:8080/webhooks/wecom",
  system: "agent",
  corpId: "",
  token: "",
  encodingAesKey: "",
  agentId: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（官方默认明文模式起步） */
export const defaultWechatMpConnection: WechatMpConnectionConfig = {
  channel: "wechat-mp",
  url: "http://127.0.0.1:8080/webhooks/wechat-mp",
  appId: "",
  token: "",
  encodingAesKey: "",
  mode: "plain",
};

/** 原型默认值：本地联调回调地址，凭据留空（明文模式 + XML 数据格式起步） */
export const defaultWechatMiniConnection: WechatMiniConnectionConfig = {
  channel: "wechat-mini",
  url: "http://127.0.0.1:8080/webhooks/wechat-mini",
  appId: "",
  token: "",
  encodingAesKey: "",
  mode: "plain",
  dataFormat: "xml",
};

/** 原型默认值：本地联调回调地址，凭据留空（新 HTTP 密文事件回调起步） */
export const defaultDingtalkConnection: DingtalkConnectionConfig = {
  channel: "dingtalk",
  url: "http://127.0.0.1:8080/webhooks/dingtalk",
  system: "http_crypto",
  token: "",
  encodingAesKey: "",
  ownerKey: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（Encrypt Key 留空 = 明文直发起步） */
export const defaultFeishuConnection: FeishuConnectionConfig = {
  channel: "feishu",
  url: "http://127.0.0.1:8080/webhooks/feishu",
  appId: "",
  verificationToken: "",
  encryptKey: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（Ed25519 验签密钥起步） */
export const defaultQqConnection: QqConnectionConfig = {
  channel: "qq",
  url: "http://127.0.0.1:8080/webhooks/qq",
  appId: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（App Secret 验签起步） */
export const defaultWeiboConnection: WeiboConnectionConfig = {
  channel: "weibo",
  url: "http://127.0.0.1:8080/webhooks/weibo",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（小程序客服消息通道起步） */
export const defaultXiaohongshuConnection: XiaohongshuConnectionConfig = {
  channel: "xiaohongshu",
  url: "http://127.0.0.1:8080/webhooks/xiaohongshu",
  system: "miniapp",
  token: "",
  encodingAesKey: "",
  appId: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（kwaisign MD5 验签起步） */
export const defaultKuaishouConnection: KuaishouConnectionConfig = {
  channel: "kuaishou",
  url: "http://127.0.0.1:8080/webhooks/kuaishou",
  appId: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（全球栈 HMAC-SHA256 验签起步） */
export const defaultTaobaoConnection: TaobaoConnectionConfig = {
  channel: "taobao",
  url: "http://127.0.0.1:8080/webhooks/taobao",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（JOS MD5 签名起步） */
export const defaultJingdongConnection: JingdongConnectionConfig = {
  channel: "jingdong",
  url: "http://127.0.0.1:8080/webhooks/jingdong",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（PMC UPPER(MD5) 签名起步） */
export const defaultPinduoduoConnection: PinduoduoConnectionConfig = {
  channel: "pinduoduo",
  url: "http://127.0.0.1:8080/webhooks/pinduoduo",
  clientId: "",
  clientSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（合作中心 MD5(url?字母序+secret) 签名起步） */
export const defaultMeituanConnection: MeituanConnectionConfig = {
  channel: "meituan",
  url: "http://127.0.0.1:8080/webhooks/meituan",
  appId: "",
  appSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（用户线 SHA1 五步签名起步） */
export const defaultElemeConnection: ElemeConnectionConfig = {
  channel: "eleme",
  url: "http://127.0.0.1:8080/webhooks/eleme",
  consumerKey: "",
  consumerSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（x-bili-* 头表 HMAC-SHA256 验签起步） */
export const defaultBilibiliConnection: BilibiliConnectionConfig = {
  channel: "bilibili",
  url: "http://127.0.0.1:8080/webhooks/bilibili",
  clientId: "",
  clientSecret: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（异步通知 RSA2 验签起步） */
export const defaultAlipayConnection: AlipayConnectionConfig = {
  channel: "alipay",
  url: "http://127.0.0.1:8080/webhooks/alipay",
  appId: "",
  appPrivateKey: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（X-Hub-Signature-256 验签起步） */
export const defaultWhatsappConnection: WhatsappConnectionConfig = {
  channel: "whatsapp",
  url: "http://127.0.0.1:8080/webhooks/whatsapp",
  appSecret: "",
  verifyToken: "",
};

/** 原型默认值：本地联调回调地址，凭据留空（恒等头原样比对起步） */
export const defaultTelegramConnection: TelegramConnectionConfig = {
  channel: "telegram",
  url: "http://127.0.0.1:8080/webhooks/telegram",
  secretToken: "",
};

function itemsFrom(list: ConnectionConfig[]): Record<string, ConnectionConfig> {
  return Object.fromEntries(list.map((config) => [config.channel, config]));
}

export const initialConnectionsState: ConnectionsState = {
  items: {
    douyin: defaultDouyinConnection,
    wecom: defaultWecomConnection,
    xiaohongshu: defaultXiaohongshuConnection,
    "wechat-mp": defaultWechatMpConnection,
    "wechat-mini": defaultWechatMiniConnection,
    feishu: defaultFeishuConnection,
    dingtalk: defaultDingtalkConnection,
    qq: defaultQqConnection,
    weibo: defaultWeiboConnection,
    kuaishou: defaultKuaishouConnection,
    taobao: defaultTaobaoConnection,
    jingdong: defaultJingdongConnection,
    pinduoduo: defaultPinduoduoConnection,
    meituan: defaultMeituanConnection,
    eleme: defaultElemeConnection,
    bilibili: defaultBilibiliConnection,
    alipay: defaultAlipayConnection,
    whatsapp: defaultWhatsappConnection,
    telegram: defaultTelegramConnection,
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

/** 测试连接按渠道路由到对应协议命令（抖音 challenge / 企微 echostr /
 *  公众号与小程序三参签名 GET / 飞书 url_verification POST challenge）。
 *  switch 穷尽：新增渠道漏配路由时编译期报错；运行时未知渠道 fail-safe 拒绝。 */
export const testConnection = createAsyncThunk(
  "connections/test",
  async (config: ConnectionConfig) => {
    switch (config.channel) {
      case "douyin":
        return testDouyinApi(config);
      case "wecom":
        return testWecomApi(config);
      case "wechat-mp":
        return testWechatMpApi(config);
      case "wechat-mini":
        return testWechatMiniApi(config);
      case "feishu":
        return testFeishuApi(config);
      case "dingtalk":
        return testDingtalkApi(config);
      case "qq":
        return testQqApi(config);
      case "weibo":
        return testWeiboApi(config);
      case "xiaohongshu":
        return testXiaohongshuApi(config);
      case "kuaishou":
        return testKuaishouApi(config);
      case "taobao":
        return testTaobaoApi(config);
      case "jingdong":
        return testJingdongApi(config);
      case "pinduoduo":
        return testPinduoduoApi(config);
      case "meituan":
        return testMeituanApi(config);
      case "eleme":
        return testElemeApi(config);
      case "bilibili":
        return testBilibiliApi(config);
      case "alipay":
        return testAlipayApi(config);
      case "whatsapp":
        return testWhatsappApi(config);
      case "telegram":
        return testTelegramApi(config);
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
 * 「已配置」的内容判定（isConnectionReady）：直发前置条件，发送入口与指引
 * 展示共用。按职责拆出到 ./is-connection-ready（单文件 ≤ 500 行），
 * 此处仅保持既有导入路径稳定。
 */
export { isConnectionReady } from "./is-connection-ready";

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
