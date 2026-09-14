import { isTemplateStep } from "@/features/scenarios";
import type { ChannelId } from "@/lib/channels";
import { type Page, paginate as paginateList } from "@/lib/paginate";

import type { Plan } from "./model";
import { planModeLabel, plansReferencingScenario } from "./model";

/** 编排筛选：搜索 + 全部/收藏 tab（纯 selector，列表交给 react-virtuoso） */
export type PlanFilters = {
  query: string;
  kind: "all" | "favorite";
};

/** 列表行：编排 + 派生展示事实（剧本数 / 执行方式文案） */
export type PlanRow = {
  plan: Plan;
  scenarioCount: number;
  modeLabel: "并行" | "串行";
};

/** 筛选（保持库内原顺序：编排无时间戳，按装载/保存顺序稳定呈现）。 */
export function filterPlans(items: Plan[], filters: PlanFilters): PlanRow[] {
  const query = filters.query.trim().toLowerCase();
  return items
    .map((plan) => ({
      plan,
      scenarioCount: plan.items.length,
      modeLabel: planModeLabel(plan.mode),
    }))
    .filter((row) => {
      if (filters.kind === "favorite" && !row.plan.favorite) {
        return false;
      }
      return query === "" || row.plan.name.toLowerCase().includes(query);
    });
}

export type PlanPage = Page<PlanRow>;

/** 分页：转发 lib 泛型实现（页码收敛到 [1, pages]；空列表为第 1 页）。 */
export const paginatePlans = paginateList;

/** 编辑器底部统计：「N 个平台 · N 个事件」——平台按 lane 渠道去重，
 *  事件 = 各 lane 步骤数之和。入参为已解析的 lane 剧本列表
 *  （resolveLaneScenario 产物：快照优先），未解析的 lane 不计入。 */
type ResolvedLane = { channelId: ChannelId; steps: readonly unknown[] };

export function planStats(
  laneScenarios: readonly (ResolvedLane | undefined)[],
): { platformCount: number; eventCount: number } {
  const referenced = laneScenarios.filter(
    (scene): scene is ResolvedLane => scene !== undefined,
  );
  const platforms = new Set(referenced.map((scene) => scene.channelId));
  const eventCount = referenced.reduce(
    (sum, scene) => sum + scene.steps.length,
    0,
  );
  return { platformCount: platforms.size, eventCount };
}

/** 跨 feature 窄 selector：引用该剧本的编排名列表（空 = 可删除，
 *  组合根删除守卫消费）。入参收结构化最小形状（含 plans 键或 items 即可）。 */
export function planNamesReferencingScenario(
  state: { items: Plan[] } | { plans: { items: Plan[] } },
  scenarioId: string,
): string[] {
  const plans = "plans" in state ? state.plans : state;
  return plansReferencingScenario(scenarioId, plans.items).map(
    (plan) => plan.name,
  );
}

/** 即使来源剧本已经改动，编排的固定快照仍持有事件版本（模板步骤不引用素材）。 */
export function planNamesReferencingEvent(
  state: { items: Plan[] },
  eventId: string,
): string[] {
  return state.items
    .filter((plan) =>
      plan.items.some((lane) =>
        lane.snapshot?.steps.some(
          (step) => !isTemplateStep(step) && step.eventId === eventId,
        ),
      ),
    )
    .map((plan) => plan.name);
}
