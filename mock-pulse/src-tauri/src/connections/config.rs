//! 平台连接的域类型：各渠道推送体系/通道/模式枚举 + [`ConnectionConfig`]。
//! 从 mod.rs 按职责拆出（单文件 ≤ 500 行）——mod.rs 留适配器 seam 与命令，
//! 这里集中「按渠道存不同凭据形状」的配置判别类型。

use serde::{Deserialize, Serialize};

/// 抖音推送体系（事实库 §2：四套并行推送体系，验签与载荷完全不同）。
/// 连接配置按体系路由协议原语；序列化 snake_case，缺省 dop（旧版数据形状不变）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DouyinSystem {
    /// dop Webhooks：移动/网站应用 + IM 私信，X-Douyin-Signature = sha1(client_secret + body)
    #[default]
    Dop,
    /// 生活服务 WebHooks：X-Douyin-Signature = sha1(AppSecret + 去换行 body)，2.5 秒应答窗口
    LifeService,
    /// 小游戏消息推送：x-signature = base64(md5(排序四头 + body + token))
    MiniGame,
    /// 服务商（第三方小程序）：{Nonce, TimeStamp, Encrypt, MsgSignature} 信封
    Isv,
}

/// 企微推送通道（事实库 §2.1/§2.10：XML 自建应用与 JSON 智能机器人两通道并行）。
/// 连接配置按通道路由协议原语；序列化 snake_case，缺省 agent（旧版数据形状不变）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WecomSystem {
    /// 自建应用回调：明文 XML 报文，加密 receiveid = corpId（官方 90239/90240）
    #[default]
    Agent,
    /// 智能机器人回调：明文 JSON 报文，加密 receiveid = 空串（官方 100719/101027/101033）
    Aibot,
}

/// 公众号消息加解密方式（事实库 §4.1 三模式，官方服务器配置配套项）。
/// 序列化 snake_case，缺省 plain（官方默认明文模式）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WechatMpMode {
    /// 明文模式（官方默认）：明文 XML 直发，URL 仅三参 signature
    #[default]
    Plain,
    /// 兼容模式（调试过渡）：明文与密文并存，URL 加 encrypt_type=aes + msg_signature
    Compatible,
    /// 安全模式（官方推荐）：仅密文信封（ToUserName + Encrypt），URL 同兼容
    Secure,
}

/// 小程序消息加解密方式（小程序事实库 §3.1 三选一：明文/兼容不建议、安全强烈
/// 推荐；与公众号同族同流程）。序列化 snake_case，缺省 plain（明文列首且
/// 免配 EncodingAESKey，与公众号缺省一致）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WechatMiniMode {
    /// 明文模式：明文报文直发，URL 仅三参 signature
    #[default]
    Plain,
    /// 兼容模式：明文与密文并存，URL 加 encrypt_type=aes + msg_signature
    Compatible,
    /// 安全模式（官方强烈推荐）：仅密文信封，URL 同兼容
    Secure,
}

/// 小程序推送数据格式（小程序事实库 §3.1：XML 或 JSON 可选，与公众号不同点）。
/// 序列化 snake_case，缺省 xml——双格式按事实库结论取 XML 为主（模板与直发
/// 均为 XML）；JSON 随配置记录目标侧控制台形态。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WechatMiniDataFormat {
    /// XML 报文（本工具推送主形态，模板逐字锚定 XML 样本）
    #[default]
    Xml,
    /// JSON 报文（官方可选；目标侧控制台配置形态随连接记录）
    Json,
}

/// 钉钉推送通道（事实库 §2 体系 B/D：新 HTTP 密文事件回调与机器人明文收消息
/// 并行，验签体系完全不同）。连接配置按通道路由协议原语；序列化 snake_case，
/// 缺省 http_crypto（本票主体为新 HTTP 密文信封子形态）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DingtalkSystem {
    /// 事件订阅新 HTTP 密文信封：sha1 四参验签 + AES-CBC（PKCS#7-32、包尾
    /// $key），1500ms 内期望加密 success 回包
    #[default]
    HttpCrypto,
    /// 机器人收消息明文通道：header timestamp/sign =
    /// Base64(HmacSHA256(timestamp + "\n" + appSecret))，1h 时钟窗
    Bot,
}

