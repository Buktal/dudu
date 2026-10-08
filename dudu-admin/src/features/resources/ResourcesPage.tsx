import { adminApi } from "@/api/admin-api";
import { useAdminQuery } from "@/api/admin-query";
import { CompanyFilters } from "@/components/company-filters";
import {
  PAGE_SIZE,
  PageHeader,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { QueryView } from "@/components/query-view";
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
import { useCompanies } from "@/features/companies/company-data";
import { routes } from "@/navigation";

function ResourceCells({ companyId }: { companyId: string }) {
  const query = useAdminQuery(adminApi.resources, [companyId]);
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
  // 初始筛选来自路由，依赖 App 的 key remount 重挂载才生效（company-data 契约）。
  const query = useCompanies({
    keyword: companyId ?? undefined,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="企业资源汇总"
        description="查看各企业的用户、用户组和渠道接入账号数量。"
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
      />
      <CompanyFilters
        keyword={query.keyword}
        status={query.status}
        onKeyword={query.setKeyword}
        onStatus={query.setStatus}
        onReset={query.reset}
      />
      <QueryView
        count={query.list.length}
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
        pagination={{
          page: query.page,
          pageSize: query.pageSize,
          total: query.total,
          onPage: query.setPage,
        }}
        empty={{
          filtered: Boolean(query.keyword) || query.status !== undefined,
          filteredCopy: {
            title: "未找到符合条件的企业",
            description: "调整筛选条件后重试。",
          },
          defaultCopy: {
            title: "暂无企业资源",
            description: "企业开通后，可在这里查看资源汇总。",
          },
        }}
      >
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
            {query.list.map((company) => (
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
                <TableCell className="font-mono">{company.companyId}</TableCell>
                <TableCell>
                  <StatusBadge status={company.status} />
                </TableCell>
                <ResourceCells companyId={company.companyId} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </QueryView>
    </div>
  );
}
