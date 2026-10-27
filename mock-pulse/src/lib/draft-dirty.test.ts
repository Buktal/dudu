import { describe, expect, it } from "vitest";

import { draftDirty } from "./draft-dirty";

/**
 * 四域脏判定单点的内核不变量（「touched 门 + 与基线的内容差」）：
 * 各域只负责供 touched 位与 differs，门与比较的合成语义在此钉住。
 */
describe("draftDirty（touched 门 + 内容差）", () => {
  it("没动手恒不脏（内容不同也不脏）", () => {
    expect(
      draftDirty({ touched: false, draft: { a: 1 }, baseline: { a: 2 } }),
    ).toBe(false);
  });

  it("无草稿恒不脏", () => {
    expect(draftDirty({ touched: true, draft: null, baseline: null })).toBe(
      false,
    );
  });

  it("动手了且无基线（未保存的新草稿）即脏", () => {
    expect(draftDirty({ touched: true, draft: { a: 1 }, baseline: null })).toBe(
      true,
    );
  });

  it("动手了但内容与基线等值不脏；有差即脏（缺省整对象深比较）", () => {
    expect(
      draftDirty({ touched: true, draft: { a: 1 }, baseline: { a: 1 } }),
    ).toBe(false);
    expect(
      draftDirty({ touched: true, draft: { a: 1 }, baseline: { a: 2 } }),
    ).toBe(true);
    // 深比较：嵌套差异也算差
    expect(
      draftDirty({
        touched: true,
        draft: { items: [{ id: "x" }] },
        baseline: { items: [{ id: "y" }] },
      }),
    ).toBe(true);
  });

  it("differs 自定义内容差（域内规范形比较的装配口）", () => {
    const differs = (draft: { n: number }, baseline: { n: number }) =>
      draft.n !== baseline.n;
    // 深比较不等但规范形等值 → 由 differs 判定不脏
    expect(
      draftDirty({
        touched: true,
        draft: { n: 1, extra: true },
        baseline: { n: 1 },
        differs,
      }),
    ).toBe(false);
    expect(
      draftDirty({
        touched: true,
        draft: { n: 2 },
        baseline: { n: 1 },
        differs,
      }),
    ).toBe(true);
  });
});
