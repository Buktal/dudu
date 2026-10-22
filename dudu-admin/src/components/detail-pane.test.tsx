import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DetailPane } from "./detail-pane";

// 骨架测试只断言编排行为：加载占满、失败不冒充内容、重试接线。
it("加载中只呈现加载态，不渲染内容槽", () => {
  render(
    <DetailPane loading error={null} refresh={() => {}}>
      <p>详情内容</p>
    </DetailPane>,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByText("详情内容")).not.toBeInTheDocument();
});

it("失败不冒充空数据：有错误时不渲染内容槽，重试接线到 refresh", () => {
  const refresh = vi.fn();
  render(
    <DetailPane loading={false} error="详情读取失败" refresh={refresh}>
      <p>详情内容</p>
    </DetailPane>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("详情读取失败");
  expect(screen.queryByText("详情内容")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("数据到位后渲染内容槽", () => {
  render(
    <DetailPane loading={false} error={null} refresh={() => {}}>
      <p>详情内容</p>
    </DetailPane>,
  );
  expect(screen.getByText("详情内容")).toBeInTheDocument();
});
