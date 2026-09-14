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
import type { ConnectionConfig, DouyinSystem, WecomSystem } from "../api";

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

export function ConnectionFields({
  draft,
  onEdit,
}: {
  draft: ConnectionConfig;
  onEdit: (key: string, value: string) => void;
}) {
  const fields =
    draft.channel === "douyin" ? douyinFields(draft) : wecomFields(draft);
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
