import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
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
    <Notice className="mb-4" role="alert">
      <InfoIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">运行已完成，记录尚未保存：{error}</span>
      <Button
        size="sm"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void dispatch(retrySaveRun(runId)).finally(() => setSaving(false));
        }}
        variant="outline"
      >
        {saving ? "正在保存…" : "重试保存"}
      </Button>
    </Notice>
  );
}
