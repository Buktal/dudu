import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
