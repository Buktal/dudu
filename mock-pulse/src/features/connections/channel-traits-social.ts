import type {
  DouyinConnectionConfig,
  DouyinSystem,
  WechatMiniConnectionConfig,
  WechatMiniDataFormat,
  WechatMiniMode,
  WechatMpConnectionConfig,
  WechatMpMode,
  WecomConnectionConfig,
  WecomSystem,
} from "./api";
import type { ChannelTrait, CredentialField } from "./channel-traits-model";
import { hasText } from "./channel-traits-model";

/**
 * 社交平台行集（douyin/wecom/wechat-mp/wechat-mini）：多形态渠道——各行自带
 * 默认连接 + 凭证字段 + 必填集 + 信封形态 + 验证文案 + 选择器定义。
 * 构建器均为文件内函数（不导出），对外仅经行记录与默认连接访问；
 * 必填集统一走 hasText（trim 规则单点，空白串视为未填）。
 */

/** 抖音推送体系（事实库 §2 四套并行体系，验签/信封完全不同） */
export const DOUYIN_SYSTEMS: readonly { value: DouyinSystem; label: string }[] =
  [
    { value: "dop", label: "dop Webhooks（移动/网站应用）" },
    { value: "life_service", label: "生活服务 WebHooks" },
    { value: "mini_game", label: "小游戏消息推送" },
    { value: "isv", label: "服务商（第三方小程序）" },
  ];

/** 企微推送通道（事实库 §2.1/§2.2/§2.10：XML 自建应用与 JSON 智能机器人） */
export const WECOM_SYSTEMS: readonly { value: WecomSystem; label: string }[] = [
  { value: "agent", label: "自建应用（XML 回调）" },
  { value: "aibot", label: "智能机器人（JSON 回调）" },
];

/** 公众号消息加解密方式（事实库 §4.1 三模式，官方服务器配置配套项） */
export const WECHAT_MP_MODES: readonly {
  value: WechatMpMode;
  label: string;
}[] = [
  { value: "plain", label: "明文模式（官方默认）" },
  { value: "compatible", label: "兼容模式（调试过渡）" },
  { value: "secure", label: "安全模式（官方推荐）" },
];

/** 小程序消息加解密方式（事实库 §3.1 三选一：明文/兼容不建议、安全强烈推荐） */
export const WECHAT_MINI_MODES: readonly {
  value: WechatMiniMode;
  label: string;
}[] = [
  { value: "plain", label: "明文模式" },
  { value: "compatible", label: "兼容模式" },
  { value: "secure", label: "安全模式（官方强烈推荐）" },
];

/** 小程序数据格式（事实库 §3.1：XML/JSON 可选，与公众号不同点） */
export const WECHAT_MINI_DATA_FORMATS: readonly {
  value: WechatMiniDataFormat;
  label: string;
}[] = [
  { value: "xml", label: "XML（本工具推送主形态）" },
  { value: "json", label: "JSON" },
];

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

