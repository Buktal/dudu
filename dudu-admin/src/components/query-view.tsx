import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import { Pagination } from "./page-parts";

// 列表页骨架单点：加载、失败、空态、表格与分页的编排只在这里写一次。
// 「失败不冒充空数据」由分支顺序保证：error 先于空态判定，失败时绝不渲染空态文案。
// 差异归页面：表格列与行渲染走 children 槽，空态动作按钮走 empty.action。
export function QueryView({
  count,
  loading,
  error,
  retry,
  pagination,
  empty,
  children,
}: {
  count: number;
  loading: boolean;
  error: string | null;
  retry: () => void;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
  };
  empty: {
    filtered: boolean;
    filteredCopy: { title: string; description: string };
    defaultCopy: { title: string; description: string };
    action?: (filtered: boolean) => ReactNode;
  };
  children: ReactNode;
}) {
  const copy = empty.filtered ? empty.filteredCopy : empty.defaultCopy;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={retry} />
      ) : (
        <>
          {count ? (
            children
          ) : (
            <EmptyState title={copy.title} description={copy.description}>
              {empty.action?.(empty.filtered)}
            </EmptyState>
          )}
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={pagination.onPage}
          />
        </>
      )}
    </div>
  );
}
