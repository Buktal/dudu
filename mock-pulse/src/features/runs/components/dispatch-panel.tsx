import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Plug,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Button } from "@/components/ui/button";
import { channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import { setView } from "@/stores/app-slice";
import { receiptStatusText } from "../model";
import {
  directDispatch,
  selectLastDispatch,
  selectPanelMessage,
  selectPanelPhase,
} from "../stores/runs-slice";
import { RunStepDetail } from "./run-step-detail";

/**
 * 回执面板：编辑区底部状态条（默认收起，点击展开详情）。
 * 显示最近一次直发的 HTTP 状态、耗时、原始回执与比对结论；
 * 未配置连接时给出「前往平台连接」指引。
 */
export function DispatchPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const phase = useSelector((state: RootState) => selectPanelPhase(state.runs));
  const message = useSelector((state: RootState) =>
    selectPanelMessage(state.runs),
  );
  const result = useSelector((state: RootState) =>
    selectLastDispatch(state.runs),
  );
  const [expanded, setExpanded] = useState(false);

  const step = result?.step;
  const channel = step ? channelById(step.channel) : undefined;

  return (
    <>
      {expanded && step ? (
        <div className="max-h-64 flex-none overflow-y-auto border-t border-border bg-muted/20 px-6 py-4">
          <RunStepDetail step={step} />
        </div>
      ) : null}
      <footer
        role="status"
        className="flex min-h-11 flex-none flex-wrap items-center gap-2.5 border-t border-border bg-muted/30 px-6 py-2.5 text-[10px]"
      >
        {phase === "sending" ? (
          <>
            <Loader2
              className="size-3.5 animate-spin text-primary"
              aria-hidden
            />
            <span className="text-primary">正在发送…</span>
            <span className="grow" />
          </>
        ) : phase === "needConnection" ? (
          <>
            <Plug className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="font-medium text-foreground">
              尚未配置抖音连接
            </span>
            <span className="text-muted-foreground">
              直发需要目标地址与签名密钥，先到平台连接完成配置。
            </span>
            <span className="grow" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch(setView("connections"))}
            >
              <Plug className="size-3.5" aria-hidden />
              前往平台连接
            </Button>
          </>
        ) : phase === "error" ? (
          <>
            <XCircle className="size-3.5 text-destructive" aria-hidden />
            <span className="font-medium text-destructive">发送失败</span>
            <span className="truncate text-muted-foreground">{message}</span>
            <span className="grow" />
          </>
        ) : phase === "done" && step ? (
          <>
            {step.verdict.passed ? (
              <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            ) : (
              <XCircle className="size-3.5 text-destructive" aria-hidden />
            )}
            <span
              className={cn(
                "font-mono font-medium",
                step.verdict.passed ? "text-success" : "text-destructive",
              )}
            >
              {receiptStatusText(step.receipt)}
            </span>
            <span
              className={cn(
                step.verdict.passed ? "text-success" : "text-destructive",
              )}
            >
              {step.verdict.passed ? "符合期望" : "与期望不符"}
            </span>
            <span className="font-mono text-muted-foreground">
              {step.receipt.elapsedMs} ms
            </span>
            {channel ? (
              <span className="text-muted-foreground/80">
                {channel.name} · {step.eventName}
              </span>
            ) : null}
            <span className="grow" />
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="size-3.5" aria-hidden />
              ) : (
                <ChevronUp className="size-3.5" aria-hidden />
              )}
              {expanded ? "收起回执" : "查看回执"}
            </Button>
          </>
        ) : (
          <>
            <History className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">
              尚未发送 · 直发把当前草稿原样发到目标服务，无需先保存
            </span>
            <span className="grow" />
          </>
        )}
        {phase !== "done" && phase !== "sending" ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={phase === "sending"}
            onClick={() => void dispatch(directDispatch())}
          >
            再发一次
          </Button>
        )}
      </footer>
    </>
  );
}
