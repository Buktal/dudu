import type {
  BilibiliConnectionConfig,
  DingtalkConnectionConfig,
  DingtalkSystem,
  FeishuConnectionConfig,
  KuaishouConnectionConfig,
  QqConnectionConfig,
  TelegramConnectionConfig,
  WeiboConnectionConfig,
  WhatsappConnectionConfig,
  XiaohongshuConnectionConfig,
  XiaohongshuSystem,
} from "./api";
import type { CredentialField } from "./channel-traits-model";
import { hasText } from "./channel-traits-model";

/**
 * IM/内容行集（feishu/dingtalk/qq/weibo/xiaohongshu/kuaishou/whatsapp/
 * telegram/bilibili）：单形态渠道为主，dingtalk/xiaohongshu 带通道选择器。
 * 各行自带默认连接 + 凭证字段 + 必填集 + 信封形态 + 验证文案 + 选择器定义；
 * 构建器均为文件内函数（不导出），必填集统一走 hasText。
 */

/** 钉钉推送通道（事实库 §2 体系 B/D：密文事件回调与机器人明文收消息） */
export const DINGTALK_SYSTEMS: readonly {
  value: DingtalkSystem;
  label: string;
}[] = [
  { value: "http_crypto", label: "事件订阅（新 HTTP 密文信封）" },
  { value: "bot", label: "机器人收消息（明文 JSON）" },
];

/** 小红书推送通道（事实库 §2/§10：小程序客服消息与电商 ark 推送双体系并行） */
export const XIAOHONGSHU_SYSTEMS: readonly {
  value: XiaohongshuSystem;
  label: string;
}[] = [
  { value: "miniapp", label: "小程序客服消息（加密 JSON 信封）" },
  { value: "ark", label: "电商 ark 订单推送（JSON 数组明文）" },
];

