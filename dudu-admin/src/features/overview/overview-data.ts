import { adminApi } from "@/api/admin-api";
import { useAdminQuery } from "@/api/admin-query";
import type { Overview } from "@/api/types";

// 运营概览：client 绑定归单记录查询（useAdminQuery）单点，这里只装订 overview
// 读数投影；页面只消费统计读数与最近开通名单。
// 决策：不订阅企业聚合失效——维护命令的写入口都在企业页，本页挂载期间没有
// 并发写入口，也就没有可见的陈旧；接线最小化为零，出现并发写入口时再补订阅。
export function useOverview() {
  const query = useAdminQuery(adminApi.overview, []);
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
