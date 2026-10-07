import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { adminApi } from "@/api/admin-api";
import { AdminClient } from "@/api/client";
import { AdminContext } from "@/api/context";
import type { CompanyProfile } from "@/api/types";
import { company, detail, page, success } from "@/test/http";
import { useCompanies, useCompany, useCompanyCommands } from "./company-data";

afterEach(() => vi.unstubAllGlobals());

const profile: CompanyProfile = {
  companyName: "青禾新名称",
  contactName: null,
  contactInfo: null,
  remark: null,
};

function mount(client: AdminClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <AdminContext value={client}>{children}</AdminContext>;
  }
  function useHarness() {
    const companies = useCompanies({ page: 1, pageSize: 20 });
    const companyDetail = useCompany("123456");
    const commands = useCompanyCommands();
    return { companies, companyDetail, commands };
  }
  return renderHook(() => useHarness(), { wrapper: Wrapper });
}

function countRequests(
  request: { mock: { calls: unknown[][] } },
  path: string,
  method = "GET",
) {
  return request.mock.calls.filter(([url, init]) => {
    const requestInit = init as RequestInit | undefined;
    return (
      String(url).includes(path) && (requestInit?.method ?? "GET") === method
    );
  }).length;
}

// 依次记录企业列表查询（POST /admin/companies/query）的请求体，供不变量断言。
function queryBodies(request: { mock: { calls: unknown[][] } }) {
  return request.mock.calls
    .filter(([url]) => String(url).includes("/admin/companies/query"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

it("企业维护成功后，挂载中的列表与详情各自重读新资料", async () => {
  let current = company;
  const request = vi.fn((input: string | URL | Request, init: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success(page([current])));
    if ((init.method ?? "GET") === "PUT") {
      current = { ...current, ...JSON.parse(String(init.body)) };
      return Promise.resolve(success(current));
    }
    return Promise.resolve(success({ ...detail, company: current }));
  });
  vi.stubGlobal("fetch", request);
  const { result } = mount(new AdminClient());
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await waitFor(() => expect(result.current.companyDetail.loading).toBe(false));
  expect(result.current.companies.list[0].companyName).toBe("青禾科技");
  expect(result.current.companyDetail.detail?.company.companyName).toBe(
    "青禾科技",
  );

  await act(async () => {
    await result.current.commands.update(
      "123456",
      profile,
      new AbortController().signal,
    );
  });
  await waitFor(() =>
    expect(result.current.companies.list[0].companyName).toBe("青禾新名称"),
  );
  expect(result.current.companyDetail.detail?.company.companyName).toBe(
    "青禾新名称",
  );
  expect(countRequests(request, "/admin/companies/query", "POST")).toBe(2);
  expect(countRequests(request, "/admin/companies/123456")).toBe(2);
  expect(countRequests(request, "/admin/companies/123456", "PUT")).toBe(1);
});

it("已中止的企业维护不发送写请求，也不触发重读", async () => {
  const request = vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success(page()));
    return Promise.resolve(success(detail));
  });
  vi.stubGlobal("fetch", request);
  const { result } = mount(new AdminClient());
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await waitFor(() => expect(result.current.companyDetail.loading).toBe(false));
  const controller = new AbortController();
  controller.abort();
  await act(async () => {
    await result.current.commands
      .update("123456", profile, controller.signal)
      .catch(() => undefined);
  });
  expect(countRequests(request, "/admin/companies/123456", "PUT")).toBe(0);
  expect(countRequests(request, "/admin/companies/query", "POST")).toBe(1);
  expect(countRequests(request, "/admin/companies/123456")).toBe(1);
});

it("卸载后不再订阅失效，维护成功不触发重读", async () => {
  const request = vi.fn((input: string | URL | Request, init: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success(page()));
    if ((init.method ?? "GET") === "PUT")
      return Promise.resolve(success(company));
    return Promise.resolve(success(detail));
  });
  vi.stubGlobal("fetch", request);
  const client = new AdminClient();
  const { result, unmount } = mount(client);
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await waitFor(() => expect(result.current.companyDetail.loading).toBe(false));
  unmount();
  await act(async () => {
    await adminApi.update(
      client,
      "123456",
      profile,
      new AbortController().signal,
    );
  });
  expect(countRequests(request, "/admin/companies/123456", "PUT")).toBe(1);
  expect(countRequests(request, "/admin/companies/query", "POST")).toBe(1);
  expect(countRequests(request, "/admin/companies/123456")).toBe(1);
});

it("翻页与筛选的请求体由命名操作决定：筛选回第一页且保留 pageSize", async () => {
  const request = vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success(page()));
    return Promise.resolve(success(detail));
  });
  vi.stubGlobal("fetch", request);
  const { result } = mount(new AdminClient());
  await waitFor(() => expect(result.current.companies.loading).toBe(false));

  await act(async () => {
    result.current.companies.setPage(3);
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await act(async () => {
    result.current.companies.setKeyword("青禾");
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await act(async () => {
    result.current.companies.setStatus(0);
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));

  expect(queryBodies(request)).toEqual([
    { page: 1, pageSize: 20 },
    { page: 3, pageSize: 20 },
    { page: 1, pageSize: 20, keyword: "青禾" },
    { page: 1, pageSize: 20, keyword: "青禾", status: 0 },
  ]);
  expect(result.current.companies.page).toBe(1);
});

it("reset 清空全部筛选回到第一页，且保留当前 pageSize", async () => {
  const request = vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success(page()));
    return Promise.resolve(success(detail));
  });
  vi.stubGlobal("fetch", request);
  const { result } = mount(new AdminClient());
  await waitFor(() => expect(result.current.companies.loading).toBe(false));

  await act(async () => {
    result.current.companies.setKeyword("青禾");
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await act(async () => {
    result.current.companies.setStatus(0);
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  await act(async () => {
    result.current.companies.reset();
  });
  await waitFor(() => expect(result.current.companies.loading).toBe(false));

  expect(queryBodies(request)).toEqual([
    { page: 1, pageSize: 20 },
    { page: 1, pageSize: 20, keyword: "青禾" },
    { page: 1, pageSize: 20, keyword: "青禾", status: 0 },
    { page: 1, pageSize: 20 },
  ]);
  expect(result.current.companies.keyword).toBeUndefined();
  expect(result.current.companies.status).toBeUndefined();
});

it("page 以服务端回显为单一真相，与请求值解耦", async () => {
  const request = vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/admin/companies/query")
      return Promise.resolve(success({ ...page(), page: 4, pageSize: 50 }));
    return Promise.resolve(success(detail));
  });
  vi.stubGlobal("fetch", request);
  const { result } = mount(new AdminClient());

  await waitFor(() => expect(result.current.companies.loading).toBe(false));
  expect(result.current.companies.page).toBe(4);
  expect(result.current.companies.pageSize).toBe(50);
  expect(queryBodies(request)).toEqual([{ page: 1, pageSize: 20 }]);
});
