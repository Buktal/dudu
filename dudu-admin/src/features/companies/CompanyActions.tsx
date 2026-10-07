import { useState } from "react";
import type { CompanyDetail } from "@/api/types";
import { useMutation } from "@/api/use-mutation";
import { Message, PendingLabel } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PasswordFields,
  passwordError,
} from "@/features/account/password-fields";
import { useCompanyCommands } from "./company-data";
import { cleanProfile, ProfileFields } from "./profile-fields";

export type CompanyAction = "edit" | "status" | "password";

export function CompanyActions({
  action,
  detail,
  close,
  onSaved,
}: {
  action: CompanyAction;
  detail: CompanyDetail;
  close: () => void;
  onSaved: (message: string) => void;
}) {
  const commands = useCompanyCommands();
  const mutation = useMutation();
  const { company, adminInit } = detail;
  const [profile, setProfile] = useState(cleanProfile(company));
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const disabling = company.status === 1;
  const title =
    action === "edit"
      ? "编辑企业资料"
      : action === "password"
        ? "重置管理员密码"
        : disabling
          ? "停用企业"
          : "恢复企业";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.pending) close();
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!mutation.pending}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {company.companyName} · {company.companyId}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (action === "edit" && !profile.companyName.trim()) {
              mutation.setError("请输入企业名称");
              return;
            }
            if (action === "status" && disabling && !reason.trim()) {
              mutation.setError("请填写停用原因");
              return;
            }
            if (action === "password") {
              const error = passwordError(password, confirmation);
              if (error) {
                mutation.setError(error);
                return;
              }
              if (!adminInit) {
                mutation.setError("该企业尚无可重置的管理员");
                return;
              }
            }
            void mutation.run(
              async (signal) => {
                if (action === "edit")
                  await commands.update(
                    company.companyId,
                    cleanProfile(profile),
                    signal,
                  );
                else if (action === "password")
                  await commands.resetPassword(
                    company.companyId,
                    password,
                    signal,
                  );
                else if (disabling)
                  await commands.disable(
                    company.companyId,
                    reason.trim(),
                    signal,
                  );
                else await commands.enable(company.companyId, signal);
              },
              {
                // 写回只在未中止的成功后执行；列表与详情的重读由失效语义接管
                commit: () => {
                  setPassword("");
                  setConfirmation("");
                  onSaved(
                    action === "edit"
                      ? "企业资料已更新"
                      : action === "password"
                        ? "管理员密码已重置"
                        : disabling
                          ? "企业已停用"
                          : "企业已恢复",
                  );
                },
              },
            );
          }}
        >
          {mutation.error && <Message error>{mutation.error}</Message>}
          {action === "edit" && (
            <ProfileFields
              profile={profile}
              setProfile={setProfile}
              disabled={mutation.pending}
            />
          )}
          {action === "status" && (
            <>
              <p className="text-sm text-muted-foreground">
                {disabling
                  ? "停用后，企业将被标记为停用。已有资料会保留，可以随时恢复。"
                  : "恢复后，企业将重新标记为启用。"}
              </p>
              {disabling && (
                <TextField
                  label="停用原因"
                  multiline
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  maxLength={500}
                  disabled={mutation.pending}
                />
              )}
            </>
          )}
          {action === "password" && (
            <>
              <dl className="detail-grid">
                <dt>管理员</dt>
                <dd>
                  {adminInit?.name}（{adminInit?.username}）
                </dd>
                <dt>员工 ID</dt>
                <dd className="font-mono">{adminInit?.userId}</dd>
              </dl>
              <PasswordFields
                password={password}
                confirmation={confirmation}
                setPassword={setPassword}
                setConfirmation={setConfirmation}
                disabled={mutation.pending}
              />
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.pending}
              onClick={close}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant={
                action === "status" && disabling ? "destructive" : "default"
              }
              disabled={mutation.pending}
            >
              <PendingLabel pending={mutation.pending}>
                {mutation.pending
                  ? "正在保存"
                  : action === "edit"
                    ? "保存修改"
                    : title}
              </PendingLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
