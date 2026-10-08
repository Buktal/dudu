import { useCallback, useState } from "react";
import type { AdminClient } from "./client";
import { useAdmin } from "./context";
import type { Page } from "./types";
import { useQuery } from "./use-query";

// 分页查询：分页列表共用的取数机制，client 绑定、查询条件状态与翻页写接口
// 都收敛在这里。两条翻页不变量在此唯一陈述、单点测试：
// 「筛选变化与重置都回第一页且保留 pageSize」「page 只暴露服务端回显这一份真相
// （加载或失败时回退请求值）」。
// domain 数据模块（useCompanies/useLogs）只装订命名筛选操作词汇，不重复机制；
// load 须引用稳定（adminApi 上的函数天然满足），包装成 useQuery 需要的稳定身份
// 也在这里单点完成，调用方不再写 useCallback 仪式。
export function usePagedQuery<F extends { page: number; pageSize: number }, T>(
  load: (
    client: AdminClient,
    filters: F,
    signal: AbortSignal,
  ) => Promise<Page<T>>,
  initialFilters: F,
) {
  const client = useAdmin();
  // initialFilters 只在挂载读取：props 更新不覆盖已应用的筛选，重挂载才生效。
  const [filters, setFilters] = useState(initialFilters);
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => load(client, filters, signal),
      [client, filters, load],
    ),
  );
  return {
    // 已应用的查询条件：domain 薄壳从这里取筛选值回显。
    filters,
    // 命名筛选操作的机制侧：合并补丁并回第一页；分页字段只能经 setPage 变更。
    setFilter: (values: Partial<Omit<F, "page" | "pageSize">>) =>
      setFilters((current) => ({ ...current, page: 1, ...values })),
    // 重置：清空全部筛选回第一页；查询类型的非分页字段全部可选，
    // 仅保留 pageSize 的分页字段集即是完整的空查询。
    reset: () =>
      setFilters((current) => ({ page: 1, pageSize: current.pageSize }) as F),
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
