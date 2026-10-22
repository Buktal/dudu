import { useId, useState } from "react";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type AccountDetail,
  type ChannelDefinition,
  CREDENTIAL_TEXT_MAX_LENGTH,
  CREDENTIAL_TEXTAREA_MAX_LENGTH,
  TELEGRAM_BOT_TOKEN_PATTERN,
  WECHAT_MINI_APP_ID_FIELD,
} from "./api";
export function CredentialFields({
  definition,
  detail,
  values,
  clear,
  setValues,
  setClear,
  disabled,
}: {
  definition: ChannelDefinition;
  detail?: AccountDetail;
  values: Record<string, string>;
  clear: string[];
  setValues: (v: Record<string, string>) => void;
  setClear: (v: string[]) => void;
  disabled: boolean;
}) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const inputPrefix = useId();
  const supportsMask =
    typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc");
  return (
    <>
      {[false, true].map((send) => (
        <FieldGroup key={String(send)} className="gap-4">
          <h3 className="font-medium">{send ? "发送配置" : "回调配置"}</h3>
          {definition.fields
            .filter((f) =>
              send ? !f.requiredForReceive : f.requiredForReceive,
            )
            .map((field) => {
              const configured = field.secret
                ? detail?.configuredSecretFields.includes(field.key)
                : !!detail?.fields[field.key];
              const immutable =
                !!detail && field.immutableOnceConfigured && configured;
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  {field.secret && field.control === "textarea" ? (
                    <Field
                      data-disabled={
                        disabled || immutable || clear.includes(field.key)
                      }
                    >
                      <FieldLabel htmlFor={`${inputPrefix}-${field.key}`}>
                        {field.label}
                        {field.requiredForReceive
                          ? " · 接收必需"
                          : field.requiredForSend
                            ? " · 发送所需"
                            : " · 可选"}
                      </FieldLabel>
                      <Textarea
                        id={`${inputPrefix}-${field.key}`}
                        aria-describedby={`${inputPrefix}-${field.key}-help`}
                        value={values[field.key] ?? ""}
                        onChange={(event) =>
                          setValues({
                            ...values,
                            [field.key]: event.target.value,
                          })
                        }
                        maxLength={CREDENTIAL_TEXTAREA_MAX_LENGTH}
                        disabled={
                          disabled || immutable || clear.includes(field.key)
                        }
                        readOnly={!!immutable}
                        autoComplete="off"
                        spellCheck={false}
                        rows={4}
                        className={cn(
                          supportsMask &&
                            !revealed.includes(field.key) &&
                            "[-webkit-text-security:disc]",
                        )}
                      />
                      <FieldDescription id={`${inputPrefix}-${field.key}-help`}>
                        {detail
                          ? `${configured ? "已配置" : "未配置"}；留空保持不变。`
                          : "粘贴完整多行 PEM 私钥。"}
                        {!supportsMask &&
                          "当前浏览器不支持多行文本遮盖，私钥将以明文显示。"}
                      </FieldDescription>
                    </Field>
                  ) : (
                    <TextField
                      label={`${field.label}${field.requiredForReceive ? " · 接收必需" : field.requiredForSend ? " · 发送所需" : " · 可选"}`}
                      type={
                        field.secret && !revealed.includes(field.key)
                          ? "password"
                          : "text"
                      }
                      multiline={
                        field.control === "textarea" &&
                        (!field.secret || revealed.includes(field.key))
                      }
                      value={values[field.key] ?? ""}
                      maxLength={
                        field.control === "textarea"
                          ? CREDENTIAL_TEXTAREA_MAX_LENGTH
                          : CREDENTIAL_TEXT_MAX_LENGTH
                      }
                      disabled={
                        disabled || immutable || clear.includes(field.key)
                      }
                      readOnly={immutable}
                      autoComplete="off"
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.key]: event.target.value,
                        })
                      }
                      description={
                        immutable
                          ? "身份已固定，换账号请新建记录"
                          : detail && field.secret
                            ? `${configured ? "已配置" : "未配置"}；留空保持不变`
                            : undefined
                      }
                    />
                  )}
                  {field.secret &&
                    field.control === "textarea" &&
                    supportsMask && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          setRevealed(
                            revealed.includes(field.key)
                              ? revealed.filter((k) => k !== field.key)
                              : [...revealed, field.key],
                          )
                        }
                      >
                        {revealed.includes(field.key) ? "遮盖私钥" : "展开私钥"}
                      </Button>
                    )}
                  {detail && configured && !immutable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || field.requiredForReceive}
                      onClick={() => {
                        setValues({ ...values, [field.key]: "" });
                        setClear(
                          clear.includes(field.key)
                            ? clear.filter((k) => k !== field.key)
                            : [...clear, field.key],
                        );
                      }}
                    >
                      {clear.includes(field.key) ? "撤销清除" : "清除"}{" "}
                      {field.label}
                    </Button>
                  )}
                </div>
              );
            })}
        </FieldGroup>
      ))}
    </>
  );
}
export function credentialError(
  definition: ChannelDefinition,
  values: Record<string, string>,
  detail?: AccountDetail,
) {
  for (const field of definition.fields) {
    const value = values[field.key];
    const existed = field.secret
      ? detail?.configuredSecretFields.includes(field.key)
      : !!detail?.fields[field.key];
    if (field.requiredForReceive && !value?.trim() && !existed)
      return `请填写${field.label}`;
    if (value !== undefined && value !== "" && !value.trim())
      return `${field.label}不能全为空白`;
    if (
      value &&
      value.length >
        (field.control === "textarea"
          ? CREDENTIAL_TEXTAREA_MAX_LENGTH
          : CREDENTIAL_TEXT_MAX_LENGTH)
    )
      return `${field.label}过长`;
  }
  if (
    definition.channel === "telegram" &&
    values.botToken &&
    !TELEGRAM_BOT_TOKEN_PATTERN.test(values.botToken)
  )
    return "Bot token 格式不正确，请使用平台提供的 token";
  if (
    definition.channel === "wechat-mini" &&
    values.encodingAesKey &&
    !values[WECHAT_MINI_APP_ID_FIELD]?.trim() &&
    !detail?.fields[WECHAT_MINI_APP_ID_FIELD]
  )
    return "密文回调需要 appId";
  return null;
}
export function editableValues(
  definition: ChannelDefinition,
  values: Record<string, string>,
  detail?: AccountDetail,
) {
  const result: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = values[field.key];
    if (value === undefined || value === "") continue;
    if (detail && field.immutableOnceConfigured && detail.fields[field.key])
      continue;
    const next =
      field.secret || field.control === "textarea" ? value : value.trim();
    if (!detail || field.secret || next !== detail.fields[field.key])
      result[field.key] = next;
  }
  return result;
}
