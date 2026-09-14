import { invoke } from "@tauri-apps/api/core";

/**
 * 抖音推送体系（与 Rust 端 DouyinSystem 内标一致，snake_case）：
 * 四套并行推送体系，验签与信封完全不同（事实库 §2）。
 */
export type DouyinSystem = "dop" | "life_service" | "mini_game" | "isv";

/**
 * 企微推送通道（与 Rust 端 WecomSystem 内标一致，snake_case）：
 * 自建应用 XML 回调与智能机器人 JSON 回调两条通道，同用 Token/EncodingAESKey
 * 验签加密，差异在报文形态与加密 receiveid（应用=corpId，机器人=空串）。
 */
export type WecomSystem = "agent" | "aibot";

/**
 * 公众号消息加解密方式（与 Rust 端 WechatMpMode 内标一致，snake_case）：
 * 明文/兼容/安全三模式（官方服务器配置配套项），差异在直发包与 URL 参数——
 * 明文仅三参 signature；兼容/安全加 encrypt_type=aes + msg_signature，
 * 安全模式包体仅密文信封。缺省 plain（官方默认）。
 */
export type WechatMpMode = "plain" | "compatible" | "secure";

/**
 * 小程序消息加解密方式（与 Rust 端 WechatMiniMode 内标一致，snake_case）：
 * 与公众号同族三模式（事实库 §3.1：明文/兼容不建议、安全强烈推荐）。
 * 缺省 plain。
 */
export type WechatMiniMode = "plain" | "compatible" | "secure";

/**
 * 小程序推送数据格式（与 Rust 端 WechatMiniDataFormat 内标一致，snake_case）：
 * 官方控制台 XML/JSON 可选（事实库 §3.1，与公众号不同点）；双格式按事实库
 * 结论取 XML 为主，此项随连接记录目标侧形态。缺省 xml。
 */
export type WechatMiniDataFormat = "xml" | "json";

/**
 * 连接配置按渠道区分形状（与 Rust 端 ConnectionConfig 内标枚举一致，
 * 以 channel 字段判别；持久化与 IPC 透传均为 camelCase）。
 */
export type DouyinConnectionConfig = {
  channel: "douyin";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 推送体系：决定握手与直发的验签/信封协议 */
  system: DouyinSystem;
  /** 应用标识：dop/生活服务 client_key；小游戏 AppID（x-appid 头） */
  clientKey: string;
  /** 签名密钥：dop client_secret / 生活服务 AppSecret */
  clientSecret: string;
  /** 小游戏消息推送 Token（官方 3~32 字符，参与 x-signature） */
  miniGameToken: string;
  /** 服务商 消息验证 TOKEN（参与 MsgSignature） */
  isvToken: string;
  /** 服务商 消息加密解密 KEY（官方 AES 参数待核验，暂随配置保存） */
  isvKey: string;
};

export type WecomConnectionConfig = {
  channel: "wecom";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 推送通道：自建应用 XML / 智能机器人 JSON（缺省 agent，兼容旧数据） */
  system: WecomSystem;
  /** 企业 ID（明文结构里的 receiveid，加解密参与方；机器人通道 receiveid 为空） */
  corpId: string;
  /** 回调配置 Token（参与签名） */
  token: string;
  /** 43 位消息加解密密钥（AES-256-CBC 派生源） */
  encodingAesKey: string;
  agentId: string;
};

export type WechatMpConnectionConfig = {
  channel: "wechat-mp";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 公众号 AppID（安全模式密文尾部即它，解密后须校验） */
  appId: string;
  /** 服务器配置 Token（GET 三参握手与四参 msg_signature 的签名源） */
  token: string;
  /** 43 位 EncodingAESKey（明文模式可不填；兼容/安全的 AES-256-CBC 派生源） */
  encodingAesKey: string;
  /** 消息加解密方式：三模式直发路由（缺省 plain，官方默认） */
  mode: WechatMpMode;
};

export type WechatMiniConnectionConfig = {
  channel: "wechat-mini";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 小程序 AppID（开发设置获取；安全模式密文尾部即它，解密后须校验） */
  appId: string;
  /** 服务器配置 Token（GET 三参握手与四参 msg_signature 的签名源） */
  token: string;
  /** 43 位 EncodingAESKey（明文模式可不填；兼容/安全的 AES-256-CBC 派生源） */
  encodingAesKey: string;
  /** 消息加解密方式：三模式直发路由（缺省 plain，官方推荐 secure） */
  mode: WechatMiniMode;
  /** 数据格式：XML/JSON 可选；推送取 XML 为主，此项记录目标侧控制台形态 */
  dataFormat: WechatMiniDataFormat;
};

export type ConnectionConfig =
  | DouyinConnectionConfig
  | WecomConnectionConfig
  | WechatMpConnectionConfig
  | WechatMiniConnectionConfig;

export type TestOutcome = {
  ok: boolean;
  /** 成功/失败的人类可读原因 */
  message: string;
};

/** 读取本地持久化的全部连接（Rust 端存 JSON 文件） */
export function loadConnections(): Promise<ConnectionConfig[]> {
  return invoke<ConnectionConfig[]>("connections_load");
}

/** 保存单条连接（按 channel 覆盖），返回保存后的完整列表 */
export function saveConnection(
  config: ConnectionConfig,
): Promise<ConnectionConfig[]> {
  return invoke<ConnectionConfig[]>("connections_save", { config });
}

/** 按抖音连接的推送体系测试连接：dop/生活服务 challenge 握手、
 *  小游戏 verify_request 握手、服务商授权推送（目标回 success） */
export function testDouyinConnection(
  config: DouyinConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_douyin", { config });
}

/** 按企微 GET echostr 协议向目标发起握手（AES 加密 + 四值字典序签名） */
export function testWecomConnection(
  config: WecomConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_wecom", { config });
}

/** 按公众号 GET 三参握手协议向目标发起 GET（signature=sha1(字典序三参)，
 *  目标须原样回显 echostr） */
export function testWechatMpConnection(
  config: WechatMpConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_wechat_mp", { config });
}

/** 按小程序 GET 三参握手协议向目标发起 GET（与公众号同族：
 *  signature=sha1(字典序三参)，目标须原样回显 echostr） */
export function testWechatMiniConnection(
  config: WechatMiniConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_wechat_mini", { config });
}
