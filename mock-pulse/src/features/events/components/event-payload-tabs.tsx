import { CheckIcon } from "lucide-react";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import type { ExpectedReceipt, ReceiptBodyMode } from "../model";
import { parseWireDraft, wireDraftText } from "../payload";
import { RECEIPT_BODY_MODES } from "../receipt";
import type { EventSchema } from "../schemas";

export function EventRawEditor({
  schema,
  raw,
  onChange,
  onApply,
  onError,
}: {
  schema: EventSchema;
  raw: string;
  onChange: (raw: string) => void;
  onApply: () => void;
  onError: (message: string) => void;
}) {
  return (
    <FieldGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {schema.wire === "xml" ? "加密前的 XML" : "平台原始 JSON"}
        </Badge>
        <span className="min-w-0 flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              onChange(wireDraftText(schema, parseWireDraft(schema, raw)));
              onError("");
            } catch (cause) {
              onError(errorMessage(cause));
            }
          }}
        >
          格式化
        </Button>
        <Button size="sm" variant="secondary" onClick={onApply}>
          <CheckIcon data-icon="inline-start" />
          应用到字段
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor="raw-payload" className="sr-only">
          完整{schema.wire.toUpperCase()}报文
        </FieldLabel>
        <div className="font-mono">
          <Textarea
            id="raw-payload"
            className="min-h-80 resize-y"
            aria-describedby="raw-payload-hint"
            spellCheck={false}
            value={raw}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <FieldDescription id="raw-payload-hint">
          字段编辑与完整报文共享同一份参数。新增字段会保留，已有说明的字段自动显示中文含义。
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

export function EventExpectedFields({
  expected,
  onChange,
}: {
  expected: ExpectedReceipt;
  onChange: (value: Partial<ExpectedReceipt>) => void;
}) {
  return (
    <FieldGroup>
      <Notice>
        发送时，将回执与这里的期望对照。空白响应正文表示只检查 HTTP 状态。
      </Notice>
      <FieldGroup className="grid grid-cols-1 @xl/workspace:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="expected-status">期望 HTTP 状态</FieldLabel>
          <Input
            id="expected-status"
            type="number"
            min={100}
            max={599}
            value={expected.status}
            onChange={(event) =>
              onChange({ status: Number(event.target.value) })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="expected-mode">正文比对方式</FieldLabel>
          <NativeSelect
            className="w-full"
            id="expected-mode"
            aria-describedby="expected-mode-hint"
            value={expected.bodyMode}
            onChange={(event) =>
              onChange({ bodyMode: event.target.value as ReceiptBodyMode })
            }
          >
            {RECEIPT_BODY_MODES.map((mode) => (
              <NativeSelectOption key={mode.id} value={mode.id}>
                {mode.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription id="expected-mode-hint">
            {
              RECEIPT_BODY_MODES.find((mode) => mode.id === expected.bodyMode)
                ?.hint
            }
          </FieldDescription>
        </Field>
        <Field className="col-span-full">
          <FieldLabel htmlFor="expected-body">期望响应正文</FieldLabel>
          <Textarea
            id="expected-body"
            rows={4}
            placeholder="留空时不校验正文"
            aria-describedby="expected-body-hint"
            value={expected.body}
            onChange={(event) => onChange({ body: event.target.value })}
          />
          <FieldDescription id="expected-body-hint">
            留空时只检查 HTTP 状态。
          </FieldDescription>
        </Field>
      </FieldGroup>
    </FieldGroup>
  );
}
