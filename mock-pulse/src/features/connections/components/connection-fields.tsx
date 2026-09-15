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
import type { ConnectionConfig } from "../api";
import {
  DINGTALK_SYSTEMS,
  DOUYIN_SYSTEMS,
  WECHAT_MINI_DATA_FORMATS,
  WECHAT_MINI_MODES,
  WECHAT_MP_MODES,
  WECOM_SYSTEMS,
  XIAOHONGSHU_SYSTEMS,
} from "./connection-options";
import { credentialFieldsOf } from "./credential-fields";

/**
 * 连接表单的凭证字段区：字段构建器在 ./credential-fields（按渠道/通道拆分），
 * 本组件只负责推送通道选择器与控件渲染（secret 字段走掩码输入）。
 */

/** 抖音推送体系选择器（四套体系并行且验签完全不同） */
function DouyinSystemSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "douyin" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
  );
}

/** 企微推送通道选择器（XML 自建应用与 JSON 智能机器人，receiveid 语义不同） */
function WecomSystemSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "wecom" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
  );
}

/** 公众号消息加解密方式选择器（三模式直发形态不同） */
function WechatMpModeSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "wechat-mp" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
        兼容/安全加 encrypt_type=aes + msg_signature（安全模式包体仅密文信封）。
      </FieldDescription>
    </Field>
  );
}

/** 小程序消息加解密方式 + 数据格式选择器（与公众号同族，XML/JSON 可选） */
function WechatMiniModeSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "wechat-mini" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
  );
}

/** 钉钉推送通道选择器（密文事件回调与机器人收消息验签完全不同） */
function DingtalkSystemSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "dingtalk" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
        钉钉密文事件回调与机器人收消息并行且验签完全不同（sha1 四参 + AES 信封 /
        HmacSHA256 头）：回调地址与凭证按通道配套填写。
      </FieldDescription>
    </Field>
  );
}

/** 小红书推送通道选择器（小程序客服消息与电商 ark 双体系协议完全不同） */
function XiaohongshuSystemSelector({
  draft,
  onEdit,
}: {
  draft: Extract<ConnectionConfig, { channel: "xiaohongshu" }>;
  onEdit: (key: string, value: string) => void;
}) {
  return (
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
        {XIAOHONGSHU_SYSTEMS.map((system) => (
          <NativeSelectOption key={system.value} value={system.value}>
            {system.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription id="connection-system-hint">
        小红书双体系并行且协议完全不同（小程序客服消息 AES 加密信封回 success /
        电商 ark JSON 数组明文回 success+error_code）：回调地址与
        凭证按通道配套填写。
      </FieldDescription>
    </Field>
  );
}

export function ConnectionFields({
  draft,
  onEdit,
}: {
  draft: ConnectionConfig;
  onEdit: (key: string, value: string) => void;
}) {
  const fields = credentialFieldsOf(draft);
  const systemSelector =
    draft.channel === "douyin" ? (
      <DouyinSystemSelector draft={draft} onEdit={onEdit} />
    ) : draft.channel === "wecom" ? (
      <WecomSystemSelector draft={draft} onEdit={onEdit} />
    ) : draft.channel === "wechat-mp" ? (
      <WechatMpModeSelector draft={draft} onEdit={onEdit} />
    ) : draft.channel === "wechat-mini" ? (
      <WechatMiniModeSelector draft={draft} onEdit={onEdit} />
    ) : draft.channel === "dingtalk" ? (
      <DingtalkSystemSelector draft={draft} onEdit={onEdit} />
    ) : draft.channel === "xiaohongshu" ? (
      <XiaohongshuSystemSelector draft={draft} onEdit={onEdit} />
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
