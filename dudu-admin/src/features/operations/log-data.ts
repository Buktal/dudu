import { useCallback, useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import type { LogQuery, operationActions } from "@/api/types";
import { useQuery } from "@/api/use-query";

// 操作记录列表：client 绑定、请求竞态防护与查询条件收敛在这里。
// 写接口是命名操作（setCompanyId/setAction/reset/setPage）：筛选与重置都回第一页
// 且保留 pageSize，调用方不手工拼 LogQuery；page 只暴露服务端回显这一份真相。
// 提交式的企业 ID 草稿与校验归页面，这里只收已应用的筛选值。
// 操作记录是既成事实，不随企业聚合失效重读。
export function useLogs(initialFilters: LogQuery) {
  const client = useAdmin();
  const [filters, setFilters] = useState(initialFilters);
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.logs(client, filters, signal),
      [client, filters],
    ),
  );
  return {
    companyId: filters.companyId,
    action: filters.action,
    setCompanyId: (companyId?: string) =>
      setFilters((current) => ({ ...current, page: 1, companyId })),
    setAction: (action?: keyof typeof operationActions) =>
      setFilters((current) => ({ ...current, page: 1, action })),
    reset: () =>
      setFilters((current) => ({ page: 1, pageSize: current.pageSize })),
    setPage: (page: number) => setFilters((current) => ({ ...current, page })),
    list: query.data?.list ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? filters.page,
    pageSize: query.data?.pageSize ?? filters.pageSize,
    loading: query.loading,
    error: query.error,
    refresh: query.refresh,
  };
}
