import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectField, TextField } from "./form-field";

// SelectField 的受控交互用小壳承接：断言只针对「选择回传值」这一外部行为。
function SelectHarness({
  options,
  onChange,
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SelectField
      label="渠道"
      value={value}
      options={options}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("表单字段", () => {
  it("SelectField 渲染选项并回传所选值", async () => {
    const onChange = vi.fn();
    render(
      <SelectHarness
        options={[
          { value: "", label: "请选择渠道" },
          { value: "wechat-mp", label: "微信公众号" },
          { value: "web", label: "已下线渠道", disabled: true },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "渠道" }));
    fireEvent.pointerDown(
      await screen.findByRole("option", { name: "微信公众号" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "微信公众号" }), {
      detail: 1,
    });
    expect(onChange).toHaveBeenCalledWith("wechat-mp");
  });

  it("TextField 错误与描述互斥地呈现，多行走 Textarea", () => {
    const view = render(<TextField label="账号名称" error="请输入账号名称" />);
    expect(screen.getByRole("textbox", { name: "账号名称" })).toBeInvalid();
    expect(screen.getByText("请输入账号名称")).toBeInTheDocument();
    view.rerender(
      <TextField label="备注" multiline description="不超过 200 字" />,
    );
    expect(screen.getByRole("textbox", { name: "备注" })).not.toBeInvalid();
    expect(screen.getByText("不超过 200 字")).toBeInTheDocument();
    expect(screen.queryByText("请输入账号名称")).not.toBeInTheDocument();
  });
});
