import { useState } from "react";
import { StudioButton } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
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
        <div className="receipt-detail">
          <RunStepDetail step={result.step} />
        </div>
      ) : null}
      <footer className="receipt-bar">
        {state.phase === "sending" &&
        state.directLive?.eventId === draft?.id ? (
          <>
            <StudioIcon name="refresh" className="spin" />
            <span className="blue">
              {state.stoppingRunId
                ? "正在停止，等待当前请求结束…"
                : "正在发送…"}
            </span>
            <span className="grow" />
          </>
        ) : state.phase === "needConnection" ? (
          <>
            <StudioIcon name="info" />
            <span>请先配置该平台的回调地址和凭据</span>
            <span className="grow" />
            <StudioButton
              small
              tone="quiet"
              onClick={() => {
                if (draft) dispatch(setConnectionChannel(draft.channelId));
                dispatch(setView("connections"));
              }}
            >
              前往平台连接
            </StudioButton>
          </>
        ) : state.phase === "error" ? (
          <>
            <StudioIcon name="info" />
            <span role="alert" className="red">
              {state.message}
            </span>
          </>
        ) : result ? (
          <>
            <StudioIcon name={result.step.verdict.passed ? "check" : "info"} />
            <span className={result.step.verdict.passed ? "green" : "red"}>
              {result.step.receipt.status
                ? `HTTP ${result.step.receipt.status}`
                : "未收到响应"}
            </span>
            <span className="muted">
              {result.step.verdict.passed ? "符合期望" : "与期望不符"}
            </span>
            <span className="mono muted">
              {result.step.receipt.elapsedMs} ms
            </span>
            <span className="grow" />
            <button
              type="button"
              className="text-btn"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起" : "查看回执"}
              <StudioIcon name={expanded ? "down" : "up"} />
            </button>
          </>
        ) : (
          <>
            <StudioIcon name="history" />
            <span className="muted">尚未发送</span>
            <span className="grow" />
            <span className="muted">保存后可在平台剧本中选择</span>
          </>
        )}
      </footer>
    </>
  );
}
