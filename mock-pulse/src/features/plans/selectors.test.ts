import { describe, expect, it } from "vitest";

import { addLane, createPlan, withFavorite } from "./model";
import { filterPlans, PAGE_SIZE, paginatePlans, planStats } from "./selectors";

function planOf(name: string, items: string[], favorite = false) {
  let plan = withFavorite(createPlan(name, "parallel"), favorite);
  for (const scenarioId of items) {
    plan = addLane(plan, scenarioId);
  }
  return plan;
}

const SCENARIOS = [
  { id: "scn-dy", channelId: "douyin" as const, steps: [{}, {}] },
  { id: "scn-wc", channelId: "wecom" as const, steps: [{}] },
];

describe("编排筛选与分页", () => {
  const items = [
    planOf("双平台回归", ["scn-dy", "scn-wc"], true),
    planOf("抖音串行", ["scn-dy"]),
  ];

  it("filterPlans：搜索按名称匹配，行 meta 携带剧本数与执行方式", () => {
    const rows = filterPlans(items, { query: "", kind: "all" });
    expect(rows).toHaveLength(2);
    expect(rows[0].scenarioCount).toBe(2);
    expect(rows[0].modeLabel).toBe("并行");

    expect(
      filterPlans(items, { query: "抖音", kind: "all" }).map(
        (row) => row.plan.name,
      ),
    ).toEqual(["抖音串行"]);
    // 搜索大小写不敏感（英文名）
    expect(filterPlans(items, { query: "双平台", kind: "all" })).toHaveLength(
      1,
    );
  });

  it("filterPlans：收藏 tab 只留星标编排", () => {
    const rows = filterPlans(items, { query: "", kind: "favorite" });
    expect(rows.map((row) => row.plan.name)).toEqual(["双平台回归"]);
  });

  it("paginatePlans：页码收敛，空列表为第 1 页", () => {
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_v, index) =>
      planOf(`编排 ${index}`, []),
    );
    const rows = filterPlans(many, { query: "", kind: "all" });
    const page1 = paginatePlans(rows, 1);
    expect(page1.pages).toBe(2);
    expect(page1.items).toHaveLength(PAGE_SIZE);
    expect(paginatePlans(rows, 99).page).toBe(page1.pages);
    expect(paginatePlans([], 5)).toEqual({
      items: [],
      page: 1,
      pages: 1,
      total: 0,
    });
  });
});

describe("编排统计 planStats", () => {
  it("平台按引用剧本的渠道去重；事件 = 各剧本步骤数之和", () => {
    let plan = createPlan("跨渠道", "parallel");
    plan = addLane(plan, "scn-dy");
    plan = addLane(plan, "scn-wc");
    plan = addLane(plan, "scn-dy");
    expect(planStats(plan, SCENARIOS)).toEqual({
      platformCount: 2,
      eventCount: 5,
    });
  });

  it("引用失效的 lane 不计入统计", () => {
    let plan = createPlan("含失效 lane", "serial");
    plan = addLane(plan, "scn-dy");
    plan = addLane(plan, "scn-gone");
    expect(planStats(plan, SCENARIOS)).toEqual({
      platformCount: 1,
      eventCount: 2,
    });
  });

  it("空编排为 0 平台 0 事件", () => {
    expect(planStats(createPlan("空", "parallel"), SCENARIOS)).toEqual({
      platformCount: 0,
      eventCount: 0,
    });
  });
});
