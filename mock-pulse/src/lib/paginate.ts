/**
 * 列表分页的单一实现（events / scenarios / plans / runs 四域共用）：
 * 页码收敛到 [1, pages]；空列表为第 1 页。页大小固定 PAGE_SIZE。
 */

export const PAGE_SIZE = 10;

export type Page<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
};

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number = PAGE_SIZE,
): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.max(1, Math.min(page, pages));
  return {
    items: items.slice((clamped - 1) * pageSize, clamped * pageSize),
    page: clamped,
    pages,
    total: items.length,
  };
}
