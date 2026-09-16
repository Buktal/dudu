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
 * 各渠道的原型默认连接（本地联调回调地址，凭据留空）：channel-traits 表的
 * 数据行，初始占位连接（slice 初始化）与表单回退共用。自
 * stores/connections-slice.ts 移入（code-review 退件：默认值随渠道描述表
 * 聚合，消费点查表）。
 */

/** 原型默认值：dop 体系起步 */
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

/** 原型默认值：自建应用 XML 通道起步 */
export const defaultWecomConnection: WecomConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:8080/webhooks/wecom",
  system: "agent",
  corpId: "",
  token: "",
  encodingAesKey: "",
  agentId: "",
};

/** 原型默认值：官方默认明文模式起步 */
export const defaultWechatMpConnection: WechatMpConnectionConfig = {
  channel: "wechat-mp",
  url: "http://127.0.0.1:8080/webhooks/wechat-mp",
  appId: "",
  token: "",
  encodingAesKey: "",
  mode: "plain",
};

/** 原型默认值：明文模式 + XML 数据格式起步 */
export const defaultWechatMiniConnection: WechatMiniConnectionConfig = {
  channel: "wechat-mini",
  url: "http://127.0.0.1:8080/webhooks/wechat-mini",
  appId: "",
  token: "",
  encodingAesKey: "",
  mode: "plain",
  dataFormat: "xml",
};

/** 原型默认值：新 HTTP 密文事件回调起步 */
export const defaultDingtalkConnection: DingtalkConnectionConfig = {
  channel: "dingtalk",
  url: "http://127.0.0.1:8080/webhooks/dingtalk",
  system: "http_crypto",
  token: "",
  encodingAesKey: "",
  ownerKey: "",
  appSecret: "",
};

/** 原型默认值：Encrypt Key 留空 = 明文直发起步 */
export const defaultFeishuConnection: FeishuConnectionConfig = {
  channel: "feishu",
  url: "http://127.0.0.1:8080/webhooks/feishu",
  appId: "",
  verificationToken: "",
  encryptKey: "",
};

/** 原型默认值：Ed25519 验签密钥起步 */
export const defaultQqConnection: QqConnectionConfig = {
  channel: "qq",
  url: "http://127.0.0.1:8080/webhooks/qq",
  appId: "",
  appSecret: "",
};

/** 原型默认值：App Secret 验签起步 */
export const defaultWeiboConnection: WeiboConnectionConfig = {
  channel: "weibo",
  url: "http://127.0.0.1:8080/webhooks/weibo",
  appSecret: "",
};

/** 原型默认值：小程序客服消息通道起步 */
export const defaultXiaohongshuConnection: XiaohongshuConnectionConfig = {
  channel: "xiaohongshu",
  url: "http://127.0.0.1:8080/webhooks/xiaohongshu",
  system: "miniapp",
  token: "",
  encodingAesKey: "",
  appId: "",
};

/** 原型默认值：kwaisign MD5 验签起步 */
export const defaultKuaishouConnection: KuaishouConnectionConfig = {
  channel: "kuaishou",
  url: "http://127.0.0.1:8080/webhooks/kuaishou",
  appId: "",
  appSecret: "",
};

/** 原型默认值：全球栈 HMAC-SHA256 验签起步 */
export const defaultTaobaoConnection: TaobaoConnectionConfig = {
  channel: "taobao",
  url: "http://127.0.0.1:8080/webhooks/taobao",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：JOS MD5 签名起步 */
export const defaultJingdongConnection: JingdongConnectionConfig = {
  channel: "jingdong",
  url: "http://127.0.0.1:8080/webhooks/jingdong",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：PMC UPPER(MD5) 签名起步 */
export const defaultPinduoduoConnection: PinduoduoConnectionConfig = {
  channel: "pinduoduo",
  url: "http://127.0.0.1:8080/webhooks/pinduoduo",
  clientId: "",
  clientSecret: "",
};

/** 原型默认值：合作中心 MD5(url?字母序+secret) 签名起步 */
export const defaultMeituanConnection: MeituanConnectionConfig = {
  channel: "meituan",
  url: "http://127.0.0.1:8080/webhooks/meituan",
  appId: "",
  appSecret: "",
};

/** 原型默认值：用户线 SHA1 五步签名起步 */
export const defaultElemeConnection: ElemeConnectionConfig = {
  channel: "eleme",
  url: "http://127.0.0.1:8080/webhooks/eleme",
  consumerKey: "",
  consumerSecret: "",
};

/** 原型默认值：x-bili-* 头表 HMAC-SHA256 验签起步 */
export const defaultBilibiliConnection: BilibiliConnectionConfig = {
  channel: "bilibili",
  url: "http://127.0.0.1:8080/webhooks/bilibili",
  clientId: "",
  clientSecret: "",
};

/** 原型默认值：异步通知 RSA2 验签起步 */
export const defaultAlipayConnection: AlipayConnectionConfig = {
  channel: "alipay",
  url: "http://127.0.0.1:8080/webhooks/alipay",
  appId: "",
  appPrivateKey: "",
};

/** 原型默认值：X-Hub-Signature-256 验签起步 */
export const defaultWhatsappConnection: WhatsappConnectionConfig = {
  channel: "whatsapp",
  url: "http://127.0.0.1:8080/webhooks/whatsapp",
  appSecret: "",
  verifyToken: "",
};

/** 原型默认值：恒等头原样比对起步 */
export const defaultTelegramConnection: TelegramConnectionConfig = {
  channel: "telegram",
  url: "http://127.0.0.1:8080/webhooks/telegram",
  secretToken: "",
};