/** 按推送体系取凭证字段：标签随体系语义变化，存储字段保持稳定 */
function douyinFields(draft: DouyinConnectionConfig): CredentialField[] {
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
function wecomFields(draft: WecomConnectionConfig): CredentialField[] {
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
function wechatMpFields(draft: WechatMpConnectionConfig): CredentialField[] {
  const fields: CredentialField[] = [
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
  draft: WechatMiniConnectionConfig,
): CredentialField[] {
  const fields: CredentialField[] = [
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
      note: "服务器配置 Token（任意填写），GET 三参握手与四参 msg_signature 签名源。",
      value: draft.token,
      secret: true,
    },
  ];
  if (draft.mode !== "plain") {
    fields.push({
      key: "encodingAesKey",
      label: "EncodingAESKey",
      note: "43 位消息加解密密钥；兼容/安全的 AES-256-CBC 派生源。",
      value: draft.encodingAesKey,
      secret: true,
    });
  }
  return fields;
}

/** 抖音按推送体系核验签密钥（体系内标兜底走 clientSecret，兼容旧数据） */
function douyinSystemReady(config: DouyinConnectionConfig): boolean {
  switch (config.system) {
    case "mini_game":
      return hasText(config.miniGameToken);
    case "isv":
      return hasText(config.isvToken);
    case "dop":
    case "life_service":
      return hasText(config.clientSecret);
    default: {
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/** 企微按推送通道核加密必填集（Token/EncodingAESKey 两通道通用） */
function wecomSystemReady(config: WecomConnectionConfig): boolean {
  const base = hasText(config.token) && hasText(config.encodingAesKey);
  switch (config.system) {
    case "agent":
      return base && hasText(config.corpId);
    case "aibot":
      return base;
    default: {
      const exhaustive: never = config.system;
      void exhaustive;
      return false;
    }
  }
}

/** 公众号按加解密方式核必填集：明文模式无需 EncodingAESKey（官方默认项） */
function wechatMpReady(config: WechatMpConnectionConfig): boolean {
  const base = hasText(config.appId) && hasText(config.token);
  switch (config.mode) {
    case "plain":
      return base;
    case "compatible":
    case "secure":
      return base && hasText(config.encodingAesKey);
    default: {
      const exhaustive: never = config.mode;
      void exhaustive;
      return false;
    }
  }
}

/** 小程序与公众号同族：按加解密方式核必填集（明文模式 AESKey 可空） */
function wechatMiniReady(config: WechatMiniConnectionConfig): boolean {
  const base = hasText(config.appId) && hasText(config.token);
  switch (config.mode) {
    case "plain":
      return base;
    case "compatible":
    case "secure":
      return base && hasText(config.encodingAesKey);
    default: {
      const exhaustive: never = config.mode;
      void exhaustive;
      return false;
    }
  }
}

/** 抖音握手文案按推送体系呈现（事实库 §3.1/§3.4：四套体系握手形态不同） */
function douyinTestNote(system: DouyinSystem): string {
  switch (system) {
    case "mini_game":
      return "发送 verify_request（x-signature 五头），检查服务是否验签通过并回 HTTP 200。";
    case "isv":
      return "按授权推送形态发送 TOKEN 重签信封，检查服务是否直接返回 success（不带引号）。";
    default:
      return "发送 challenge，检查服务是否原样返回验证内容。";
  }
}

/** 企微握手文案按推送通道呈现（官方 GET echostr 流程相同，receiveid 语义不同） */
function wecomTestNote(system: WecomSystem): string {
  if (system === "aibot") {
    return "发送加密 echostr（receiveid 为空串），检查服务是否正确解密并回显。";
  }
  return "发送加密 echostr，检查服务是否正确解密并回显。";
}

/** 公众号握手文案按消息加解密方式呈现（GET 三参握手三模式同一流程） */
function wechatMpTestNote(mode: WechatMpMode): string {
  const suffix =
    mode === "plain"
      ? "明文模式。"
      : mode === "compatible"
        ? "兼容模式。"
        : "安全模式。";
  return `发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。${suffix}`;
}

/** 小程序握手文案（与公众号同族 GET 三参握手，三模式同一流程） */
function wechatMiniTestNote(mode: WechatMiniMode): string {
  const suffix =
    mode === "plain"
      ? "明文模式。"
      : mode === "compatible"
        ? "兼容模式。"
        : "安全模式。";
  return `发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。${suffix}`;
}

const douyinTrait: ChannelTrait<DouyinConnectionConfig> = {
  defaultConnection: defaultDouyinConnection,
  credentialFields: douyinFields,
  credentialReady: douyinSystemReady,
  wireFormat: "JSON",
  testNote: (draft) => douyinTestNote(draft.system),
  selectors: [
    {
      key: "system",
      label: "推送体系",
      hint: "抖音四套推送体系并行且验签完全不同：回调地址与凭证按体系配套填写。",
      options: DOUYIN_SYSTEMS,
    },
  ],
};

const wecomTrait: ChannelTrait<WecomConnectionConfig> = {
  defaultConnection: defaultWecomConnection,
  credentialFields: wecomFields,
  credentialReady: wecomSystemReady,
  wireFormat: (draft) => (draft.system === "aibot" ? "JSON" : "XML"),
  testNote: (draft) => wecomTestNote(draft.system),
  selectors: [
    {
      key: "system",
      label: "推送通道",
      hint: "企微 XML 与机器人 JSON 两通道并行，加密 receiveid 语义不同（应用=CorpID， 机器人=空串）：回调地址与凭证按通道配套填写。",
      options: WECOM_SYSTEMS,
    },
  ],
};

const wechatMpTrait: ChannelTrait<WechatMpConnectionConfig> = {
  defaultConnection: defaultWechatMpConnection,
  credentialFields: wechatMpFields,
  credentialReady: wechatMpReady,
  wireFormat: "XML",
  testNote: (draft) => wechatMpTestNote(draft.mode),
  selectors: [
    {
      key: "mode",
      label: "消息加解密方式",
      hint: "公众号仅 XML 推送，三模式直发形态不同：明文仅三参 signature，兼容/安全加 encrypt_type=aes + msg_signature（安全模式包体仅密文信封）。",
      options: WECHAT_MP_MODES,
    },
  ],
};

const wechatMiniTrait: ChannelTrait<WechatMiniConnectionConfig> = {
  defaultConnection: defaultWechatMiniConnection,
  credentialFields: wechatMiniFields,
  credentialReady: wechatMiniReady,
  wireFormat: "XML",
  testNote: (draft) => wechatMiniTestNote(draft.mode),
  selectors: [
    {
      key: "mode",
      label: "消息加解密方式",
      hint: "小程序与公众号同族三模式：明文仅三参 signature，兼容/安全加 encrypt_type=aes + msg_signature（安全模式包体仅密文信封）。",
      options: WECHAT_MINI_MODES,
    },
    {
      key: "dataFormat",
      label: "数据格式",
      hint: "官方控制台 XML/JSON 可选（与公众号不同点）；本工具推送报文取 XML 为主，此处随连接记录目标侧控制台形态。",
      options: WECHAT_MINI_DATA_FORMATS,
    },
  ],
};

/** 社交平台行集：键即渠道 id，值即该行完整描述（组装见 ./channel-traits） */
export const socialTraits = {
  douyin: douyinTrait,
  wecom: wecomTrait,
  "wechat-mp": wechatMpTrait,
  "wechat-mini": wechatMiniTrait,
};
