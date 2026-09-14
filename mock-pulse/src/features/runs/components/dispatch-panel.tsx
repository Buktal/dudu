import { useState } from "react";
import { StudioIcon } from "@/components/studio-icon";
import { Button } from "@/components/ui/button";
import { setConnectionChannel } from "@/features/connections";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { setView } from "@/stores/app-slice";
import { RunPersistenceNotice } from "./run-persistence-notice";
import { RunStepDetail } from "./run-step-detail";

export function DispatchPanel() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.runs);
  const draft = useAppSelector((root) => root.events.draft);
  const [expanded, setExpanded] = useState(false);
  const result = state.result?.eventId === draft?.id ? state.result : null;
  return (
    <>
      <RunPersistenceNotice runId={result?.runId} />
      {expanded && result ? (
        <div className="max-h-64 shrink-0 overflow-y-auto border-t p-4 lg:px-6">
          <RunStepDetail step={result.step} />
        </div>
      ) : null}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground lg:px-6">
        {state.phase === "sending" &&
        state.directLive?.eventId === draft?.id ? (
          <>
            <StudioIcon name="refresh" className="motion-safe:animate-spin" />
            <span className="text-primary">
              {state.stoppingRunId
                ? "正在停止，等待当前请求结束…"
                : "正在发送…"}
            </span>
            <span className="min-w-0 flex-1" />
          </>
        ) : state.phase === "needConnection" ? (
          <>
            <StudioIcon name="info" />
            <span>请先配置该平台的回调地址和凭据</span>
            <span className="min-w-0 flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (draft) dispatch(setConnectionChannel(draft.channelId));
                dispatch(setView("connections"));
              }}
            >
              前往平台连接
            </Button>
          </>
        ) : state.phase === "error" ? (
          <>
            <StudioIcon name="info" />
            <span role="alert" className="text-destructive">
              {state.message}
            </span>
          </>
        ) : result ? (
          <>
            <StudioIcon name={result.step.verdict.passed ? "check" : "info"} />
            <span
              className={
                result.step.verdict.passed ? "text-success" : "text-destructive"
              }
            >
              {result.step.receipt.status
                ? `HTTP ${result.step.receipt.status}`
                : "未收到响应"}
            </span>
            <span className="text-muted-foreground">
              {result.step.verdict.passed ? "符合期望" : "与期望不符"}
            </span>
            <span className="font-mono text-muted-foreground">
              {result.step.receipt.elapsedMs} ms
            </span>
            <span className="min-w-0 flex-1" />
            <Button
              type="button"
              className="h-auto p-0 "
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              variant="link"
            >
              {expanded ? "收起" : "查看回执"}
              <StudioIcon name={expanded ? "down" : "up"} />
            </Button>
          </>
        ) : (
          <>
            <StudioIcon name="history" />
            <span className="text-muted-foreground">尚未发送</span>
            <span className="min-w-0 flex-1" />
            <span className="text-muted-foreground">
              保存后可在平台剧本中选择
            </span>
          </>
        )}
      </footer>
    </>
  );
}
