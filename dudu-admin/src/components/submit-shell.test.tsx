import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SubmitButton, SubmitMessage, useSubmit } from "./submit-shell";

// 外壳测试的固定样式：harness 表单装配校验与命令，断言只针对提交编排行为。
function Harness({
  validate,
  command,
  close = () => {},
}: {
  validate: () => string | null;
  command: (signal: AbortSignal) => Promise<string>;
  close?: () => void;
}) {
  const shell = useSubmit();
  const hold = shell.hold(close);
  return (
    <form
      aria-label="提交表单"
      onSubmit={(event) => shell.submit(event, validate, command)}
    >
      <SubmitMessage error={shell.error} />
      <button type="button" onClick={() => hold.onOpenChange(false)}>
        触发关闭
      </button>
      <span aria-hidden="true">{String(hold.showCloseButton)}</span>
      <SubmitButton shell={shell} label="保存" pendingLabel="正在保存" />
    </form>
  );
}

it("校验文案写入错误位并拦下命令，不进入 pending", () => {
  const command = vi.fn(async () => "结果");
  render(<Harness validate={() => "请填写企业名称"} command={command} />);
  fireEvent.submit(screen.getByRole("form", { name: "提交表单" }));
  expect(screen.getByRole("alert")).toHaveTextContent("请填写企业名称");
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  expect(command).not.toHaveBeenCalled();
});

it("校验通过执行命令，pending 期按钮禁用并显示正在文案，成功后恢复", async () => {
  const command = vi.fn(async () => "结果");
  render(<Harness validate={() => null} command={command} />);
  fireEvent.submit(screen.getByRole("form", { name: "提交表单" }));
  expect(command).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "正在保存" })).toBeDisabled();
  expect(await screen.findByRole("button", { name: "保存" })).toBeEnabled();
});

it("弹层 pending 关闭守卫：pending 期不放行关闭且隐藏关闭按钮，结束即恢复", async () => {
  let release!: (value: string) => void;
  const command = vi.fn(
    () =>
      new Promise<string>((step) => {
        release = step;
      }),
  );
  const close = vi.fn();
  render(<Harness validate={() => null} command={command} close={close} />);
  expect(screen.getByText("true")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "触发关闭" }));
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.submit(screen.getByRole("form", { name: "提交表单" }));
  // pending 期：重复提交被拦、关闭守卫不放行、关闭按钮位隐藏
  fireEvent.submit(screen.getByRole("form", { name: "提交表单" }));
  expect(command).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "触发关闭" }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(screen.getByText("false")).toBeInTheDocument();
  await act(async () => release("结果"));
  expect(screen.getByText("true")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "触发关闭" }));
  expect(close).toHaveBeenCalledTimes(2);
});
