import { type ReactNode, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { StudioButton, StudioDialog } from "./studio-controls";
import { StudioIcon } from "./studio-icon";

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
      <StudioDialog
        open={pending !== null}
        title="这些修改还没有保存"
        description="保存后再继续，或放弃这份草稿的修改。"
        onClose={() => {
          if (!saving) setPending(null);
        }}
        footer={
          <>
            <StudioButton
              tone="quiet"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              继续编辑
            </StudioButton>
            <StudioButton
              disabled={saving}
              onClick={() => {
                onDiscard();
                proceed();
              }}
            >
              放弃修改并继续
            </StudioButton>
            <StudioButton
              tone="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              <StudioIcon
                name={saving ? "refresh" : "save"}
                className={saving ? "spin" : undefined}
              />
              保存并继续
            </StudioButton>
          </>
        }
      >
        <div className="builder-intro">
          <StudioIcon name="event" />
          <div>
            <h3>{name || "未命名草稿"}</h3>
            <p>已保存的剧本只会选择素材库中的版本。</p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="modal-inline-error">
            {error}
          </p>
        ) : null}
      </StudioDialog>
    </>
  );
}
