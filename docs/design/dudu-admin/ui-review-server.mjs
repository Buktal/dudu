// 2026-10-08：仅供 DuduAdmin 界面验收的固定响应，不连接数据库，也不参与正式构建。
// 仓库根运行：node docs/design/dudu-admin/ui-review-server.mjs
// http://127.0.0.1:5175/；任意登录名/密码；?scenario=empty 或 ?scenario=error 验证空态/失败态。
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = fileURLToPath(new URL("../../../dudu-admin/", import.meta.url));
const requireFromAdmin = createRequire(new URL("../../../dudu-admin/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(requireFromAdmin.resolve("vite")));
const user = { userId: "9007199254740993", username: "operator", name: "平台运营", role: "admin" };
const names = [
  "青禾科技", "远山文化", "云间书店", "森屿生活", "知行教育", "拾光家居",
  "海岸零售", "轻舟软件", "南山文创", "新芽传媒", "白鹭商贸", "麦田设计",
  "朝阳数码", "云朵服饰", "橡木工坊", "山海旅行", "风铃食品", "北辰物流",
  "长青园艺", "蓝湾运动", "安和服务", "溪谷科技", "时雨咖啡",
  "星河跨境电商客户服务有限公司（华东运营中心）",
];
const companies = names.map((companyName, index) => ({
  companyId: ["123456", "823419", "467210"][index] ?? String(500000 + index * 997),
  companyName,
  contactName: index % 4 === 2 ? null : ["林先生", "陈女士", "周先生"][index % 3],
  contactInfo: index % 4 === 2 ? null : `support-${index + 1}@example.com`,
  remark: index === 0 ? "电商与售后服务，优先联系负责人" : index === 1 ? "内容咨询与活动接待" : null,
  status: index % 5 === 2 ? 0 : 1,
  disableReason: index % 5 === 2 ? "企业申请暂停服务" : null,
  createTime: `2026-10-${String(8 - Math.floor(index / 4)).padStart(2, "0")} 09:30:00`,
  updateTime: "2026-10-08 10:15:00",
}));
const actions = ["company.create", "company.update", "company.disable", "company.enable", "admin.password_reset", "admin.password_change"];
const summaries = ["创建企业并开通初始管理员账号", "更新企业联系人与备注", "企业申请暂停服务", "恢复企业使用", "重置初始企业管理员密码", "修改平台管理员登录密码"];
const logs = Array.from({ length: 24 }, (_, index) => {
  const action = index % actions.length;
  const company = companies[index % companies.length];
  return {
    operationLogId: String(1000 + index),
    operatorUserId: user.userId,
    companyId: action === 5 ? null : company.companyId,
    action: actions[action],
    target: action >= 4 ? "user" : "company",
    targetId: action >= 4 ? String(9007199254740900n + BigInt(index)) : company.companyId,
    summary: summaries[action],
    createTime: `2026-10-08 ${String(14 - Math.floor(index / 6)).padStart(2, "0")}:${String(55 - (index % 6) * 7).padStart(2, "0")}:00`,
  };
});

const server = await createServer({
  root: appRoot,
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
  plugins: [{
    name: "dudu-ui-review-fixtures",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1:5175");
        if (!url.pathname.startsWith("/api/")) return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        const send = (payload) => response.end(JSON.stringify(payload));
        const ok = (data) => send({ code: 0, msg: "成功", data });
        const fail = (msg) => send({ code: 13000, msg, data: null });
        const scenario = new URL(request.headers.referer ?? "http://127.0.0.1:5175").searchParams.get("scenario");
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        const page = (list) => {
          const total = list.length;
          const pageSize = body.pageSize ?? 20;
          const current = Math.min(body.page ?? 1, Math.max(1, Math.ceil(total / pageSize)));
          send({ code: 0, msg: "成功", list: list.slice((current - 1) * pageSize, current * pageSize), total, page: current, pageSize });
        };
        if (url.pathname === "/api/admin/login") return ok({ token: "isolated-ui-review", exp: 2000000000, user });
        if (url.pathname === "/api/admin/logout") return ok(null);
        if (url.pathname === "/api/admin/profile") return ok(user);
        if (scenario === "error") return fail("服务暂时不可用，请稍后重试");
        const visible = scenario === "empty" ? [] : companies;
        if (url.pathname === "/api/admin/companies/query") {
          return page(visible.filter((item) => (!body.keyword || item.companyName.includes(body.keyword) || item.companyId.includes(body.keyword)) && (body.status === undefined || item.status === body.status)));
        }
        if (url.pathname === "/api/admin/operation_logs/query") {
          return page((scenario === "empty" ? [] : logs).filter((item) => (!body.companyId || item.companyId === body.companyId) && (!body.action || item.action === body.action)));
        }
        if (url.pathname === "/api/admin/overview") {
          return ok({ companyCount: visible.length, companyEnabledCount: visible.filter((item) => item.status === 1).length, companyDisabledCount: visible.filter((item) => item.status === 0).length, companyCreatedLast7DaysCount: visible.length, recentCompanies: visible.slice(0, 5) });
        }
        if (url.pathname === "/api/admin/companies/id_candidates") return ok({ companyId: "765432" });
        if (url.pathname === "/api/admin/companies/id_availability") {
          const companyId = url.searchParams.get("companyId");
          return ok({ companyId, available: !companies.some((item) => item.companyId === companyId) });
        }
        const match = url.pathname.match(/^\/api\/admin\/companies\/(\d{6})(\/resource_summary)?$/);
        if (request.method === "GET" && match) {
          const company = companies.find((item) => item.companyId === match[1]);
          if (!company) return fail("企业不存在");
          const index = companies.indexOf(company);
          if (match[2]) return ok({ companyId: company.companyId, userCount: 12 + index * 3, userEnabledCount: 10 + index * 2, userGroupCount: 3 + index % 4, companyChannelCount: 4 + index % 3 });
          return ok({ company, adminInit: { userId: "9007199254740988", username: "admin", name: "企业管理员", status: 1, createTime: company.createTime } });
        }
        return fail("界面验收服务不执行写操作");
      });
    },
  }],
});
await server.listen();
server.printUrls();
