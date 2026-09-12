import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

import App from "@/App";
import { store } from "@/store";

// 冒烟：证明 jsdom + testing-library + jest-dom matcher 接线可用。
// 业务测试按 CLAUDE.md 约定落在被测文件同目录，不在此堆叠。
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
    // 覆盖组合根装配全部 feature reducer + events/scenarios 互相引用的
    // 模块环：任一求值期取值错误（TDZ）都会在此炸掉。
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    expect(screen.getAllByText("事件调试").length).toBeGreaterThan(0);
  });
});
