import { invoke } from "@tauri-apps/api/core";

import { type ChannelId, isChannelId } from "@/lib/channels";

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
 * 京东连接配置形状（与 Rust 端 ConnectionConfig::Jingdong 内标一致）：
 * JOS 消息推送模拟——app_key/timestamp/v/sign 系统参数走 URL query，事件明文
 * 以 360buy_param_json 名参与签名（§4.1，应用级参数整体 JSON），sign =
 * UPPER(MD5(appSecret + 字母序 k+v + appSecret))，timestamp 10 分钟窗口；
 * 推送回调验签官方口径待核验(09-27)，以唯一实锤的 API 请求签名规则模拟。
 */
export type JingdongConnectionConfig = {
  channel: "jingdong";
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  /** 应用 app_key（应用中心创建应用获取，事实库 §6）：系统参数与签名参与方 */
  appKey: string;
  /** appSecret（签名两端夹 secret，事实库 §4.1）：UPPER(MD5) 签名密钥 */
  appSecret: string;
};

/**
 * 拼多多连接配置形状（与 Rust 端 ConnectionConfig::Pinduoduo 内标一致）：
 * PMC 订阅推送模拟——签名 = UPPER(MD5(client_secret + ASCII 排序 k+v +
 * client_secret))（§4.1 官方三步逐字，官方向量 E4DE3ED21002510DED352819E7AE6775
 * 已核验），公共参数 client_id/timestamp（UNIX 秒）必传；access_token 放参数集
 * 参签（非 Authorization 头，事实库 §6），推送模拟不收该选填项。
 */
export type PinduoduoConnectionConfig = {
  channel: "pinduoduo";
  /** 回调目标地址，事件与剧本共享（官方推送地址为商户配置的回调 URL） */
  url: string;
  /** 应用 client_id（应用详情查看，事实库 §4.1 公共参数表必传项） */
  clientId: string;
  /** client_secret（签名两端夹 secret，事实库 §4.1）：UPPER(MD5) 签名密钥 */
  clientSecret: string;
};

/**
 * 美团连接配置形状（与 Rust 端 ConnectionConfig::Meituan 内标一致）：
 * 技术服务合作中心回调模拟——POST form-urlencoded（端口仅 80/8080），签名 =
 * MD5(url?字母序 k=v 串 + app secret) 32 位小写（事实库 §4.1 官方五步逐字，
 * 官方向量 00934d00d0aea6f12161edfb6456143d 已对拍），系统级参数
 * app_id/timestamp（调用时 UNIX 秒）/sig 由适配器直发时补齐；ISV 应用的门店
 * access_token 参签流程待核验(09-27)（事实库 §6/§7），推送模拟不收。
 */
export type MeituanConnectionConfig = {
  channel: "meituan";
  /** 回调目标地址，事件与剧本共享（官方按推送项逐项配置回调 URL，端口仅 80/8080） */
  url: string;
  /** 应用 app_id（开发者中心查看，事实库 §4.1/§6 系统级参数必传项） */
  appId: string;
  /** app secret / consumer_secret（事实库 §4.1/§6）：MD5(url?字母序+secret) 签名密钥 */
  appSecret: string;
};

/**
 * 饿了么连接配置形状（与 Rust 端 ConnectionConfig::Eleme 内标一致）：
 * 用户线推送模拟——HTTP POST 无握手无 token 无加密，签名 = SHA1(HEX(url?字母序
 * k=v 串 + consumer_secret)) 40 位小写（事实库 §4.1 官方五步逐字，官方示例
 * 待签串已复现），系统级参数 consumer_key/timestamp/sig 一律放 Query String
 * （§4.1）；v2 JSON 推送明文透传、H5 表单推送业务字段原字节保留。成功应答
 * HTTP 200 + {"message":"ok"}（§5.1 逐字）。
 */
