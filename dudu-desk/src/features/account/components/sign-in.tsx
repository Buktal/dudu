import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { LoginCredentials } from "../api";
import { AccountScreen } from "./account-screen";

export function SignIn({
  pending,
  error,
  onSignIn,
}: {
  pending: boolean;
  error?: string;
  onSignIn: (credentials: LoginCredentials) => Promise<boolean>;
}) {
  const id = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <AccountScreen>
      <section
        className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm"
        aria-labelledby={`${id}-title`}
      >
        <div className="flex flex-col gap-2">
          <h1
            id={`${id}-title`}
            className="text-xl font-semibold tracking-tight"
          >
            登录嘟嘟 Desk
          </h1>
          <p className="text-sm text-muted-foreground">
            使用工作台账号开始接待。
          </p>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSignIn({ username, password }).finally(() =>
              setPassword(""),
            );
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${id}-username`}>账号</FieldLabel>
              <Input
                id={`${id}-username`}
                autoComplete="username"
                required
                value={username}
                disabled={pending}
                placeholder="请输入工作台账号"
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-password`}>密码</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-password`}
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  disabled={pending}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    aria-label={visible ? "隐藏密码" : "显示密码"}
                    aria-pressed={visible}
                    onClick={() => setVisible((value) => !value)}
                  >
                    {visible ? (
                      <EyeOff data-icon="inline-start" />
                    ) : (
                      <Eye data-icon="inline-start" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
          {error && <FieldError role="alert">{error}</FieldError>}
          <Button
            type="submit"
            disabled={pending || !username.trim() || !password}
          >
            {pending ? (
              <LoaderCircle
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            {pending ? "正在登录…" : "登录"}
          </Button>
        </form>
      </section>
    </AccountScreen>
  );
}
