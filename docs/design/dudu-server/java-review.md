# Server Java 审查与改造记录

2026-10-07。对应用户 28 项审查意见与后续已确认决定。实施基线：c194513e7f7dbfd613c69c151b122e85a7f96619。范围含 Server、Admin 调用及相关文档；不新增依赖，不发布或推送

## 已确认的行为

- HTTP 应用层响应固定 200，业务码表达结果；ID 类型本轮不改，数据库 Long/BIGINT、HTTP 字符串
- 用户组名 UserGroup、表 user_group；企业具体渠道账号 CompanyChannel、表 company_channel；多对多成员表 user_group_member
- 仅 initUserId 指向且属于本企业的初始管理员自动拥有全部组（含未来组），其他用户含普通管理员按成员关系授权；无成员关系则无组权限。管理接口和权限等级后续实施
- 渠道信息用 channelInfo JSON，移除 externalAccountId 字段；迁移保留旧非空值到 JSON
- 删除操作记录 result 字段及前端结果列、结果筛选，只记录共同提交的已完成操作
- 用户最新反馈取消数据库撤销方案：不建 token 表、不增加 jti，保留 /login、/logout；退出仅清理客户端 token，不承诺旧 token 立即失效。默认有效期 7 天

## 逐项处理

| 项 | 处理 |
| --- | --- |
| 1 | AdminGuardInterceptor → AdminAuthInterceptor，仍区分认证与平台授权职责。 |
| 2 | DevCorsConfig 仅在 dev 下提供 CorsFilter，统一在 MVC 前处理预检，删除每个拦截器的重复判断；不增加环境判断和注册包装。 |
| 3 | 按最新反馈保留 JwtManager 和原 createToken、parseToken、parseAuthorization 方法名。 |
| 4 | Bearer 前缀提取类内常量。 |
| 5 | Hutool 空白判断简化 token 输入检查；保留签名、身份、过期不同错误分支。 |
| 6 | JwtProperties.secret 简化属性名，以 @Name 保留外部 jwt-secret 配置键。 |
| 7 | 配置错误消息缩短，默认 604800 秒；保留非法配置启动失败。 |
| 8 | JwtUser.role 使用 UserRoleEnum，JWT 仍输出小写业务代码。 |
| 9 | 配置与异常消息等空白逻辑复用 Hutool；签名密钥不做 trim。 |
| 10 | 全局异常分类复核，规范日志格式，请求体解析日志不带原始输入值。 |
| 11 | PageQuery、P、R、Save、Query 合并至 common。 |
| 12 | 默认初始化密码 admin，用户名仍 Admin；不重置已有账号。 |
| 13 | result 枚举、字段、SQL 列、筛选与展示整体删除。 |
| 14 | OperationTargetEnum target 与 OperationActionEnum 关联（数据库通过显式映射保留 target_type 列）；日志服务从动作推导目标类型。 |
| 15 | 所有 15 个 API 核对：按用户明确偏好保留 POST login/logout 例外，个人密码 profile/password、企业初始管理员密码 companies/{companyId}/initial_admin/password，企业及操作日志列表使用 POST companies/query、POST operation_logs/query + JSON，删除 WebConfig.addFormatters；其他路径保留。 |
| 16 | OverviewController 合入 AdminController，聚合仍在 Service。 |
| 17 | 保留 P 名称，仅组装响应；PageQuery.toPage 用 Hutool ObjectUtil 补默认值、MP Page 计算总页数，保留末页钳位和单次计数。 |
| 18 | 保留两层拦截对登录路径的排除；登录同属 /api/** 和 /api/admin/**，排除是必要配置。 |
| 19 | DO/DTO/VO 有限取值改枚举；MP 与 JSON 保持业务 code，并拒绝未知值。 |
| 20 | 保留 passwordHash，明确区别明文与 BCrypt 哈希；从 UserDO.toString 排除。 |
| 21 | UserGroup/CompanyChannel 及成员表落地，复合企业键约束跨企业关系。 |
| 22 | ChannelEnum 定义平台类型，不复用 MockPulse 的回调子类型。 |
| 23 | channelInfo JSON 保存渠道信息，既有 externalAccountId 值迁入 JSON。 |
| 24 | Service 经手册审查；createCompany 区分 MP save，概览方法用 get 前缀；修复启停并发，零条记录跳过分页 SQL。 |
| 25 | PasswordCodec → PasswordHasher，保留 Hutool BCrypt；CompanyIdPolicy.parseCompanyId 表达六位业务校验。 |
| 26 | 需要实体拷贝的四个 VO 用 Lombok Bean + Hutool BeanUtil.toBean，删除手工逐字段及 ID 字符串拼装；仅声明公开字段，null 保持 null。其余简单载体保留 record。 |
| 27 | CompanyIdCandidateVO、CompanyIdAvailabilityVO、AdminOverviewVO、CompanyResourceSummaryVO 体现归属。 |
| 28 | userCount/userEnabledCount、companyCount/companyEnabledCount/companyDisabledCount/companyCreatedLast7DaysCount、userGroupCount/companyChannelCount 前后端统一。 |

## 审查发现的相关修复

- CompanyDO/UserDO/原 ReceptionGroupDO/ChannelAccountDO 时间填充注解被并入注释，已恢复，验证真实插入
- 并发启停按原状态条件更新并检查影响行数，失败不重复记日志
- 前端旧 platform_admin、enabled/disabled、嵌套分页与后端契约不一致；已改 admin、0/1、平铺分页。企业 ID 冲突码统一 12300
- JwtManager 恢复直接 JSONUtil.parseObj(user) 签发；UserRoleEnum.toString 返回业务 code，避免签发方法手动补角色字段

## 验证与运行边界

最终 Server clean test package 通过：124 项测试、0 失败、0 跳过，包含 MySQL 空库与 V1 升级、旧数据迁移、时间填充、枚举及 JSON、企业隔离、并发停用、登录和无状态退出。Admin check:all 与 build 通过：34 项测试、类型检查和 lint。真实页面完成登录、企业状态筛选、概览、资源统计、操作记录与退出验证。Standards / Spec 两路审查及最终命名增量补审通过

原有开发 MySQL unhealthy，现有凭据无法登录，本轮使用同版本独立临时容器，不修改原库与密码。V2 不改已提交 V1，原库尚未应用本次迁移。默认 7 天仅影响未显式配置 TTL 的新 token；改密和停用不会自动撤销其他 token。没有新增 Console 管理界面或角色等级