/// 小红书推送通道（事实库 §2/§10：小程序客服消息与电商 ark 推送双体系并行，
/// 验签/加密体系完全不同）。连接配置按通道路由协议原语；序列化 snake_case，
/// 缺省 miniapp（小程序客服消息为小红书侧官方消息型推送基准，事实库 §10.8）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum XiaohongshuSystem {
    /// 小程序客服消息：GET 四参握手（三参 sha1 排序验签）+ AES 加密信封
    /// （MsgSignature 在 body 内），应答 success，5s 超时×3 重试
    #[default]
    Miniapp,
    /// 电商 ark 订单推送：POST JSON 数组明文（无签名头），应答
    /// {"success":true,"error_code":0}
    Ark,
}

/// 平台连接配置：持久化（store）与协议握手（douyin/wecom/wechat_mp）共用的域类型。
/// 按渠道存不同凭据形状，以 channel 内标序列化（旧版抖音/企微数据形状不变，
/// 新增体系/通道/模式字段全部 serde default 缺省）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "channel")]
pub enum ConnectionConfig {
    #[serde(rename = "douyin", rename_all = "camelCase")]
    Douyin {
        url: String,
        /// 推送体系：决定握手与直发的验签/信封协议（缺省 dop）
        #[serde(default)]
        system: DouyinSystem,
        /// 应用标识：dop/生活服务 client_key；小游戏 AppID（x-appid 头）
        client_key: String,
        /// 签名密钥：dop client_secret / 生活服务 AppSecret
        client_secret: String,
        /// 小游戏消息推送 Token（官方配置项，3~32 字符，参与 x-signature）
        #[serde(default)]
        mini_game_token: String,
        /// 服务商 消息验证 TOKEN（参与 MsgSignature）
        #[serde(default)]
        isv_token: String,
        /// 服务商 消息加密解密 KEY（官方 AES 参数待核验(09-27)，暂随配置保存）
        #[serde(default)]
        isv_key: String,
    },
    #[serde(rename = "wecom", rename_all = "camelCase")]
    Wecom {
        url: String,
        /// 推送通道：自建应用 XML / 智能机器人 JSON（缺省 agent）
        #[serde(default)]
        system: WecomSystem,
        /// 企业 CorpID（自建应用通道的加密 receiveid；机器人通道 receiveid 为空）
        corp_id: String,
        /// 回调配置 Token（两通道共用，参与四值签名）
        token: String,
        /// 43 位 EncodingAESKey（两通道共用，AES-256-CBC 派生源）
        encoding_aes_key: String,
        /// 自建应用数字 ID（仅应用相关回调信封携带）
        agent_id: String,
    },
    #[serde(rename = "wechat-mp", rename_all = "camelCase")]
    WechatMp {
        url: String,
        /// 公众号 AppID（开发者 ID）：安全模式密文尾部即它，解密后须校验
        app_id: String,
        /// 服务器配置 Token（任意填写）：GET 三参握手与四参 msg_signature 签名源
        token: String,
        /// 43 位 EncodingAESKey（明文模式可不填；兼容/安全的 AES-256-CBC 派生源）
        encoding_aes_key: String,
        /// 消息加解密方式：三模式直发路由（缺省 plain，官方默认）
        #[serde(default)]
        mode: WechatMpMode,
    },
    #[serde(rename = "wechat-mini", rename_all = "camelCase")]
    WechatMini {
        url: String,
        /// 小程序 AppID（开发设置获取）：安全模式密文尾部即它，解密后须校验
        app_id: String,
        /// 服务器配置 Token：GET 三参握手与四参 msg_signature 签名源
        token: String,
        /// 43 位 EncodingAESKey（明文模式可不填；兼容/安全的 AES-256-CBC 派生源）
        encoding_aes_key: String,
        /// 消息加解密方式：三模式直发路由（缺省 plain，官方推荐 secure）
        #[serde(default)]
        mode: WechatMiniMode,
        /// 数据格式：XML/JSON 可选（事实库 §3.1 与公众号不同点）；推送取 XML 为主
        #[serde(default)]
        data_format: WechatMiniDataFormat,
    },
    #[serde(rename = "feishu", rename_all = "camelCase")]
    Feishu {
        url: String,
        /// 应用 AppID（cli_ 开头，事件 header 的 app_id；随连接记录）
        app_id: String,
        /// Verification Token（事件与回调 > 加密策略）：url_verification 明文
        /// 三参之一与事件 header 的 token（官方 §4.1 默认校验方式）
        verification_token: String,
        /// Encrypt Key（官方 §4）：空 = 明文事件直发；非空 = X-Lark-Signature
        /// 签名 + AES-256-CBC 加密信封（key = sha256(encrypt_key)）
        #[serde(default)]
        encrypt_key: String,
    },
    #[serde(rename = "dingtalk", rename_all = "camelCase")]
    Dingtalk {
        url: String,
        /// 推送通道：新 HTTP 密文事件回调 / 机器人收消息明文（缺省 http_crypto）
        #[serde(default)]
        system: DingtalkSystem,
        /// 事件订阅加解密 Token（sha1 四参验签签名源，密文通道）
        #[serde(default)]
        token: String,
        /// 43 位 EncodingAESKey（AESKey = Base64Decode(EncodingAESKey + "=")，
        /// 密文通道）
        #[serde(default)]
        encoding_aes_key: String,
        /// OWNER_KEY：控制台订阅 = AppKey、注册 API = 组织维度（密文包尾 $key，
        /// 企业内部=Corpid / 第三方=suiteKey）
        #[serde(default)]
        owner_key: String,
        /// 应用 Client Secret（机器人通道 timestamp/sign = HmacSHA256 密钥）
        #[serde(default)]
        app_secret: String,
    },
    #[serde(rename = "qq", rename_all = "camelCase")]
    Qq {
        url: String,
        /// 机器人 AppID（op13 请求头 X-Bot-Appid；仅随连接记录）
        app_id: String,
        /// AppSecret（官方 sign 页亦称 Bot Secret）：Ed25519 验签密钥，
        /// 自我翻倍至 32 字节即 seed；老 Token 鉴权已废弃不收录（事实库 §6）
        app_secret: String,
    },
    #[serde(rename = "weibo", rename_all = "camelCase")]
    Weibo {
        url: String,
        /// APPKEY 对应的 App Secret（事实库 §4.1：验签密钥是它而非自定义
        /// Token，与微信差异点；APPKEY 本身不参与推送协议，不设字段）
        app_secret: String,
    },
    #[serde(rename = "xiaohongshu", rename_all = "camelCase")]
    Xiaohongshu {
        url: String,
        /// 推送通道：小程序客服消息 / 电商 ark 订单推送（缺省 miniapp）
        #[serde(default)]
        system: XiaohongshuSystem,
        /// 小程序通道：消息验证 TOKEN（GET 握手三参与 MsgSignature 四参签名源）
        #[serde(default)]
        token: String,
        /// 小程序通道：43 位 EncodingAESKey（官方 MsgDecrypt 同族 AES 派生源）
        #[serde(default)]
        encoding_aes_key: String,
        /// 小程序通道：小程序 AppID（加密明文尾部 receiveid，解密后须校验）
        #[serde(default)]
        app_id: String,
    },
    #[serde(rename = "kuaishou", rename_all = "camelCase")]
    Kuaishou {
        url: String,
        /// 应用 AppID（开放平台/小程序一致口径）：连接测试 TEST 事件信封 app_id
        app_id: String,
        /// 应用 AppSecret：kwaisign = MD5(原始 body + AppSecret) 头验签的签名源
        app_secret: String,
    },
    #[serde(rename = "taobao", rename_all = "camelCase")]
    Taobao {
        url: String,
        /// AppKey（全球栈应用标识）：验签消息体 = AppKey 拼接请求 body
        /// （官方示例 AppKey "123456"，事实库 §4.2）
        app_key: String,
        /// AppSecret（全球栈应用密钥）：HMAC-SHA256 验签密钥；数据明文传输无 AES
        app_secret: String,
    },
    #[serde(rename = "jingdong", rename_all = "camelCase")]
    Jingdong {
        url: String,
        /// 应用 app_key（应用中心创建应用获取，事实库 §6）：系统参数（§4.2 表
        /// 必传项），参与字母序签名拼接
        app_key: String,
        /// appSecret：sign = UPPER(MD5(appSecret + 字母序 k+v + appSecret))
        /// 两端夹 secret 的签名源（事实库 §4.1）
        app_secret: String,
    },
    #[serde(rename = "pinduoduo", rename_all = "camelCase")]
    Pinduoduo {
        url: String,
        /// 应用 client_id（应用详情查看，事实库 §4.1 公共参数表必传项）：参与
        /// ASCII 排序签名拼接
        client_id: String,
        /// client_secret：sign = UPPER(MD5(client_secret + ASCII 排序 k+v +
        /// client_secret)) 两端夹 secret 的签名源（事实库 §4.1，官方向量
        /// E4DE3ED21002510DED352819E7AE6775 已核验）
        client_secret: String,
    },
    #[serde(rename = "meituan", rename_all = "camelCase")]
    Meituan {
        url: String,
        /// 应用 app_id（开发者中心查看，事实库 §4.1/§6 系统级参数必传项）：
        /// 参与字母序签名拼接，由适配器随直发补齐进表单字段集
        app_id: String,
        /// app secret / consumer_secret：sig = MD5(url?字母序 k=v 串 + secret)
        /// 32 位小写的签名源（事实库 §4.1 官方五步，官方向量
        /// 00934d00d0aea6f12161edfb6456143d 已对拍）
        app_secret: String,
    },
    #[serde(rename = "eleme", rename_all = "camelCase")]
    Eleme {
        url: String,
        /// 应用 consumer_key（Key，应用身份标识，饿了么分配可在接入后台查看，
        /// 事实库 §6）：系统级参数必传项（§4.1/§6「每次调用带 consumer_key +
        /// timestamp(秒) + sig」），参与 ASCII 排序签名拼接
        consumer_key: String,
        /// 应用 consumer_secret（Secret，应用私钥）：sig = SHA1(HEX(url?字母序
        /// k=v 串 + consumer_secret)) 40 位小写的签名源（事实库 §4.1 官方
        /// 五步，官方示例待签串已复现）
        consumer_secret: String,
    },
    #[serde(rename = "alipay", rename_all = "camelCase")]
    Alipay {
        url: String,
        /// 应用 APPID（创建应用生成，事实库 §6.1「调用一切 OpenAPI 的身份」）：
        /// 异步通知公共参数 app_id（非三方场景 auth_app_id = app_id，§5.1），
        /// 属载荷信封、参与验签，由模板携带（§5.1），此处仅随连接记录
        app_id: String,
        /// 支付宝侧签名私钥（PEM PKCS#8/PKCS#1 或 DER Base64）：异步通知
        /// sign = Base64(RSA-SHA256(PKCS#1 v1.5)(待签串)) 的签名源（事实库
        /// §4.3 rsaCheckV1 / §4.1 RSA2 = SHA256WithRSA 2048 位；商户侧以成对的
        /// 支付宝公钥验签，测试联调自备密钥对）
        app_private_key: String,
    },
    #[serde(rename = "whatsapp", rename_all = "camelCase")]
    Whatsapp {
        url: String,
        /// App Secret（App Settings > Basic，第三方口径待核验(09-27)）：
        /// X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(AppSecret,
        /// 原始 body)) 头验签的签名源（事实库 §4.1，校验对原始字节算 MAC）；
        /// 载荷不设加密字段
        app_secret: String,
        /// Verify Token（App Dashboard > WhatsApp > Configuration 自选任意
        /// 字符串）：GET 三参握手 hub.verify_token 比对值（事实库 §3.2；
        /// verify token 与 app secret 是两个无关值，verify token 不参与
        /// POST 验签）
        verify_token: String,
    },
    #[serde(rename = "telegram", rename_all = "camelCase")]
    Telegram {
        url: String,
        /// Secret Token（setWebhook 的 secret_token，官方限 1–256 字符、
        /// 仅 A-Z a-z 0-9 _ -）：恒等头 X-Telegram-Bot-Api-Secret-Token 的
        /// 头值——原样回显 + 接收侧字符串相等比较（事实库 §4.1，无 HMAC
        /// 无签名无加密，官方验证链路的唯一要素）
        secret_token: String,
    },
    #[serde(rename = "bilibili", rename_all = "camelCase")]
    Bilibili {
        url: String,
        /// 应用 client_id（管理中心创建应用分配，事实库 §6）：签名头表
        /// x-bili-accesskeyid 的头值（官方头表必填项，即 accesskeyid）
        client_id: String,
        /// 应用 secret（回调验签/服务端签名密钥，事实库 §6）：
        /// Authorization = HMAC-SHA256 的签名源；载荷明文无加密（§4.3）
        app_secret: String,
    },
}
