import { adminApi } from "@/api/admin-api";
import { usePagedQuery } from "@/api/paged-query";
import type { LogQuery, operationActions } from "@/api/types";

// 操作记录列表：翻页机制收敛在 usePagedQuery，这里只装订 domain 词汇——
// 命名操作 setCompanyId/setAction 把筛选意图映射进 LogQuery，请求走 adminApi.logs；
// 对外键名与语义不变，调用方不感知机制侧。
// 提交式的企业 ID 草稿与校验归页面，这里只收已应用的筛选值。
// 操作记录是既成事实，不随企业聚合失效重读。
export function useLogs(initialFilters: LogQuery) {
  const paging = usePagedQuery(adminApi.logs, initialFilters);
  return {
    companyId: paging.filters.companyId,
    action: paging.filters.action,
    setCompanyId: (companyId?: string) => paging.setFilter({ companyId }),
    setAction: (action?: keyof typeof operationActions) =>
      paging.setFilter({ action }),
    reset: paging.reset,
    setPage: paging.setPage,
    list: paging.list,
    total: paging.total,
    page: paging.page,
    pageSize: paging.pageSize,
    loading: paging.loading,
    error: paging.error,
    refresh: paging.refresh,
    // 机制侧派生键原样透出：任一命名筛选已应用，供空态筛选取向单点消费。
    filtered: paging.filtered,
  };
}
