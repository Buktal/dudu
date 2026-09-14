import { Fragment } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { StudioIcon } from "@/components/studio-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { RunRecord } from "../model";
import { laneGroups } from "../selectors";
import type { LiveRun } from "../stores/live";

export type TimelineStep = { name: string; status: string; detail?: string };
export type TimelineLane = {
  name: string;
  channel: ChannelId;
  steps: TimelineStep[];
  timing?: string;
};

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    success: "已完成",
    failed: "未通过",
    waiting: "运行中",
    pending: "等待开始",
    skipped: "已跳过",
    cancelled: "已停止",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        status === "waiting" ? "running" : status,
      )}
    >
      <span className="inline-block size-1.5 shrink-0 rounded-full bg-current" />
      {labels[status] ?? status}
    </Badge>
  );
}

export function recordLanes(run: RunRecord): TimelineLane[] {
  const groups = laneGroups(run) ?? [
    {
      lane: 0,
      name: run.scenarioName || run.steps[0]?.eventName || "单条事件",
      steps: run.steps,
    },
  ];
  return groups.map((lane) => ({
    name: lane.name,
    channel: lane.steps[0]?.channel ?? "douyin",
    steps: lane.steps.map((step) => ({
      name: step.eventName,
      status: step.skipped
        ? "skipped"
        : step.verdict.passed
          ? "success"
          : "failed",
      detail: step.skipped
        ? "已跳过"
        : `HTTP ${step.receipt.status || "超时"} · ${step.receipt.elapsedMs} ms`,
    })),
  }));
}

/**
 * 实况 → 展示轨道（剧本/编排统一的 lane 适配出口）。渠道缺省回退
 * 已完成步骤的快照，再回退抖音（live 阶段渠道尚未经事件确认时兜底）。
 */
export function liveLanes(run: LiveRun): TimelineLane[] {
  return run.lanes.map((lane) => ({
    name: lane.name,
    channel:
      lane.channel ??
      lane.steps.find((step) => step.step)?.step?.channel ??
      "douyin",
    steps: lane.steps.map((step) => ({
      name: step.eventName,
      status: step.status,
    })),
  }));
}

export function RunSummary({
  lanes,
  mode = "serial",
  active = false,
  onStop,
  onOpen,
}: {
  lanes: TimelineLane[];
  mode?: "serial" | "parallel";
  active?: boolean;
  onStop?: () => void;
  onOpen?: () => void;
}) {
  const steps = lanes.flatMap((lane) => lane.steps);
  const passed = steps.filter((step) => step.status === "success").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const completed = steps.filter(
    (step) => !["pending", "waiting"].includes(step.status),
  ).length;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1">
          {active ? "正在执行" : "最近一次运行"}
        </h3>
        <StatusBadge
          status={
            active
              ? "waiting"
              : failed
                ? "failed"
                : steps.some((step) => step.status === "skipped")
                  ? "cancelled"
                  : "success"
          }
        />
        {active && onStop ? (
          <Button size="sm" variant="ghost" onClick={onStop}>
            <StudioIcon name="stop" data-icon="inline-start" />
            停止
          </Button>
        ) : onOpen ? (
          <Button size="sm" variant="ghost" onClick={onOpen}>
            <StudioIcon name="history" data-icon="inline-start" />
            查看记录
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {mode === "parallel" ? "并行" : "串行"} · {lanes.length} 个剧本
        </span>
        <span className="font-mono">
          {completed} / {steps.length}
        </span>
        <span className="text-success">{passed} 通过</span>
        {failed ? (
          <span className="text-destructive">{failed} 未通过</span>
        ) : null}
        <span className="min-w-0 flex-1" />
        <span>HTTP 回执</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{
            width: `${steps.length ? (100 * completed) / steps.length : 0}%`,
          }}
        />
      </div>
    </div>
  );
}

export function RunLanes({
  lanes,
  mode = "serial",
}: {
  lanes: TimelineLane[];
  mode?: "serial" | "parallel";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {lanes.map((lane, index) => {
        const status = lane.steps.some((step) => step.status === "waiting")
          ? "waiting"
          : lane.steps.some((step) => step.status === "failed")
            ? "failed"
            : lane.steps.every((step) => step.status === "success")
              ? "success"
              : lane.steps.some((step) => step.status === "skipped")
                ? "cancelled"
                : "pending";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 运行快照中的轨道顺序不可变，同名剧本可重复出现。
          <Fragment key={`${index}-${lane.name}`}>
            {mode === "serial" && index > 0 ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <StudioIcon name="down" />
                等待前一剧本结束
              </div>
            ) : null}
            <article className="min-w-0 rounded-xl border bg-card p-4">
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <ChannelMark channel={lane.channel} small />
                <div className="min-w-0 flex-1">
                  <h3>{lane.name}</h3>
                  <p>
                    {lane.timing ??
                      (status === "pending"
                        ? "尚未开始"
                        : status === "waiting"
                          ? "正在执行"
                          : "执行结束")}
                  </p>
                </div>
                <StatusBadge status={status} />
              </header>
              <div className="flex min-w-0 items-center gap-3 overflow-x-auto pb-2">
                {lane.steps.map((step, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 运行快照中的步骤位置不可变，事件可重复出现。
                  <Fragment key={`${i}-${step.name}`}>
                    {i ? (
                      <span className="shrink-0 text-muted-foreground">→</span>
                    ) : null}
                    <div
                      className={cn(
                        "min-w-28 shrink-0 rounded-lg border bg-background p-3 text-sm text-muted-foreground",
                        step.status === "success"
                          ? "done"
                          : step.status === "waiting"
                            ? ""
                            : step.status,
                      )}
                    >
                      {step.name}
                      <small>
                        {step.detail ??
                          (step.status === "pending"
                            ? "等待"
                            : step.status === "waiting"
                              ? "正在发送"
                              : step.status === "success"
                                ? "通过"
                                : step.status === "failed"
                                  ? "未通过"
                                  : "已停止")}
                      </small>
                    </div>
                  </Fragment>
                ))}
              </div>
            </article>
          </Fragment>
        );
      })}
    </div>
  );
}
