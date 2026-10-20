import { useState } from "react";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { AccountDetail, ChannelDefinition } from "./api";
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
                    maxLength={field.control === "textarea" ? 16384 : 4096}
                    disabled={
                      disabled || immutable || clear.includes(field.key)
                    }
                    readOnly={immutable}
                    autoComplete="off"
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                    description={
                      immutable
                        ? "身份已固定，换账号请新建记录"
                        : detail && field.secret
                          ? `${configured ? "已配置" : "未配置"}；留空保持不变`
                          : undefined
                    }
                  />
                  {field.secret && field.control === "textarea" && (
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
    if (value && value.length > (field.control === "textarea" ? 16384 : 4096))
      return `${field.label}过长`;
  }
  if (
    definition.channel === "telegram" &&
    values.botToken &&
    !/^[0-9]+:[A-Za-z0-9_-]+$/.test(values.botToken)
  )
    return "Bot token 格式不正确，请使用平台提供的 token";
  if (
    definition.channel === "wechat-mini" &&
    values.encodingAesKey &&
    !values.appId?.trim() &&
    !detail?.fields.appId
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
