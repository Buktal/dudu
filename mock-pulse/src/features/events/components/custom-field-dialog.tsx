import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { errorMessage } from "@/lib/errors";
import { withCustomField } from "../payload";
import type { EventSchema, WirePayload } from "../schemas";

export function CustomFieldDialog({
  schema,
  payload,
  onAdd,
  onClose,
}: {
  schema: EventSchema;
  payload: WirePayload;
  onAdd: (payload: WirePayload) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("string");
  const [error, setError] = useState("");
  const add = () => {
    try {
      onAdd(
        withCustomField(
          schema,
          payload,
          path,
          type === "string" ? value : JSON.parse(value),
        ),
      );
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <WorkspaceDialog
      open
      title="添加自定义参数"
      description="新增字段会保留在完整报文中，也可以补充字段说明。"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={add}>
            <PlusIcon data-icon="inline-start" />
            添加参数
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="custom-path">字段路径</FieldLabel>
          <Input
            id="custom-path"
            autoFocus
            placeholder={
              schema.wire === "xml"
                ? "例如：Extra"
                : schema.wire === "form"
                  ? "例如：extended_field"
                  : "例如：content.extra"
            }
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>值类型</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={[type]}
            aria-label="参数值类型"
            onValueChange={(values) => {
              if (values[0]) setType(values[0]);
            }}
          >
            <ToggleGroupItem value="string" className="flex-1">
              文本
            </ToggleGroupItem>
            <ToggleGroupItem value="json" className="flex-1">
              JSON 值
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-value">参数值</FieldLabel>
          <Textarea
            id="custom-value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {type === "json" ? (
            <FieldDescription>
              支持数字、布尔值、数组或对象，例如 true、42 或 [1, 2]。
            </FieldDescription>
          ) : null}
        </Field>
        {error ? (
          <Notice role="alert" variant="destructive">
            {error}
          </Notice>
        ) : null}
      </FieldGroup>
    </WorkspaceDialog>
  );
}
