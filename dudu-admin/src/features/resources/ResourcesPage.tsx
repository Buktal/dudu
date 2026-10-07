import { useCallback, useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import type { CompanyQuery } from "@/api/types";
import { useQuery } from "@/api/use-query";
import { CompanyFilters } from "@/components/company-filters";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import {
  PAGE_SIZE,
  PageHeader,
  Pagination,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ResourceCells({ companyId }: { companyId: string }) {
  const client = useAdmin();
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.resources(client, companyId, signal),
      [client, companyId],
    ),
  );
  if (query.loading)
    return (
      <TableCell colSpan={4}>
        <Skeleton className="h-5 w-full" />
        <span className="sr-only">正在加载资源</span>
      </TableCell>
    );
  if (query.error)
    return (
      <TableCell colSpan={4}>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-destructive">{query.error}</span>
          <Button variant="outline" size="xs" onClick={query.refresh}>
            重试
          </Button>
        </div>
      </TableCell>
    );
  return (
    query.data && (
      <>
        <TableCell className="text-right font-mono">
          {query.data.userCount}
        </TableCell>
        <TableCell className="text-right font-mono">
          {query.data.userEnabledCount}
        </TableCell>
        <TableCell className="text-right font-mono">
          {query.data.userGroupCount}
        </TableCell>
        <TableCell className="text-right font-mono">
          {query.data.companyChannelCount}
        </TableCell>
      </>
    )
  );
}

export function ResourcesPage({
  navigate,
  companyId,
}: {
  navigate: (path: string) => void;
  companyId?: string | null;
}) {
  const client = useAdmin();
  const [filters, setFilters] = useState<CompanyQuery>({
    keyword: companyId ?? undefined,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.companies(client, filters, signal),
      [client, filters],
    ),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="企业资源汇总"
        description="查看各企业的用户、用户组和渠道接入账号数量。"
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
      />
      {/* 本页尚未迁 useCompanies，筛选不变量暂由本地状态手工维持 */}
      <CompanyFilters
        keyword={filters.keyword}
        status={filters.status}
        onKeyword={(keyword) => setFilters({ ...filters, page: 1, keyword })}
        onStatus={(status) => setFilters({ ...filters, page: 1, status })}
        onReset={() => setFilters({ page: 1, pageSize: filters.pageSize })}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        {query.loading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState message={query.error} retry={query.refresh} />
        ) : (
          query.data && (
            <>
              {query.data.list.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>企业名称</TableHead>
                      <TableHead>企业 ID</TableHead>
                      <TableHead>企业状态</TableHead>
                      <TableHead className="text-right">用户总数</TableHead>
                      <TableHead className="text-right">启用用户</TableHead>
                      <TableHead className="text-right">用户组</TableHead>
                      <TableHead className="text-right">渠道接入账号</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.list.map((company) => (
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
                        <ResourceCells companyId={company.companyId} />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title={
                    filters.keyword || filters.status !== undefined
                      ? "未找到符合条件的企业"
                      : "暂无企业资源"
                  }
                  description={
                    filters.keyword || filters.status !== undefined
                      ? "调整筛选条件后重试。"
                      : "企业开通后，可在这里查看资源汇总。"
                  }
                />
              )}
              <Pagination
                {...query.data}
                onChange={(page) => setFilters({ ...filters, page })}
              />
            </>
          )
        )}
      </div>
    </div>
  );
}
