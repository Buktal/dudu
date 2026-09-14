import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { EditorField } from "../definitions/resolve";

function FieldPath({ path }: { path: string }) {
  let prefix = "";
  return path.split(".").map((part) => {
    prefix = prefix ? `${prefix}.${part}` : part;
    return (
      <Fragment key={prefix}>
        {part}
        {prefix.length < path.length ? (
          <>
            .<wbr />
          </>
        ) : null}
      </Fragment>
    );
  });
}

export function EventFieldInput({
  field,
  input,
  onChange,
  onDescribe,
}: {
  field: EditorField;
  input?: { text: string; error?: string };
  onChange: (text: string) => void;
  onDescribe: () => void;
}) {
  const control = {
    id: `field-${field.path}`,
    "aria-describedby": `desc-${field.path}${input?.error ? ` error-${field.path}` : ""}`,
    "aria-invalid": !!input?.error,
    value:
      input?.text ??
      (field.type === "json"
        ? (JSON.stringify(field.value, null, 2) ?? "")
        : String(field.value ?? "")),
    onChange: (event: { target: { value: string } }) =>
      onChange(event.target.value),
  };
  return (
    <Field
      className="grid grid-cols-1 items-start gap-3 @lg/workspace:grid-cols-[9rem_minmax(0,1fr)] @5xl/workspace:grid-cols-[11rem_minmax(0,1fr)]"
      data-invalid={!!input?.error}
    >
      <FieldLabel htmlFor={control.id} className="flex-col items-start gap-1">
        <span>
          {field.title}
          {field.required ? (
            <>
              <span className="ml-1 text-primary" aria-hidden="true">
                *
              </span>
              <span className="sr-only">（必填）</span>
            </>
          ) : null}
        </span>
        <span
          className="font-mono text-xs leading-relaxed text-muted-foreground wrap-anywhere"
          title={field.path}
        >
          <FieldPath path={field.path} />
        </span>
      </FieldLabel>
      <div className="flex min-w-0 flex-col gap-2">
        {field.type === "boolean" ? (
          <NativeSelect {...control} className="w-full">
            <NativeSelectOption value="true">true</NativeSelectOption>
            <NativeSelectOption value="false">false</NativeSelectOption>
          </NativeSelect>
        ) : field.multiline || field.type === "json" ? (
          <Textarea {...control} rows={field.multiline ? 3 : 4} />
        ) : (
          <Input
            {...control}
            type={field.type === "number" ? "number" : "text"}
            step={field.type === "number" ? "any" : undefined}
            spellCheck={false}
          />
        )}
        {input?.error ? (
          <FieldError id={`error-${field.path}`}>{input.error}</FieldError>
        ) : null}
        <FieldDescription id={`desc-${field.path}`}>
          {field.description}
        </FieldDescription>
        {field.unknown ? (
          <Button
            size="sm"
            variant="link"
            className="self-start"
            onClick={onDescribe}
          >
            补充说明
          </Button>
        ) : null}
      </div>
    </Field>
  );
}
