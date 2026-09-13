import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { StudioButton, StudioDialog } from "./studio-controls";
import { StudioIcon } from "./studio-icon";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function SaveAsDialog({
  label,
  name,
  onSave,
  onClose,
}: {
  label: string;
  name: string;
  onSave: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [nextName, setNextName] = useState(`${name} · 副本`);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!nextName.trim()) {
      setError("请填写新名称。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(nextName.trim());
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <StudioDialog
      open
      title={`另存${label}`}
      description="建立独立素材，原来的版本和引用保持不变。"
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <StudioButton disabled={saving} onClick={onClose}>
            取消
          </StudioButton>
          <StudioButton
            tone="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            <StudioIcon name="save" />
            保存副本
          </StudioButton>
        </>
      }
    >
      <FieldGroup className="modal-fields">
        <Field>
          <FieldLabel htmlFor="copy-name">新名称</FieldLabel>
          <Input
            id="copy-name"
            autoFocus
            maxLength={80}
            value={nextName}
            onChange={(event) => setNextName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
        </Field>
      </FieldGroup>
      {error ? (
        <p role="alert" className="modal-inline-error">
          {error}
        </p>
      ) : null}
    </StudioDialog>
  );
}

export function DeleteEntityDialog({
  label,
  name,
  onDelete,
  onClose,
}: {
  label: string;
  name: string;
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  return (
    <StudioDialog
      open
      title={`删除${label}`}
      description={`删除「${name}」后，无法撤销。被其他素材引用时会保留。`}
      onClose={() => {
        if (!deleting) onClose();
      }}
      footer={
        <>
          <StudioButton disabled={deleting} onClick={onClose}>
            取消
          </StudioButton>
          <StudioButton
            tone="danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              setError("");
              try {
                await onDelete();
                onClose();
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setDeleting(false);
              }
            }}
          >
            确认删除
          </StudioButton>
        </>
      }
    >
      <p>此操作只删除这份{label}，已经生成的运行记录会保留。</p>
      {error ? (
        <p role="alert" className="modal-inline-error">
          {error}
        </p>
      ) : null}
    </StudioDialog>
  );
}
