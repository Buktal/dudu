import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { defineMessage } from "../development/fixtures";
import type { DeliveryState } from "../types";
import { MessageView } from "./message-view";

afterEach(cleanup);

/**
 * 发送结果展示：受理记录（含重新登录后按库加载的 sending）显示发送中，
 * 失败带重试入口，已落定的结果不显示额外提示。
 */
function outgoing(delivery: DeliveryState, reason?: string) {
  return defineMessage({
    id: "server-1",
    conversationId: "conversation-a",
    direction: "outgoing",
    body: { type: "text", text: "已经发出去了" },
    delivery: reason ? { state: delivery, reason } : { state: delivery },
  });
}

it("shows a sending hint for a record still marked sending", () => {
  render(<MessageView message={outgoing("sending")} />);

  expect(screen.getByText("发送中")).toBeTruthy();
  expect(screen.queryByText("发送失败")).toBeNull();
  expect(screen.queryByText("重试原消息")).toBeNull();
});

it("shows the failure with its reason and retry action instead of the sending hint", () => {
  render(
    <MessageView
      message={outgoing("failed", "渠道明确拒绝")}
      onRetry={() => {}}
    />,
  );

  expect(screen.getByText("发送失败")).toBeTruthy();
  expect(screen.getByTitle("渠道明确拒绝")).toBeTruthy();
  expect(screen.getByText("重试原消息")).toBeTruthy();
  expect(screen.queryByText("发送中")).toBeNull();
});

it("keeps settled and incoming messages free of a delivery footer", () => {
  render(<MessageView message={outgoing("sent")} />);
  expect(screen.queryByText("发送中")).toBeNull();
  expect(screen.queryByText("发送失败")).toBeNull();

  render(
    <MessageView
      message={defineMessage({
        id: "server-2",
        conversationId: "conversation-a",
      })}
    />,
  );
  expect(screen.queryByText("发送中")).toBeNull();
});
