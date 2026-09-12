import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import type { EventItem } from "./model";
import {
  type EventFilters,
  filterEvents,
  PAGE_SIZE,
  paginateEvents,
} from "./selectors";

/** 固定 seed 的数百条样本工厂（验收：筛选分页在数百条样本下可用） */
function seededEvents(count: number): EventItem[] {
  faker.seed(20260912);
  const schemaCycle = ["dy-text", "dy-image", "dy-enter", "dy-read"] as const;
  const items: EventItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const schemaId = schemaCycle[i % schemaCycle.length];
    const channel = i % 5 === 0 ? "wecom" : "douyin";
    const name =
      i === 7
        ? "FIXEDMARK 咨询"
        : `${faker.person.lastName()} ${faker.lorem.words(2)}`;
    const base = Date.UTC(2026, 8, 12, 0, 0, 0) + i * 60_000;
    items.push({
      id: `evt-${String(i).padStart(4, "0")}`,
      name,
      channelId: channel,
      schemaId,
      versions: [
        {
          revision: 1 + (i % 3),
          savedAt: new Date(base).toISOString(),
          payload: { event: "stub" },
          expected: { status: 200, body: "", bodyMode: "contains" },
        },
      ],
    });
  }
  return items;
}

const NO_FILTERS: EventFilters = { query: "", channel: "all", kind: "all" };

describe("filterEvents", () => {
  it("数百条样本按最新保存时间倒序", () => {
    const items = seededEvents(300);
    const result = filterEvents(items, NO_FILTERS);
    expect(result).toHaveLength(300);
    for (let i = 1; i < result.length; i += 1) {
      expect(
        result[i - 1].updatedAt >= result[i].updatedAt,
        `第 ${i} 项应不早于下一项`,
      ).toBe(true);
    }
  });

  it("渠道筛选只保留对应渠道", () => {
    const items = seededEvents(300);
    const douyin = filterEvents(items, { ...NO_FILTERS, channel: "douyin" });
    expect(douyin.every((row) => row.item.channelId === "douyin")).toBe(true);
    expect(douyin.length).toBe(240);
    const wecom = filterEvents(items, { ...NO_FILTERS, channel: "wecom" });
    expect(wecom.map((row) => row.item.channelId)).toEqual(
      Array.from({ length: 60 }, () => "wecom"),
    );
  });

  it("类型筛选按 schema 的 message/event 分类", () => {
    const items = seededEvents(300);
    const messages = filterEvents(items, { ...NO_FILTERS, kind: "message" });
    const events = filterEvents(items, { ...NO_FILTERS, kind: "event" });
    expect(messages).toHaveLength(150);
    expect(events).toHaveLength(150);
    expect(messages.every((row) => row.schema?.kind === "message")).toBe(true);
    expect(events.every((row) => row.schema?.kind === "event")).toBe(true);
  });

  it("搜索命中名称/事件类型，大小写不敏感", () => {
    const items = seededEvents(300);
    const byMarker = filterEvents(items, { ...NO_FILTERS, query: "fixedmark" });
    expect(byMarker.map((row) => row.item.name)).toEqual(["FIXEDMARK 咨询"]);

    const bySchemaName = filterEvents(items, {
      ...NO_FILTERS,
      query: "接收私信",
    });
    expect(bySchemaName.length).toBeGreaterThan(0);
    expect(
      bySchemaName.every(
        (row) =>
          row.schema?.kind === "message" || row.item.channelId === "wecom",
      ),
    ).toBe(true);

    expect(
      filterEvents(items, { ...NO_FILTERS, query: "不存在的关键词" }),
    ).toEqual([]);
  });

  it("组合筛选可叠加", () => {
    const items = seededEvents(300);
    const result = filterEvents(items, {
      query: "接收私信",
      channel: "douyin",
      kind: "message",
    });
    expect(
      result.every(
        (row) =>
          row.item.channelId === "douyin" && row.schema?.kind === "message",
      ),
    ).toBe(true);
  });
});

describe("paginateEvents", () => {
  it("分页切片与页数正确", () => {
    const items = seededEvents(300);
    const filtered = filterEvents(items, NO_FILTERS);
    const page2 = paginateEvents(filtered, 2);
    expect(page2.total).toBe(300);
    expect(page2.pages).toBe(Math.ceil(300 / PAGE_SIZE));
    expect(page2.page).toBe(2);
    expect(page2.items).toEqual(filtered.slice(PAGE_SIZE, PAGE_SIZE * 2));
    expect(page2.items[0]?.item.id).toBe(filtered[PAGE_SIZE]?.item.id);
  });

  it("页码越界收敛到有效区间", () => {
    const items = seededEvents(300);
    const filtered = filterEvents(items, NO_FILTERS);
    expect(paginateEvents(filtered, 0).page).toBe(1);
    expect(paginateEvents(filtered, 9999).page).toBe(
      Math.ceil(300 / PAGE_SIZE),
    );
  });

  it("空列表返回第 1 页空切片", () => {
    const page = paginateEvents([], 3);
    expect(page).toEqual({ items: [], page: 1, pages: 1, total: 0 });
  });
});

describe("固定 seed 的确定性", () => {
  it("两次独立生成的样本完全一致", () => {
    const first = seededEvents(300);
    const second = seededEvents(300);
    expect(first).toEqual(second);
  });
});
