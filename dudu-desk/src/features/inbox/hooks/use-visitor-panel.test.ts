import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisitorPanel } from "./use-visitor-panel";
import * as viewport from "./use-workspace-viewport";

afterEach(() => vi.restoreAllMocks());

describe("visitor panel across window sizes", () => {
  it("closes the inline panel when a narrower window would turn it into a sheet", () => {
    const breakpoint = vi.spyOn(viewport, "useWorkspaceViewport");
    breakpoint.mockReturnValue({ inlineInfo: true });
    const { result, rerender } = renderHook(() => useVisitorPanel());
    expect(result.current.open).toBe(true);

    breakpoint.mockReturnValue({ inlineInfo: false });
    rerender();
    expect(result.current.open).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);

    breakpoint.mockReturnValue({ inlineInfo: true });
    rerender();
    expect(result.current.open).toBe(true);
  });

  it("keeps a deliberately closed panel closed when the window widens", () => {
    const breakpoint = vi.spyOn(viewport, "useWorkspaceViewport");
    breakpoint.mockReturnValue({ inlineInfo: false });
    const { result, rerender } = renderHook(() => useVisitorPanel());
    expect(result.current.open).toBe(false);

    act(() => result.current.setOpen(true));
    act(() => result.current.setOpen(false));
    breakpoint.mockReturnValue({ inlineInfo: true });
    rerender();
    expect(result.current.open).toBe(false);
  });
});
