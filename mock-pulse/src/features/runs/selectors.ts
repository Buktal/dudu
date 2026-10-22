import { channelById } from "@/lib/channels";
import { paginate as paginateList } from "@/lib/paginate";

import type { RunRecord, RunStep } from "./model";

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

/** 来源筛选：全部 / 直发 / 剧本 / 编排（RunRecord.source 的超集加 all）。 */
export type RunSourceFilter = "all" | RunRecord["source"];

/** 结果筛选：全部 / 通过 / 失败 / 停止。 */
export type RunOutcomeFilter = "all" | "passed" | "failed" | "cancelled";

/** 运行记录筛选：查询词 + 来源 + 结果（filters + page 与其余域同构，状态在 runs-slice）。 */
export type RunFilters = {
  query: string;
  source: RunSourceFilter;
  outcome: RunOutcomeFilter;
};

/** 分页：转发 lib 泛型实现（页码收敛到 [1, pages]；空列表为第 1 页）。 */
export const paginateRuns = paginateList;

/** 查询干草堆：id、编排名、剧本名、状态词（成功 通过 / 失败 未通过）、
 *  各步骤的事件名与渠道名。 */
function runHaystack(run: RunRecord): string {
  return `${run.id} ${run.planName ?? ""} ${run.scenarioName ?? ""} ${
    runStatus(run) === "passed" ? "成功 通过" : "失败 未通过"
  } ${run.steps
    .map((step) => `${step.eventName} ${channelById(step.channel)?.name}`)
    .join(" ")}`;
}

/** 结果维谓词：停止 = cancelled；通过/失败 = 未停止且状态命中。 */
function matchesOutcome(run: RunRecord, outcome: RunOutcomeFilter): boolean {
  if (outcome === "all") return true;
  if (outcome === "cancelled") return run.cancelled === true;
  return !run.cancelled && runStatus(run) === outcome;
}

/**
 * 筛选：来源与结果先收敛，查询按空白分词、全部词命中干草堆才保留
 * （大小写不敏感；「未通过」含「通过」，状态词按子串语义匹配）。
 * 返回按开始时间倒序（新→旧，列表展示即此序）。
 */
export function filterRuns(
  items: RunRecord[],
  filters: RunFilters,
): RunRecord[] {
  const words = filters.query.trim().toLowerCase().split(/\s+/);
  return [...items]
    .reverse()
    .filter(
      (run) =>
        (filters.source === "all" || run.source === filters.source) &&
        matchesOutcome(run, filters.outcome) &&
        words.every((word) => runHaystack(run).toLowerCase().includes(word)),
    );
}

/** 当前选中运行：无选中或 id 未命中时回退最新一条（库内时间升序取末条）。 */
export function selectedRun(state: {
  items: RunRecord[];
  selectedId?: string | null;
}): RunRecord | undefined {
  return (
    state.items.find((item) => item.id === state.selectedId) ??
    state.items[state.items.length - 1]
  );
}

/**
 * 最近一次同源运行记录（编辑器「最近一次运行」快照的唯一查询出口）：
 * 库内时间升序，从末尾起找同 source + sourceId 的第一条。
 */
export function lastRunFor(
  state: { items: RunRecord[] },
  kind: RunRecord["source"],
  sourceId: string,
): RunRecord | undefined {
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const run = state.items[i];
    if (run.source === kind && run.sourceId === sourceId) {
      return run;
    }
  }
  return undefined;
}
