import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import type {
  CompanyProfile,
  CompanyQuery,
  CompanyStatus,
  CreateCompany,
} from "@/api/types";
import { useQuery } from "@/api/use-query";

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

// 企业列表：client 绑定、请求竞态防护、查询条件与失效重读都收敛在这里。
// 写接口是命名操作（setKeyword/setStatus/reset/setPage）：「筛选变化回第一页且保留
// pageSize」的不变量在 module 内固定，调用方不手工拼 CompanyQuery；
// page 只暴露服务端回显这一份真相（加载或失败时回退请求值）。
export function useCompanies(initialFilters: CompanyQuery) {
  const client = useAdmin();
  const [filters, setFilters] = useState(initialFilters);
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.companies(client, filters, signal),
      [client, filters],
    ),
  );
  useEffect(() => subscribeCompaniesChanged(query.refresh), [query.refresh]);
  return {
    keyword: filters.keyword,
    status: filters.status,
    setKeyword: (keyword?: string) =>
      setFilters((current) => ({ ...current, page: 1, keyword })),
    setStatus: (status?: CompanyStatus) =>
      setFilters((current) => ({ ...current, page: 1, status })),
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

// 企业详情：与列表共享同一份失效语义。
export function useCompany(companyId: string) {
  const client = useAdmin();
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.company(client, companyId, signal),
      [client, companyId],
    ),
  );
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
