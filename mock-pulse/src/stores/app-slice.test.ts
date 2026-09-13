import { findNonSerializableValue } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";

import {
  appSlice,
  initialAppState,
  selectView,
  setView,
  VIEWS,
  type ViewId,
} from "./app-slice";

describe("应用壳导航（五视图）", () => {
  it("导航状态满足 Redux 的序列化约束", () => {
    expect(findNonSerializableValue(initialAppState)).toBe(false);
    const state = appSlice.reducer(initialAppState, setView("plans"));
    expect(findNonSerializableValue(state)).toBe(false);
  });

  it("初始视图是事件调试", () => {
    expect(initialAppState.view).toBe("events");
  });

  it("注册表恰好包含五个视图入口", () => {
    expect(VIEWS.map((view) => view.id)).toEqual([
      "events",
      "scenarios",
      "plans",
      "runs",
      "connections",
    ]);
  });

  it("五个视图全部已实现（无空态占位）", () => {
    expect(
      VIEWS.filter((view) => view.implemented).map((view) => view.id),
    ).toEqual(["events", "scenarios", "plans", "runs", "connections"]);
  });

  it("每个视图注册项都带图标与侧栏分组（单一注册表完整）", () => {
    for (const view of VIEWS) {
      expect(view.icon).toBeDefined();
      expect(["build", "monitor", "bottom"]).toContain(view.navSection);
    }
  });

  it("setView 切换当前视图", () => {
    let state = initialAppState;
    state = appSlice.reducer(state, setView("runs"));
    expect(selectView(state)).toBe("runs");
    state = appSlice.reducer(state, setView("connections"));
    expect(selectView(state)).toBe("connections");
  });

  it("setView 拒绝未知视图 id", () => {
    expect(() =>
      appSlice.reducer(initialAppState, setView("settings" as ViewId)),
    ).toThrow();
  });
});
