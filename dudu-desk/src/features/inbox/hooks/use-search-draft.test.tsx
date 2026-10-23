import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchDraft } from "./use-search-draft";

// 搜索「草稿-提交」编排：逐键只改草稿，防抖停顿或回车才提交去空格词条，
// 草稿跟随已应用值（外部清除一并回空）
describe("useSearchDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps typing local and commits the trimmed keyword after the debounce", () => {
    const commits: string[] = [];
    const { result } = renderHook(() =>
      useSearchDraft("", (keyword) => commits.push(keyword)),
    );

    act(() => result.current.onChange("  手机 "));
    act(() => result.current.onChange("  手机 维修 "));
    expect(commits).toEqual([]);

    act(() => vi.advanceTimersByTime(250));
    expect(commits).toEqual(["手机 维修"]);
  });

  it("commits immediately on Enter and cancels the pending timer", () => {
    const commits: string[] = [];
    const { result } = renderHook(() =>
      useSearchDraft("", (keyword) => commits.push(keyword)),
    );

    act(() => result.current.onChange("保修"));
    act(() => result.current.onEnter());
    expect(commits).toEqual(["保修"]);

    act(() => vi.advanceTimersByTime(250));
    expect(commits).toEqual(["保修"]);
  });

  it("follows the applied value when it changes externally", () => {
    const commits: string[] = [];
    const { result, rerender } = renderHook(
      ({ applied }: { applied: string }) =>
        useSearchDraft(applied, (keyword) => commits.push(keyword)),
      { initialProps: { applied: "旧词" } },
    );

    act(() => result.current.onChange("中间草稿"));
    // 外部清除筛选把已应用值归空：草稿一并回空，等待中的提交被取消
    rerender({ applied: "" });
    expect(result.current.draft).toBe("");
    act(() => vi.advanceTimersByTime(250));
    expect(commits).toEqual([]);
  });
});
