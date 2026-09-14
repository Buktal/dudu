import { FileTextIcon, SaveIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { errorMessage } from "@/lib/errors";

/** 保存成功后再执行切换；失败保留原草稿和待执行操作。 */
export function DraftGuard({
  dirty,
  name,
  onSave,
  onDiscard,
  children,
}: {
  dirty: boolean;
  name: string;
  onSave: () => Promise<unknown>;
  onDiscard: () => void;
  children: (request: (action: () => void) => void) => ReactNode;
}) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = (action: () => void) => {
    if (!dirty) return action();
    setError("");
    setPending(() => action);
  };
  const proceed = () => {
    pending?.();
    setPending(null);
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave();
      proceed();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {children(request)}
      <WorkspaceDialog
        open={pending !== null}
        title="这些修改还没有保存"
        description="保存后再继续，或放弃这份草稿的修改。"
        onClose={() => {
          if (!saving) setPending(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              继续编辑
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                onDiscard();
                proceed();
              }}
              variant="outline"
            >
              放弃修改并继续
            </Button>
            <Button
              variant="default"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <SaveIcon aria-hidden="true" data-icon="inline-start" />
              )}
              保存并继续
            </Button>
          </>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <FileTextIcon aria-hidden="true" className="size-4 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="font-medium wrap-anywhere">
              {name || "未命名草稿"}
            </h3>
            <p className="text-sm text-muted-foreground">
              保存后，可继续复用这份素材。
            </p>
          </div>
        </div>
        {error ? (
          <Notice role="alert" className="mb-4" variant="destructive">
            {error}
          </Notice>
        ) : null}
      </WorkspaceDialog>
    </>
  );
}
