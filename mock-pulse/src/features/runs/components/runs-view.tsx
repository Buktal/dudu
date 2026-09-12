import { ChevronDown, ChevronUp, History, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { channelById } from "@/lib/channels";
import { formatDateTime } from "@/lib/time";
import type { AppDispatch, RootState } from "@/store";
import { setView } from "@/stores/app-slice";

import type { RunRecord } from "../model";
import { fetchRuns, selectRuns } from "../stores/runs-slice";
import { RunStepDetail, StepVerdictBadge } from "./run-step-detail";

function RunRow({ run }: { run: RunRecord }) {
  const [expanded, setExpanded] = useState(false);
  const step = run.steps[0];
  const channel = step ? channelById(step.channel) : undefined;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">
          {step ? step.eventName : "（空运行）"}
        </span>
        {channel ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {channel.name}
          </span>
        ) : null}
        <span className="font-mono text-[9px] text-muted-foreground/80">
          直发
        </span>
        <span className="grow" />
        {step ? <StepVerdictBadge step={step} /> : null}
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatDateTime(run.startedAt)}
        </span>
        {step ? (
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
            {expanded ? "收起快照" : "查看快照"}
          </Button>
        ) : null}
      </div>
      <p className="px-3 pb-2 text-[10px] leading-relaxed text-muted-foreground">
        {step?.verdict.reason ?? "没有步骤。"}
      </p>
      {expanded && step ? (
        <div className="border-t border-border p-3">
          <RunStepDetail step={step} />
        </div>
      ) : null}
    </div>
  );
}

/** 运行记录视图：直发记录基础列表（完整运行视图归 #20） */
export function RunsView() {
  const dispatch = useDispatch<AppDispatch>();
  const runs = useSelector((state: RootState) => selectRuns(state.runs));

  useEffect(() => {
    dispatch(fetchRuns());
  }, [dispatch]);

  // 新记录在前
  const ordered = useMemo(() => [...runs].reverse(), [runs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card">
      {ordered.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyState
            icon={History}
            title="运行之后，回到这里看结果"
            description="每次直发都保留当时的参数快照、签名头与回执；即使来源事件修改，这份快照也不变。"
          />
          <div className="flex justify-center pb-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch(setView("events"))}
            >
              <Zap className="size-3.5" aria-hidden />
              去调试一条事件
            </Button>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-3 px-8 py-6">
          <header className="space-y-1">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              运行记录
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {ordered.length} 次运行 · 本地持久化，重启后仍在
            </p>
          </header>
          {ordered.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
