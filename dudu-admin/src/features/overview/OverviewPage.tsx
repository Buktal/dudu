import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CirclePause,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useCallback } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import { useQuery } from "@/api/use-query";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import {
  formatDate,
  Metric,
  PageHeader,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function OverviewPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const client = useAdmin();
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.overview(client, signal),
      [client],
    ),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="运营概览"
        description="了解企业规模与近期开通情况。"
        actions={
          <>
            <RefreshButton loading={query.loading} onClick={query.refresh} />
            <Button onClick={() => navigate("companies?create=1")}>
              <Plus data-icon="inline-start" />
              创建企业
            </Button>
          </>
        }
      />
      {query.loading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={query.error} retry={query.refresh} />
      ) : (
        query.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="企业总数"
                value={query.data.totalCompanies}
                icon={<Building2 className="size-5" />}
              />
              <Metric
                label="正常启用"
                value={query.data.enabledCompanies}
                icon={<CheckCircle2 className="size-5" />}
              />
              <Metric
                label="已停用"
                value={query.data.disabledCompanies}
                icon={<CirclePause className="size-5" />}
              />
              <Metric
                label="近 7 天开通"
                value={query.data.recentCreatedCount}
                icon={<TrendingUp className="size-5" />}
              />
            </div>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>最近开通企业</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("companies")}
                >
                  全部企业
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardHeader>
              <CardContent className="px-0">
                {query.data.recentCompanies.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>企业名称</TableHead>
                        <TableHead>企业 ID</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>开通时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data.recentCompanies.map((company) => (
                        <TableRow key={company.companyId}>
                          <TableCell>
                            <button
                              type="button"
                              className="company-link"
                              onClick={() =>
                                navigate(
                                  `companies?companyId=${company.companyId}`,
                                )
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
          </>
        )
      )}
    </div>
  );
}
