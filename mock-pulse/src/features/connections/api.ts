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
 * 钉钉推送通道（与 Rust 端 DingtalkSystem 内标一致，snake_case）：
 * 新 HTTP 密文信封事件回调与机器人收消息明文通道并行，验签体系完全不同
 * （事实库 §2 体系 B/D：前者 sha1 四参 + AES 信封，后者 HmacSHA256 头）。
 */
export type DingtalkSystem = "http_crypto" | "bot";

/**
 * 小红书推送通道（与 Rust 端 XiaohongshuSystem 内标一致，snake_case）：
 * 双体系并行（事实库 §2/§10）——小程序客服消息（官方消息型推送基准：GET
 * 四参握手 + AES 加密信封，回 success）与电商 ark 订单推送（POST JSON 数组
 * 明文，回 {"success":true,"error_code":0}），验签/加密体系完全不同。
 */
export type XiaohongshuSystem = "miniapp" | "ark";

/**
 * 钉钉连接配置形状（与 Rust 端 ConnectionConfig::Dingtalk 内标一致）：
 * 密文通道用 token/encodingAesKey/ownerKey（sha1 四参验签 + AES-CBC，
 * PKCS#7-32，包尾 $key=ownerKey）；机器人通道用 appSecret（HmacSHA256）。
 */
export type DingtalkConnectionConfig = {
  channel: "dingtalk";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 推送通道：新 HTTP 密文事件回调 / 机器人收消息明文通道（缺省 http_crypto） */
  system: DingtalkSystem;
  /** 回调加解密 Token（sha1 四参验签签名源，密文通道） */
  token: string;
  /** 43 位 EncodingAESKey（AESKey = Base64Decode(EncodingAESKey + "=")，密文通道） */
  encodingAesKey: string;
  /** OWNER_KEY：控制台订阅 = AppKey、注册 API = 组织维度（密文包尾 $key） */
  ownerKey: string;
  /** 应用 Client Secret（机器人通道 timestamp/sign = HmacSHA256 的密钥） */
  appSecret: string;
};

/**
 * QQ 连接配置形状（与 Rust 端 ConnectionConfig::Qq 内标一致）：
 * AppID 随 op13 请求头 X-Bot-Appid 记录；AppSecret（官方 sign 页亦称
 * Bot Secret）为 Ed25519 验签密钥（自我翻倍至 32 字节即 seed）。老 Token
 * 鉴权官方已废弃（事实库 §6），不设 Token 字段。
 */
export type QqConnectionConfig = {
  channel: "qq";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 机器人 AppID（op13 请求头 X-Bot-Appid；仅随连接记录） */
  appId: string;
  /** AppSecret / Bot Secret：Ed25519 验签密钥（翻倍截断 32 字节即 seed） */
  appSecret: string;
};

/**
 * 微博连接配置形状（与 Rust 端 ConnectionConfig::Weibo 内标一致）：
 * 验签密钥是 APPKEY 对应的 App Secret（官方明示非自定义 Token，事实库 §4.1），
 * GET 四参握手与每次推送的三参 sha1 签名都吃它；APPKEY 本身不参与推送协议，
 * 不设字段。
 */
export type WeiboConnectionConfig = {
  channel: "weibo";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** APPKEY 对应的 App Secret：三参 sha1 排序验签的签名源 */
  appSecret: string;
};

/**
 * 小红书连接配置形状（与 Rust 端 ConnectionConfig::Xiaohongshu 内标一致）：
 * 小程序通道三元组（Token 参与握手三参与 MsgSignature 四参签名、
 * EncodingAESKey 派生 AES-256-CBC、AppID 为加密明文尾部 receiveid）；
 * ark 通道无凭据（两 SDK 均未展示推送侧签名头，事实库 §3.7）。
 */
export type XiaohongshuConnectionConfig = {
  channel: "xiaohongshu";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 推送通道：小程序客服消息 / 电商 ark 订单推送（缺省 miniapp） */
  system: XiaohongshuSystem;
  /** 小程序通道：消息验证 TOKEN（握手三参与 MsgSignature 四参签名源） */
  token: string;
  /** 小程序通道：43 位 EncodingAESKey（官方 MsgDecrypt 同族 AES 派生源） */
  encodingAesKey: string;
  /** 小程序通道：小程序 AppID（加密明文尾部 receiveid，解密后须校验） */
  appId: string;
};

