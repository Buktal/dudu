import { SaveIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { Notice } from "@/components/notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { errorMessage } from "@/lib/errors";

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
  const nameId = useId();
  const [nextName, setNextName] = useState(`${name} · 副本`);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    if (!nextName.trim()) {
      setInvalid(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(nextName.trim());
      toast.add({ title: `${label}副本已保存`, type: "success" });
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <WorkspaceDialog
      open
      title={`另存${label}`}
      description="保存为独立素材，保留原素材的版本和引用。"
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button disabled={saving} onClick={onClose} variant="outline">
            取消
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {saving ? "正在保存…" : "保存副本"}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={nameId}>新名称</FieldLabel>
          <Input
            id={nameId}
            autoFocus
            maxLength={80}
            value={nextName}
            disabled={saving}
            aria-invalid={invalid}
            onChange={(event) => {
              setNextName(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void save();
              }
            }}
          />
          {invalid ? <FieldError>请填写新名称。</FieldError> : null}
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
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除{label}？</AlertDialogTitle>
          <AlertDialogDescription>
            「{name}
            」删除后无法恢复。被其他素材引用时会阻止删除，已有运行记录会保留。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Notice role="alert" variant="destructive">
            {error}
          </Notice>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>保留{label}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={async () => {
              if (deleting) return;
              setDeleting(true);
              setError("");
              try {
                await onDelete();
                toast.add({ title: `${label}已删除`, type: "success" });
                onClose();
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2Icon data-icon="inline-start" />
            )}
            {deleting ? "正在删除…" : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
