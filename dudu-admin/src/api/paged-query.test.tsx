import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { AdminClient } from "./client";
import { AdminContext } from "./context";
import { usePagedQuery } from "./paged-query";
import type { Page } from "./types";

// 领域无关的查询夹具：结构对齐 CompanyQuery/LogQuery——分页字段之外只有可选筛选。
interface FixtureQuery {
  keyword?: string;
  state?: number;
  page: number;
  pageSize: number;
}
interface FixtureItem {
  id: string;
}

// 回显与请求解耦的固定应答：专供「page 以服务端回显为单一真相」断言。
const echo = (page: number, pageSize: number): Page<FixtureItem> => ({
  list: [{ id: `item-${page}` }],
  total: 7,
  page,
  pageSize,
});
// 恒等回显：回显值就是请求值，供与翻页不变量无关的用例使用。
const samePage = (filters: FixtureQuery): Page<FixtureItem> => ({
  list: [],
  total: 0,
  page: filters.page,
  pageSize: filters.pageSize,
});

function mount(
  load: (
    client: AdminClient,
    filters: FixtureQuery,
    signal: AbortSignal,
  ) => Promise<Page<FixtureItem>>,
  initial: FixtureQuery = { page: 1, pageSize: 20 },
) {
  // client 在挂载时创建一次：wrapper 重渲染不得更换绑定，否则会重启查询。
  const client = new AdminClient();
  return renderHook((filters: FixtureQuery) => usePagedQuery(load, filters), {
    initialProps: initial,
    wrapper: ({ children }: { children: ReactNode }) => (
      <AdminContext value={client}>{children}</AdminContext>
    ),
  });
}

// 依次记录查询条件入参，供请求体断言。
function requested(load: { mock: { calls: unknown[][] } }): FixtureQuery[] {
  return load.mock.calls.map(([, filters]) => filters as FixtureQuery);
}

