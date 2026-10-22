import type { ReactNode } from "react";
import { ErrorState, LoadingState } from "./feedback";

// 详情路径骨架单点：加载、失败、内容三态的编排只在这里写一次。
// 「失败不冒充空数据」由分支顺序保证：error 先于内容分支，失败时绝不渲染 children。
// 差异归调用方：数据到位后的呈现整体走 children 槽，外壳不含布局与卡片样式。
export function DetailPane({
  loading,
  error,
  refresh,
  children,
}: {
  loading: boolean;
  error: string | null;
  refresh: () => void;
  children: ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={refresh} />;
  return <>{children}</>;
}
