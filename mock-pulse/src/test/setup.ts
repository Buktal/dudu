import "@testing-library/jest-dom/vitest";

// jsdom 未实现 window.matchMedia（ui/sidebar 的 use-mobile 依赖），补最小桩：
// 桌面语义（matches = false），事件监听为空操作。
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
