import { UserRound } from "lucide-react";
import { useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdminQuery } from "@/api/admin-query";
import { useAdmin } from "@/api/context";
import { ErrorState, LoadingState } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { PageHeader } from "@/components/page-parts";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  PASSWORD_MAX_LENGTH,
  PasswordFields,
  passwordError,
} from "./password-fields";

export function AccountPage() {
  const client = useAdmin();
  const query = useAdminQuery(adminApi.profile, []);
  const shell = useSubmit();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="个人账号" description="查看当前身份，管理登录密码。" />
      {query.loading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={query.error} retry={query.refresh} />
      ) : (
        query.data && (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card>
              <CardHeader>
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <UserRound />
                </div>
                <CardTitle>{query.data.name}</CardTitle>
                <CardDescription>平台管理员</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="detail-grid">
                  <dt>登录名</dt>
                  <dd>{query.data.username}</dd>
                  <dt>用户 ID</dt>
                  <dd className="font-mono">{query.data.userId}</dd>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>修改密码</CardTitle>
                <CardDescription>
                  修改成功后，请使用新密码重新登录。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-6"
                  onSubmit={(event) =>
                    shell.submit(
                      event,
                      () =>
                        passwordError(password, confirmation) ??
                        (current.trim() ? null : "请输入当前密码"),
                      (signal) =>
                        adminApi.changePassword(
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
                    />
                  </FieldGroup>
                  <PasswordFields
                    password={password}
                    confirmation={confirmation}
                    setPassword={setPassword}
                    setConfirmation={setConfirmation}
                    disabled={shell.pending}
                  />
                  <div className="flex gap-2">
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
        )
      )}
    </div>
  );
}
