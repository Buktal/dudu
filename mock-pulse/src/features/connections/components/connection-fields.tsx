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
  type ChannelSelectorDef,
  type ConnectionFieldKey,
  channelTraits,
} from "../channel-traits";

/**
 * 连接表单的凭证字段区：字段定义与通道/模式选择器定义均查 channel-traits
 * 渠道描述表（行内 selectors + credentialFields），本组件只负责控件渲染
 * （secret 字段走掩码输入），不再写渠道级联。
 */

/** 通道/模式选择器（表驱动：定义来自 trait 行的 selectors） */
function ChannelSelectorField({
  selector,
  value,
  onEdit,
}: {
  selector: ChannelSelectorDef;
  value: string;
  onEdit: (key: ConnectionFieldKey, value: string) => void;
}) {
  const id =
    selector.key === "dataFormat"
      ? "connection-data-format"
      : "connection-system";
  const hintId =
    selector.key === "dataFormat"
      ? "connection-data-format-hint"
      : "connection-system-hint";
  return (
    <Field className="col-span-full">
      <FieldLabel htmlFor={id}>{selector.label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full"
        autoComplete="off"
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onEdit(selector.key, event.target.value)}
      >
        {selector.options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription id={hintId}>{selector.hint}</FieldDescription>
    </Field>
  );
}

export function ConnectionFields({
  draft,
  onEdit,
}: {
  draft: ConnectionConfig;
  onEdit: (key: ConnectionFieldKey, value: string) => void;
}) {
  const trait = channelTraits(draft.channel);
  const fields = trait.credentialFields(draft);
  const record = draft as unknown as Record<ConnectionFieldKey, string>;
  return (
    <FieldGroup className="grid grid-cols-1 gap-5 @xl/workspace:grid-cols-2">
      {trait.selectors.map((selector) => (
        <ChannelSelectorField
          key={`${draft.channel}-${selector.key}`}
          selector={selector}
          value={record[selector.key] ?? ""}
          onEdit={onEdit}
        />
      ))}
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
