import { useEffect, useMemo } from "react";
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

// —— company 聚合失效 ——
// 「维护成功后重新读取列表和详情」的单点接线：企业维护命令成功即宣告聚合已变更，
// 挂载中的列表与详情订阅者各自重读，页面不再手工传递刷新回调。
const subscribers = new Set<() => void>();

function companiesChanged() {
  for (const notify of subscribers) notify();
}

function subscribeCompaniesChanged(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

// 企业列表：翻页机制收敛在 usePagedQuery，这里只装订 domain 词汇——
// 命名操作 setKeyword/setStatus 把筛选意图映射进 CompanyQuery，请求走
// adminApi.companies；对外键名与语义不变，调用方不感知机制侧。
export function useCompanies(initialFilters: CompanyQuery) {
  const paging = usePagedQuery(adminApi.companies, initialFilters);
  // 企业聚合失效接线：维护成功即重读挂载中的列表。
  useEffect(() => subscribeCompaniesChanged(paging.refresh), [paging.refresh]);
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

// 企业详情：与列表共享同一份失效语义。
export function useCompany(companyId: string) {
  const query = useAdminQuery(adminApi.company, [companyId]);
  useEffect(() => subscribeCompaniesChanged(query.refresh), [query.refresh]);
  return {
    detail: query.data,
    loading: query.loading,
    error: query.error,
    refresh: query.refresh,
  };
}

// 企业维护命令：写成功即宣告聚合已变更；已中止的提交视为未发生。
export function useCompanyCommands() {
  const client = useAdmin();
  return useMemo(() => {
    const changed = (signal: AbortSignal) => {
      if (!signal.aborted) companiesChanged();
    };
    return {
      create: async (body: CreateCompany, signal: AbortSignal) => {
        const company = await adminApi.create(client, body, signal);
        changed(signal);
        return company;
      },
      update: async (
        companyId: string,
        profile: CompanyProfile,
        signal: AbortSignal,
      ) => {
        await adminApi.update(client, companyId, profile, signal);
        changed(signal);
      },
      disable: async (
        companyId: string,
        disableReason: string,
        signal: AbortSignal,
      ) => {
        await adminApi.disable(client, companyId, disableReason, signal);
        changed(signal);
      },
      enable: async (companyId: string, signal: AbortSignal) => {
        await adminApi.enable(client, companyId, signal);
        changed(signal);
      },
      resetPassword: async (
        companyId: string,
        newPassword: string,
        signal: AbortSignal,
      ) => {
        await adminApi.resetPassword(client, companyId, newPassword, signal);
        changed(signal);
      },
    };
  }, [client]);
}
