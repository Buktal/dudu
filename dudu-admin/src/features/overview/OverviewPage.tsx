import { ArrowRight, Plus } from "lucide-react";
import { DetailPane } from "@/components/detail-pane";
import { EmptyState } from "@/components/feedback";
import {
  formatDate,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/navigation";
import { useOverview } from "./overview-data";

export function OverviewPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const { stats, recentCompanies, loading, error, refresh } = useOverview();
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="企业运营统计"
        className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4 sm:px-5"
      >
        {stats && !loading && !error ? (
          <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-x-6 gap-y-3 sm:basis-auto sm:grid-cols-4">
            {[
              { label: "企业总数", value: stats.companyCount },
              { label: "正常启用", value: stats.companyEnabledCount },
              { label: "已停用", value: stats.companyDisabledCount },
              {
                label: "近 7 天开通",
                value: stats.companyCreatedLast7DaysCount,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline gap-x-3"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
                  {value.toLocaleString("zh-CN")}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-sm text-muted-foreground">
            {loading ? "正在加载统计" : "企业统计暂不可用"}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <RefreshButton loading={loading} onClick={refresh} />
          <Button onClick={() => navigate(routes.companyCreate())}>
            <Plus data-icon="inline-start" />
            创建企业
          </Button>
        </div>
      </section>
      <DetailPane loading={loading} error={error} refresh={refresh}>
        {stats && (
          <Card className="data-panel gap-0 pb-0">
            <CardHeader className="items-center pb-5">
              <CardTitle>最近开通企业</CardTitle>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(routes.companies())}
                >
                  全部企业
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardAction>
            </CardHeader>
            <Separator />
            <CardContent className="px-0">
              {recentCompanies.length ? (
                <Table aria-label="最近开通企业">
                  <TableHeader>
                    <TableRow>
                      <TableHead>企业名称</TableHead>
                      <TableHead>企业 ID</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>开通时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCompanies.map((company) => (
                      <TableRow key={company.companyId}>
                        <TableCell>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() =>
                              navigate(routes.companyDetail(company.companyId))
                            }
                          >
                            {company.companyName}
                          </button>
                        </TableCell>
                        <TableCell className="font-mono">
                          {company.companyId}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={company.status} />
                        </TableCell>
                        <TableCell>
                          {formatDate(company.createTime, true)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="暂无开通记录"
                  description="创建企业后，可以在这里查看最新开通情况。"
                />
              )}
            </CardContent>
          </Card>
        )}
      </DetailPane>
    </div>
  );
}
