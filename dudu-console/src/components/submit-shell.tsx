import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useMutation } from "@/api/use-mutation";
import { Message, PendingLabel } from "./feedback";
import { Button } from "./ui/button";

// 表单提交外壳单点：守卫-写错-中断、错误 Message 显示位、提交按钮 pending
// 编排、弹层「pending 期不可关闭」守卫都只在这里写一次，调用方只留字段、
// 校验函数与命令；机制侧不变量（竞态、取消、写回收敛）仍归 useMutation 单点。
export function useSubmit() {
  const mutation = useMutation();
  const submit = <T,>(
    event: FormEvent,
    // 校验返回错误文案即写错并中断，null 放行命令
    validate: () => string | null,
    command: (signal: AbortSignal) => Promise<T>,
    onResult?: {
      commit?: (value: T) => void;
      onError?: (error: unknown) => void;
    },
  ) => {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      mutation.setError(invalid);
      return;
    }
    void mutation.run(command, onResult);
  };
  // 弹层 pending 关闭守卫：onOpenChange 只拦关闭方向，与隐藏关闭按钮成对取用
  const hold = (close: () => void) => ({
    onOpenChange: (open: boolean) => {
      if (!open && !mutation.pending) close();
    },
    showCloseButton: !mutation.pending,
  });
  return {
    pending: mutation.pending,
    error: mutation.error,
    setError: mutation.setError,
    submit,
    hold,
  };
}

export type Submit = ReturnType<typeof useSubmit>;

// 错误显示位单点：旁路通知与错误各占一个 Message，调用方只给文案
export function SubmitMessage({
  error,
  notice,
}: {
  error: string | null;
  notice?: string | null;
}) {
  return (
    <>
      {notice && <Message>{notice}</Message>}
      {error && <Message error>{error}</Message>}
    </>
  );
}

// 提交按钮单点：type、pending 禁用与「正在X」文案编排收在这里；
// children 追加在文案后，由调用方按 pending 自行取舍。
export function SubmitButton({
  shell,
  label,
  pendingLabel,
  disabled = false,
  children,
  ...button
}: Omit<ComponentProps<typeof Button>, "type" | "disabled" | "children"> & {
  shell: Submit;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button type="submit" disabled={shell.pending || disabled} {...button}>
      <PendingLabel pending={shell.pending}>
        {shell.pending ? pendingLabel : label}
      </PendingLabel>
      {children}
    </Button>
  );
}
