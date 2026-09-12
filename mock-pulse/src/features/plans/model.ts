/**
 * 执行编排领域模型：Plan = {id, name, mode, failure, favorite, items[]}。
 * 跨渠道把多个已保存剧本组成一次执行；items 有序即 lanes——
 * parallel = 全部剧本 T+0 同时起跑（剧内严格有序，ADR-0004 并发语义）；
 * serial = 前一剧本完全结束后才启动下一个。
 * items 只存剧本引用（scenarioId），运行时经引用解析物化（与剧本步骤同一引用哲学）。
 */

export type PlanMode = "parallel" | "serial";
/** 失败策略：stop = 任一剧本失败即停整个编排；continue = 记录后继续其余剧本 */
export type PlanFailure = "stop" | "continue";

/** 编排项：引用一个已保存剧本 */
export type PlanItem = {
  scenarioId: string;
};

export type Plan = {
  id: string;
  name: string;
  mode: PlanMode;
  failure: PlanFailure;
  /** 素材库收藏星标 */
  favorite: boolean;
  items: PlanItem[];
};

let idCounter = 0;

export function newPlanId(): string {
  idCounter += 1;
  return `plan-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 编排运行 id（与剧本运行同一前缀风格，run-progress 事件按 runId 路由） */
export function newPlanRunId(): string {
  idCounter += 1;
  return `run-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 新建编排：默认继续失败策略（记录后跑完其余剧本），收藏未标。 */
export function createPlan(name: string, mode: PlanMode): Plan {
  return {
    id: newPlanId(),
    name,
    mode,
    failure: "continue",
    favorite: false,
    items: [],
  };
}

/** mode 的界面文案（素材库 meta / 模式切换共用单点） */
export function planModeLabel(mode: PlanMode): "并行" | "串行" {
  return mode === "parallel" ? "并行" : "串行";
}

/** 添加剧本（lane 追加到末尾）；同一剧本可重复入编排（如制造并发线）。 */
export function addLane(plan: Plan, scenarioId: string): Plan {
  return { ...plan, items: [...plan.items, { scenarioId }] };
}

/** 上移 / 下移 lane：越界（首条上移、末条下移）为无操作，原样返回。 */
export function moveLane(plan: Plan, index: number, delta: -1 | 1): Plan {
  const target = index + delta;
  if (
    index < 0 ||
    index >= plan.items.length ||
    target < 0 ||
    target >= plan.items.length
  ) {
    return plan;
  }
  const items = [...plan.items];
  const [moved] = items.splice(index, 1);
  items.splice(target, 0, moved);
  return { ...plan, items };
}

/** 按位置删除 lane；越界为无操作。同一剧本可多次入编排，故不用 id 定位。 */
export function removeLane(plan: Plan, index: number): Plan {
  if (index < 0 || index >= plan.items.length) {
    return plan;
  }
  return {
    ...plan,
    items: plan.items.filter((_item, i) => i !== index),
  };
}

/** 切换执行模式（并行/串行） */
export function withPlanMode(plan: Plan, mode: PlanMode): Plan {
  return { ...plan, mode };
}

/** 切换失败策略（失败即停 / 记录后继续） */
export function withPlanFailure(plan: Plan, failure: PlanFailure): Plan {
  return { ...plan, failure };
}

/** 切换收藏星标 */
export function withFavorite(plan: Plan, favorite: boolean): Plan {
  return { ...plan, favorite };
}

/**
 * 保存前整体校验：每个 lane 引用的剧本必须存在于剧本库。
 * 违例抛可读错误；步骤级引用校验（版本存在等）复用 runs 的物化校验。
 */
export function validatePlan(
  plan: Plan,
  scenarios: readonly { id: string }[],
): void {
  for (const [index, item] of plan.items.entries()) {
    const exists = scenarios.some(
      (scenario) => scenario.id === item.scenarioId,
    );
    if (!exists) {
      throw new Error(
        `第 ${index + 1} 条引用的剧本不存在：${item.scenarioId}。`,
      );
    }
  }
}

/** 引用了该剧本的编排列表（剧本删除守卫：非空则拒绝删除）。 */
export function plansReferencingScenario(
  scenarioId: string,
  plans: readonly Plan[],
): Plan[] {
  return plans.filter((plan) =>
    plan.items.some((item) => item.scenarioId === scenarioId),
  );
}
