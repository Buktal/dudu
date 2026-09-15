import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import {
  type ConnectionConfig,
  type DingtalkConnectionConfig,
  type DouyinConnectionConfig,
  type FeishuConnectionConfig,
  type KuaishouConnectionConfig,
  loadConnections,
  type QqConnectionConfig,
  saveConnection as saveConnectionApi,
  testDingtalkConnection as testDingtalkApi,
  testDouyinConnection as testDouyinApi,
  testFeishuConnection as testFeishuApi,
  testKuaishouConnection as testKuaishouApi,
  testQqConnection as testQqApi,
  testWechatMiniConnection as testWechatMiniApi,
  testWechatMpConnection as testWechatMpApi,
  testWecomConnection as testWecomApi,
  testWeiboConnection as testWeiboApi,
  testXiaohongshuConnection as testXiaohongshuApi,
  type WechatMiniConnectionConfig,
  type WechatMpConnectionConfig,
  type WecomConnectionConfig,
  type WeiboConnectionConfig,
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
 * - 企微按通道核（加密/签名必需）：url + token + encodingAesKey；
 *   自建应用另需 corpId（加密 receiveid），机器人 receiveid 恒为空串不核
 * - 公众号核：url + appId（密文尾部校验方）+ token（三参/四参签名源）；
 *   encodingAesKey 仅兼容/安全模式必填（明文模式官方无需配置）
 * - 小程序核：同公众号族——url + appId + token；encodingAesKey 仅兼容/安全
 *   模式必填（dataFormat 随连接记录，不参与必填集）
 * - 飞书核：url + verificationToken 必填（官方 §4.1 默认校验方式，握手三参与
 *   事件 header 都带）；encryptKey 选填（空 = 明文直发，非空 = 签名 + AES
 *   信封）；appId 仅随连接记录
 * - 钉钉按通道核：密文通道 = url + token + encodingAesKey + ownerKey（sha1
 *   四参验签 + AES 解密封装 + 包尾 $key）；机器人通道 = url + appSecret
 *   （timestamp/sign = HmacSHA256）
 * - QQ 核：url + appSecret 必填（Ed25519 验签密钥）；appId 仅随连接记录
 * - 微博核：url + appSecret 必填（三参 sha1 排序验签的签名源，官方明示
 *   非 Token）；APPKEY 不参与推送协议不设字段
 * - 小红书按通道核：小程序通道 = url + token + encodingAesKey + appId
 *   （握手三参/MsgSignature 四参签名源 + AES 派生源 + 加密明文尾部校验方）；
 *   ark 通道 = url 即可（官方无推送侧签名口径，事实库 §3.7）
 * - 快手核：url + appId + appSecret 必填（开放域与支付回调族共用同一传输：
 *   AppSecret 为 kwaisign = MD5(原始 body + AppSecret) 签名源，AppID 参与连接
 *   测试 TEST 事件信封）
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
      return config.url.trim() !== "" && wecomSystemReady(config);
    case "wechat-mp":
      return config.url.trim() !== "" && wechatMpReady(config);
    case "wechat-mini":
      return config.url.trim() !== "" && wechatMiniReady(config);
    case "feishu":
      return config.url.trim() !== "" && feishuReady(config);
    case "dingtalk":
      return config.url.trim() !== "" && dingtalkReady(config);
    case "qq":
      return config.url.trim() !== "" && qqReady(config);
    case "weibo":
      return config.url.trim() !== "" && weiboReady(config);
    case "xiaohongshu":
      return config.url.trim() !== "" && xiaohongshuReady(config);
    case "kuaishou":
      return config.url.trim() !== "" && kuaishouReady(config);
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

/** 企微按推送通道核加密必填集（Token/EncodingAESKey 两通道通用） */
function wecomSystemReady(config: WecomConnectionConfig): boolean {
  const base = config.token !== "" && config.encodingAesKey !== "";
  switch (config.system) {
    case "agent":
      return base && config.corpId !== "";
    case "aibot":
      // 机器人通道加密 receiveid 恒为空串，corpId 不参与
      return base;
    default: {
      // 穷尽守卫：新增通道漏配必填集时编译期报错；未知通道视为未配置
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/** 公众号按加解密方式核必填集：明文模式无需 EncodingAESKey（官方默认项） */
function wechatMpReady(config: WechatMpConnectionConfig): boolean {
  const base = config.appId !== "" && config.token !== "";
  switch (config.mode) {
    case "plain":
      return base;
    case "compatible":
    case "secure":
      // 兼容/安全走 AES 信封：EncodingAESKey 必填（事实库 §4.1）
      return base && config.encodingAesKey !== "";
    default: {
      // 穷尽守卫：新增模式漏配必填集时编译期报错；未知模式视为未配置
      const exhaustive: never = config.mode;
      void exhaustive;
      return false;
    }
  }
}

/** 小程序与公众号同族：按加解密方式核必填集（明文模式 AESKey 可空） */
function wechatMiniReady(config: WechatMiniConnectionConfig): boolean {
  const base = config.appId !== "" && config.token !== "";
  switch (config.mode) {
    case "plain":
      return base;
    case "compatible":
    case "secure":
      // 兼容/安全走 AES 信封：EncodingAESKey 必填（事实库 §3.1）
      return base && config.encodingAesKey !== "";
    default: {
      // 穷尽守卫：新增模式漏配必填集时编译期报错；未知模式视为未配置
      const exhaustive: never = config.mode;
      void exhaustive;
      return false;
    }
  }
}

/**
 * 飞书核：url + verificationToken 必填（官方 §4.1 默认校验方式的三参之一，
 * 握手与事件 header 都带）；encryptKey 选填——留空 = 明文直发，填写 = 签名
 * + 加密信封（appId 仅随连接记录，不参与验签）。
 */
function feishuReady(config: FeishuConnectionConfig): boolean {
  return config.url.trim() !== "" && config.verificationToken.trim() !== "";
}

/** 钉钉按推送通道核必填集（验签/加密要素是直发前置） */
function dingtalkReady(config: DingtalkConnectionConfig): boolean {
  switch (config.system) {
    case "http_crypto":
      // 密文通道：sha1 四参验签 + AES 解密封装都吃 token/aesKey，包尾 $key=ownerKey
      return (
        config.token.trim() !== "" &&
        config.encodingAesKey.trim() !== "" &&
        config.ownerKey.trim() !== ""
      );
    case "bot":
      // 机器人通道：timestamp/sign = HmacSHA256(timestamp+"\n"+appSecret)
      return config.appSecret.trim() !== "";
    default: {
      // 穷尽守卫：新增通道漏配必填集时编译期报错；未知通道视为未配置
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/**
 * QQ 核：url + appSecret 必填（Ed25519 验签密钥，直发签名与 op13 回包校验
 * 都吃它）；appId 仅随连接记录（op13 请求头 X-Bot-Appid），不参与必填集。
 */
function qqReady(config: QqConnectionConfig): boolean {
  return config.appSecret.trim() !== "";
}

/**
 * 微博核：url + appSecret 必填（GET 握手与每次推送的三参 sha1 签名都吃它，
 * 官方明示密钥是 App Secret 而非自定义 Token）。
 */
function weiboReady(config: WeiboConnectionConfig): boolean {
  return config.appSecret.trim() !== "";
}

/** 小红书按推送通道核必填集（验签/加密要素是直发前置） */
function xiaohongshuReady(config: XiaohongshuConnectionConfig): boolean {
  switch (config.system) {
    case "miniapp":
      // 小程序通道：握手/MsgSignature 签名源 + AES 派生源 + 明文尾部 receiveid
      return (
        config.token.trim() !== "" &&
        config.encodingAesKey.trim() !== "" &&
        config.appId.trim() !== ""
      );
    case "ark":
      // ark 通道明文直发：无验签凭据（官方无推送侧签名口径，事实库 §3.7）
      return true;
    default: {
      // 穷尽守卫：新增通道漏配必填集时编译期报错；未知通道视为未配置
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/**
 * 快手核：url + appSecret 必填（kwaisign = MD5(原始 body + AppSecret) 头验签
 * 的签名源，开放域与支付回调族共用同一传输）；appId 参与连接测试 TEST 事件
 * 的信封 app_id，同为必填。
 */
function kuaishouReady(config: KuaishouConnectionConfig): boolean {
  return config.appId.trim() !== "" && config.appSecret.trim() !== "";
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
