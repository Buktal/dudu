import { ChevronDown, ChevronUp, History, Loader2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Virtuoso } from "react-virtuoso";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CHANNELS } from "@/lib/channels";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import { setView } from "@/stores/app-slice";
import type { RunStep } from "../model";
import type { RunFilters, RunRow } from "../selectors";
import { filterRuns, laneGroups } from "../selectors";
import {
  fetchRuns,
  type LiveRun,
  selectLiveRun,
  selectRuns,
} from "../stores/runs-slice";
import { RunStepDetail, StepVerdictBadge } from "./run-step-detail";

const STATUS_TABS: { key: RunFilters["status"]; label: string }[] = [
  { key: "all", label: "全部状态" },
  { key: "passed", label: "通过" },
  { key: "failed", label: "失败" },
];

/** 多步运行的步骤条目：点击步骤名展开该步的四类快照详情。
 *  步骤按位置标识（同一事件可多次入本，位置即键语义）。 */
function StepList({ steps }: { steps: RunStep[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const entries = steps.map((step, index) => ({
    id: `${index + 1}-${step.eventId}-${step.msgId}`,
    step,
  }));
  return (
    <div className="space-y-1.5">
      {entries.map((entry, index) => {
        const open = openId === entry.id;
        const { step } = entry;
        return (
          <div key={entry.id} className="rounded-md border border-border">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : entry.id)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
            >
              <span className="font-mono text-[9px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="truncate text-xs font-medium text-foreground">
                {step.eventName}
              </span>
              <span className="grow" />
              <StepVerdictBadge step={step} />
              {open ? (
                <ChevronDown
                  className="size-3 text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <ChevronUp
                  className="size-3 text-muted-foreground"
                  aria-hidden
                />
              )}
            </button>
            {open ? (
              <div className="border-t border-border p-2.5">
                <RunStepDetail step={step} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RunRecordRow({ row }: { row: RunRow }) {
  const [expanded, setExpanded] = useState(false);
  const { run } = row;
  const single = run.steps.length === 1 ? run.steps[0] : undefined;
  // 编排运行：详情按 lane 分组展示（lane 名 + 该 lane 步骤）
  const lanes = useMemo(() => laneGroups(run), [run]);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Badge variant="secondary" className="font-mono text-[9px]">
          {row.sourceLabel}
        </Badge>
        <span className="text-xs font-semibold text-foreground">
          {run.planName ??
            run.scenarioName ??
            single?.eventName ??
            "（空运行）"}
        </span>
        {row.channelName ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.channelName}
          </span>
        ) : null}
        {run.steps.length > 1 ? (
          <span className="font-mono text-[9px] text-muted-foreground/80">
            {row.passedCount}/{row.stepCount} 步通过
          </span>
        ) : null}
        <span className="grow" />
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-[9px]",
            row.status === "passed"
              ? "border-success/40 text-success"
              : "border-destructive/40 text-destructive",
          )}
        >
          {row.status === "passed" ? "通过" : "失败"}
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatDateTime(run.startedAt)}
        </span>
        {run.steps.length > 0 ? (
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
        {single
          ? single.verdict.reason
          : (run.steps.find((step) => !step.verdict.passed)?.verdict.reason ??
            "没有步骤。")}
      </p>
      {expanded && run.steps.length > 0 ? (
        <div className="space-y-3 border-t border-border p-3">
          {lanes ? (
            lanes.map((lane) => (
              <div key={lane.lane} className="space-y-1.5">
                <p className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                  <span className="rounded-sm bg-muted px-1 py-0.5">
                    {String(lane.lane + 1).padStart(2, "0")}
                  </span>
                  {lane.name}
                </p>
                <StepList steps={lane.steps} />
              </div>
            ))
          ) : (
            <StepList steps={run.steps} />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 进行中的运行：实时步骤状态（run-progress 事件驱动） */
function LiveRunCard({ live }: { live: LiveRun }) {
  // 步骤按位置标识（同一事件可多次入本，位置即键语义）
  const entries = live.steps.map((step, index) => ({
    id: `${index + 1}-${step.eventName}`,
    step,
  }));
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
        <Badge variant="secondary" className="font-mono text-[9px]">
          剧本
        </Badge>
        <span className="text-xs font-semibold text-foreground">
          {live.scenarioName}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          正在运行 · {formatDateTime(live.startedAt)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-primary/20 px-3 py-2">
        {entries.map((entry, index) => (
          <span
            key={entry.id}
            className={cn(
              "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px]",
              entry.step.status === "pending" &&
                "border-border text-muted-foreground",
              entry.step.status === "waiting" &&
                "border-primary/40 text-primary",
              entry.step.status === "success" &&
                "border-success/40 text-success",
              entry.step.status === "failed" &&
                "border-destructive/40 text-destructive",
              entry.step.status === "skipped" &&
                "border-muted-foreground/30 text-muted-foreground",
            )}
          >
            {`${index + 1} ${entry.step.eventName}`}
            {entry.step.status === "waiting" ? (
              <Loader2 className="size-2.5 animate-spin" aria-hidden />
            ) : null}
            {entry.step.status === "pending" ? " · 等待" : null}
            {entry.step.status === "waiting" ? " · 发送中" : null}
            {entry.step.status === "success" ? " · 成功" : null}
            {entry.step.status === "failed" ? " · 失败" : null}
            {entry.step.status === "skipped" ? " · 未执行" : null}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 运行记录视图：历史列表（状态/渠道筛选 + 虚拟滚动）+ 进行中运行 + 多步详情 */
export function RunsView() {
  const dispatch = useDispatch<AppDispatch>();
  const runs = useSelector((state: RootState) => selectRuns(state.runs));
  const live = useSelector((state: RootState) => selectLiveRun(state.runs));
  const [filters, setFilters] = useState<RunFilters>({
    status: "all",
    channel: "all",
  });

  useEffect(() => {
    dispatch(fetchRuns());
  }, [dispatch]);

  // 新记录在前
  const rows = useMemo(
    () => [...filterRuns(runs, filters)].reverse(),
    [runs, filters],
  );

  const total = runs.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {total === 0 && !live ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyState
            icon={History}
            title="运行之后，回到这里看结果"
            description="每次直发与剧本运行都保留当时的参数快照、签名头与回执；即使来源事件修改，这份快照也不变。"
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
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-8 py-6">
          {" "}
          <header className="flex-none space-y-1">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              运行记录
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {total} 次运行 · 本地持久化，重启后仍在
            </p>
          </header>
          <div className="flex-none space-y-2 border-b border-border py-3">
            <fieldset className="flex gap-1">
              <legend className="sr-only">状态筛选</legend>
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={filters.status === tab.key}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, status: tab.key }))
                  }
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    filters.status === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </fieldset>
            <fieldset className="flex gap-1">
              <legend className="sr-only">渠道筛选</legend>
              {(["all", ...CHANNELS.map((channel) => channel.id)] as const).map(
                (id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filters.channel === id}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, channel: id }))
                    }
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                      filters.channel === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {id === "all"
                      ? "全部渠道"
                      : (CHANNELS.find((channel) => channel.id === id)?.name ??
                        id)}
                  </button>
                ),
              )}
            </fieldset>
          </div>
          {live ? (
            <div className="flex-none pt-3">
              <LiveRunCard live={live} />
            </div>
          ) : null}
          {rows.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
              <History className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-xs font-medium text-foreground">
                没有匹配的运行记录
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                换一个状态或渠道筛选条件。
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 pt-3">
              <Virtuoso
                className="h-full"
                data={rows}
                itemContent={(_index, row) => (
                  <div className="pb-3">
                    <RunRecordRow row={row} />
                  </div>
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
