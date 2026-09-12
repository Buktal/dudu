import { type ChannelId, channelById } from "@/lib/channels";

import type { RunRecord, RunStep } from "./model";

/** 运行记录筛选：状态（全部/通过/失败）+ 渠道（纯 selector，列表交给 react-virtuoso） */
export type RunFilters = {
  status: "all" | "passed" | "failed";
  channel: ChannelId | "all";
};

/** 列表行：运行 + 派生展示事实（渠道/来源标识/步骤计数） */
export type RunRow = {
  run: RunRecord;
  /** 首步渠道（空运行为 undefined；编排运行跨渠道，不用首步代表） */
  channel: ChannelId | undefined;
  channelName: string | undefined;
  status: "passed" | "failed";
  /** 来源标识：直发 / 剧本 / 执行编排 */
  sourceLabel: string;
  scenarioName: string | undefined;
  planName: string | undefined;
  stepCount: number;
  passedCount: number;
};

/** 运行状态：任一步骤未通过（含 skipped）即失败；空运行无通过事实，视为失败。 */
export function runStatus(run: RunRecord): "passed" | "failed" {
  const hasSteps = run.steps.length > 0;
  return hasSteps && run.steps.every((step) => step.verdict.passed)
    ? "passed"
    : "failed";
}

/** 编排运行的一个 lane 分组：同一剧本（lane）的步骤按序聚在一起。 */
export type LaneGroup = {
  lane: number;
  /** 剧本名快照 */
  name: string;
  steps: RunStep[];
};

/**
 * 编排运行的步骤按 lane 分组（组内保持步骤顺序，组间按 lane 序号排序）；
 * 非编排运行返回 null。缺 laneIndex 的步骤按出现顺序并入第一个无名分组兜底。
 */
export function laneGroups(run: RunRecord): LaneGroup[] | null {
  if (run.source !== "plan") {
    return null;
  }
  const groups: LaneGroup[] = [];
  const byLane = new Map<number, LaneGroup>();
  for (const step of run.steps) {
    const lane = step.laneIndex ?? 0;
    let group = byLane.get(lane);
    if (!group) {
      group = {
        lane,
        name: step.laneName ?? `剧本 ${lane + 1}`,
        steps: [],
      };
      byLane.set(lane, group);
      groups.push(group);
    }
    group.steps.push(step);
  }
  return groups.sort((a, b) => a.lane - b.lane);
}

/** 筛选（保持库内时间升序；视图渲染时倒序）。 */
export function filterRuns(runs: RunRecord[], filters: RunFilters): RunRow[] {
  return runs
    .map((run) => {
      const channel = run.source === "plan" ? undefined : run.steps[0]?.channel;
      return {
        run,
        channel,
        channelName: channel
          ? (channelById(channel)?.name ?? channel)
          : undefined,
        status: runStatus(run),
        sourceLabel:
          run.source === "plan"
            ? "执行编排"
            : run.source === "scenario"
              ? "剧本"
              : "直发",
        scenarioName: run.scenarioName ?? undefined,
        planName: run.planName ?? undefined,
        stepCount: run.steps.length,
        passedCount: run.steps.filter((step) => step.verdict.passed).length,
      };
    })
    .filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) {
        return false;
      }
      if (filters.channel !== "all" && row.channel !== filters.channel) {
        return false;
      }
      return true;
    });
}
