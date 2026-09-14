import { SecretInput } from "@/components/secret-input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConnectionConfig } from "../api";

export function ConnectionFields({
  draft,
  onEdit,
}: {
  draft: ConnectionConfig;
  onEdit: (key: string, value: string) => void;
}) {
  const fields =
    draft.channel === "douyin"
      ? [
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
        ]
      : [
          {
            key: "corpId",
            label: "CorpID",
            note: "参与消息加解密的企业标识。",
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
  return (
    <FieldGroup className="grid grid-cols-1 gap-5 @xl/workspace:grid-cols-2">
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
