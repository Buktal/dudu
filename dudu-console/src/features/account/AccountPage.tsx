import { KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { consoleApi } from "@/api/console-api";
import { useConsole, useSession } from "@/api/context";
import { TextField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  PASSWORD_MAX_LENGTH,
  PasswordFields,
  passwordError,
} from "./password-fields";

export function AccountPage() {
  const client = useConsole();
  // 身份直读会话快照：refreshProfile 是权限变化的单一通路，快照更新即随渲染刷新，
  // 不再经页面级查询制造第二份真相；工作区仅在身份就绪后挂载（App 门卫），
  // 空值守卫只为类型收窄。
  const { profile } = useSession();
  const shell = useSubmit();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  if (!profile) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="break-words">{profile.user.name}</h2>
            </CardTitle>
            <CardDescription>企业管理员</CardDescription>
            <CardAction>
              <span
                className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"
                aria-hidden="true"
              >
                <UserRound className="size-5" />
              </span>
            </CardAction>
          </CardHeader>
          <Separator />
          <CardContent>
            <dl className="detail-grid">
              <dt>企业</dt>
              <dd>
                {profile.company.companyName} · {profile.company.companyId}
              </dd>
              <dt>管理权限</dt>
              <dd>
                {profile.user.isInitialAdmin
                  ? "初始企业管理员 · 全部用户组"
                  : "企业管理员 · 已授权用户组"}
              </dd>
              <dt>登录名</dt>
              <dd className="break-all">{profile.user.username}</dd>
              <dt>用户 ID</dt>
              <dd className="break-all font-mono text-xs">
                {profile.user.userId}
              </dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>修改密码</h2>
            </CardTitle>
            <CardDescription>
              修改成功后，请使用新密码重新登录。
            </CardDescription>
            <CardAction>
              <span className="metric-icon" aria-hidden="true">
                <KeyRound className="size-5" />
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) =>
                shell.submit(
                  event,
                  () =>
                    passwordError(password, confirmation) ??
                    (current ? null : "请输入当前密码"),
                  (signal) =>
                    consoleApi.changePassword(
                      client,
                      current,
                      password,
                      signal,
                    ),
                  {
                    // 写回只在未中止的成功后执行
                    commit: () =>
                      client.clearSession("密码已修改，请使用新密码登录"),
                  },
                )
              }
            >
              <SubmitMessage error={shell.error} />
              <FieldGroup>
                <TextField
                  label="当前密码"
                  type="password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  required
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="current-password"
                  disabled={shell.pending}
                  placeholder="输入当前登录密码"
                />
              </FieldGroup>
              <PasswordFields
                password={password}
                confirmation={confirmation}
                setPassword={setPassword}
                setConfirmation={setConfirmation}
                disabled={shell.pending}
              />
              <Separator />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={shell.pending}
                  onClick={() => {
                    setCurrent("");
                    setPassword("");
                    setConfirmation("");
                    shell.setError(null);
                  }}
                >
                  取消
                </Button>
                <SubmitButton
                  shell={shell}
                  label="修改密码"
                  pendingLabel="正在修改"
                  className="self-start"
                />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
