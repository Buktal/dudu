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
  DouyinSystem,
  WechatMiniDataFormat,
  WechatMiniMode,
  WechatMpMode,
  WecomSystem,
} from "../api";

/** 抖音推送体系（事实库 §2 四套并行体系，验签/信封完全不同） */
const DOUYIN_SYSTEMS: readonly { value: DouyinSystem; label: string }[] = [
  { value: "dop", label: "dop Webhooks（移动/网站应用）" },
  { value: "life_service", label: "生活服务 WebHooks" },
  { value: "mini_game", label: "小游戏消息推送" },
  { value: "isv", label: "服务商（第三方小程序）" },
];

/** 企微推送通道（事实库 §2.1/§2.2/§2.10：XML 自建应用与 JSON 智能机器人） */
const WECOM_SYSTEMS: readonly { value: WecomSystem; label: string }[] = [
  { value: "agent", label: "自建应用（XML 回调）" },
  { value: "aibot", label: "智能机器人（JSON 回调）" },
];

/** 公众号消息加解密方式（事实库 §4.1 三模式，官方服务器配置配套项） */
const WECHAT_MP_MODES: readonly { value: WechatMpMode; label: string }[] = [
  { value: "plain", label: "明文模式（官方默认）" },
  { value: "compatible", label: "兼容模式（调试过渡）" },
  { value: "secure", label: "安全模式（官方推荐）" },
];

/** 小程序消息加解密方式（事实库 §3.1 三选一：明文/兼容不建议、安全强烈推荐） */
const WECHAT_MINI_MODES: readonly { value: WechatMiniMode; label: string }[] = [
  { value: "plain", label: "明文模式" },
  { value: "compatible", label: "兼容模式" },
  { value: "secure", label: "安全模式（官方强烈推荐）" },
];

/** 小程序数据格式（事实库 §3.1：XML/JSON 可选，与公众号不同点） */
const WECHAT_MINI_DATA_FORMATS: readonly {
  value: WechatMiniDataFormat;
  label: string;
}[] = [
  { value: "xml", label: "XML（本工具推送主形态）" },
  { value: "json", label: "JSON" },
];

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
