// 仅用于浏览器布局验收的隔离 HTTP 固定响应，不参与 Admin 开发启动或生产构建。
// node docs/design/dudu-admin/browser-check-server.mjs
import { createServer } from "node:http";

const user = { userId: "42", username: "operator", name: "平台运营", role: "platform_admin" };
const company = { companyId: "123456", companyName: "青禾科技", contactName: "林先生", contactInfo: "support@example.com", remark: "优先联系负责人", status: "enabled", disableReason: null, createTime: "2026-09-28T08:00:00.000Z", updateTime: "2026-09-29T09:00:00.000Z" };
const companies = [company, { ...company, companyId: "823419", companyName: "远山文化", contactName: null, contactInfo: null, remark: null }, { ...company, companyId: "467210", companyName: "云间书店", status: "disabled", disableReason: "企业申请暂停", remark: null }];
const initialAdmin = { userId: "9007199254740993", username: "admin", name: "企业管理员", status: "enabled", createTime: company.createTime };

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5175");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, "http://127.0.0.1:9180");
  const ok = (data) => response.end(JSON.stringify({ code: 0, msg: "成功", data }));
  if (url.pathname.endsWith("/auth/login")) { ok({ token: "browser-check-token", exp: 2000000000, user }); return; }
  if (url.pathname.endsWith("/auth/logout")) { ok(null); return; }
  if (request.method !== "GET") { response.end(JSON.stringify({ code: 13200, msg: "验收服务不执行写操作", data: null })); return; }
  if (url.pathname.endsWith("/account")) { ok(user); return; }
  if (url.pathname.endsWith("/overview")) { ok({ totalCompanies: 3, enabledCompanies: 2, disabledCompanies: 1, recentCreatedCount: 3, recentCompanies: companies }); return; }
  if (url.pathname.endsWith("/companies")) {
    const keyword = url.searchParams.get("keyword") || "";
    const status = url.searchParams.get("status");
    const list = companies.filter((item) => (!keyword || item.companyName.includes(keyword) || item.companyId === keyword) && (!status || item.status === status));
    ok({ list, total: list.length, page: 1, pageSize: 20 }); return;
  }
  if (url.pathname.endsWith("/resource-summary")) { ok({ companyId: url.pathname.split("/")[4], employeeCount: 12, enabledEmployeeCount: 10, groupCount: 3, channelAccountCount: 4 }); return; }
  if (url.pathname.endsWith("/operation-logs")) { ok({ list: [{ operationLogId: "31", operatorUserId: "42", companyId: company.companyId, action: "company.create", targetType: "company", targetId: company.companyId, result: "success", summary: "创建企业及初始管理员", createTime: company.createTime }], total: 1, page: 1, pageSize: 20 }); return; }
  const found = companies.find((item) => url.pathname.endsWith(`/${item.companyId}`));
  if (found) { ok({ company: found, initialAdmin }); return; }
  response.writeHead(404); response.end(JSON.stringify({ code: 13100, msg: "不存在", data: null }));
});
server.listen(9180, "127.0.0.1", () => process.stdout.write("Isolated browser check HTTP responses: http://127.0.0.1:9180\n"));
