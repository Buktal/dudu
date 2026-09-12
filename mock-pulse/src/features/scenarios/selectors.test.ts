import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import type { EventItem } from "@/features/events";

import type { Scenario, ScenarioStep } from "./model";
import {
  filterScenarios,
  PAGE_SIZE,
  paginateScenarios,
  resolveSteps,
  type ScenarioFilters,
} from "./selectors";

/** 固定 seed 的剧本样本工厂（验收：筛选分页在数百条样本下可用） */
function seededScenarios(count: number): Scenario[] {
  faker.seed(20260912);
  const items: Scenario[] = [];
  for (let i = 0; i < count; i += 1) {
    const channel = i % 4 === 0 ? "wecom" : "douyin";
    const name =
      i === 9
        ? "FIXEDMARK 咨询"
        : `${faker.person.lastName()} ${faker.lorem.words(2)}`;
    items.push({
      id: `scn-${String(i).padStart(4, "0")}`,
      name,
      channelId: channel,
      steps:
        i % 3 === 0 ? [] : [{ eventId: `evt-${i}`, revision: 1 + (i % 2) }],
    });
  }
  return items;
}

function eventWithVersions(id: string, revisions: number[]): EventItem {
  return {
    id,
    name: `事件 ${id}`,
    channelId: "douyin",
    schemaId: "dy-text",
    versions: revisions.map((revision) => ({
      revision,
      savedAt: `2026-09-12T0${revision}:00:00.000Z`,
      payload: { event: "im_receive_msg", content: { text: `v${revision}` } },
      expected: { status: 200, body: "", bodyMode: "contains" },
    })),
  };
}

const NO_FILTERS: ScenarioFilters = { query: "", channel: "all" };

describe("filterScenarios", () => {
  it("按渠道筛选只保留对应渠道", () => {
    const items = seededScenarios(300);
    const wecom = filterScenarios(items, { ...NO_FILTERS, channel: "wecom" });
    expect(wecom.every((row) => row.scenario.channelId === "wecom")).toBe(true);
    expect(wecom.length).toBe(75);
  });

  it("搜索命中剧本名与渠道名，大小写不敏感；无命中为空", () => {
    const items = seededScenarios(300);
    const byMarker = filterScenarios(items, {
      ...NO_FILTERS,
      query: "fixedmark",
    });
    expect(byMarker.map((row) => row.scenario.name)).toEqual([
      "FIXEDMARK 咨询",
    ]);

    const byChannel = filterScenarios(items, { ...NO_FILTERS, query: "抖音" });
    expect(byChannel.every((row) => row.scenario.channelId === "douyin")).toBe(
      true,
    );
    expect(
      filterScenarios(items, { ...NO_FILTERS, query: "不存在的关键词" }),
    ).toEqual([]);
  });

  it("组合筛选可叠加，且保持原顺序", () => {
    const items = seededScenarios(300);
    const result = filterScenarios(items, {
      query: "fixedmark",
      channel: "douyin",
    });
    expect(result).toHaveLength(1);

    const wecomAll = filterScenarios(items, {
      ...NO_FILTERS,
      channel: "wecom",
    });
    const expected = items.filter((s) => s.channelId === "wecom");
    expect(wecomAll.map((row) => row.scenario.id)).toEqual(
      expected.map((s) => s.id),
    );
  });
});

describe("paginateScenarios", () => {
  it("分页切片与页数正确", () => {
    const rows = filterScenarios(seededScenarios(95), NO_FILTERS);
    const page2 = paginateScenarios(rows, 2);
    expect(page2.total).toBe(95);
    expect(page2.pages).toBe(Math.ceil(95 / PAGE_SIZE));
    expect(page2.items).toEqual(rows.slice(PAGE_SIZE, PAGE_SIZE * 2));
  });

  it("页码越界收敛到有效区间；空列表第 1 页空切片", () => {
    const rows = filterScenarios(seededScenarios(25), NO_FILTERS);
    expect(paginateScenarios(rows, 0).page).toBe(1);
    expect(paginateScenarios(rows, 9999).page).toBe(Math.ceil(25 / PAGE_SIZE));
    expect(paginateScenarios([], 3)).toEqual({
      items: [],
      page: 1,
      pages: 1,
      total: 0,
    });
  });
});

describe("resolveSteps（版本引用解析与「有新版本」提示）", () => {
  const steps: ScenarioStep[] = [
    { eventId: "evt-a", revision: 1 },
    { eventId: "evt-b", revision: 2 },
  ];

  it("事件出现新版本时对应步骤 outdated，且引用版本的载荷仍是旧版（修改原事件不影响已存剧本）", () => {
    const events = [eventWithVersions("evt-a", [1, 2, 3])];
    const rows = resolveSteps(steps, events);
    const a = rows[0];
    expect(a?.outdated).toBe(true);
    expect(a?.latestRevision).toBe(3);
    expect(a?.referenced?.revision).toBe(1);
    expect(a?.referenced?.payload).toMatchObject({ content: { text: "v1" } });
  });

  it("引用即最新版本时无提示", () => {
    const events = [eventWithVersions("evt-a", [1])];
    const rows = resolveSteps([{ eventId: "evt-a", revision: 1 }], events);
    expect(rows[0]?.outdated).toBe(false);
  });

  it("事件库中没有的事件标为 missing（悬空防御，正常流程删除被拒不出现）", () => {
    const rows = resolveSteps(steps, []);
    expect(rows[0]?.missing).toBe(true);
    expect(rows[0]?.referenced).toBeUndefined();
    expect(rows[0]?.outdated).toBe(false);
  });

  it("同一事件多次入本：各步骤按自身 revision 解析", () => {
    const events = [eventWithVersions("evt-a", [1, 2])];
    const rows = resolveSteps(
      [
        { eventId: "evt-a", revision: 1 },
        { eventId: "evt-a", revision: 2 },
      ],
      events,
    );
    expect(rows.map((row) => row.referenced?.revision)).toEqual([1, 2]);
    expect(rows.map((row) => row.outdated)).toEqual([true, false]);
  });
});
