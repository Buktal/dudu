import { useId } from "react";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { languages } from "./api";
import { useTranslation } from "./provider";

export function TranslationSettings() {
  const translation = useTranslation();
  const languageId = useId();
  if (!translation) return null;
  const { preference, save, pending, error } = translation;
  return (
    <FieldSet className="gap-4">
      <FieldLegend variant="label">消息翻译</FieldLegend>
      <Field className="gap-2">
        <ToggleGroup
          aria-label="自动翻译"
          value={[preference.automatic ? "on" : "off"]}
          disabled={pending}
          onValueChange={(values) => {
            if (values[0])
              void save({ ...preference, automatic: values[0] === "on" });
          }}
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="off">手动点击翻译</ToggleGroupItem>
          <ToggleGroupItem value="on">自动翻译</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          原文与译文同时显示，自动翻译仅在打开的会话中生效。
        </FieldDescription>
      </Field>
      <Field className="gap-2">
        <FieldLabel htmlFor={languageId}>阅读语言</FieldLabel>
        <Select
          value={preference.targetLanguage}
          disabled={pending}
          onValueChange={(value) => {
            if (value) void save({ ...preference, targetLanguage: value });
          }}
          items={languages.map(([value, label]) => ({ value, label }))}
        >
          <SelectTrigger
            id={languageId}
            aria-label="翻译目标语言"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {languages.map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>偏好随当前坐席账户保存。</FieldDescription>
      </Field>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </FieldSet>
  );
}
