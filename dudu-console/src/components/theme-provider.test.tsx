import { fireEvent, render } from "@testing-library/react";
import { expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";

const KEY = "test.theme";
const rootClasses = () => document.documentElement.className;

it("存储值合法时装载即生效", () => {
  localStorage.setItem(KEY, "dark");
  render(
    <ThemeProvider storageKey={KEY}>
      <p>内容</p>
    </ThemeProvider>,
  );
  expect(rootClasses()).toContain("dark");
  expect(localStorage.getItem(KEY)).toBe("dark");
});

it("d 键切换走持久化单点：light 起步切到 dark 并写回存储", () => {
  render(
    <ThemeProvider defaultTheme="light" storageKey={KEY}>
      <p>内容</p>
    </ThemeProvider>,
  );
  expect(rootClasses()).toContain("light");
  fireEvent.keyDown(window, { key: "d" });
  expect(rootClasses()).toContain("dark");
  expect(localStorage.getItem(KEY)).toBe("dark");
});

it("storage 事件同步跨标签页变化，无效值回退 defaultTheme", () => {
  render(
    <ThemeProvider defaultTheme="light" storageKey={KEY}>
      <p>内容</p>
    </ThemeProvider>,
  );
  fireEvent(
    window,
    new StorageEvent("storage", {
      key: KEY,
      newValue: "dark",
      storageArea: localStorage,
    }),
  );
  expect(rootClasses()).toContain("dark");
  fireEvent(
    window,
    new StorageEvent("storage", {
      key: KEY,
      newValue: "bogus",
      storageArea: localStorage,
    }),
  );
  expect(rootClasses()).toContain("light");
});
