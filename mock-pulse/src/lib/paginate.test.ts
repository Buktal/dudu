import { describe, expect, it } from "vitest";

import { PAGE_SIZE, paginate } from "./paginate";

/** 三域分页测试合并于此（events / scenarios / plans / runs 共用单一实现） */
describe("paginate（列表分页的单一实现）", () => {
  const items = Array.from({ length: 95 }, (_v, index) => `item-${index}`);

  it("分页切片与页数正确", () => {
    const page2 = paginate(items, 2);
    expect(page2.total).toBe(95);
    expect(page2.pages).toBe(Math.ceil(95 / PAGE_SIZE));
    expect(page2.page).toBe(2);
    expect(page2.items).toEqual(items.slice(PAGE_SIZE, PAGE_SIZE * 2));
  });

  it("页码越界收敛到 [1, pages]", () => {
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, 9999).page).toBe(Math.ceil(95 / PAGE_SIZE));
  });

  it("空列表返回第 1 页空切片", () => {
    expect(paginate([] as string[], 3)).toEqual({
      items: [],
      page: 1,
      pages: 1,
      total: 0,
    });
  });

  it("泛型：切片保持入参元素类型", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const page = paginate(rows, 1);
    expect(page.items).toEqual(rows);
    expect(page.items[0]?.id).toBe("a");
  });
});
