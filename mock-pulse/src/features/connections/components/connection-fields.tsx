import { SecretInput } from "@/components/secret-input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type {
  ConnectionConfig,
  DingtalkConnectionConfig,
  FeishuConnectionConfig,
  QqConnectionConfig,
  WeiboConnectionConfig,
} from "../api";
import {
  DINGTALK_SYSTEMS,
  DOUYIN_SYSTEMS,
  WECHAT_MINI_DATA_FORMATS,
  WECHAT_MINI_MODES,
  WECHAT_MP_MODES,
  WECOM_SYSTEMS,
} from "./connection-options";

/** 按推送体系取凭证字段：标签随体系语义变化，存储字段保持稳定 */
function douyinFields(draft: Extract<ConnectionConfig, { channel: "douyin" }>) {
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
function wecomFields(draft: Extract<ConnectionConfig, { channel: "wecom" }>) {
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
) {
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
) {
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
function dingtalkFields(draft: DingtalkConnectionConfig) {
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
function feishuFields(draft: FeishuConnectionConfig) {
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
function qqFields(draft: QqConnectionConfig) {
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
function weiboFields(draft: WeiboConnectionConfig) {
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

export function ConnectionFields({
  draft,
  onEdit,
}: {
  draft: ConnectionConfig;
  onEdit: (key: string, value: string) => void;
}) {
  const fields =
    draft.channel === "douyin"
      ? douyinFields(draft)
      : draft.channel === "wechat-mp"
        ? wechatMpFields(draft)
        : draft.channel === "wechat-mini"
          ? wechatMiniFields(draft)
          : draft.channel === "feishu"
            ? feishuFields(draft)
            : draft.channel === "dingtalk"
              ? dingtalkFields(draft)
              : draft.channel === "qq"
                ? qqFields(draft)
                : draft.channel === "weibo"
                  ? weiboFields(draft)
                  : wecomFields(draft);
  const systemSelector =
    draft.channel === "douyin" ? (
      <Field className="col-span-full">
        <FieldLabel htmlFor="connection-system">推送体系</FieldLabel>
        <NativeSelect
          id="connection-system"
          className="w-full"
          autoComplete="off"
          value={draft.system}
          aria-describedby="connection-system-hint"
          onChange={(event) => onEdit("system", event.target.value)}
        >
          {DOUYIN_SYSTEMS.map((system) => (
            <NativeSelectOption key={system.value} value={system.value}>
              {system.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription id="connection-system-hint">
          抖音四套推送体系并行且验签完全不同：回调地址与凭证按体系配套填写。
        </FieldDescription>
      </Field>
    ) : draft.channel === "wecom" ? (
      <Field className="col-span-full">
        <FieldLabel htmlFor="connection-system">推送通道</FieldLabel>
        <NativeSelect
          id="connection-system"
          className="w-full"
          autoComplete="off"
          value={draft.system}
          aria-describedby="connection-system-hint"
          onChange={(event) => onEdit("system", event.target.value)}
        >
          {WECOM_SYSTEMS.map((system) => (
            <NativeSelectOption key={system.value} value={system.value}>
              {system.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription id="connection-system-hint">
          企微 XML 与机器人 JSON 两通道并行，加密 receiveid
          语义不同（应用=CorpID， 机器人=空串）：回调地址与凭证按通道配套填写。
        </FieldDescription>
      </Field>
    ) : draft.channel === "wechat-mp" ? (
      <Field className="col-span-full">
        <FieldLabel htmlFor="connection-system">消息加解密方式</FieldLabel>
        <NativeSelect
          id="connection-system"
          className="w-full"
          autoComplete="off"
          value={draft.mode}
          aria-describedby="connection-system-hint"
          onChange={(event) => onEdit("mode", event.target.value)}
        >
          {WECHAT_MP_MODES.map((mode) => (
            <NativeSelectOption key={mode.value} value={mode.value}>
              {mode.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription id="connection-system-hint">
          公众号仅 XML 推送，三模式直发形态不同：明文仅三参 signature，
          兼容/安全加 encrypt_type=aes +
          msg_signature（安全模式包体仅密文信封）。
        </FieldDescription>
      </Field>
    ) : draft.channel === "wechat-mini" ? (
      <>
        <Field className="col-span-full">
          <FieldLabel htmlFor="connection-system">消息加解密方式</FieldLabel>
          <NativeSelect
            id="connection-system"
            className="w-full"
            autoComplete="off"
            value={draft.mode}
            aria-describedby="connection-system-hint"
            onChange={(event) => onEdit("mode", event.target.value)}
          >
            {WECHAT_MINI_MODES.map((mode) => (
              <NativeSelectOption key={mode.value} value={mode.value}>
                {mode.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription id="connection-system-hint">
            小程序与公众号同族三模式：明文仅三参 signature，兼容/安全加
            encrypt_type=aes + msg_signature（安全模式包体仅密文信封）。
          </FieldDescription>
        </Field>
        <Field className="col-span-full">
          <FieldLabel htmlFor="connection-data-format">数据格式</FieldLabel>
          <NativeSelect
            id="connection-data-format"
            className="w-full"
            autoComplete="off"
            value={draft.dataFormat}
            aria-describedby="connection-data-format-hint"
            onChange={(event) => onEdit("dataFormat", event.target.value)}
          >
            {WECHAT_MINI_DATA_FORMATS.map((format) => (
              <NativeSelectOption key={format.value} value={format.value}>
                {format.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription id="connection-data-format-hint">
            官方控制台 XML/JSON 可选（与公众号不同点）；本工具推送报文取 XML
            为主，此处随连接记录目标侧控制台形态。
          </FieldDescription>
        </Field>
      </>
    ) : draft.channel === "dingtalk" ? (
      <Field className="col-span-full">
        <FieldLabel htmlFor="connection-system">推送通道</FieldLabel>
        <NativeSelect
          id="connection-system"
          className="w-full"
          autoComplete="off"
          value={draft.system}
          aria-describedby="connection-system-hint"
          onChange={(event) => onEdit("system", event.target.value)}
        >
          {DINGTALK_SYSTEMS.map((system) => (
            <NativeSelectOption key={system.value} value={system.value}>
              {system.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription id="connection-system-hint">
          钉钉密文事件回调与机器人收消息并行且验签完全不同（sha1 四参 + AES 信封
          / HmacSHA256 头）：回调地址与凭证按通道配套填写。
        </FieldDescription>
      </Field>
    ) : null;
  return (
    <FieldGroup className="grid grid-cols-1 gap-5 @xl/workspace:grid-cols-2">
      {systemSelector}
      {fields.map((field) => {
        const Control = field.secret ? SecretInput : Input;
        return (
          <Field
            key={`${draft.channel}-${field.key}`}
            className={cn(
              "min-w-0",
              field.key === "encodingAesKey" && "col-span-full",
            )}
          >
            <FieldLabel htmlFor={`connection-${field.key}`}>
              {field.label}
            </FieldLabel>
            <Control
              id={`connection-${field.key}`}
              autoComplete="off"
              spellCheck={false}
              value={field.value}
              aria-describedby={`connection-${field.key}-hint`}
              onChange={(event) => onEdit(field.key, event.target.value)}
            />
            <FieldDescription id={`connection-${field.key}-hint`}>
              {field.note}
            </FieldDescription>
          </Field>
        );
      })}
    </FieldGroup>
  );
}
