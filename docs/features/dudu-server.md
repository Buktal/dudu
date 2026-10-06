# DUDU Server 功能图谱

子项目入口：[dudu-server/README.md](../../dudu-server/README.md)。2026-10-07 完成 Java 审查改造与 Admin 契约联动；企业侧管理接口及角色权限等级仍未实施。

| 模块 | 入口 | 行为与限制 |
| --- | --- | --- |
| 基础请求响应 | `dudu-server/src/main/java/com/dudu/duduserver/common/` | R 为 code/msg/data；P 平铺 code/msg/list/total/page/pageSize；PageQuery 统一默认 1/20、上限 100、末页钳位和单次计数；Save/Query 为校验组 |
| 异常处理 | `dudu-server/src/main/java/com/dudu/duduserver/config/exception/` | HTTP 恒 200；BizException 与参数错误转换为业务码；请求体解析日志不记录原始输入，未知异常留服务端堆栈 |
| JWT | `dudu-server/src/main/java/com/dudu/duduserver/config/auth/JwtManager.java` | HS256；强类型 JwtUser 与小写角色代码；默认 7 天；直接序列化载荷，检查验签、身份与到期 |
| 认证链 | `WebConfig`、`AuthInterceptor`、`AdminAuthInterceptor`、`MeResolver` | `/api/**` 默认认证，仅登录路径公开；Admin 仅 admin 角色；无共享身份上下文，参数解析独立验签 |
| CORS | `dudu-server/src/main/java/com/dudu/duduserver/config/DevCorsConfig.java` | CorsFilter 在 MVC 前统一处理预检；dev 允许调试跨域，其他环境同源部署；实际请求仍认证 |
| 登录与退出 | `POST /api/admin/login`、`POST /api/admin/logout` | 登录签发 token；退出仅由前端清理本地 token，按用户最新要求取消服务端撤销表，旧 token 仍有效至到期 |
| 平台 API | `dudu-server/src/main/java/com/dudu/duduserver/controller/admin/` | AdminController 包含登录、退出、profile、profile/password、overview；CompanyController 提供企业资源操作；OperationLogController 查询已完成操作 |
| 企业 | `CompanyService`、`CompanyIdPolicy` | 六位显式主键；创建企业和初始管理员原子提交；停用恢复按原状态条件更新，重复操作报错；选填字段支持 null 清空 |
| 用户组 | `UserGroupService`、`UserGroupMemberService` | 用户与组多对多；复合外键防跨企业；仅所属企业 initUserId 对应用户自动拥有全部组，其他用户含普通管理员按成员关系授权 |
| 企业渠道账号 | `CompanyChannelService` | 每条记录为具体渠道账号，同企业同渠道可有多个；一个账号归一个用户组；ChannelEnum 表达平台，channelInfo JSON 保存渠道信息 |
| 操作记录 | `OperationLogService` | 仅记录已完成操作，与业务共同提交；无 result 字段或失败筛选；动作枚举直接携带目标类型，禁止调用方错配 |
| 数据类型 | `constant/`、`entity/`、`dto/`、`vo/` | role/status/action/target/channel 为枚举；MP 与 JSON 使用业务 code，列表查询统一 POST + JSON；HTTP ID 继续字符串；VO 用 Hutool 拷贝公开字段，不含密码和 token |
| 统计 | `OverviewService` | AdminOverviewVO 与 CompanyResourceSummaryVO；companyCount/companyEnabledCount/companyDisabledCount/companyCreatedLast7DaysCount/recentCompanies；userCount/userEnabledCount/userGroupCount/companyChannelCount |
| 初始化 | `AdminInitializer` | 无平台账号时创建 Admin/admin；已有账号不重置；用户哈希排除 toString 输出 |
| 持久化 | `dudu-server/src/main/resources/db/migration/` | 保留 V1，V2 改名组和渠道表、迁移外部标识到 JSON、删除日志 result、新增成员表；恢复实体时间自动填充 |

## 验证

普通 Server 测试与编译打包通过；MySQL 8.4.11 独立库集成验收见 `ServerIntegrationTest`，覆盖空库、V1 升级及重复迁移、时间填充、枚举和 JSON 往返、登录与无状态退出、CORS、企业成员隔离及并发停用。集成测试需显式设置 `DUDU_INTEGRATION_TEST=true`、`DUDU_TEST_JDBC_URL`（独立的 dudu_review 数据库）、`DUDU_TEST_DB_PASSWORD`，会创建 dudu_review_upgrade，禁止指向业务库。

原有开发 MySQL 容器在本轮 unhealthy 且凭据验证失败，因此验收使用独立临时容器，不修改既有开发库或密码。V2 尚未部署到现有开发库。
