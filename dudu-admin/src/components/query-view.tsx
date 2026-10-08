import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import { Pagination } from "./page-parts";
import { Separator } from "./ui/separator";

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
  filters,
  actions,
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
    icon?: LucideIcon;
    filtered: boolean;
    filteredCopy: { title: string; description: string };
    defaultCopy: { title: string; description: string };
    action?: (filtered: boolean) => ReactNode;
  };
  filters?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const copy = empty.filtered ? empty.filteredCopy : empty.defaultCopy;
  return (
    <div className="data-panel min-w-0 overflow-hidden rounded-4xl border bg-card">
      {(filters || actions) && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5">
            {filters}
            {actions && (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {actions}
              </div>
            )}
          </div>
          <Separator />
        </>
      )}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={retry} />
      ) : (
        <>
          {count ? (
            children
          ) : (
            <EmptyState
              title={copy.title}
              description={copy.description}
              icon={empty.icon}
            >
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
