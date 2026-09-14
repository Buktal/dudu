import {
  ArrowDownIcon,
  ArrowRightIcon,
  HistoryIcon,
  SquareIcon,
} from "lucide-react";
import { Fragment } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
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
    success: "已通过",
    failed: "未通过",
    waiting: "运行中",
    pending: "等待开始",
    skipped: "已跳过",
    cancelled: "已停止",
  };
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "waiting"
            ? "default"
            : "outline"
      }
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          status === "success" && "text-success",
        )}
      />
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
  stopping = false,
  cancelled = false,
  source = "scenario",
  title,
  onStop,
  onOpen,
}: {
  lanes: TimelineLane[];
  mode?: "serial" | "parallel";
  active?: boolean;
  stopping?: boolean;
  cancelled?: boolean;
  source?: RunRecord["source"];
  title?: string;
  onStop?: () => void;
  onOpen?: () => void;
}) {
  const steps = lanes.flatMap((lane) => lane.steps);
  const passed = steps.filter((step) => step.status === "success").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const completed = steps.filter(
    (step) => !["pending", "waiting"].includes(step.status),
  ).length;
  const status = active
    ? "waiting"
    : cancelled
      ? "cancelled"
      : failed || !steps.length
        ? "failed"
        : steps.some((step) => step.status === "skipped")
          ? "cancelled"
          : "success";
  return (
    <Card className="mb-5" size="sm">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {title ?? (active ? "正在执行" : "最近一次运行")}
            <StatusBadge status={status} />
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-3">
            <span>
              {source === "direct"
                ? "单条发送"
                : source === "scenario"
                  ? `${steps.length} 步 · 顺序执行`
                  : `${mode === "parallel" ? "并行" : "串行"} · ${lanes.length} 个剧本`}
            </span>
            <span className="text-success">{passed} 通过</span>
            {failed ? (
              <span className="text-destructive">{failed} 未通过</span>
            ) : null}
          </CardDescription>
        </div>
        <CardAction>
          {active && onStop ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              disabled={stopping}
            >
              {stopping ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <SquareIcon data-icon="inline-start" />
              )}
              {stopping ? "正在停止…" : "停止"}
            </Button>
          ) : onOpen ? (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              <HistoryIcon data-icon="inline-start" />
              查看记录
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        <Progress
          value={steps.length ? (100 * completed) / steps.length : 0}
          aria-label="运行进度"
        >
          <ProgressLabel>执行进度</ProgressLabel>
          <ProgressValue>
            {() => `${completed} / ${steps.length}`}
          </ProgressValue>
        </Progress>
      </CardContent>
    </Card>
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
    <div className="flex min-w-0 flex-col gap-4">
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
                <ArrowDownIcon className="size-4" />
                等待前一剧本结束
              </div>
            ) : null}
            <Card className="min-w-0" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChannelMark channel={lane.channel} small />
                  {lane.name}
                </CardTitle>
                <CardDescription>
                  {lane.timing ??
                    (status === "pending"
                      ? "尚未开始"
                      : status === "waiting"
                        ? "正在执行"
                        : "执行结束")}
                </CardDescription>
                <CardAction>
                  <StatusBadge status={status} />
                </CardAction>
              </CardHeader>
              <CardContent className="min-w-0">
                <ol
                  className="flex min-w-0 items-center gap-3 overflow-x-auto pb-2"
                  aria-label={`${lane.name}的运行步骤`}
                >
                  {lane.steps.map((step, stepIndex) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: 运行快照中的步骤位置不可变，事件可重复出现。
                      key={`${stepIndex}-${step.name}`}
                      className="flex shrink-0 items-center gap-3"
                    >
                      {stepIndex ? (
                        <ArrowRightIcon className="size-4 text-muted-foreground" />
                      ) : null}
                      <div className="flex min-w-32 max-w-64 flex-col items-start gap-2 rounded-lg bg-muted/50 p-3">
                        <span className="max-w-full truncate" title={step.name}>
                          {step.name}
                        </span>
                        <StatusBadge status={step.status} />
                        {step.detail ? (
                          <span className="text-xs text-muted-foreground">
                            {step.detail}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </Fragment>
        );
      })}
    </div>
  );
}
