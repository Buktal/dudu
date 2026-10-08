import { useState } from "react";
import { ApiError, COMPANY_ID_CONFLICT } from "@/api/client";
import type { Company } from "@/api/types";
import { TextField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/account/password-fields";
import { CompanyIdField, type IdSelection } from "./CompanyIdField";
import { useCompanyCommands } from "./company-data";
import { cleanProfile, emptyProfile, ProfileFields } from "./profile-fields";

export function CreateCompanySheet({
  close,
  onCreated,
}: {
  close: () => void;
  onCreated: (company: Company) => void;
}) {
  const commands = useCompanyCommands();
  const shell = useSubmit();
  const [profile, setProfile] = useState(emptyProfile);
  const [selection, setSelection] = useState<IdSelection>({
    value: "",
    status: "idle",
  });
  const [username, setUsername] = useState("admin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const cleaned = cleanProfile(profile);
  // 弹层 pending 关闭守卫成对取用：Root 拦关闭，Content 隐藏关闭按钮
  const hold = shell.hold(close);
  return (
    <Sheet open onOpenChange={hold.onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        showCloseButton={hold.showCloseButton}
      >
        <SheetHeader className="pr-14">
          <SheetTitle>创建企业</SheetTitle>
          <SheetDescription>开通企业并设置初始管理员账号。</SheetDescription>
        </SheetHeader>
        <Separator />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) =>
            shell.submit(
              event,
              () => {
                if (
                  !cleaned.companyName ||
                  username.trim().length < 2 ||
                  !password.trim()
                )
                  return "请填写企业名称及有效的管理员登录名和密码";
                if (selection.status !== "available")
                  return "请先检测企业 ID 是否可用";
                return null;
              },
              (signal) =>
                commands.create(
                  {
                    ...cleaned,
                    companyId: selection.value,
                    adminInit: {
                      username: username.trim(),
                      password,
                      name: name.trim() || null,
                    },
                  },
                  signal,
                ),
              {
                // 写回只在未中止的成功后执行；列表重读由失效语义接管
                commit: (company) => {
                  setPassword("");
                  onCreated(company);
                },
                onError: (error) => {
                  if (
                    error instanceof ApiError &&
                    error.code === COMPANY_ID_CONFLICT
                  )
                    setSelection({
                      value: selection.value,
                      status: "occupied",
                    });
                },
              },
            )
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
            <SubmitMessage error={shell.error} />
            <CompanyIdField
              selection={selection}
              onChange={setSelection}
              disabled={shell.pending}
            />
            <ProfileFields
              profile={profile}
              setProfile={setProfile}
              disabled={shell.pending}
            />
            <Separator />
            <FieldSet disabled={shell.pending}>
              <FieldLegend>初始企业管理员</FieldLegend>
              <FieldGroup className="gap-5">
                <TextField
                  label="管理员登录名"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={2}
                  maxLength={64}
                  autoComplete="off"
                />
                <TextField
                  label="显示名称"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="选填"
                />
                <TextField
                  label="初始密码"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  description="8–72 字符"
                  placeholder="设置管理员初始密码"
                />
              </FieldGroup>
            </FieldSet>
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button variant="outline" disabled={shell.pending} onClick={close}>
              取消
            </Button>
            <SubmitButton
              shell={shell}
              label="创建企业"
              pendingLabel="正在创建"
              disabled={selection.status !== "available"}
            />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
