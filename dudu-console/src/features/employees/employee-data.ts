import { usePagedQuery } from "@/api/paged-query";
import { type EmployeeFilters, queryEmployees } from "./api";

// 员工列表：翻页机制收敛在 usePagedQuery，这里只装订 domain 词汇——
// 命名操作 setKeyword/setRole/setStatus 把筛选意图映射进 EmployeeFilters；
// 下拉「all」哨兵归 undefined 的取值约定也在这里单点，页面不感知机制侧。
export function useEmployees(initialFilters: EmployeeFilters) {
  const paging = usePagedQuery(queryEmployees, initialFilters);
  return {
    keyword: paging.filters.keyword,
    role: paging.filters.role,
    status: paging.filters.status,
    setKeyword: (keyword?: string) => paging.setFilter({ keyword }),
    setRole: (role: "user" | "console" | "all") =>
      paging.setFilter({ role: role === "all" ? undefined : role }),
    setStatus: (status: 0 | 1 | "all") =>
      paging.setFilter({ status: status === "all" ? undefined : status }),
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
