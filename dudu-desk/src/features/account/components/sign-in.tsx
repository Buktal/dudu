import { Eye, EyeOff, LogIn } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import type { LoginCredentials } from "../api";
import { AccountScreen } from "./account-screen";

// 企业 ID 与后端 CompanyIdPolicy 一致：100000–999999 的六位数字，首位不为 0
const COMPANY_ID_PATTERN = /^[1-9]\d{5}$/;
// 登录名与密码沿用后端上限（密码 72 为 BCrypt 实际可校验长度）
const USERNAME_MAX_LENGTH = 64;
const PASSWORD_MAX_LENGTH = 72;

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
  const [companyId, setCompanyId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const companyIdValid = COMPANY_ID_PATTERN.test(companyId.trim());
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
            使用企业 ID 和工作台账号开始接待。
          </p>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSignIn({ companyId, username, password }).finally(() =>
              setPassword(""),
            );
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${id}-company`}>企业 ID</FieldLabel>
              <Input
                id={`${id}-company`}
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={6}
                value={companyId}
                disabled={pending}
                placeholder="请输入六位企业 ID"
                onChange={(event) => setCompanyId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-username`}>账号</FieldLabel>
              <Input
                id={`${id}-username`}
                autoComplete="username"
                required
                maxLength={USERNAME_MAX_LENGTH}
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
                  maxLength={PASSWORD_MAX_LENGTH}
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
            disabled={
              pending || !companyIdValid || !username.trim() || !password
            }
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
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
