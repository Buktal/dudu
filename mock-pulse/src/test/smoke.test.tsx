import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

import App from "@/App";
import { store } from "@/store";

// 冒烟：证明 jsdom + testing-library + jest-dom matcher 接线可用。
// 业务测试按 AGENTS.md 约定落在被测文件同目录，不在此堆叠。
function Hello() {
  return <h1>hi</h1>;
}

describe("test setup smoke", () => {
  it("renders and matches with jest-dom", () => {
    render(<Hello />);
    expect(
      screen.getByRole("heading", { level: 1, name: "hi" }),
    ).toBeInTheDocument();
  });

  it("renders the app shell with the real store (full module graph)", () => {
    // 验证真实 reducer 与应用壳体的装配。Vitest 的模块求值与浏览器不同，
    // 原生 ESM 的循环依赖由 Biome noImportCycles 在 lint 阶段拦截。
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    expect(screen.getAllByText("事件调试").length).toBeGreaterThan(0);
  });
});
