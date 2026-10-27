import { afterEach, describe, expect, it } from "vitest";
import { findFocusable, isFocusable } from "./focus";

/**
 * 「可见且非 inert」聚焦谓词的三个分支：inert 子树排除、无布局盒排除、
 * 多个候选时取第一个可见者。jsdom 不做布局，getClientRects 恒为空列表，
 * 需要按测试意图把元素标记为「有布局盒」。
 */

function get<E extends Element = Element>(selector: string): E {
  const found = document.querySelector<E>(selector);
  if (!found) throw new Error(`缺少测试元素：${selector}`);
  return found;
}

/** jsdom 没有布局引擎：给该元素一个非空的布局盒以表示可见。 */
function visible(element: Element): void {
  element.getClientRects = () =>
    [{ width: 10, height: 10 }] as unknown as DOMRectList;
}

describe("focusable element predicate", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("skips elements inside an inert subtree", () => {
    document.body.innerHTML = `
      <div inert><button id="blocked">被屏蔽</button></div>
      <button id="open">可用</button>
    `;
    visible(get("#blocked"));
    visible(get("#open"));
    expect(isFocusable(get("#blocked"))).toBe(false);
    expect(findFocusable("button")?.id).toBe("open");
  });

  it("skips elements without a layout box", () => {
    document.body.innerHTML = `
      <button id="hidden" hidden>隐藏</button>
      <button id="shown">可见</button>
    `;
    // 隐藏按钮保持 jsdom 默认的空布局盒，只有可见者被标记
    visible(get("#shown"));
    expect(isFocusable(get("#hidden"))).toBe(false);
    expect(findFocusable("button")?.id).toBe("shown");
  });

  it("takes the first visible match among several candidates", () => {
    document.body.innerHTML = `
      <input id="ghost" />
      <input id="first" />
      <input id="second" />
    `;
    visible(get("#first"));
    visible(get("#second"));
    // 第一个匹配没有布局盒：落到第一个可见候选而不是整体放弃
    expect(findFocusable("input")?.id).toBe("first");
    expect(findFocusable<HTMLTextAreaElement>("textarea")).toBeUndefined();
  });
});
