import {
  CheckCircle2Icon,
  ChevronDownIcon,
  HistoryIcon,
  InfoIcon,
  RadioIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { setConnectionChannel } from "@/features/connections";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import { setView } from "@/stores/app-slice";
import { selectRun } from "../stores/runs-slice";
import { RunPersistenceNotice } from "./run-persistence-notice";
import { RunStepDetail } from "./run-step-detail";

export function DispatchPanel() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.runs);
  const draft = useAppSelector((root) => root.events.draft);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(false);
  const result = state.result?.eventId === draft?.id ? state.result : null;
  const sending =
    state.phase === "sending" && state.directLive?.eventId === draft?.id;
  const configure = () => {
    if (draft) dispatch(setConnectionChannel(draft.channelId));
    dispatch(setView("connections"));
  };
  return (
    <div className="shrink-0 border-t bg-card">
      <RunPersistenceNotice runId={result?.runId} />
      <Collapsible
        open={expanded && !!result && !sending}
        onOpenChange={setExpanded}
      >
        <footer className="flex min-h-14 flex-wrap items-center gap-2 px-5 py-3 text-xs text-muted-foreground lg:px-7">
          {sending ? (
            <div className="flex items-center gap-2" role="status">
              <Spinner aria-label="正在发送" />
              {state.stoppingRunId
                ? "正在停止，等待当前请求结束…"
                : "正在发送，等待目标服务响应…"}
            </div>
          ) : state.phase === "needConnection" ? (
            <>
              <InfoIcon className="size-4" />
              <span>先配置该平台的回调地址和凭据，再直发</span>
              <Button
                variant="link"
                size="sm"
                className="ml-auto"
                onClick={configure}
              >
                前往平台连接
              </Button>
            </>
          ) : state.phase === "error" ? (
            <div
              role="alert"
              className="flex min-w-0 items-center gap-2 text-destructive"
            >
              <XCircleIcon className="size-4 shrink-0" />
              <span className="wrap-anywhere">{state.message}</span>
            </div>
          ) : result ? (
            <>
              {result.step.verdict.passed ? (
                <CheckCircle2Icon className="size-4 text-success" />
              ) : (
                <XCircleIcon className="size-4 text-destructive" />
              )}
              <Badge
                variant={
                  result.step.verdict.passed ? "secondary" : "destructive"
                }
              >
                {result.step.receipt.status
                  ? `HTTP ${result.step.receipt.status}`
                  : "未收到响应"}
              </Badge>
              <span>
                {result.step.verdict.passed ? "符合期望" : "与期望不符"}
              </span>
              <span className="font-mono tabular-nums">
                {result.step.receipt.elapsedMs} ms
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                aria-label="打开本次运行记录"
                onClick={() => {
                  dispatch(selectRun(result.runId));
                  dispatch(setView("runs"));
                }}
              >
                <HistoryIcon data-icon="inline-start" />
                <span className="hidden sm:inline">记录</span>
              </Button>
              <CollapsibleTrigger
                render={<Button variant="outline" size="sm" />}
              >
                {expanded ? "收起回执" : "查看回执"}
                <ChevronDownIcon
                  data-icon="inline-end"
                  className={cn(
                    "transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
            </>
          ) : (
            <>
              <RadioIcon className="size-4" />
              <span>等待发送</span>
              <span className="ml-auto hidden sm:inline">
                发送当前参数，结果会自动留存
              </span>
            </>
          )}
        </footer>
        <CollapsibleContent>
          {result ? (
            <div className="flex max-h-[min(32dvh,18rem)] flex-col gap-3 overflow-y-auto border-t p-4 lg:px-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {result.step.verdict.reason}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setDetail(true)}
                >
                  查看完整快照
                </Button>
              </div>
              <CodeBlock
                title="响应正文"
                value={result.step.receipt.body || "（空响应正文）"}
              />
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      {detail && result ? (
        <WorkspaceDialog
          open
          wide
          title={result.step.eventName}
          description="本次发送的参数和回执快照。"
          onClose={() => setDetail(false)}
        >
          <RunStepDetail step={result.step} />
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
