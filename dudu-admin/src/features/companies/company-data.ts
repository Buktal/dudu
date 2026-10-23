import { useMemo } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdminQuery } from "@/api/admin-query";
import { useAdmin } from "@/api/context";
import { usePagedQuery } from "@/api/paged-query";
import type {
  CompanyProfile,
  CompanyQuery,
  CompanyStatus,
  CreateCompany,
} from "@/api/types";

// —— 企业聚合失效 ——
// 「维护成功后重新读取列表和详情」由 client 的写后失效单点驱动：维护命令
// 以 write 声明写入，成功即提升 dataRevision，挂载中的列表与详情（经
// usePagedQuery / useAdminQuery 的 revision 依赖）各自重读，页面不手工接线。

// 企业列表：翻页机制收敛在 usePagedQuery，这里只装订 domain 词汇——
// 命名操作 setKeyword/setStatus 把筛选意图映射进 CompanyQuery，请求走
// adminApi.companies；对外键名与语义不变，调用方不感知机制侧。
export function useCompanies(initialFilters: CompanyQuery) {
  const paging = usePagedQuery(adminApi.companies, initialFilters);
  return {
    keyword: paging.filters.keyword,
    status: paging.filters.status,
    setKeyword: (keyword?: string) => paging.setFilter({ keyword }),
    setStatus: (status?: CompanyStatus) => paging.setFilter({ status }),
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

// 企业详情：与列表共享同一份失效语义（写后失效经 useAdminQuery 的 revision 依赖）。
export function useCompany(companyId: string) {
  const query = useAdminQuery(adminApi.company, [companyId]);
  return {
    detail: query.data,
    loading: query.loading,
    error: query.error,
    refresh: query.refresh,
  };
}

// 企业维护命令：写请求以 write 声明，成功后的失效重查由 client 单点完成。
export function useCompanyCommands() {
  const client = useAdmin();
  return useMemo(
    () => ({
      create: (body: CreateCompany, signal: AbortSignal) =>
        adminApi.create(client, body, signal),
      update: (
        companyId: string,
        profile: CompanyProfile,
        signal: AbortSignal,
      ) => adminApi.update(client, companyId, profile, signal),
      disable: (
        companyId: string,
        disableReason: string,
        signal: AbortSignal,
      ) => adminApi.disable(client, companyId, disableReason, signal),
      enable: (companyId: string, signal: AbortSignal) =>
        adminApi.enable(client, companyId, signal),
      resetPassword: (
        companyId: string,
        newPassword: string,
        signal: AbortSignal,
      ) => adminApi.resetPassword(client, companyId, newPassword, signal),
    }),
    [client],
  );
}
