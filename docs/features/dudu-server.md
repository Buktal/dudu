# DUDU Server 功能图谱

子项目入口：[dudu-server/README.md](../../dudu-server/README.md)。已提供 DuduAdmin 首版全部后端接口；Console 与 Desk 的企业侧能力尚未实施。

| 模块 | 入口 | 行为与限制 |
| --- | --- | --- |
| 统一返回 | `dudu-server/src/main/java/com/dudu/duduserver/config/response/R.java` | 应用层以 HTTP 200 和 code/msg/data 表达结果；成功码为 0；分页响应用 P 平铺为 code/msg/list/total/page/pageSize，不嵌套 data |
| 业务异常 | `dudu-server/src/main/java/com/dudu/duduserver/config/exception/` | BizException 携带 ApiEnum；统一处理绑定、校验、请求体、参数缺失及类型错误；未知异常返回 10001 |
| 认证 | `dudu-server/src/main/java/com/dudu/duduserver/config/auth/` | 固定 HS256；载荷直接映射 JwtUser；校验签名、算法、userId 和 exp；默认环境必须配置密钥 |
| 当前用户注入 | `@Me JwtUser user` | MeResolver 直接读取 Authorization，无 request attribute 或 ThreadLocal；载荷字段定义在 JwtUser，未知字段忽略 |
| 接口保护 | `dudu-server/src/main/java/com/dudu/duduserver/config/WebConfig.java` | `/api/**` 默认全拦；`/api/admin/login` 为唯一放行路径；`/api/admin/**` 叠加 AdminGuardInterceptor，仅 `admin` 角色可访问，其余返回 10106 |
| Admin 接口 | `dudu-server/src/main/java/com/dudu/duduserver/controller/admin/` | 前缀 `/api/admin`，按前端模块划分控制器：平台管理员自身入口合并于 AdminController（登录/退出、资料/改密）、companies（企业 CRUD、ID 候选与检测、停用恢复、重置管理员密码、资源汇总）、overview（运营概览）、operation-logs（操作记录查询） |
| 企业领域 | `dudu-server/src/main/java/com/dudu/duduserver/service/` | 企业 ID 严格六位 100000–999999（CompanyIdPolicy），显式主键不自增、创建后固定；创建企业与初始管理员同事务，主键冲突唯一约束最终裁决并整体回滚；停用原因必填、恢复时清空；完整编辑 null 清空字段；近期开通为近 7 天 + 最近 10 家，概览与汇总实时聚合、不建统计表 |
| 操作记录 | `dudu-server/src/main/java/com/dudu/duduserver/service/OperationLogService.java` | 只追加成功操作（失败留痕待决策票 #64），summary 记录业务要点、不含密码；查询按企业、动作与结果过滤，时间倒序分页 |
| 数据访问 | `dudu-server/src/main/java/com/dudu/duduserver/{entity,mapper,service}/` | 全部经 MyBatis-Plus `IService` 与 Lambda 条件构造器表达，无 XML 或注解 SQL；登录名唯一性由函数唯一索引 `(COALESCE(company_id,0), username)` 保证，utf8mb4_0900_ai_ci 大小写不敏感，跨企业允许同名 |
| 业务迁移 | `dudu-server/src/main/resources/db/migration/V1__admin_core_tables.sql` | 首版五表：company、user、operation_log、reception_group、channel_account；企业显式主键、用户自增主键、操作记录只追加；`initial_admin_user_id` 为稳定定位候选列，待 #62 表结构收敛 |
| 时间约定 | `dudu-server/src/main/java/com/dudu/duduserver/config/{JacksonConfig,MyMetaObjectHandler}.java` | 全链路 UTC：JDBC 会话、自动填充与序列化一致，HTTP 输出 `uuuu-MM-dd HH:mm:ss`（到秒，无时区标记，前端按 UTC 解析）；Wrapper 显式 set 更新时手工写 updateTime |
| 平台管理员初始化 | `dudu-server/src/main/java/com/dudu/duduserver/config/AdminInitializer.java` | 启动时无平台账号则以内置凭据 Admin/Admin 创建（非生产凭据，首登后改密）；幂等可重复执行；不开放自注册 |
| 校验分组 | `dudu-server/src/main/java/com/dudu/duduserver/config/validate/` | Save、Query 继承 Default，保留公共约束并支持各自分组约束 |
| 本地数据库环境 | `dudu-server/compose.yaml`、`dudu-server/.env.example` | MySQL 8.4.11、仅本机端口、应用账号、命名卷和鉴权 SQL 健康检查；仅供开发，需可用的 Docker Linux 引擎 |

错误码保留既有分段：101xx 认证、11xxx 参数、12xxx 数据、13xxx 第三方；DuduDesk 按 101xx 识别认证失败。首版新增：10104 登录失败、10106 无权访问、12300 数据已存在、12310 原密码错误。

## 验证范围

108 项测试覆盖返回体、错误码、异常转换、认证拦截、完整载荷注入、JWT 畸形输入与算法限制、并发签发解析、校验分组、时间填充、UTC 序列化、企业 ID 策略边界、密码哈希、分页归一化、登录全分支、企业领域分支（创建三态、状态互斥、重置归属校验、初始管理员缺省名）、守卫角色拦截与登录放行、Admin 接口 HTTP 契约；无数据源上下文测试在领域服务边界以 Mockito 切分（MP 3.5.17 链式 API 需真 MapperProxy），SQL 真实行为由本地 MySQL 验收覆盖。

2026-09-30 在本地 MySQL 8.4.11 完成首版全场景实连验收：V1 空库迁移与幂等重启（up to date）；Admin 初始化、删除后重建；登录对错、改密后旧 token 有效至过期；创建企业、同 ID 冲突回滚 12300、随机候选与占用检测（响应 no-store）、列表关键词/状态过滤、详情含初始管理员、编辑清空字段、停用原因必填与恢复清空、重置管理员密码（BCrypt 轮换）、资源汇总与运营概览计数、操作记录过滤与未知动作拒绝、user/console 角色越权 10106；两请求对同一可用 ID 并发创建仅一家成功（败方 12300，无多余用户）；绕过外键注入同作用域登录名后创建企业，初始管理员冲突整体回滚、company 表无半成品；函数唯一索引跨企业放行、同企业大小写不敏感拒绝、平台作用域 COALESCE 归一；DB 时间与 API 的 UTC Z 字符串一致。带中文的请求体经 UTF-8 文件以 `--data-binary` 提交，中文正常入库与返回。已有版本升级验收待出现 V2 时执行。

Flyway 11.7.2 对 MySQL 8.4 仅输出「超出已测试版本」警告、不阻断执行；V1 迁移与重启幂等均实测通过，保留 BOM 版本、不另行覆盖。
