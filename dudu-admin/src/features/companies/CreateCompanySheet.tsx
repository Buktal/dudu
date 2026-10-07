import { useState } from "react";
import { ApiError, COMPANY_ID_CONFLICT } from "@/api/client";
import type { Company } from "@/api/types";
import { useMutation } from "@/api/use-mutation";
import { Message, PendingLabel } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
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
  const mutation = useMutation();
  const [profile, setProfile] = useState(emptyProfile);
  const [selection, setSelection] = useState<IdSelection>({
    value: "",
    status: "idle",
  });
  const [username, setUsername] = useState("admin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !mutation.pending) close();
      }}
    >
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        showCloseButton={!mutation.pending}
      >
        <SheetHeader>
          <SheetTitle>创建企业</SheetTitle>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const cleaned = cleanProfile(profile);
            if (
              !cleaned.companyName ||
              username.trim().length < 2 ||
              !password.trim()
            ) {
              mutation.setError("请填写企业名称及有效的管理员登录名和密码");
              return;
            }
            if (selection.status !== "available") {
              mutation.setError("请先检测企业 ID 是否可用");
              return;
            }
            void mutation.run(
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
            );
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            {mutation.error && <Message error>{mutation.error}</Message>}
            <CompanyIdField
              selection={selection}
              onChange={setSelection}
              disabled={mutation.pending}
            />
            <ProfileFields
              profile={profile}
              setProfile={setProfile}
              disabled={mutation.pending}
            />
            <Separator />
            <FieldSet disabled={mutation.pending}>
              <FieldLegend>初始企业管理员</FieldLegend>
              <FieldGroup>
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
                />
              </FieldGroup>
            </FieldSet>
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button
              variant="outline"
              disabled={mutation.pending}
              onClick={close}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutation.pending || selection.status !== "available"}
            >
              <PendingLabel pending={mutation.pending}>
                {mutation.pending ? "正在创建" : "创建企业"}
              </PendingLabel>
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
