import { useCallback } from "react";
import type { AdminClient } from "./client";
import { useAdmin, useSession } from "./context";
import { useQuery } from "./use-query";

// 单记录查询：与分页查询（usePagedQuery）严格对称的绑定层，client 绑定与
// load 身份在 seam 处单点完成，单记录调用方不再写 useCallback 仪式；
// 请求竞态、迟到丢弃与「失败不冒充空数据」仍归 use-query 单点，这里不复制机制。
// deps 是 load 的业务参数实值（client 之外，无参传空数组）：既按 adminApi
// 的参数形转发进 load，又充当 useCallback 的依赖，取值与身份同源。
// dataRevision（写成功即失效）进入重查依赖，与分页查询对称。
export function useAdminQuery<P extends unknown[], T>(
  load: (
    client: AdminClient,
    ...args: [...P, signal: AbortSignal]
  ) => Promise<T>,
  deps: P,
) {
  const client = useAdmin();
  const { dataRevision } = useSession();
  return useQuery(
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps 展开转发进 load，元素即依赖，数组本体不参与比对
    useCallback(
      (signal: AbortSignal) => load(client, ...deps, signal),
      [client, load, dataRevision, ...deps],
    ),
  );
}
