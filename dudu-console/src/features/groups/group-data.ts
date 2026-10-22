import { useCallback } from "react";
import type { ConsoleClient } from "@/api/client";
import { usePagedQuery } from "@/api/paged-query";
import type { Page } from "@/api/types";
import { type Filters, groupsApi } from "./groups-api";

// 组关系弹层内嵌列表共用的初始分页：重挂载（切换组或重开弹层）才生效。
const initial: Filters = { page: 1, pageSize: 20 };

// 组域翻页装订：groupsApi 的组关系查询以 groupId 为首参，与 usePagedQuery 的
// load 形多一参，绑定身份在此单点完成，调用方（group-relations）不再写
// useCallback 仪式；命名操作 setKeyword 把筛选意图映射进 Filters。
function useGroupPaging<T>(
  load: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) => Promise<Page<T>>,
  groupId: string,
) {
  const bound = useCallback(
    (client: ConsoleClient, filters: Filters, signal: AbortSignal) =>
      load(client, groupId, filters, signal),
    [load, groupId],
  );
  const paging = usePagedQuery(bound, initial);
  return {
    keyword: paging.filters.keyword,
    setKeyword: (keyword?: string) => paging.setFilter({ keyword }),
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

// 组成员列表：只读展示当前组成员，无筛选入口。
export function useGroupMembers(groupId: string) {
  return useGroupPaging(groupsApi.members, groupId);
}

// 成员候选列表：添加成员弹层的候选，支持关键词搜索。
export function useGroupCandidates(groupId: string) {
  return useGroupPaging(groupsApi.candidates, groupId);
}

// 组渠道账号列表：当前组的接待账号，只读展示。
export function useGroupAccounts(groupId: string) {
  return useGroupPaging(groupsApi.accounts, groupId);
}
