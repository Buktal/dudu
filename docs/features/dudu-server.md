# DUDU Server 功能图谱

子项目入口：[dudu-server/README.md](../../dudu-server/README.md)。2026-10-07 完成 Java 审查改造与 Admin 契约联动；2026-10-12 按 [Desk 企业认证子契约](../design/dudu-desk/ticket-01-login.md)实现企业登录、身份恢复与退出，并按[最小对接契约](../design/dudu-desk/implementation-contract.md)建立访客三表与授权范围内的摘要查询；企业侧管理接口（Console）及角色权限等级仍未实施。

| 模块 | 入口 | 行为与限制 |
| --- | --- | --- |
| 基础请求响应 | `dudu-server/src/main/java/com/dudu/duduserver/common/` | R 为 code/msg/data；P 平铺 code/msg/list/total/page/pageSize；PageQuery 统一默认 1/20、上限 100、末页钳位和单次计数；Save/Query 为校验组 |
| 异常处理 | `dudu-server/src/main/java/com/dudu/duduserver/config/exception/` | HTTP 恒 200；BizException 与参数错误转换为业务码；请求体解析日志不记录原始输入，未知异常留服务端堆栈 |
| JWT | `dudu-server/src/main/java/com/dudu/duduserver/config/auth/JwtManager.java` | HS256；强类型 JwtUser 与小写角色代码；默认 7 天；直接序列化载荷，检查验签、身份与到期 |
| 认证链 | `WebConfig`、`AuthInterceptor`、`AdminAuthInterceptor`、`DeskAuthInterceptor`、`MeResolver` | `/api/**` 默认认证，公开路径仅平台与企业两个登录端点；Admin 仅 admin 角色，Desk 仅企业员工（console/user，平台身份 10106）；无共享身份上下文，参数解析独立验签 |
| 跨域 | 无服务端 CORS（DevCorsConfig 已移除） | 开发由 dudu-admin Vite 代理同源转发 `/api`；生产同源部署或网关加 CORS 头；实际请求仍认证 |
| 登录与退出 | `POST /api/admin/login`、`POST /api/admin/logout` | 登录签发 token；退出仅由前端清理本地 token，按用户最新要求取消服务端撤销表，旧 token 仍有效至到期 |
| 企业登录与接待范围 | `controller/desk/`、`DeskAuthService`、`DeskAccessService` | 企业 ID + 登录名 + 密码签发含企业归属的 JWT，返回员工、企业与接待范围（allGroups/groups/accounts，按持久数据实时查询，不写进 token）；凭据错误、不存在、停用、角色不符统一 10104，身份失效 10102；初始管理员为本企业全部组，其他员工按成员关系，无外键的脏组/账号关联不放行；不返回渠道凭据 |
| 访客查询 | `DeskVisitorService`、`controller/desk/DeskVisitorController` | `POST /api/desk/visitors/query` 先按授权账号范围筛选持久访客再做普通分页，返回 items/total/page/pageSize/counts/channels；`GET /api/desk/visitors/{visitorId}` 返回单访客当前快照。排序（wait：待回复优先、waiting_since 升序、最后消息时间降序、访客 ID 升序；messages：消息数降序）与计数（全部授权范围四态，不受筛选影响）由数据库直接查询；搜索以 LIKE/JSON 参数绑定匹配姓名、外部用户 ID、账号名、渠道名、最后摘要与共享标签/备注；渠道筛选值只在授权账号内收窄，越权 ID 10106、不存在 12100、参数 11000/11200；回复能力在发送接入前如实为 restricted |
| 平台 API | `dudu-server/src/main/java/com/dudu/duduserver/controller/admin/` | AdminController 包含登录、退出、profile、profile/password、overview；CompanyController 提供企业资源操作；OperationLogController 查询已完成操作 |
| 企业 | `CompanyService`、`CompanyIdPolicy` | 六位显式主键；创建企业和初始管理员原子提交；停用恢复按原状态条件更新，重复操作报错；选填字段支持 null 清空 |
| 用户组 | `UserGroupService`、`UserGroupMemberService` | 用户与组多对多；复合外键防跨企业；仅所属企业 initUserId 对应用户自动拥有全部组，其他用户含普通管理员按成员关系授权 |
| 企业渠道账号 | `CompanyChannelService` | 每条记录为具体渠道账号，同企业同渠道可有多个；一个账号归一个用户组；ChannelEnum 表达平台，channelInfo JSON 保存渠道信息 |
| 操作记录 | `OperationLogService` | 仅记录已完成操作，与业务共同提交；无 result 字段或失败筛选；动作枚举直接携带目标类型，禁止调用方错配 |
| 数据类型 | `constant/`、`entity/`、`dto/`、`vo/` | role/status/action/target/channel 为枚举；MP 与 JSON 使用业务 code，列表查询统一 POST + JSON；HTTP ID 继续字符串；VO 用 Hutool 拷贝公开字段，不含密码和 token |
| 统计 | `OverviewService` | AdminOverviewVO 与 CompanyResourceSummaryVO；companyCount/companyEnabledCount/companyDisabledCount/companyCreatedLast7DaysCount/recentCompanies；userCount/userEnabledCount/userGroupCount/companyChannelCount |
| 初始化 | `AdminInitializer` | 无平台账号时创建 Admin/admin；已有账号不重置；用户哈希排除 toString 输出 |
| 持久化 | `dudu-server/src/main/resources/db/migration/` | 保留 V1，V2 改名组和渠道表、迁移外部标识到 JSON、删除日志 result、新增成员表，V3 移除全部外键，V4 一次建立 visitor/visitor_profile/message 三表（外部身份与外部消息标识用二进制排序规则、DATETIME(3)、无外键）；恢复实体时间自动填充 |

## 验证

普通 Server 测试与编译打包通过；MySQL 8.4.11 独立库集成验收见 `ServerIntegrationTest`、`DeskIntegrationTest`、`DeskVisitorIntegrationTest` 与 `DeskMigrationIntegrationTest`，覆盖空库、V1/V3 升级及重复迁移、时间填充、枚举和 JSON 往返、登录与无状态退出、企业成员隔离及并发停用、企业登录的跨企业同名账号、初始管理员全组（含新建组）、成员组与账号、无外键脏关联剔除、停用与平台身份（10106）、令牌错误码与伪造归属拒绝，以及访客摘要查询的授权范围与跨企业隔离（越权 10106 / 不存在 12100）、wait/messages 排序全规则与并列访客 ID、计数不受筛选影响、渠道列表、分页边界与参数错误码、搜索各字段（含 JSON 标签与备注）、名片更新不改排序、空库 V4 迁移与 V3 升级保留既有数据。集成测试需显式设置 `DUDU_INTEGRATION_TEST=true`、`DUDU_TEST_JDBC_URL`（独立的 dudu_review 数据库）、`DUDU_TEST_DB_PASSWORD`，会创建 dudu_review_upgrade 与 dudu_review_v3v4，禁止指向业务库。

原有开发 MySQL 容器在本轮 unhealthy 且凭据验证失败，因此验收使用独立临时容器，不修改既有开发库或密码。开发库 `dudu` 当前已应用 V1–V3；V4 三表迁移在下次应用启动时由 Flyway 自动补齐（本轮未在开发库执行）。
