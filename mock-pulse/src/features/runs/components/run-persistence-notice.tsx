import { useState } from "react";
import { StudioButton } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { retrySaveRun } from "../stores/runs-slice";

export function RunPersistenceNotice({ runId }: { runId?: string }) {
  const dispatch = useAppDispatch();
  const error = useAppSelector((root) =>
    runId ? root.runs.persistenceErrors?.[runId] : undefined,
  );
  const [saving, setSaving] = useState(false);
  if (!runId || !error) return null;
  return (
    <div className="info-line" role="alert">
      <StudioIcon name="info" />
      <span className="grow">运行已完成，记录尚未保存：{error}</span>
      <StudioButton
        small
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void dispatch(retrySaveRun(runId)).finally(() => setSaving(false));
        }}
      >
        {saving ? "正在保存…" : "重试保存"}
      </StudioButton>
    </div>
  );
}