/**
 * 快手连接配置形状（与 Rust 端 ConnectionConfig::Kuaishou 内标一致）：
 * 开放域 WebHook 与支付回调族共用同一传输协议（明文 JSON + header kwaisign），
 * 无推送通道之分——AppSecret 即 kwaisign = MD5(原始 body + AppSecret) 验签密钥，
 * AppID 参与连接测试 TEST 事件的信封。两域回调地址可不同（notify_url 优先），
 * 目标侧按需切换本连接的 url 即可。
 */
export type KuaishouConnectionConfig = {
  channel: "kuaishou";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 应用 AppID（开放平台/小程序一致口径）：TEST 握手信封 app_id 即它 */
  appId: string;
  /** 应用 AppSecret：kwaisign = MD5(原始 body + AppSecret) 头验签的签名源 */
  appSecret: string;
};

/**
 * 淘宝连接配置形状（与 Rust 端 ConnectionConfig::Taobao 内标一致）：
 * 取全球栈 HTTPS 回调子形态（国内 TMC 长连接不在范围）——AppKey 拼接请求
 * body 作消息体、AppSecret 作密钥，Authorization = HEX(HMAC-SHA256(AppKey +
 * body, AppSecret))（事实库 §4.2）；数据明文传输，无 AES 字段。
 */
export type TaobaoConnectionConfig = {
  channel: "taobao";
  /** 回调目标地址，事件与剧本共享（官方要求 https + CA 签发 OV/EV 证书） */
  url: string;
  /** AppKey（全球栈应用标识）：验签消息体的前半段（官方示例 AppKey "123456"） */
  appKey: string;
  /** AppSecret（全球栈应用密钥）：HMAC-SHA256 验签密钥 */
  appSecret: string;
};

/**
 * 飞书连接配置形状（与 Rust 端 ConnectionConfig::Feishu 内标一致）：
 * Verification Token 参与 url_verification 三参与事件 header；Encrypt Key
 * 为空 = 明文直发，非空 = X-Lark-Signature 签名 + AES-256-CBC 加密信封
 * （key = sha256(encrypt_key)，官方 §4）。
 */
export type FeishuConnectionConfig = {
  channel: "feishu";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 应用 AppID（cli_ 开头，事件 header 的 app_id；随连接记录） */
  appId: string;
  /** Verification Token（事件与回调 > 加密策略；握手三参与事件 header 校验） */
  verificationToken: string;
  /** Encrypt Key：留空 = 明文直发；填写 = 签名 + 加密信封 */
  encryptKey: string;
};

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
  | WechatMiniConnectionConfig
  | FeishuConnectionConfig
  | DingtalkConnectionConfig
  | QqConnectionConfig
  | WeiboConnectionConfig
  | XiaohongshuConnectionConfig
  | KuaishouConnectionConfig
  | TaobaoConnectionConfig;

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

/** 按飞书 POST url_verification 协议测试连接（1 秒内原样回显 challenge；
 *  配 Encrypt Key 时发加密信封 + X-Lark-Signature 签名） */
export function testFeishuConnection(
  config: FeishuConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_feishu", { config });
}

/** 按钉钉通道测试连接：密文通道发 check_url 握手（期望 1500ms 内回加密
 *  success 包）；机器人通道发签名探测（timestamp/sign = HmacSHA256 头） */
export function testDingtalkConnection(
  config: DingtalkConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_dingtalk", { config });
}

/** 按 QQ op13 验证回调协议测试连接（目标须回 plain_token 回显 + Ed25519
 *  签名回包） */
export function testQqConnection(
  config: QqConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_qq", { config });
}

/** 按微博 GET 四参握手协议测试连接（signature=sha1(字典序排序三参)，
 *  目标须原样回显 echostr；官方 5 秒应答窗口） */
export function testWeiboConnection(
  config: WeiboConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_weibo", { config });
}

/** 按小红书通道测试连接：小程序通道发 GET 四参握手（三参 sha1 签名，目标
 *  原样回显 echostr）；ark 通道发最小推送探针（回 {"success":true,...}） */
export function testXiaohongshuConnection(
  config: XiaohongshuConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_xiaohongshu", { config });
}

/** 按快手 TEST 事件协议测试连接（官方配地址握手：POST TEST 事件 + header
 *  kwaisign = MD5(body+AppSecret)，目标须回 200 + result=1 并回传 message_id） */
export function testKuaishouConnection(
  config: KuaishouConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_kuaishou", { config });
}

/** 按全球栈 Verify 协议测试连接（官方配置页：填回调地址后 Verify，返回
 *  HTTP 200 即验证成功；探针带 Authorization = HEX(HMAC-SHA256(AppKey+body,
 *  AppSecret)) 头） */
export function testTaobaoConnection(
  config: TaobaoConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_taobao", { config });
}