/** 原型默认值：Encrypt Key 留空 = 明文直发起步 */
export const defaultFeishuConnection: FeishuConnectionConfig = {
  channel: "feishu",
  url: "http://127.0.0.1:8080/webhooks/feishu",
  appId: "",
  verificationToken: "",
  encryptKey: "",
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

/** 原型默认值：x-bili-* 头表 HMAC-SHA256 验签起步 */
export const defaultBilibiliConnection: BilibiliConnectionConfig = {
  channel: "bilibili",
  url: "http://127.0.0.1:8080/webhooks/bilibili",
  clientId: "",
  clientSecret: "",
};

/** 飞书凭证字段（事实库 §4）：Encrypt Key 留空 = 明文直发，填写 = 签名 + 加密信封 */
function feishuFields(draft: FeishuConnectionConfig): CredentialField[] {
  return [
    {
      key: "appId",
      label: "App ID",
      note: "应用 AppID（cli_ 开头），事件 header 的 app_id；仅随连接记录。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "verificationToken",
      label: "Verification Token",
      note: "事件与回调 > 加密策略页获取；url_verification 三参之一与事件 header 的 token。",
      value: draft.verificationToken,
      secret: true,
    },
    {
      key: "encryptKey",
      label: "Encrypt Key",
      note: "留空 = 明文直发；填写后走 X-Lark-Signature 签名 + AES 加密信封（key=sha256(encrypt_key)）。",
      value: draft.encryptKey,
      secret: true,
    },
  ];
}

/** 钉钉按推送通道取凭证字段：密文通道三元组，机器人通道 Client Secret */
function dingtalkFields(draft: DingtalkConnectionConfig): CredentialField[] {
  if (draft.system === "bot") {
    return [
      {
        key: "appSecret",
        label: "Client Secret",
        note: "应用密钥；timestamp/sign = Base64(HmacSHA256(timestamp+换行+appSecret))，与接收服务配置一致。",
        value: draft.appSecret,
        secret: true,
      },
    ];
  }
  return [
    {
      key: "token",
      label: "Token",
      note: "事件订阅页的加解密 Token；signature = sha1(字典序排序(token,timestamp,nonce,encrypt))。",
      value: draft.token,
      secret: true,
    },
    {
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: '43 位消息加解密密钥；AESKey = Base64Decode(EncodingAESKey + "=")，IV 取 AESKey 前 16 字节。',
      value: draft.encodingAesKey,
      secret: true,
    },
    {
      key: "ownerKey",
      label: "OWNER_KEY",
      note: "控制台订阅 = AppKey（注册 API = 组织维度）；加密包尾部的 $key，解密后须校验一致。",
      value: draft.ownerKey,
      secret: false,
    },
  ];
}

/** QQ 凭证字段（事实库 §4/§6）：AppSecret 即 Ed25519 验签密钥；老 Token 已废弃 */
function qqFields(draft: QqConnectionConfig): CredentialField[] {
  return [
    {
      key: "appId",
      label: "AppID",
      note: "机器人 AppID（管理端开发基础设置获取）；随 op13 请求头 X-Bot-Appid 记录。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "appSecret",
      label: "AppSecret",
      note: "验签密钥（官方 sign 页亦称 Bot Secret）：自我翻倍至 32 字节即 Ed25519 seed；老 Token 鉴权已废弃不收集。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** 微博凭证字段（事实库 §4.1）：验签密钥是 APPKEY 对应的 App Secret，非自定义 Token */
function weiboFields(draft: WeiboConnectionConfig): CredentialField[] {
  return [
    {
      key: "appSecret",
      label: "AppSecret",
      note: "APPKEY 对应的 App Secret（官方明示用它生成签名，非自定义 Token）：GET 握手与每次推送的 sha1(排序(appsecret,timestamp,nonce)) 签名源。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** 小红书按推送通道取凭证字段：小程序三元组，ark 明文直发无凭据 */
function xiaohongshuFields(
  draft: XiaohongshuConnectionConfig,
): CredentialField[] {
  if (draft.system === "ark") {
    return [];
  }
  return [
    {
      key: "token",
      label: "Token",
      note: "消息验证 TOKEN：GET 握手 signature=sha1(字典序排序(Token,timestamp,nonce)) 与推送 MsgSignature 四参签名的签名源。",
      value: draft.token,
      secret: true,
    },
    {
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: '43 位消息加解密密钥（官方 MsgDecrypt 同族：AESKey=Base64Decode(Key+"=")，IV 取前 16 字节，PKCS#7 以 32 字节补位）。',
      value: draft.encodingAesKey,
      secret: true,
    },
    {
      key: "appId",
      label: "AppID",
      note: "小程序 AppID：加密明文尾部的 receiveid 即它，解密后须校验一致。",
      value: draft.appId,
      secret: false,
    },
  ];
}

/** 快手凭证字段（事实库 §4.1）：kwaisign = MD5(原始 body + AppSecret) 头验签 */
function kuaishouFields(draft: KuaishouConnectionConfig): CredentialField[] {
  return [
    {
      key: "appId",
      label: "AppID",
      note: "应用 AppID（开放平台/小程序一致口径）：连接测试 TEST 事件信封的 app_id 即它，随载荷信封记录。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "appSecret",
      label: "AppSecret",
      note: "应用密钥：验签 kwaisign = MD5(原始 body 字符串 + AppSecret)（header kwaisign 字段）的签名源，无 AES。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** WhatsApp 凭证字段（事实库 §3.2/§4.1）：App Secret 验签 + Verify Token 握手比对，缺一不可 */
function whatsappFields(draft: WhatsappConnectionConfig): CredentialField[] {
  return [
    {
      key: "appSecret",
      label: "App Secret",
      note: "应用密钥：X-Hub-Signature-256 = sha256=hex(HMAC-SHA256(AppSecret, 原始 body)) 头验签的签名源；必须对原始字节计算，先 JSON.parse 再重序列化会改变摘要。",
      value: draft.appSecret,
      secret: true,
    },
    {
      key: "verifyToken",
      label: "Verify Token",
      note: "回调配置自选任意字符串：GET 三参握手 hub.verify_token 比对值（不匹配目标回 403）；与 App Secret 是两个无关值。",
      value: draft.verifyToken,
      secret: true,
    },
  ];
}

/** Telegram 凭证字段（事实库 §4.1）：secret_token 是恒等头原样比对的唯一要素 */
function telegramFields(draft: TelegramConnectionConfig): CredentialField[] {
  return [
    {
      key: "secretToken",
      label: "Secret Token",
      note: "setWebhook 的 secret_token（1–256 字符，仅 A-Z a-z 0-9 _ -）：恒等头 X-Telegram-Bot-Api-Secret-Token 原样回显，接收侧做字符串相等比较（无 HMAC 无加密）。",
      value: draft.secretToken,
      secret: true,
    },
  ];
}

/** B站凭证字段（事实库 §4.2/§6）：client_id 即签名头表，secret 为签名密钥 */
function bilibiliFields(draft: BilibiliConnectionConfig): CredentialField[] {
  return [
    {
      key: "clientId",
      label: "Client ID",
      note: "应用 client_id（管理中心创建应用分配）：服务端签名头表 x-bili-accesskeyid 的头值（官方头表必填项）。",
      value: draft.clientId,
      secret: false,
    },
    {
      key: "clientSecret",
      label: "App Secret",
      note: "应用 secret：Authorization = HMAC-SHA256（x-bili-* 头字典序 \\n 拼接，拼接串官方正文待核验(09-27)）的签名密钥；与接收服务配置一致。",
      value: draft.clientSecret,
      secret: true,
    },
  ];
}

/** 飞书核：verificationToken 必填（握手三参与事件 header 都带）；url 由公共前置核，不在此重复 */
function feishuReady(config: FeishuConnectionConfig): boolean {
  return hasText(config.verificationToken);
}

/** 钉钉按推送通道核必填集（验签/加密要素是直发前置） */
function dingtalkReady(config: DingtalkConnectionConfig): boolean {
  switch (config.system) {
    case "http_crypto":
      return (
        hasText(config.token) &&
        hasText(config.encodingAesKey) &&
        hasText(config.ownerKey)
      );
    case "bot":
      return hasText(config.appSecret);
    default: {
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/** QQ 核：appSecret 必填（Ed25519 验签密钥）；appId 仅随连接记录 */
function qqReady(config: QqConnectionConfig): boolean {
  return hasText(config.appSecret);
}

/** 微博核：appSecret 必填（三参 sha1 排序验签的签名源） */
function weiboReady(config: WeiboConnectionConfig): boolean {
  return hasText(config.appSecret);
}

/** 小红书按推送通道核必填集（验签/加密要素是直发前置） */
function xiaohongshuReady(config: XiaohongshuConnectionConfig): boolean {
  switch (config.system) {
    case "miniapp":
      return (
        hasText(config.token) &&
        hasText(config.encodingAesKey) &&
        hasText(config.appId)
      );
    case "ark":
      return true;
    default: {
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/** 快手核：appId + appSecret 必填（kwaisign 头验签的签名源与 TEST 信封） */
function kuaishouReady(config: KuaishouConnectionConfig): boolean {
  return hasText(config.appId) && hasText(config.appSecret);
}

/** WhatsApp 核：appSecret + verifyToken 必填（验签与握手比对，两个无关值） */
function whatsappReady(config: WhatsappConnectionConfig): boolean {
  return hasText(config.appSecret) && hasText(config.verifyToken);
}

/** Telegram 核：secretToken 必填（恒等头的唯一验证要素） */
function telegramReady(config: TelegramConnectionConfig): boolean {
  return hasText(config.secretToken);
}

/** B站核：clientId + clientSecret 必填（签名头表与签名密钥） */
function bilibiliReady(config: BilibiliConnectionConfig): boolean {
  return hasText(config.clientId) && hasText(config.clientSecret);
}

/** IM/内容行集：键即渠道 id，值即该行完整描述（组装见 ./channel-traits） */
export const imTraits = {
  feishu: {
    defaultConnection: defaultFeishuConnection,
    credentialFields: feishuFields,
    credentialReady: feishuReady,
    wireFormat: "JSON",
    testNote: (draft: FeishuConnectionConfig) => {
      const encrypted = draft.encryptKey !== "";
      return `发送 POST url_verification（challenge/token/type 三参${encrypted ? "，AES 加密信封 + X-Lark-Signature 签名" : "明文"}），检查服务是否在 1 秒内原样回显 challenge。`;
    },
    selectors: [],
  },
  dingtalk: {
    defaultConnection: defaultDingtalkConnection,
    credentialFields: dingtalkFields,
    credentialReady: dingtalkReady,
    wireFormat: "JSON",
    testNote: (draft: DingtalkConnectionConfig) =>
      draft.system === "bot"
        ? "发送带 timestamp/sign（HmacSHA256）头的明文探测请求，检查服务是否验签通过并响应 HTTP 2xx。"
        : "发送 check_url 握手（加密信封 + sha1 四参 URL 签名），检查服务是否在 1500ms 内回可解密的加密 success 包。",
    selectors: [
      {
        key: "system",
        label: "推送通道",
        hint: "钉钉密文事件回调与机器人收消息并行且验签完全不同（sha1 四参 + AES 信封 / HmacSHA256 头）：回调地址与凭证按通道配套填写。",
        options: DINGTALK_SYSTEMS,
      },
    ],
  },
  qq: {
    defaultConnection: defaultQqConnection,
    credentialFields: qqFields,
    credentialReady: qqReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 op13 验证回调（User-Agent: QQBot-Callback + X-Bot-Appid），检查服务是否回 plain_token 回显 + Ed25519 签名的验签回包。",
    selectors: [],
  },
  weibo: {
    defaultConnection: defaultWeiboConnection,
    credentialFields: weiboFields,
    credentialReady: weiboReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 GET（signature=sha1(字典序排序(AppSecret,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。",
    selectors: [],
  },
  xiaohongshu: {
    defaultConnection: defaultXiaohongshuConnection,
    credentialFields: xiaohongshuFields,
    credentialReady: xiaohongshuReady,
    wireFormat: "JSON",
    testNote: (draft: XiaohongshuConnectionConfig) =>
      draft.system === "ark"
        ? '发送最小 ark 推送探针（单条信封的 JSON 数组），检查服务是否回 {"success":true,"error_code":0}（电商侧无官方握手口径）。'
        : "发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。",
    selectors: [
      {
        key: "system",
        label: "推送通道",
        hint: "小红书双体系并行且协议完全不同（小程序客服消息 AES 加密信封回 success / 电商 ark JSON 数组明文回 success+error_code）：回调地址与凭证按通道配套填写。",
        options: XIAOHONGSHU_SYSTEMS,
      },
    ],
  },
  kuaishou: {
    defaultConnection: defaultKuaishouConnection,
    credentialFields: kuaishouFields,
    credentialReady: kuaishouReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 TEST 测试事件（header kwaisign = MD5(body+AppSecret)），检查服务是否回 HTTP 200 且 result=1 并回传收到的 message_id。",
    selectors: [],
  },
  whatsapp: {
    defaultConnection: defaultWhatsappConnection,
    credentialFields: whatsappFields,
    credentialReady: whatsappReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 GET（hub.mode=subscribe + 随机 hub.challenge + hub.verify_token），检查服务是否比对 verify_token 并以 HTTP 200 原样裸回 challenge（纯文本非 JSON；不匹配回 403 等非 200）。",
    selectors: [],
  },
  telegram: {
    defaultConnection: defaultTelegramConnection,
    credentialFields: telegramFields,
    credentialReady: telegramReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 Update 推送探针（POST 官方样本 Update 明文 + 头 X-Telegram-Bot-Api-Secret-Token = Secret Token），检查服务是否原样比对 token 并返回 HTTP 2XY（官方无 challenge 握手：setWebhook 同步返回 True 即成功；非 2XY 按合理次数重推）。",
    selectors: [],
  },
  bilibili: {
    defaultConnection: defaultBilibiliConnection,
    credentialFields: bilibiliFields,
    credentialReady: bilibiliReady,
    wireFormat: "JSON",
    testNote: () =>
      '发送 verify_webhooks 握手（POST {"event":"verify_webhooks","content":{"data":<随机数>},"timestamp":…} + x-bili-* 签名头表 + Authorization = HMAC-SHA256），检查服务是否解析 data 并以 HTTP 200 原样回 {"data":<数值>}（管理中心填回调地址失焦即触发校验，镜像口径待核验(09-27)；事件推送 5s 建连超时、失败最多共推 3 次）。',
    selectors: [],
  },
} as const;
// 行集键穷尽由 ./channel-traits 组装处的 satisfies 全局校验，此处不重复声明。
