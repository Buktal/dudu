import type {
  AlipayConnectionConfig,
  BilibiliConnectionConfig,
  DingtalkConnectionConfig,
  DouyinConnectionConfig,
  ElemeConnectionConfig,
  FeishuConnectionConfig,
  JingdongConnectionConfig,
  KuaishouConnectionConfig,
  MeituanConnectionConfig,
  PinduoduoConnectionConfig,
  QqConnectionConfig,
  TaobaoConnectionConfig,
  TelegramConnectionConfig,
  WechatMiniConnectionConfig,
  WechatMpConnectionConfig,
  WecomConnectionConfig,
  WeiboConnectionConfig,
  WhatsappConnectionConfig,
  XiaohongshuConnectionConfig,
} from "./api";

/**
 * 渠道必填集规则（channel-traits 表的数据行）：url 是全渠道公共前置
 * （stores/is-connection-ready 的通用判定），本模块只收「url 之外的渠道内
 * 必填集」——自 stores/is-connection-ready.ts 按职责移入（code-review 退件：
 * 渠道规则随渠道描述表聚合，消费点查表）。各渠道判定锚定事实库
 * （docs/research/channels/）：
 * - 抖音按推送体系核（验签密钥是直发前置）：dop/生活服务 = clientSecret
 *   （clientKey 仅标识）；小游戏 = miniGameToken（x-signature 参与）；
 *   服务商 = isvToken（MsgSignature 参与；isv_key 暂不参与验签，可空）
 * - 企微按通道核（加密/签名必需）：token + encodingAesKey；
 *   自建应用另需 corpId（加密 receiveid），机器人 receiveid 恒为空串不核
 * - 公众号核：appId（密文尾部校验方）+ token（三参/四参签名源）；
 *   encodingAesKey 仅兼容/安全模式必填（明文模式官方无需配置）
 * - 小程序核：同公众号族——appId + token；encodingAesKey 仅兼容/安全
 *   模式必填（dataFormat 随连接记录，不参与必填集）
 * - 飞书核：verificationToken 必填（官方 §4.1 默认校验方式，握手三参与
 *   事件 header 都带）；encryptKey 选填（空 = 明文直发，非空 = 签名 + AES
 *   信封）；appId 仅随连接记录
 * - 钉钉按通道核：密文通道 = token + encodingAesKey + ownerKey（sha1
 *   四参验签 + AES 解密封装 + 包尾 $key）；机器人通道 = appSecret
 *   （timestamp/sign = HmacSHA256）
 * - QQ 核：appSecret 必填（Ed25519 验签密钥）；appId 仅随连接记录
 * - 微博核：appSecret 必填（三参 sha1 排序验签的签名源，官方明示
 *   非 Token）；APPKEY 不参与推送协议不设字段
 * - 小红书按通道核：小程序通道 = token + encodingAesKey + appId
 *   （握手三参/MsgSignature 四参签名源 + AES 派生源 + 加密明文尾部校验方）；
 *   ark 通道 = url 即可（官方无推送侧签名口径，事实库 §3.7）
 * - 快手核：appId + appSecret 必填（开放域与支付回调族共用同一传输：
 *   AppSecret 为 kwaisign = MD5(原始 body + AppSecret) 签名源，AppID 参与连接
 *   测试 TEST 事件信封）
 * - 淘宝核（全球栈 HTTPS 回调）：appKey + appSecret 必填（验签消息体 =
 *   AppKey + body、密钥 = AppSecret，事实库 §4.2，两者缺一签名不可复算）
 * - 京东核（JOS 消息推送模拟）：appKey + appSecret 必填（sign =
 *   UPPER(MD5(appSecret + 字母序 k+v + appSecret)) 的密钥与 app_key 系统参数
 *   事实库 §4.1/§4.2，appSecret 缺失即签名不可复算）
 * - 拼多多核（PMC 订阅推送模拟）：clientId + clientSecret 必填（sign =
 *   UPPER(MD5(client_secret + ASCII 排序 k+v + client_secret)) 的密钥与
 *   client_id 公共参数事实库 §4.1 表必传项，clientSecret 缺失即签名不可复算）
 * - 美团核（合作中心表单回调模拟）：appId + appSecret 必填（sig =
 *   MD5(url?字母序 k=v 串 + app secret) 的密钥与 app_id 系统级参数事实库
 *   §4.1/§6，appSecret 缺失即签名不可复算；回调端口官方仅支持 80/8080）
 * - 饿了么核（用户线推送模拟）：consumerKey + consumerSecret 必填（sig =
 *   SHA1(HEX(url?字母序 k=v 串 + consumer_secret)) 的密钥与 consumer_key
 *   系统级参数事实库 §4.1/§6，consumerSecret 缺失即签名不可复算；无 token
 *   无加密无握手）
 * - 支付宝核（异步通知三地址模拟）：appPrivateKey 必填（sign =
 *   Base64(RSA-SHA256(剔除 sign/sign_type 后字典序 k=v 串)) 的签名私钥事实库
 *   §4.3/§4.1，与商户侧支付宝公钥成对，缺失即签名不可复算；appId 随载荷
 *   信封记录不参与必填集；应答 200 + success、fail 重推 25h 8 次 §3.3）
 * - WhatsApp 核（Cloud API Webhook）：appSecret + verifyToken 必填
 *   （X-Hub-Signature-256 = HMAC-SHA256(AppSecret, 原始 body) 头验签的签名源
 *   事实库 §4.1，appSecret 缺失即签名不可复算；verifyToken 为 GET 三参握手
 *   hub.verify_token 比对值 §3.2，缺失即握手必 403，与 App Secret 是两个
 *   无关值）
 * - Telegram 核（Bot Webhook）：secretToken 必填（恒等头
 *   X-Telegram-Bot-Api-Secret-Token 的头值——setWebhook.secret_token 原样
 *   回显，事实库 §4.1「字符串相等比较」的唯一验证要素，缺失即恒等头链路
 *   无法模拟；官方限 1–256 字符仅 A-Z a-z 0-9 _ -，无 HMAC 无加密）
 * - B站核（开放平台 Webhooks）：clientId + clientSecret 必填（clientId
 *   即签名头表 x-bili-accesskeyid 官方必填项、clientSecret 为 Authorization =
 *   HMAC-SHA256 的签名密钥事实库 §4.2/§6，任一缺失即签名不可复算；事件
 *   timestamp 为 UTC+8 字符串、5s 建连超时失败最多共推 3 次 §3.3）
 */

