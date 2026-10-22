import { usePagedQuery } from "@/api/paged-query";
import { type AccountFilters, channelApi } from "./api";

// 渠道账号列表：翻页机制收敛在 usePagedQuery，这里只装订 domain 词汇——
// 命名操作 setKeyword/setChannel/setGroup 把筛选意图映射进 AccountFilters；
// 下拉「all」哨兵归 undefined 的取值约定也在这里单点，页面不感知机制侧。
// 路由同步（组入口进页）经 setGroup 回填，与下拉共用同一映射。
export function useAccounts(initialFilters: AccountFilters) {
  const paging = usePagedQuery(channelApi.query, initialFilters);
  return {
    keyword: paging.filters.keyword,
    channel: paging.filters.channel,
    groupId: paging.filters.groupId,
    setKeyword: (keyword?: string) => paging.setFilter({ keyword }),
    setChannel: (channel: string | "all") =>
      paging.setFilter({ channel: channel === "all" ? undefined : channel }),
    setGroup: (groupId: string | "all") =>
      paging.setFilter({ groupId: groupId === "all" ? undefined : groupId }),
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
