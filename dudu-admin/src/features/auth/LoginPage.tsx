import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAdmin, useSession } from "@/api/context";
import { useMutation } from "@/api/use-mutation";
import { Brand } from "@/components/brand";
import { Message, PendingLabel } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

export function LoginPage() {
  const client = useAdmin();
  const session = useSession();
  const mutation = useMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="login-page flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <Card className="w-full max-w-[420px]">
          <CardHeader className="pb-3 pt-8 text-center">
            <div className="mb-4 flex justify-center">
              <span className="brand-mark brand-mark-large" aria-hidden="true">
                D
              </span>
            </div>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">
                登录管理后台
              </h1>
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              DuDu 平台运营中心
            </p>
          </CardHeader>
          <CardContent className="px-7 pb-8 sm:px-8">
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (!username.trim() || !password.trim()) {
                  mutation.setError("请输入登录名和密码");
                  return;
                }
                void mutation.run((signal) =>
                  client.login(username.trim(), password, signal),
                );
              }}
            >
              {session.notice && <Message>{session.notice}</Message>}
              {mutation.error && <Message error>{mutation.error}</Message>}
              <FieldGroup>
                <TextField
                  label="登录名"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  maxLength={64}
                  disabled={mutation.pending}
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
                  disabled={mutation.pending}
                  placeholder="请输入密码"
                />
              </FieldGroup>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={mutation.pending}
              >
                <PendingLabel pending={mutation.pending}>
                  {mutation.pending ? "正在登录" : "登录"}
                </PendingLabel>
                {!mutation.pending && <ArrowRight data-icon="inline-end" />}
              </Button>
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
