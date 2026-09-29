# DuduAdmin 前端实现与接口交接

2026-09-30。来源：[Spec #68](https://github.com/Buktal/dudu/issues/68)、实施票 #69–#77、`docs/prototype/dudu-admin/` 与本次用户确认。实现位于 `dudu-admin/`；原型、Server 及仓库中其他在途修改不属于本次前端提交。

## 本次确认与设计取舍

用户确认：新密码为 8–72 字符、停用原因必填、重置明确关联的初始企业管理员、自身改密成功后前端重新登录、概览统计近 7 天、企业名称允许重复。管理员登录名沿用当前 DTO 的 2–64 字符；显示名称选填。服务端仍负责最终校验、授权与持久化。

视觉延续原型，使用珊瑚橙 `#F2785C` 标志、深橙 `#C74E32` 操作色、浅灰 `#F8FAFC` 背景、白色卡片、深灰蓝 `#192633` 正文、`#E1E7EF` 分隔线。深橙提高按钮及文字对比度。中文标题/正文使用系统中文字体搭配已有 Inter Variable；企业与员工 ID 使用等宽字体。标志保留 D 形对话气泡，主要操作保持安静、紧凑。

```text
桌面：导航 240px | 顶栏：当前位置、开发环境下拉、退出
                | 标题与操作
                | 搜索/筛选
                | 表格与分页 → 企业详情/创建抽屉
移动：顶部导航按钮 → 导航抽屉；单列内容与容器内横向表格
```

- 首页是企业管理；概览的“创建企业”直接打开创建表单，最近企业可进入详情。
- 环境切换为下拉选择。本地地址编辑只提供一个地址输入框，无探测面板、多步骤切换或模拟环境。
- 去除运行状态伪造、Demo 入口、预填演示凭据、产品架构卡片、开发阶段说明，以及“密码仅传输哈希”等不真实提示。
- 资源汇总按当前分页企业逐项请求；失败显示在对应行，不把当前页累加当作全平台统计。详情提供带企业 ID 的资源入口。
- 自身改密和重置均不展示或保存新密码。当前退出接口仅确认身份，前端不声称服务端已撤销所有令牌；退出请求失败也清除本机身份并说明结果。
- UI 由已安装的 shadcn/Base UI 生成与组合，未新增依赖。关闭按钮作中文本地化，重生成 Dialog/Sheet 时须保留；布局通过调用处明确的 side 变体控制。

## 当前 HTTP 对接契约

源地址由环境模块选定，请求层追加 `/api`；除登录外使用 `Authorization: Bearer <token>`。统一响应 `{ code, msg, data }`，`code=0` 为成功；空成功数据为 `null`。响应数据在单一 HTTP 边界校验，不增加字段改名层。ID 为字符串；时间为带 `Z` 的 ISO 8601 UTC 字符串，展示采用浏览器本地时区。

| 方法与路径（含 /api） | 请求或查询 | 成功 data |
| --- | --- | --- |
| POST `/api/admin/auth/login` | username、password | token、exp（秒）、user |
| POST `/api/admin/auth/logout` | 无业务入参 | null |
| GET `/api/admin/account` | 无 | userId、username、name、role |
| PUT `/api/admin/account/password` | oldPassword、newPassword | null |
| GET `/api/admin/companies` | keyword、status、page、pageSize | list、total、page、pageSize |
| GET `/api/admin/companies/{companyId}` | 路径中的企业 ID | company、initialAdmin（可为 null） |
| POST `/api/admin/companies/id-candidates` | 无 | companyId |
| GET `/api/admin/companies/id-availability` | companyId | companyId、available |
| POST `/api/admin/companies` | companyId、企业资料、initialAdmin | Company |
| PUT `/api/admin/companies/{companyId}` | 完整企业资料 | Company |
| POST `/api/admin/companies/{companyId}/disable` | disableReason | null |
| POST `/api/admin/companies/{companyId}/enable` | 无 | null |
| POST `/api/admin/companies/{companyId}/admin-password-reset` | newPassword | null |
| GET `/api/admin/companies/{companyId}/resource-summary` | 无 | companyId、employeeCount、enabledEmployeeCount、groupCount、channelAccountCount |
| GET `/api/admin/overview` | 无 | totalCompanies、enabledCompanies、disabledCompanies、recentCreatedCount、recentCompanies |
| GET `/api/admin/operation-logs` | companyId、action、result、page、pageSize | list、total、page、pageSize |

公司资料字段：companyName（必填，100）、contactName（100）、contactInfo（200）、remark（1000）。括号内为最大长度。选填未填或清空提交 null。初始管理员传 username、password、name（可空，100）。企业 ID 限 100000–999999，创建后只读。

分页采用 page=1、pageSize=20；排序由现有服务端负责。状态为 enabled/disabled，结果为 success/failure。操作码采用 company.create、company.update、company.disable、company.enable、admin.password_reset、account.password_change。

10100–10103 与 10106 会清除已认证会话；登录失败 10104 留在登录页；创建冲突 13300 清除 ID 可用状态并保留表单；原密码错误 13310 保留改密表单。网关、网络、超时、非法响应独立显示，不当作空列表或零统计。

## 状态与异步行为

- 令牌只在标签页 sessionStorage 中存储，绑定源地址；恢复时通过账号接口重新验证平台身份。
- 环境切换、退出或认证失效会取消请求、清除令牌、页面数据及企业定位。每次请求捕获身份代次；即使传输忽略取消，迟到响应也不能写回。
- 查询筛选、分页和对象变化会清除当前显示并取消旧请求，避免新条件下展示旧列表。
- 企业 ID 修改或重新生成会撤销旧可用结果；生成/检测响应必须属于当前请求。检测不等于预留，创建冲突后须重新检测。
- 维护成功后重新读取列表和详情；失败、取消不更改展示的企业状态。提交期间锁定按钮。

## 验证与复现

常规检查在 `dudu-admin/` 执行：`yarn check:all`、`yarn build`。测试使用 Vitest/Testing Library，覆盖登录及错误、身份恢复和失效、退出失败、开发环境切换、生产地址固定、企业 ID 边界与竞态、创建冲突、资料同步、启停、管理员重置、自身改密、统计与查询失败。测试中的固定返回不会由应用入口导入。

浏览器布局检查使用独立固定 HTTP 响应服务：

```powershell
# 仓库根，独立终端；仅用于布局验收，不启动真实后端
node docs/design/dudu-admin/browser-check-server.mjs
# dudu-admin/，另一终端
yarn dev --host 127.0.0.1 --port 5175 --strictPort
```

开发环境下拉将本地地址临时设为 `http://127.0.0.1:9180`，输入测试值后检查页面。该服务只提供固定查询返回，拒绝业务写操作，不是产品的一部分。验收结束停止该服务，并将地址恢复为 `http://127.0.0.1:8080`。不得将此成功页面视为真实业务联调。

本轮实际检查（2026-09-30）：

- `yarn check:all` 通过：TypeScript、Biome 及 9 个测试文件的 34 项测试全部通过。最后一处操作对象文案调整后再次运行 `yarn lint`、`yarn build`，均通过。
- 生产构建成功：JavaScript 492.70 kB（gzip 157.37 kB），CSS 62.00 kB（gzip 11.67 kB）。构建产物未检出环境切换文案、Demo 标识或浏览器验证数据。
- 浏览器检查覆盖登录、环境下拉与本地地址、企业列表/创建/详情、概览、资源、日志、个人账号及移动导航。桌面 1366×900 的右侧抽屉宽 576px；移动 390×844 下页面无横向溢出，表格保留容器内滚动。关闭详情后焦点返回企业入口，创建取消的焦点行为也有回归测试。
- Standards 与 Spec 两轴审查完成；补审共同发现的日志将平台用户标为员工问题已修正为“用户”，无剩余可行动发现。文档相对链接、源文件 500 行上限及 `git diff --check` 均通过。
- 临时 HTTP 服务已停止，本地地址恢复为 `http://127.0.0.1:8080`，验证会话已清除。最终登录页截图见 [login-verification.png](login-verification.png)。

真实后端登录、数据库聚合、事务冲突与回滚、服务端权限和会话撤销、生产域名/CORS/部署仍需在对应环境验收。浏览器固定响应仅验证布局与前端交互，业务写操作的成功/失败路径由 HTTP 边界测试验证。
