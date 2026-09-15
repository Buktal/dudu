import type {
  ConnectionConfig,
  DingtalkConnectionConfig,
  FeishuConnectionConfig,
  QqConnectionConfig,
  WeiboConnectionConfig,
  XiaohongshuConnectionConfig,
} from "../api";

/**
 * 连接凭证字段的按渠道构建器（纯数据，无 JSX）：每个渠道/通道一个函数，
 * 返回表单字段描述列表（key 即配置键，secret 决定掩码控件）。
 * 从 connection-fields.tsx 按职责拆出（单文件 ≤ 500 行）；
 * 控件渲染与推送通道选择器留在原组件。
 */

/** 表单字段的构建形态：key 对应配置字段名，secret 走掩码输入 */
export type CredentialField = {
  key: string;
  label: string;
  note: string;
  value: string;
  secret: boolean;
};

/** 按推送体系取凭证字段：标签随体系语义变化，存储字段保持稳定 */
function douyinFields(
  draft: Extract<ConnectionConfig, { channel: "douyin" }>,
): CredentialField[] {
  switch (draft.system) {
    case "mini_game":
      return [
        {
          key: "clientKey",
          label: "AppID",
          note: "小游戏 AppID，作为推送头 x-appid 参与 x-signature 验签。",
          value: draft.clientKey,
          secret: false,
        },
        {
          key: "miniGameToken",
          label: "Token",
          note: "消息推送 Token（3~32 字符），参与 x-signature 计算。",
          value: draft.miniGameToken,
          secret: true,
        },
      ];
    case "isv":
      return [
        {
          key: "isvToken",
          label: "消息验证 TOKEN",
          note: "参与 MsgSignature 验签，需与第三方小程序开发配置一致。",
          value: draft.isvToken,
          secret: true,
        },
        {
          key: "isvKey",
          label: "消息加密解密 KEY",
          note: "Encrypt 密钥；官方 AES 参数待核验，暂随配置保存不参与验签。",
          value: draft.isvKey,
          secret: true,
        },
      ];
    case "life_service":
      return [
        {
          key: "clientKey",
          label: "Client Key",
          note: "生活服务应用标识，可选。",
          value: draft.clientKey,
          secret: false,
        },
        {
          key: "clientSecret",
          label: "AppSecret",
          note: "X-Douyin-Signature = sha1(AppSecret + body)，需与接收服务配置一致。",
          value: draft.clientSecret,
          secret: true,
        },
      ];
    default:
      return [
        {
          key: "clientKey",
          label: "Client Key",
          note: "应用标识，可选。",
          value: draft.clientKey,
          secret: false,
        },
        {
          key: "clientSecret",
          label: "Client Secret",
          note: "生成回调签名，需与接收服务配置一致。",
          value: draft.clientSecret,
          secret: true,
        },
      ];
  }
}

/** 按推送通道取凭证字段：机器人通道加密 receiveid 恒为空串，不收 CorpID/AgentID */
function wecomFields(
  draft: Extract<ConnectionConfig, { channel: "wecom" }>,
): CredentialField[] {
  if (draft.system === "aibot") {
    return [
      {
        key: "token",
        label: "Token",
        note: "回调签名 Token，需与机器人回调配置一致。",
        value: draft.token,
        secret: true,
      },
      {
        key: "encodingAesKey",
        label: "EncodingAESKey",
        note: "43 位消息加解密密钥；加密 receiveid 传空字符串（官方 §4.4）。",
        value: draft.encodingAesKey,
        secret: true,
      },
    ];
  }
  return [
    {
      key: "corpId",
      label: "CorpID",
      note: "参与消息加解密的企业标识（加密 receiveid）。",
      value: draft.corpId,
      secret: false,
    },
    {
      key: "agentId",
      label: "AgentID",
      note: "自建应用 ID，可选。",
      value: draft.agentId,
      secret: false,
    },
    {
      key: "token",
      label: "Token",
      note: "回调签名 Token，需与接收服务一致。",
      value: draft.token,
      secret: true,
    },
    {
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: "43 位消息加解密密钥。",
      value: draft.encodingAesKey,
      secret: true,
    },
  ];
}

/** 公众号按消息加解密方式取凭证字段：明文模式无需 EncodingAESKey（可留空） */
function wechatMpFields(
  draft: Extract<ConnectionConfig, { channel: "wechat-mp" }>,
): CredentialField[] {
  const fields = [
    {
      key: "appId",
      label: "AppID",
      note: "公众号开发者 ID；安全模式密文尾部即它，解密后须校验一致。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "token",
      label: "Token",
      note: "服务器配置 Token（任意填写），GET 三参握手与 msg_signature 的签名源。",
      value: draft.token,
      secret: true,
    },
  ];
  if (draft.mode !== "plain") {
    fields.push({
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: "43 位消息加解密密钥；兼容/安全模式的 AES-256-CBC 派生源。",
      value: draft.encodingAesKey,
      secret: true,
    });
  }
  return fields;
}

/** 小程序按消息加解密方式取凭证字段：与公众号同族，明文模式 AESKey 可空 */
function wechatMiniFields(
  draft: Extract<ConnectionConfig, { channel: "wechat-mini" }>,
): CredentialField[] {
  const fields = [
    {
      key: "appId",
      label: "AppID",
      note: "小程序 AppID（开发设置获取）；安全模式密文尾部即它，解密后须校验一致。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "token",
      label: "Token",
      note: "服务器配置 Token（任意填写），GET 三参握手与 msg_signature 的签名源。",
      value: draft.token,
      secret: true,
    },
  ];
  if (draft.mode !== "plain") {
    fields.push({
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: "43 位消息加解密密钥；兼容/安全模式的 AES-256-CBC 派生源。",
      value: draft.encodingAesKey,
      secret: true,
    });
  }
  return fields;
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

/** 按渠道取凭证字段构建器（与 ConnectionFields 的渠道分支同序） */
export function credentialFieldsOf(draft: ConnectionConfig): CredentialField[] {
  switch (draft.channel) {
    case "douyin":
      return douyinFields(draft);
    case "wechat-mp":
      return wechatMpFields(draft);
    case "wechat-mini":
      return wechatMiniFields(draft);
    case "feishu":
      return feishuFields(draft);
    case "dingtalk":
      return dingtalkFields(draft);
    case "qq":
      return qqFields(draft);
    case "weibo":
      return weiboFields(draft);
    case "xiaohongshu":
      return xiaohongshuFields(draft);
    case "wecom":
      return wecomFields(draft);
    default: {
      // 穷尽守卫：新增渠道漏配字段构建器时编译期报错
      const exhaustive: never = draft;
      void exhaustive;
      return [];
    }
  }
}
