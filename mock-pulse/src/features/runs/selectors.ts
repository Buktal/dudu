import { type ChannelId, channelById } from "@/lib/channels";

import type { RunRecord } from "./model";

/** 运行记录筛选：状态（全部/通过/失败）+ 渠道（纯 selector，列表交给 react-virtuoso） */
export type RunFilters = {
  status: "all" | "passed" | "failed";
  channel: ChannelId | "all";
};

/** 列表行：运行 + 派生展示事实（渠道/来源标识/步骤计数） */
export type RunRow = {
  run: RunRecord;
  /** 首步渠道（空运行为 undefined） */
  channel: ChannelId | undefined;
  channelName: string | undefined;
  status: "passed" | "failed";
  /** 来源标识：直发 / 剧本 */
  sourceLabel: string;
  scenarioName: string | undefined;
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

/** 筛选（保持库内时间升序；视图渲染时倒序）。 */
export function filterRuns(runs: RunRecord[], filters: RunFilters): RunRow[] {
  return runs
    .map((run) => {
      const channel = run.steps[0]?.channel;
      return {
        run,
        channel,
        channelName: channel
          ? (channelById(channel)?.name ?? channel)
          : undefined,
        status: runStatus(run),
        sourceLabel: run.source === "scenario" ? "剧本" : "直发",
        scenarioName: run.scenarioName ?? undefined,
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