it("usePagedQuery 只暴露翻页机制键：查询条件、三个写接口、回显分页与 filtered 派生", async () => {
  const load = vi.fn((_client: AdminClient, filters: FixtureQuery) =>
    Promise.resolve(samePage(filters)),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(Object.keys(result.current).sort()).toEqual([
    "error",
    "filtered",
    "filters",
    "list",
    "loading",
    "page",
    "pageSize",
    "refresh",
    "reset",
    "setFilter",
    "setPage",
    "total",
  ]);
});

it("setFilter 合并补丁并回第一页且保留 pageSize，setPage 保留筛选翻页", async () => {
  const load = vi.fn((_client: AdminClient, filters: FixtureQuery) =>
    Promise.resolve(samePage(filters)),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setPage(3);
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    result.current.setFilter({ keyword: "青禾" });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    result.current.setFilter({ state: 0 });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(requested(load)).toEqual([
    { page: 1, pageSize: 20 },
    { page: 3, pageSize: 20 },
    { page: 1, pageSize: 20, keyword: "青禾" },
    { page: 1, pageSize: 20, keyword: "青禾", state: 0 },
  ]);
});

it("reset 清空全部筛选回第一页，且保留当前 pageSize", async () => {
  const load = vi.fn((_client: AdminClient, filters: FixtureQuery) =>
    Promise.resolve(samePage(filters)),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setFilter({ keyword: "青禾", state: 0 });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    result.current.reset();
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(requested(load)).toEqual([
    { page: 1, pageSize: 20 },
    { page: 1, pageSize: 20, keyword: "青禾", state: 0 },
    { page: 1, pageSize: 20 },
  ]);
  expect(result.current.filters).toEqual({ page: 1, pageSize: 20 });
});

// 「任一命名筛选已应用」的派生语义：undefined 与空串视为未应用，
// 0 是合法筛选值（如「已停用」）必须判 true；分页字段不参与判定。
it("filtered 派生：初始未筛选 false，应用命名筛选 true，reset 后 false", async () => {
  const load = vi.fn((_client: AdminClient, filters: FixtureQuery) =>
    Promise.resolve(samePage(filters)),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  // 初始未筛选：false。
  expect(result.current.filtered).toBe(false);

  // 空串关键词不视为已应用。
  await act(async () => {
    result.current.setFilter({ keyword: "" });
  });
  expect(result.current.filtered).toBe(false);

  // 非空关键词已应用：true。
  await act(async () => {
    result.current.setFilter({ keyword: "青禾" });
  });
  expect(result.current.filtered).toBe(true);

  // 0 是合法筛选值：保持 true。
  await act(async () => {
    result.current.setFilter({ keyword: "", state: 0 });
  });
  expect(result.current.filtered).toBe(true);

  // reset 清空全部筛选：false。
  await act(async () => {
    result.current.reset();
  });
  expect(result.current.filtered).toBe(false);
});

it("page/pageSize 只暴露服务端回显这一份真相，加载中回退请求值", async () => {
  const rounds: ((value: Page<FixtureItem>) => void)[] = [];
  const load = vi.fn(
    (_client: AdminClient, _filters: FixtureQuery) =>
      new Promise<Page<FixtureItem>>((resolve) => {
        rounds.push(resolve);
      }),
  );
  const { result } = mount(load);

  // 首轮在途：回退请求值，list 不冒充数据。
  expect(result.current.loading).toBe(true);
  expect(result.current.page).toBe(1);
  expect(result.current.pageSize).toBe(20);
  expect(result.current.list).toEqual([]);

  // 服务端回显覆盖请求值。
  await act(async () => rounds[0](echo(11, 25)));
  expect(result.current.page).toBe(11);
  expect(result.current.pageSize).toBe(25);
  expect(result.current.total).toBe(7);
  expect(result.current.list).toEqual([{ id: "item-11" }]);

  // 翻页后新一轮在途：回退请求值，不沿用上一轮回显。
  await act(async () => {
    result.current.setPage(3);
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.page).toBe(3);
  await act(async () => rounds[1](echo(13, 25)));
  expect(result.current.page).toBe(13);
});

it("加载失败时回退请求值，失败不冒充数据", async () => {
  const rounds: ((value: Page<FixtureItem>) => void)[] = [];
  const failures: ((reason: unknown) => void)[] = [];
  const load = vi.fn(
    (_client: AdminClient, _filters: FixtureQuery) =>
      new Promise<Page<FixtureItem>>((resolve, reject) => {
        rounds.push(resolve);
        failures.push(reject);
      }),
  );
  const { result } = mount(load);

  await act(async () => rounds[0](echo(11, 25)));
  expect(result.current.page).toBe(11);

  await act(async () => {
    result.current.refresh();
  });
  await act(async () => failures[1](new Error("网络失败")));
  expect(result.current.error).toBe("网络失败");
  expect(result.current.page).toBe(1);
  expect(result.current.list).toEqual([]);
  expect(result.current.total).toBe(0);
});

// initialFilters 只在挂载读取：props 更新不得覆盖已应用的筛选，
// 只有重新挂载（如 App 对列表页的 key remount）才应用新的初始筛选。
it("initialFilters 只在挂载生效，重挂载才应用新的初始筛选", async () => {
  const load = vi.fn((_client: AdminClient, filters: FixtureQuery) =>
    Promise.resolve(samePage(filters)),
  );
  const first = mount(load, { keyword: "青禾", page: 1, pageSize: 20 });
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  first.rerender({ keyword: "新条件", page: 1, pageSize: 20 });
  await act(async () => {});
  expect(first.result.current.filters.keyword).toBe("青禾");
  expect(requested(load)).toEqual([{ page: 1, pageSize: 20, keyword: "青禾" }]);
  first.unmount();

  const second = mount(load, { keyword: "新条件", page: 1, pageSize: 20 });
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.filters.keyword).toBe("新条件");
  expect(requested(load)).toEqual([
    { page: 1, pageSize: 20, keyword: "青禾" },
    { page: 1, pageSize: 20, keyword: "新条件" },
  ]);
});
