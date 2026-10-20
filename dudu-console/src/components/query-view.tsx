import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import { Pagination } from "./page-parts";
import { Separator } from "./ui/separator";

// 列表页骨架单点：加载、失败、空态、表格与分页的编排只在这里写一次。
// 页面把 usePagedQuery 的返回值整只直传 query 投影，骨架只消费这几个键：
// { list, total, page, pageSize, loading, error, refresh, setPage, filtered }；
// 结构化类型就地声明，不 import api/ 下任何模块（components/ 到 api/ 的 seam 单向）。
// 「失败不冒充空数据」由分支顺序保证：error 先于空态判定，失败时绝不渲染空态文案。
// 差异归页面：表格列与行渲染走 children 槽，空态动作按钮走 empty.action，
// 「有数据 / 已筛选」两份真相由 query.list.length 与 query.filtered 单点供给。
export function QueryView<T>({
  query,
  empty,
  filters,
  actions,
  children,
}: {
  query: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    loading: boolean;
    error: string | null;
    refresh: () => void;
    setPage: (page: number) => void;
    filtered: boolean;
  };
  empty: {
    icon?: LucideIcon;
    filteredCopy: { title: string; description: string };
    defaultCopy: { title: string; description: string };
    action?: (filtered: boolean) => ReactNode;
  };
  filters?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const copy = query.filtered ? empty.filteredCopy : empty.defaultCopy;
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
      {query.loading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={query.error} retry={query.refresh} />
      ) : (
        <>
          {query.list.length ? (
            children
          ) : (
            <EmptyState
              title={copy.title}
              description={copy.description}
              icon={empty.icon}
            >
              {empty.action?.(query.filtered)}
            </EmptyState>
          )}
          <Pagination
            page={query.page}
            pageSize={query.pageSize}
            total={query.total}
            onChange={query.setPage}
          />
        </>
      )}
    </div>
  );
}
