import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useConsole, useSession } from "@/api/context";
import { Brand } from "@/components/brand";
import { TextField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

export function LoginPage() {
  const client = useConsole();
  const session = useSession();
  const shell = useSubmit();
  const [companyId, setCompanyId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="login-page flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-8">
        <Card className="w-full max-w-[420px]">
          <CardHeader className="pb-2 pt-5 text-center">
            <div className="mb-4 flex justify-center">
              <span className="brand-mark brand-mark-large" aria-hidden="true">
                D
              </span>
            </div>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">
                登录企业控制台
              </h1>
            </CardTitle>
            <CardDescription>管理员工、用户组与渠道账号</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-5 sm:px-8">
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) =>
                shell.submit(
                  event,
                  () =>
                    !/^[1-9]\d{5}$/.test(companyId) ||
                    !username.trim() ||
                    !password
                      ? "请输入六位企业 ID、登录名和密码"
                      : null,
                  (signal) =>
                    client.login(companyId, username.trim(), password, signal),
                )
              }
            >
              <SubmitMessage error={shell.error} notice={session.notice} />
              <FieldGroup className="gap-5">
                <TextField
                  label="企业 ID"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="organization"
                  disabled={shell.pending}
                  placeholder="六位企业 ID"
                />
                <TextField
                  label="登录名"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  maxLength={64}
                  disabled={shell.pending}
                  placeholder="请输入登录名"
                />
                <TextField
                  label="密码"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={72}
                  disabled={shell.pending}
                  placeholder="请输入密码"
                />
              </FieldGroup>
              <SubmitButton
                shell={shell}
                label="登录"
                pendingLabel="正在登录"
                size="lg"
                className="w-full"
              >
                {!shell.pending && <ArrowRight data-icon="inline-end" />}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </main>
      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        DuDu · 连接每一次对话
      </footer>
    </div>
  );
}
