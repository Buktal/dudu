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

export type ConnectionConfig = DouyinConnectionConfig | WecomConnectionConfig;

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
