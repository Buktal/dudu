import { TextField } from "@/components/form-field";
import { FieldGroup } from "@/components/ui/field";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function passwordError(password: string, confirmation: string) {
  if (
    !password.trim() ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  )
    return "密码长度须为 8–72 字符";
  if (password !== confirmation) return "两次输入的密码不一致";
  return null;
}

export function PasswordFields({
  password,
  confirmation,
  setPassword,
  setConfirmation,
  disabled = false,
}: {
  password: string;
  confirmation: string;
  setPassword: (value: string) => void;
  setConfirmation: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <FieldGroup>
      <TextField
        label="新密码"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        disabled={disabled}
        description="8–72 字符"
      />
      <TextField
        label="确认新密码"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
        maxLength={PASSWORD_MAX_LENGTH}
        disabled={disabled}
      />
    </FieldGroup>
  );
}
