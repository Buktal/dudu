import { describe, expect, it } from "vitest";

import { PAGE_SIZE } from "@/lib/paginate";

import { addLane, createPlan, withFavorite } from "./model";
import { filterPlans, planStats } from "./selectors";

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

describe("编排筛选", () => {
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

  it("数百条编排可筛选（分页语义由 lib/paginate 统一验收）", () => {
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_v, index) =>
      planOf(`编排 ${index}`, []),
    );
    expect(filterPlans(many, { query: "", kind: "all" })).toHaveLength(
      PAGE_SIZE + 3,
    );
  });
});

describe("编排统计 planStats", () => {
  it("平台按 lane 渠道去重；事件 = 各 lane 步骤数之和", () => {
    expect(planStats([SCENARIOS[0], SCENARIOS[1], SCENARIOS[0]])).toEqual({
      platformCount: 2,
      eventCount: 5,
    });
  });

  it("未解析的 lane（undefined）不计入统计", () => {
    expect(planStats([SCENARIOS[0], undefined])).toEqual({
      platformCount: 1,
      eventCount: 2,
    });
  });

  it("空编排为 0 平台 0 事件", () => {
    expect(planStats([])).toEqual({ platformCount: 0, eventCount: 0 });
  });
});
