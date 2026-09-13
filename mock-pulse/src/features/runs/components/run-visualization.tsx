import { Fragment } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { StudioButton } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { Badge } from "@/components/ui/badge";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { RunRecord } from "../model";
import { laneGroups } from "../selectors";

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
      className={cn("result-state", status === "waiting" ? "running" : status)}
    >
      <span className="dot" />
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
    <div className="run-summary">
      <div className="row">
        <h3 className="grow">{active ? "正在执行" : "最近一次运行"}</h3>
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
          <StudioButton small tone="quiet" onClick={onStop}>
            <StudioIcon name="stop" />
            停止
          </StudioButton>
        ) : onOpen ? (
          <StudioButton small tone="quiet" onClick={onOpen}>
            <StudioIcon name="history" />
            查看记录
          </StudioButton>
        ) : null}
      </div>
      <div className="run-stats">
        <span>
          {mode === "parallel" ? "并行" : "串行"} · {lanes.length} 个剧本
        </span>
        <span className="mono">
          {completed} / {steps.length}
        </span>
        <span className="green">{passed} 通过</span>
        {failed ? <span className="red">{failed} 未通过</span> : null}
        <span className="grow" />
        <span>HTTP 回执</span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
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
    <div className="run-lanes">
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
              <div className="serial-join">
                <StudioIcon name="down" />
                等待前一剧本结束
              </div>
            ) : null}
            <article className="lane">
              <header className="lane-head">
                <ChannelMark channel={lane.channel} small />
                <div className="grow">
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
              <div className="lane-track">
                {lane.steps.map((step, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 运行快照中的步骤位置不可变，事件可重复出现。
                  <Fragment key={`${i}-${step.name}`}>
                    {i ? <span className="track-arrow">→</span> : null}
                    <div
                      className={cn(
                        "lane-node",
                        step.status === "success"
                          ? "done"
                          : step.status === "waiting"
                            ? "active"
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
