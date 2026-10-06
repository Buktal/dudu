import { Edit3, KeyRound, Power } from "lucide-react";
import { useCallback, useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import { useQuery } from "@/api/use-query";
import { ErrorState, LoadingState } from "@/components/feedback";
import { formatDate, StatusBadge } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { navigate } from "@/navigation";
import { type CompanyAction, CompanyActions } from "./CompanyActions";

export function CompanyDetailSheet({
  companyId,
  close,
  onChanged,
  initialAction = null,
}: {
  companyId: string;
  close: () => void;
  onChanged: (message: string) => void;
  initialAction?: CompanyAction | null;
}) {
  const client = useAdmin();
  const load = useCallback(
    (signal: AbortSignal) => adminApi.company(client, companyId, signal),
    [client, companyId],
  );
  const query = useQuery(load);
  const [action, setAction] = useState(initialAction);
  const detail = query.data;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && (!action || !detail)) close();
      }}
    >
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        showCloseButton={!action || !detail}
      >
        <SheetHeader>
          <SheetTitle>企业详情</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-8">
          {query.loading ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState message={query.error} retry={query.refresh} />
          ) : (
            detail && (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="min-w-0 break-words text-xl font-semibold">
                      {detail.company.companyName}
                    </h2>
                    <StatusBadge status={detail.company.status} />
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    {detail.company.companyId}
                  </span>
                </div>
                <dl className="detail-grid">
                  <dt>联系人</dt>
                  <dd>{detail.company.contactName ?? "未填写"}</dd>
                  <dt>联系方式</dt>
                  <dd>{detail.company.contactInfo ?? "未填写"}</dd>
                  <dt>创建时间</dt>
                  <dd>{formatDate(detail.company.createTime, true)}</dd>
                  <dt>更新时间</dt>
                  <dd>{formatDate(detail.company.updateTime, true)}</dd>
                  <dt>备注</dt>
                  <dd className="whitespace-pre-wrap">
                    {detail.company.remark ?? "未填写"}
                  </dd>
                  {detail.company.status === 0 && (
                    <>
                      <dt>停用原因</dt>
                      <dd>{detail.company.disableReason ?? "未填写"}</dd>
                    </>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setAction("edit")}>
                    <Edit3 data-icon="inline-start" />
                    编辑资料
                  </Button>
                  <Button variant="outline" onClick={() => setAction("status")}>
                    <Power data-icon="inline-start" />
                    {detail.company.status === 1 ? "停用企业" : "恢复企业"}
                  </Button>
                </div>
                <Separator />
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => navigate(`resources?companyId=${companyId}`)}
                >
                  查看企业资源
                </Button>
                <section
                  className="flex flex-col gap-4"
                  aria-labelledby="initial-admin-title"
                >
                  <h3 id="initial-admin-title" className="font-semibold">
                    初始企业管理员
                  </h3>
                  {detail.adminInit ? (
                    <>
                      <dl className="detail-grid">
                        <dt>显示名称</dt>
                        <dd>{detail.adminInit.name}</dd>
                        <dt>登录名</dt>
                        <dd>{detail.adminInit.username}</dd>
                        <dt>员工 ID</dt>
                        <dd className="font-mono">{detail.adminInit.userId}</dd>
                        <dt>状态</dt>
                        <dd>
                          <StatusBadge status={detail.adminInit.status} />
                        </dd>
                      </dl>
                      <Button
                        variant="outline"
                        className="self-start"
                        onClick={() => setAction("password")}
                      >
                        <KeyRound data-icon="inline-start" />
                        重置密码
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      该企业尚无初始管理员
                    </p>
                  )}
                </section>
                {action && (
                  <CompanyActions
                    key={action}
                    action={action}
                    detail={detail}
                    close={() => setAction(null)}
                    onSaved={(message) => {
                      setAction(null);
                      query.refresh();
                      onChanged(message);
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
