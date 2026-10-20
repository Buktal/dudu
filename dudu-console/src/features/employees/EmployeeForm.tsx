import { useState } from "react";
import { useConsole } from "@/api/context";
import { TextField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import {
  createEmployee,
  type Employee,
  resetPassword,
  updateEmployee,
} from "./api";
export type EmployeeAction = "name" | "role" | "status" | "password";
export function EmployeeForm({
  employee,
  action,
  close,
  saved,
}: {
  employee?: Employee;
  action?: EmployeeAction;
  close: () => void;
  saved: (employee: Employee | undefined, message: string) => void;
}) {
  const client = useConsole();
  const shell = useSubmit();
  const [username, setUsername] = useState("");
  const [name, setName] = useState(employee?.name ?? "");
  const [password, setPassword] = useState("");
  const label = !employee
    ? "创建员工"
    : action === "name"
      ? "修改显示名称"
      : action === "password"
        ? "重置密码"
        : action === "status"
          ? employee.status === 1
            ? "停用员工"
            : "恢复员工"
          : employee.role === "user"
            ? "设为管理员"
            : "撤销管理员";
  const submit = (event: React.FormEvent) =>
    shell.submit(
      event,
      () => {
        if (
          !employee &&
          (username.trim().length < 2 || username.trim().length > 64)
        )
          return "登录名需为 2–64 字符";
        if (
          (!employee || action === "name") &&
          (!name.trim() || name.trim().length > 100)
        )
          return "显示名称需为 1–100 字符";
        if (
          (!employee || action === "password") &&
          (password.length < 8 || password.length > 72)
        )
          return "密码需为 8–72 字符";
        return null;
      },
      async (signal) => {
        if (!employee)
          return createEmployee(
            client,
            { username: username.trim(), name: name.trim(), password },
            signal,
          );
        if (action === "password") {
          await resetPassword(client, employee.userId, password, signal);
          return undefined;
        }
        return updateEmployee(
          client,
          employee.userId,
          action ?? "name",
          action === "role"
            ? { role: employee.role === "console" ? "user" : "console" }
            : action === "status"
              ? { status: employee.status === 1 ? 0 : 1 }
              : { name: name.trim() },
          signal,
        );
      },
      {
        commit: (result) => {
          setPassword("");
          saved(result, `${label}成功`);
        },
      },
    );
  return (
    <Dialog
      open
      {...shell.hold(() => {
        setPassword("");
        close();
      })}
    >
      <DialogContent showCloseButton={!shell.pending}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {employee
              ? `${employee.name} · 员工 ID ${employee.userId}`
              : "新员工默认启用，为普通员工，不会自动加入用户组。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            {!employee && (
              <TextField
                label="登录名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={64}
                required
                disabled={shell.pending}
                autoComplete="off"
              />
            )}
            {(!employee || action === "name") && (
              <TextField
                label="显示名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                disabled={shell.pending}
              />
            )}
            {(!employee || action === "password") && (
              <>
                <TextField
                  label={!employee ? "初始密码" : "新密码"}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                  disabled={shell.pending}
                  autoComplete="new-password"
                  description="8–72 字符，保留输入中的空格。保存后无法查看密码。"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!password || shell.pending}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(password)
                      .catch(() =>
                        shell.setError("复制失败，请手动复制输入中的密码"),
                      );
                  }}
                >
                  复制当前未提交密码
                </Button>
              </>
            )}
            {employee && action === "status" && (
              <p className="text-sm text-muted-foreground">
                {employee.status === 1
                  ? "停用后员工将无法继续使用系统；成员关系和历史信息保留。"
                  : "恢复后，员工按现有成员关系重新获得权限。"}
              </p>
            )}
            {employee && action === "role" && (
              <p className="text-sm text-muted-foreground">
                {employee.role === "console"
                  ? "撤销后失去 Console 管理权限，仍可按所属组使用 Desk。"
                  : "获得 Console 管理权限，范围取决于所属组；不会自动加入全部用户组。"}
              </p>
            )}
            {action === "password" && (
              <p className="text-sm text-muted-foreground">
                确认重置该员工密码。请通过安全途径告知员工新密码。
              </p>
            )}
          </FieldGroup>
          <SubmitMessage error={shell.error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={shell.pending}
              onClick={() => {
                setPassword("");
                close();
              }}
            >
              取消
            </Button>
            <SubmitButton shell={shell} label={label} pendingLabel="正在保存" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