export type ElemeConnectionConfig = {
  channel: "eleme";
  /** 回调目标地址，事件与剧本共享（官方无握手，推送即普通 POST） */
  url: string;
  /** 应用 consumer_key（Key，应用身份标识，事实库 §6）：系统级参数与签名参与方 */
  consumerKey: string;
  /** 应用 consumer_secret（Secret，应用私钥，事实库 §4.1/§6）：SHA1 五步签名密钥 */
  consumerSecret: string;
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
 * 支付宝连接配置形状（与 Rust 端 ConnectionConfig::Alipay 内标一致）：
 * 异步通知三地址（接口 notify_url / 应用网关 / From 蚂蚁订阅）共用同一传输
 * 与签名协议——POST form-urlencoded，sign = Base64(RSA-SHA256(PKCS#1 v1.5)
 * (剔除 sign/sign_type 后字典序 k=v 串))（rsaCheckV1 语义，事实库 §4.3/§4.1，
 * sign 为 base64 344 位）；应答 200 + 纯文本 success、fail 重推 25h 8 次、
 * notify_id 幂等（§3.3/§3.4）。信封字段由模板载荷携带（§5.1），appId 仅随
 * 连接记录。
 */
export type AlipayConnectionConfig = {
  channel: "alipay";
  /** 回调目标地址（notify_url 或应用网关），事件与剧本共享（须外网 POST 回 200） */
  url: string;
  /** 应用 APPID（创建应用生成，事实库 §6.1）：非三方场景 auth_app_id=app_id，随载荷信封记录 */
  appId: string;
  /** 支付宝侧签名私钥（PEM PKCS#8/PKCS#1 或 DER Base64）：与商户侧配置的支付宝公钥成对（§4.3 验签用支付宝公钥），RSA-SHA256 签名源，测试联调自备密钥对 */
  appPrivateKey: string;
};

/**
 * WhatsApp 连接配置形状（与 Rust 端 ConnectionConfig::Whatsapp 内标一致）：
 * Cloud API Webhook（单 URL + 必订 messages）——POST 明文 JSON + 头
 * X-Hub-Signature-256 = sha256(HMAC-SHA256(AppSecret, 原始 body)) 验签
 * （事实库 §4.1，载荷不设加密字段）；verifyToken 为 GET 三参握手
 * hub.verify_token 比对值（§3.2，与 App Secret 是两个无关值）。
 */
export type WhatsappConnectionConfig = {
  channel: "whatsapp";
  /** 回调目标地址，事件与剧本共享（官方要求 HTTPS + 有效 TLS 证书，自签不接受） */
  url: string;
  /** App Secret（App Settings > Basic）：X-Hub-Signature-256 头验签的签名源 */
  appSecret: string;
  /** Verify Token（回调配置自选任意字符串）：GET 三参握手比对值 */
  verifyToken: string;
};

/**
 * Telegram 连接配置形状（与 Rust 端 ConnectionConfig::Telegram 内标一致）：
 * Bot Webhook 模拟——POST JSON Update 明文 + 恒等头
 * X-Telegram-Bot-Api-Secret-Token（setWebhook secret_token 原样回显，
 * 1–256 字符、仅 A-Z a-z 0-9 _ -，接收侧字符串相等比较，事实库 §4.1，
 * 无 HMAC、无加密字段）；官方无 challenge 握手（§3.2）。
 */
export type TelegramConnectionConfig = {
  channel: "telegram";
  /** 回调目标地址，事件与剧本共享（官方约束：HTTPS、端口 443/80/88/8443、TLS1.2+） */
  url: string;
  /** Secret Token（setWebhook.secret_token，1–256 字符 A-Z a-z 0-9 _ -）：
   *  恒等头 X-Telegram-Bot-Api-Secret-Token 的头值，原样比对 */
  secretToken: string;
};

/**
 * B站连接配置形状（与 Rust 端 ConnectionConfig::Bilibili 内标一致）：
 * 开放平台 Webhooks 模拟——POST 明文 JSON {event, content, timestamp} +
 * x-bili-* 服务端签名头表（官方摘录实锤，§4.2），Authorization =
 * HMAC-SHA256 签名；clientId 即 x-bili-accesskeyid（= client_id，事实库
 * §6），clientSecret 为签名密钥。verify_webhooks 握手（§3.2 镜像口径）
 * 由 Rust 适配器承载。
 */
export type BilibiliConnectionConfig = {
  channel: "bilibili";
  /** 回调目标地址，事件与剧本共享（管理中心 Webhooks 模块配置） */
  url: string;
  /** 应用 Client ID（client_id，事实库 §6）：签名头表 x-bili-accesskeyid 的头值 */
  clientId: string;
  /** 应用 secret（签名密钥，事实库 §6）：Authorization = HMAC-SHA256 的签名源 */
  clientSecret: string;
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
  | TaobaoConnectionConfig
  | JingdongConnectionConfig
  | PinduoduoConnectionConfig
  | MeituanConnectionConfig
  | ElemeConnectionConfig
  | BilibiliConnectionConfig
  | AlipayConnectionConfig
  | WhatsappConnectionConfig
  | TelegramConnectionConfig;

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

/**
 * 渠道连接测试的 IPC 命令分发表（单点）：Rust 侧 `#[tauri::command]` 具名函数
 * 不动，前端 19 个 testXxxConnection 包装器收敛为按 channel 查表分发。
 * 命令名 = connections_test_<渠道 id 的 snake_case>；新增渠道 = 注册表加渠道
 * + 此表加一行（satisfies 穷尽：漏配时编译期报错）。各渠道握手/探针形态
 * 锚定事实库（docs/research/channels/），文案见 channel-notes.ts。
 */
const TEST_COMMANDS = {
  douyin: "connections_test_douyin", // dop/生活服务 challenge、小游戏 verify_request、服务商授权推送
  wecom: "connections_test_wecom", // GET echostr 握手（AES 加密 + 四值字典序签名）
  "wechat-mp": "connections_test_wechat_mp", // GET 三参握手（signature=sha1 字典序三参，回显 echostr）
  "wechat-mini": "connections_test_wechat_mini", // GET 三参握手（与公众号同族）
  feishu: "connections_test_feishu", // POST url_verification（1s 内回显 challenge；配 Encrypt Key 加密信封）
  dingtalk: "connections_test_dingtalk", // 密文通道 check_url 握手 / 机器人通道 HmacSHA256 签名探测
  qq: "connections_test_qq", // op13 验证回调（plain_token 回显 + Ed25519 签名回包）
  weibo: "connections_test_weibo", // GET 四参握手（sha1 排序验签，官方 5 秒应答窗口）
  xiaohongshu: "connections_test_xiaohongshu", // 小程序 GET 四参握手 / ark 最小推送探针
  kuaishou: "connections_test_kuaishou", // TEST 事件握手（kwaisign = MD5(body+AppSecret)，回 200 + result=1）
  taobao: "connections_test_taobao", // 全球栈 Verify（HTTP 200 即验证成功）
  jingdong: "connections_test_jingdong", // 推送探针（POST 状态枚举样本 + JOS 系统参数与 MD5 签名）
  pinduoduo: "connections_test_pinduoduo", // 推送探针（POST 订单状态样本 + client_id/timestamp/sign）
  meituan: "connections_test_meituan", // 推送探针（POST 订单核验表单 + 尾部追加 app_id/timestamp/sig）
  eleme: "connections_test_eleme", // 推送探针（POST 订单状态样本 + query 系统参数与 sig）
  alipay: "connections_test_alipay", // 推送探针（POST 异步通知核验表单 + RSA2 sign）
  whatsapp: "connections_test_whatsapp", // GET 三参握手（hub.mode=subscribe，匹配 200 裸回 challenge）
  telegram: "connections_test_telegram", // Update 推送探针（恒等头 X-Telegram-Bot-Api-Secret-Token）
  bilibili: "connections_test_bilibili", // verify_webhooks 握手（x-bili-* 签名头表，200 原样回 data）
} as const satisfies Record<ChannelId, string>;

/**
 * 按渠道分发连接测试命令：探针语义同该渠道普通推送，期望值由 Rust 适配器
 * 判定。运行时未知渠道（持久化文件混入注册表外 id）fail-safe 拒绝，
 * 不静默路由到任何已知协议。
 */
export function testConnectionInvoke(
  config: ConnectionConfig,
): Promise<TestOutcome> {
  const command = isChannelId(config.channel)
    ? TEST_COMMANDS[config.channel]
    : undefined;
  if (!command) {
    return Promise.reject(
      new Error(`未知渠道，无法路由测试命令：${String(config.channel)}`),
    );
  }
  return invoke<TestOutcome>(command, { config });
}
