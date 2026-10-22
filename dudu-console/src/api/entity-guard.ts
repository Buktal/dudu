import { useCallback, useEffect, useRef } from "react";
import { ApiError, type ConsoleClient, ENTITY_MISSING } from "./client";

// 「实体缺失（12100）」判定单点：详情读取与写回错误共用同一语义。
export const isMissingEntity = (error: unknown) =>
  error instanceof ApiError && error.code === ENTITY_MISSING;

// 实体缺失守卫：详情数据源报「实体不存在」时收起详情弹层，错误原样上抛由
// use-query 呈现；「详情失效即收起」的编排在此唯一陈述，调用方不再各自
// try/catch。回调经 ref 读取最新闭包，包装身份保持稳定，可直接作为
// use-console-query 的 load，deps 机制不因守卫重启查询。
export function useEntityGuard<T>(
  load: (client: ConsoleClient, id: string, signal: AbortSignal) => Promise<T>,
  onMissing: () => void,
) {
  const latest = useRef(onMissing);
  useEffect(() => {
    latest.current = onMissing;
  });
  return useCallback(
    (client: ConsoleClient, id: string, signal: AbortSignal) =>
      load(client, id, signal).catch((error) => {
        if (!signal.aborted && isMissingEntity(error)) latest.current();
        throw error;
      }),
    [load],
  );
}