/** 抖音按推送体系核验签密钥（体系内标兜底走 clientSecret，兼容旧数据） */
export function douyinSystemReady(config: DouyinConnectionConfig): boolean {
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
export function wecomSystemReady(config: WecomConnectionConfig): boolean {
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
export function wechatMpReady(config: WechatMpConnectionConfig): boolean {
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
export function wechatMiniReady(config: WechatMiniConnectionConfig): boolean {
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
export function feishuReady(config: FeishuConnectionConfig): boolean {
  return config.url.trim() !== "" && config.verificationToken.trim() !== "";
}

/** 钉钉按推送通道核必填集（验签/加密要素是直发前置） */
export function dingtalkReady(config: DingtalkConnectionConfig): boolean {
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
export function qqReady(config: QqConnectionConfig): boolean {
  return config.appSecret.trim() !== "";
}

/**
 * 微博核：url + appSecret 必填（GET 握手与每次推送的三参 sha1 签名都吃它，
 * 官方明示密钥是 App Secret 而非自定义 Token）。
 */
export function weiboReady(config: WeiboConnectionConfig): boolean {
  return config.appSecret.trim() !== "";
}

/** 小红书按推送通道核必填集（验签/加密要素是直发前置） */
export function xiaohongshuReady(config: XiaohongshuConnectionConfig): boolean {
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
 * 快手核：url + appId + appSecret 必填（kwaisign = MD5(原始 body + AppSecret)
 * 头验签的签名源，开放域与支付回调族共用同一传输）；appId 参与连接测试 TEST
 * 事件的信封 app_id，同为必填。
 */
export function kuaishouReady(config: KuaishouConnectionConfig): boolean {
  return config.appId.trim() !== "" && config.appSecret.trim() !== "";
}

/**
 * 淘宝核（全球栈 HTTPS 回调）：url + appKey + appSecret 必填——验签消息体 =
 * AppKey 拼接请求 body、密钥 = AppSecret（事实库 §4.2），AppKey 缺失即签名
 * 不可复算，同为直发前置。
 */
export function taobaoReady(config: TaobaoConnectionConfig): boolean {
  return config.appKey.trim() !== "" && config.appSecret.trim() !== "";
}

/**
 * 京东核（JOS 消息推送模拟）：url + appKey + appSecret 必填——sign =
 * UPPER(MD5(appSecret + 按字母序 k+v 拼接 + appSecret))（事实库 §4.1），
 * appSecret 缺失即签名不可复算；app_key 为系统参数（事实库 §4.2 表必传项），
 * 缺失即请求不完整，同为直发前置。
 */
export function jingdongReady(config: JingdongConnectionConfig): boolean {
  return config.appKey.trim() !== "" && config.appSecret.trim() !== "";
}

/**
 * 拼多多核（PMC 订阅推送模拟）：url + clientId + clientSecret 必填——sign =
 * UPPER(MD5(client_secret + 按 ASCII 升序 k+v 拼接 + client_secret))（事实库
 * §4.1 官方三步逐字，官方向量已核验），clientSecret 缺失即签名不可复算；
 * client_id 为公共参数必传项（事实库 §4.1 表），缺失即请求不完整，同为直发
 * 前置。access_token 为选填公共参数（放参数集参签，非 Authorization 头），
 * 推送模拟不收。
 */
export function pinduoduoReady(config: PinduoduoConnectionConfig): boolean {
  return config.clientId.trim() !== "" && config.clientSecret.trim() !== "";
}

/**
 * 美团核（合作中心表单回调模拟）：url + appId + appSecret 必填——sig =
 * MD5(url?字母序 k=v 串 + app secret) 32 位小写（事实库 §4.1 官方五步逐字，
 * 官方向量已对拍），appSecret 缺失即签名不可复算；app_id 为系统级参数必传项
 * （事实库 §4.1/§6），缺失即请求不完整，同为直发前置。ISV 应用的门店
 * access_token 参签流程待核验(09-27)（事实库 §6/§7），推送模拟不收。
 */
export function meituanReady(config: MeituanConnectionConfig): boolean {
  return config.appId.trim() !== "" && config.appSecret.trim() !== "";
}

/**
 * 饿了么核（用户线推送模拟）：url + consumerKey + consumerSecret 必填——sig =
 * SHA1(HEX(url?字母序 k=v 串 + consumer_secret)) 40 位小写（事实库 §4.1 官方
 * 五步逐字，官方示例待签串已复现），consumerSecret 缺失即签名不可复算；
 * consumer_key 为系统级参数必传项（事实库 §4.1/§6「每次调用带 consumer_key +
 * timestamp(秒) + sig」），缺失即请求不完整，同为直发前置。无 token 无加密
 * 无握手（事实库 §3.1/§4.4）。
 */
export function elemeReady(config: ElemeConnectionConfig): boolean {
  return (
    config.consumerKey.trim() !== "" && config.consumerSecret.trim() !== ""
  );
}

/**
 * 支付宝核（异步通知三地址模拟）：url + appPrivateKey 必填——sign =
 * Base64(RSA-SHA256(剔除 sign/sign_type 后字典序 k=v 串))（rsaCheckV1 语义，
 * 事实库 §4.3/§4.1），appPrivateKey 缺失即签名不可复算；appId 随载荷信封
 * 记录（§5.1 信封字段由模板携带），不参与必填集。
 */
export function alipayReady(config: AlipayConnectionConfig): boolean {
  return config.appPrivateKey.trim() !== "";
}

/**
 * WhatsApp 核（Cloud API Webhook）：url + appSecret + verifyToken 必填——
 * X-Hub-Signature-256 = sha256=hex(HMAC-SHA256(AppSecret, 原始 body))（事实库
 * §4.1），appSecret 缺失即签名不可复算；verifyToken 为 GET 三参握手
 * hub.verify_token 比对值（§3.2），缺失即握手必 403，与 App Secret 是两个
 * 无关值。载荷不设加密字段（§4），无 AES 字段。
 */
export function whatsappReady(config: WhatsappConnectionConfig): boolean {
  return config.appSecret.trim() !== "" && config.verifyToken.trim() !== "";
}

/**
 * Telegram 核（Bot Webhook）：url + secretToken 必填——恒等头
 * X-Telegram-Bot-Api-Secret-Token 是官方验证链路的唯一要素（原样回显 +
 * 字符串相等比较，事实库 §4.1，无 HMAC），secretToken 缺失即恒等头链路
 * 无法模拟。官方限 1–256 字符、仅 A-Z a-z 0-9 _ -（越限的 token 真实
 * setWebhook 配不出来，由 Rust 适配器直发侧拒绝）。
 */
export function telegramReady(config: TelegramConnectionConfig): boolean {
  return config.secretToken.trim() !== "";
}

/**
 * B站核（开放平台 Webhooks）：url + clientId + clientSecret 必填——clientId
 * 即签名头表 x-bili-accesskeyid（官方头表必填项，事实库 §4.2/§6），缺失即
 * 请求不完整；clientSecret 为 Authorization = HMAC-SHA256 的签名密钥，缺失
 * 即签名不可复算。事件载荷明文无加密（§4.3），无 AES 字段。
 */
export function bilibiliReady(config: BilibiliConnectionConfig): boolean {
  return config.clientId.trim() !== "" && config.clientSecret.trim() !== "";
}
