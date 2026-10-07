import { useCallback } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import type { Overview } from "@/api/types";
import { useQuery } from "@/api/use-query";

// 运营概览：client 绑定与请求竞态收敛在这里，页面只消费统计读数与最近开通名单。
// 决策：不订阅企业聚合失效——维护命令的写入口都在企业页，本页挂载期间没有
// 并发写入口，也就没有可见的陈旧；接线最小化为零，出现并发写入口时再补订阅。
export function useOverview() {
  const client = useAdmin();
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.overview(client, signal),
      [client],
    ),
  );
  const stats: OverviewStats | null = query.data && {
    companyCount: query.data.companyCount,
    companyEnabledCount: query.data.companyEnabledCount,
    companyDisabledCount: query.data.companyDisabledCount,
    companyCreatedLast7DaysCount: query.data.companyCreatedLast7DaysCount,
  };
  return {
    stats,
    recentCompanies: query.data?.recentCompanies ?? [],
    loading: query.loading,
    error: query.error,
    refresh: query.refresh,
  };
}

type OverviewStats = Pick<
  Overview,
  | "companyCount"
  | "companyEnabledCount"
  | "companyDisabledCount"
  | "companyCreatedLast7DaysCount"
>;
