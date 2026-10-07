import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import {
  authenticatedSession,
  company,
  deferred,
  detail,
  failure,
  installHttp,
  page,
  success,
} from "@/test/http";

afterEach(() => vi.unstubAllGlobals());
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

it("取消创建后恢复到创建入口的键盘焦点", async () => {
  installHttp(() => success(page()));
  authenticatedSession();
  render(<App />);
  const trigger = await screen.findByRole("button", { name: "创建企业" });
  trigger.focus();
  fireEvent.click(trigger);
  await screen.findByRole("dialog", { name: "创建企业" });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("创建冲突保留资料并要求重新检测，成功后打开相同企业的详情", async () => {
  let conflict = true;
  const request = installHttp((url, init) => {
    if (url.pathname.endsWith("/id_availability"))
      return success({
        companyId: url.searchParams.get("companyId"),
        available: true,
      });
    if (url.pathname === "/api/admin/companies" && init.method === "POST")
      return conflict
        ? failure(12300, "企业 ID 已被占用，请重新选择")
        : success(company);
    if (url.pathname === "/api/admin/companies/123456") return success(detail);
    return success(page());
  });
  authenticatedSession("#/companies?create=1");
  render(<App />);
  await screen.findByRole("dialog", { name: "创建企业" });
  fill("企业 ID", "123456");
  fill("企业名称", "青禾科技");
  fill("联系人", "林先生");
  fill("初始密码", "Password-123");
  expect(screen.getByRole("button", { name: "创建企业" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "检测" }));
  await screen.findByText("当前可用");
  fireEvent.click(screen.getByRole("button", { name: "创建企业" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建企业" })).toBeDisabled(),
  );
  expect(screen.getByLabelText("企业名称")).toHaveValue("青禾科技");
  expect(screen.getByLabelText("初始密码")).toHaveValue("Password-123");
  expect(screen.queryByText("当前可用")).not.toBeInTheDocument();
  conflict = false;
  fireEvent.click(screen.getByRole("button", { name: "检测" }));
  await screen.findByText("当前可用");
  fireEvent.click(screen.getByRole("button", { name: "创建企业" }));
  const opened = await screen.findByRole("dialog", { name: "企业详情" });
  expect(
    await within(opened).findByText("9007199254740993"),
  ).toBeInTheDocument();
  expect(within(opened).queryByText("Password-123")).not.toBeInTheDocument();
  const creation = request.mock.calls.find(
    ([url, init]) =>
      new URL(String(url)).pathname === "/api/admin/companies" &&
      init.method === "POST",
  );
  expect(JSON.parse(String(creation?.[1].body))).toEqual({
    companyId: "123456",
    companyName: "青禾科技",
    contactName: "林先生",
    contactInfo: null,
    remark: null,
    adminInit: { username: "admin", password: "Password-123", name: null },
  });
});

it("保存完整资料时空字段传 null，详情和列表刷新为新资料", async () => {
  let current = company;
  const request = installHttp((url, init) => {
    if (init.method === "PUT") {
      current = { ...company, ...JSON.parse(String(init.body)) };
      return success(current);
    }
    return url.pathname.endsWith("/123456")
      ? success({ ...detail, company: current })
      : success(page([current]));
  });
  authenticatedSession("#/companies?companyId=123456");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑资料" }));
  await screen.findByRole("dialog", { name: "编辑企业资料" });
  fill("企业名称", "青禾新名称");
  fill("联系人", "");
  fill("备注", "");
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  const opened = await screen.findByRole("dialog", { name: "企业详情" });
  expect(
    await within(opened).findByRole("heading", { name: "青禾新名称" }),
  ).toBeInTheDocument();
  const update = request.mock.calls.find(([, init]) => init.method === "PUT");
  expect(JSON.parse(String(update?.[1].body))).toEqual({
    companyName: "青禾新名称",
    contactName: null,
    contactInfo: "support@example.com",
    remark: null,
  });
  fireEvent.click(within(opened).getByRole("button", { name: "关闭" }));
  expect(
    await screen.findByRole("button", { name: "青禾新名称" }),
  ).toBeInTheDocument();
});

it("搜索和分页传递冻结的查询字段，迟到搜索不覆盖新结果", async () => {
  const old = deferred<Response>();
  const request = installHttp((_url, init) => {
    const query = JSON.parse(String(init.body ?? "{}"));
    if (query.keyword === "旧查询") return old.promise;
    if (query.keyword === "新查询")
      return success(page([{ ...company, companyName: "新查询企业" }]));
    return success({ ...page(), total: 21 });
  });
  authenticatedSession();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([, init]) => JSON.parse(String(init.body ?? "{}")).page === 2,
      ),
    ).toBe(true),
  );
  fill("搜索企业", "旧查询");
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([, init]) =>
          JSON.parse(String(init.body ?? "{}")).keyword === "旧查询",
      ),
    ).toBe(true),
  );
  fill("搜索企业", "新查询");
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(
    await screen.findByRole("button", { name: "新查询企业" }),
  ).toBeInTheDocument();
  await act(async () =>
    old.resolve(success(page([{ ...company, companyName: "旧结果" }]))),
  );
  expect(
    screen.queryByRole("button", { name: "旧结果" }),
  ).not.toBeInTheDocument();
  const latest = request.mock.calls.slice(-1)[0];
  expect(latest?.[1].method).toBe("POST");
  expect(JSON.parse(String(latest?.[1].body))).toMatchObject({
    page: 1,
    pageSize: 20,
  });
});

it("列表失败不冒充空数据，重试为空时才显示开通入口", async () => {
  let failing = true;
  installHttp(() =>
    failing ? new Response("", { status: 503 }) : success(page([])),
  );
  authenticatedSession();
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时不可用");
  expect(screen.queryByText("暂无企业")).not.toBeInTheDocument();
  failing = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("暂无企业")).toBeInTheDocument();
});

it("重置清空搜索草稿并回到全量查询，无需 remount key", async () => {
  const request = installHttp(() => success(page()));
  authenticatedSession();
  render(<App />);
  await screen.findByRole("button", { name: company.companyName });
  const queryBodies = () =>
    request.mock.calls
      .filter(([url]) => String(url).includes("/admin/companies/query"))
      .map(([, init]) => JSON.parse(String(init?.body)));

  fill("搜索企业", "青禾");
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await waitFor(() => expect(queryBodies()).toHaveLength(2));
  expect(screen.getByLabelText("搜索企业")).toHaveValue("青禾");

  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(screen.getByLabelText("搜索企业")).toHaveValue("");
  await waitFor(() => expect(queryBodies()).toHaveLength(3));
  expect(queryBodies()[2]).toEqual({ page: 1, pageSize: 20 });
  expect(
    screen.queryByRole("button", { name: "重置" }),
  ).not.toBeInTheDocument();
});
