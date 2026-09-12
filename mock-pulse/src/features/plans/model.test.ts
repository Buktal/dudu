import { describe, expect, it } from "vitest";

import {
  addLane,
  createPlan,
  moveLane,
  newPlanId,
  newPlanRunId,
  type Plan,
  planModeLabel,
  plansReferencingScenario,
  removeLane,
  validatePlan,
  withFavorite,
  withPlanFailure,
  withPlanMode,
} from "./model";

const LIBRARY = [{ id: "scn-1" }, { id: "scn-2" }, { id: "scn-3" }];

describe("编排领域模型", () => {
  it("createPlan：默认继续失败策略，items 为空", () => {
    const plan = createPlan("双平台完整回归", "parallel");
    expect(plan.name).toBe("双平台完整回归");
    expect(plan.mode).toBe("parallel");
    expect(plan.failure).toBe("continue");
    expect(plan.favorite).toBe(false);
    expect(plan.items).toEqual([]);
    expect(plan.id).toMatch(/^plan-/);
  });

  it("newPlanId / newPlanRunId 生成不重复 id（run 前缀与剧本运行一致）", () => {
    const ids = new Set([
      newPlanId(),
      newPlanId(),
      newPlanRunId(),
      newPlanRunId(),
    ]);
    expect(ids.size).toBe(4);
    expect(newPlanRunId()).toMatch(/^run-/);
  });

  it("addLane：追加 {scenarioId} 引用；同一剧本可重复入编排", () => {
    let plan = createPlan("回归", "serial");
    plan = addLane(plan, "scn-1");
    plan = addLane(plan, "scn-2");
    plan = addLane(plan, "scn-1");
    expect(plan.items).toEqual([
      { scenarioId: "scn-1" },
      { scenarioId: "scn-2" },
      { scenarioId: "scn-1" },
    ]);
    // 不可变性：原对象不被修改
    expect(createPlan("回归", "serial").items).toEqual([]);
  });

  it("moveLane：上移下移交换位置；越界（首条上移/末条下移/索引出界）无操作", () => {
    let plan = createPlan("回归", "parallel");
    for (const id of ["scn-1", "scn-2", "scn-3"]) {
      plan = addLane(plan, id);
    }

    // 末条上移
    const movedUp = moveLane(plan, 2, -1);
    expect(movedUp.items.map((item) => item.scenarioId)).toEqual([
      "scn-1",
      "scn-3",
      "scn-2",
    ]);
    // 首条下移
    const movedDown = moveLane(plan, 0, 1);
    expect(movedDown.items.map((item) => item.scenarioId)).toEqual([
      "scn-2",
      "scn-1",
      "scn-3",
    ]);
    // 越界：原样返回
    expect(moveLane(plan, 0, -1)).toBe(plan);
    expect(moveLane(plan, 2, 1)).toBe(plan);
    expect(moveLane(plan, -1, 1)).toBe(plan);
    expect(moveLane(plan, 3, -1)).toBe(plan);
  });

  it("removeLane：按位置删除；越界无操作（同一剧本多次入编排时按位置定位）", () => {
    let plan = createPlan("回归", "serial");
    plan = addLane(plan, "scn-1");
    plan = addLane(plan, "scn-1");
    plan = addLane(plan, "scn-2");

    const removed = removeLane(plan, 0);
    expect(removed.items.map((item) => item.scenarioId)).toEqual([
      "scn-1",
      "scn-2",
    ]);
    expect(removeLane(plan, 3)).toBe(plan);
    expect(removeLane(plan, -1)).toBe(plan);
  });

  it("withPlanMode / withPlanFailure / withFavorite：切换字段", () => {
    const plan = createPlan("回归", "parallel");
    expect(withPlanMode(plan, "serial").mode).toBe("serial");
    expect(withPlanFailure(plan, "stop").failure).toBe("stop");
    expect(withFavorite(plan, true).favorite).toBe(true);
  });

  it("planModeLabel：并行/串行文案单点", () => {
    expect(planModeLabel("parallel")).toBe("并行");
    expect(planModeLabel("serial")).toBe("串行");
  });

  it("validatePlan：引用剧本必须存在于剧本库，违例指明 lane 序号", () => {
    let plan = createPlan("回归", "serial");
    plan = addLane(plan, "scn-1");
    plan = addLane(plan, "scn-gone");
    expect(() => validatePlan(plan, LIBRARY)).toThrow(
      /第 2 条引用的剧本不存在：scn-gone/,
    );
    // 全部存在时通过（空编排也允许保存草稿，运行前另有拦截）
    expect(() =>
      validatePlan(addLane(createPlan("空", "serial"), "scn-3"), LIBRARY),
    ).not.toThrow();
  });

  it("plansReferencingScenario：被编排引用的剧本查询（删除守卫）", () => {
    let a = createPlan("A", "parallel");
    a = addLane(a, "scn-1");
    let b: Plan = createPlan("B", "serial");
    b = addLane(b, "scn-2");
    b = addLane(b, "scn-1");

    const referencing = plansReferencingScenario("scn-1", [a, b]);
    expect(referencing.map((plan) => plan.name)).toEqual(["A", "B"]);
    expect(plansReferencingScenario("scn-gone", [a, b])).toEqual([]);
  });
});
