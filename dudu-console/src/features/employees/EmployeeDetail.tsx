import { useState } from "react";
import { useConsoleQuery } from "@/api/console-query";
import { useSession } from "@/api/context";
import { useEntityGuard } from "@/api/entity-guard";
import { ErrorState, LoadingState } from "@/components/feedback";
import { StatusBadge } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getEmployee } from "./api";
import { type EmployeeAction, EmployeeForm } from "./EmployeeForm";

export function EmployeeDetail({
  id,
  close,
  notify,
}: {
  id: string;
  close: () => void;
  notify: (message: string) => void;
}) {
  const query = useConsoleQuery(useEntityGuard(getEmployee, close), [id]);
  const profile = useSession().profile;
  const [action, setAction] = useState<EmployeeAction | null>(null);
  const employee = query.data;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !action) close();
      }}
    >
      <SheetContent
        className="data-[side=right]:w-full! data-[side=right]:sm:max-w-xl!"
        showCloseButton={!action}
      >
        <SheetHeader>
          <SheetTitle>员工详情</SheetTitle>
        </SheetHeader>
        <Separator />
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          {query.loading ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState message={query.error} retry={query.refresh} />
          ) : (
            employee && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold break-words">
                    {employee.name}
                  </h2>
                  <StatusBadge status={employee.status} />
                </div>
                <dl className="detail-grid">
                  <dt>员工 ID</dt>
                  <dd>{employee.userId}</dd>
                  <dt>登录名</dt>
                  <dd>{employee.username}</dd>
                  <dt>角色</dt>
                  <dd>
                    {employee.isInitialAdmin
                      ? "初始企业管理员"
                      : employee.role === "console"
                        ? "企业管理员"
                        : "普通员工"}
                  </dd>
                  <dt>当前组 ID</dt>
                  <dd>{employee.groupIds.join("、") || "未加入用户组"}</dd>
                  <dt>创建时间</dt>
                  <dd>{employee.createTime}</dd>
                  <dt>更新时间</dt>
                  <dd>{employee.updateTime}</dd>
                </dl>
                {employee.isInitialAdmin && (
                  <p className="text-sm text-muted-foreground">
                    初始管理员自动拥有全部用户组权限，不能被停用或调整角色；密码恢复请联系平台管理员。
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setAction("name")}>
                    修改显示名称
                  </Button>
                  {!employee.isInitialAdmin && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setAction("status")}
                      >
                        {employee.status === 1 ? "停用员工" : "恢复员工"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setAction("role")}
                      >
                        {employee.role === "console"
                          ? "撤销管理员"
                          : "设为管理员"}
                      </Button>
                    </>
                  )}
                  {!employee.isInitialAdmin &&
                    employee.userId !== profile?.user.userId && (
                      <Button
                        variant="outline"
                        onClick={() => setAction("password")}
                      >
                        重置密码
                      </Button>
                    )}
                </div>
                {employee.userId === profile?.user.userId && (
                  <p className="text-sm text-muted-foreground">
                    自己的密码请在个人账号中验证原密码后修改。
                  </p>
                )}
                {action && (
                  <EmployeeForm
                    employee={employee}
                    action={action}
                    close={() => setAction(null)}
                    saved={(_, message) => {
                      setAction(null);
                      notify(message);
                    }}
                  />
                )}
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
