# DuduAdmin 表结构与接口字段草案

状态：首版候选设计，尚未创建业务表、迁移或接口。已确认的业务规则与工程建议分开记录；待定项收敛后才能发布最终契约。范围限于 Admin 首版及其真实资源汇总所需的数据，不展开消息、访客和会话全库。

决策跟踪：[Admin 表结构与接口字段如何统一？](https://github.com/Buktal/dudu/issues/67)。

## 已确认输入

- 企业资料采用基础范围：名称必填，联系人、联系方式、备注选填；企业编号、创建时间和状态由系统维护。
- 企业员工登录名在企业内唯一，跨企业允许同名。企业登录使用企业编号、登录名和密码；平台登录使用账号和密码。见 [企业隔离与身份决策](../../adr/0011-enterprise-group-access.md)。
- 初始企业管理员登录名默认 `admin`、允许修改，密码由运营方填写；企业与初始管理员共同创建成功或共同失败。
- 沿用单用户表加角色的既有约定；企业是隔离边界，平台管理员不属于某家企业的员工。
- Admin 不使用模拟数据；查询、统计和操作结果均来自真实接口。概览不另建统计表，不在企业行上手工维护资源计数。

## 命名与类型建议

| 内容 | 数据库 | Java / HTTP JSON / Admin TypeScript |
| --- | --- | --- |
| 企业内部标识 | `company_id` | `companyId` |
| 企业登录编号 | `company_code` | `companyCode` |
| 企业名称 | `company_name` | `companyName` |
| 用户标识 | `user_id` | `userId` |
| 登录名 | `username` | `username` |
| 创建时间 | `create_time` | `createTime` |
| 更新时间 | `update_time` | `updateTime` |

- 表名已确认不加产品前缀：独立的 `dudu` 数据库已经限定项目归属，直接采用业务名称。表名建议使用单数下划线命名；SQL 列用下划线，Java、JSON、Admin 用同一套小驼峰字段名。语义、空值和枚举同时统一。
- 数据库与 Java 的命名差异交由既有 MyBatis-Plus 映射；不在前端增加 `company_name → companyName` 等通用转换层。HTTP DTO 仅暴露公开字段，不能把实体直接序列化以省略安全边界。
- 沿用 bigint 自增方向，数据库建议 `BIGINT`、Java `Long`；HTTP 和 TypeScript 中业务 ID 统一十进制字符串，避免 JavaScript 大整数丢精度。该 HTTP 序列化尚未实现；JWT `exp` 仍是数字秒值。
- 日期列建议 `DATETIME(3)`，Java 沿用 `createTime/updateTime`；存储和写入统一 UTC，HTTP 使用带 `Z` 的 ISO 8601 字符串，前端按用户时区显示。
- 当前时间填充使用 JVM 本地时间，dev JDBC 会话使用 UTC，HTTP 时间格式也未统一。实施时须一起修正并验证，不能只给旧本地时间字符串追加 `Z`。
- 名称为非空文本；选填联系资料和备注，在响应中统一用 `null` 表示未填写。完整编辑表单提交 `null` 表示清空；不能用省略字段同时表达保留与清空。
- 下列长度是候选存储上限，最终表单校验和接口校验必须采用相同值。用户名大小写规则、名称重名规则等业务选择仍见末尾待定项。

## 首批核心表

### 企业：`company`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `company_id` | `companyId` | BIGINT，主键自增 | 内部标识，创建后不变 |
| `company_code` | `companyCode` | VARCHAR(32)，非空唯一 | 系统生成的企业登录编号，创建后不变 |
| `company_name` | `companyName` | VARCHAR(100)，非空 | 企业名称；是否唯一尚待用户确认 |
| `contact_name` | `contactName` | VARCHAR(100)，可空 | 联系人 |
| `contact_info` | `contactInfo` | VARCHAR(200)，可空 | 联系方式，首版按文本表达，不限定只有手机号 |
| `remark` | `remark` | VARCHAR(1000)，可空 | 运营备注 |
| `status` | `status` | VARCHAR(16)，非空 | 候选代码 `enabled` / `disabled` |
| `disable_reason` | `disableReason` | VARCHAR(500)，可空，候选字段 | 停用原因；必填与恢复后显示规则待停用流程确认 |
| `create_time` | `createTime` | DATETIME(3)，非空 | 创建时间 |
| `update_time` | `updateTime` | DATETIME(3)，非空 | 最后修改时间 |

候选索引：`company_code` 唯一；按 `status, create_time, company_id` 支持状态列表和稳定分页。不预先给 `company_name` 加唯一索引，待同名规则确认。

企业与初始管理员需要稳定关联，不能用“查出第一个管理员”代替。候选是企业记录关联 `initial_admin_user_id`，与创建事务共同维护；该字段及复合外键要等管理员定位和重置目标流程确认后定稿，当前不将它视为已批准 DDL。

### 用户：`user`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `user_id` | `userId` | BIGINT，主键自增 | 平台人员或企业员工的稳定身份 |
| `company_id` | `companyId` | BIGINT，平台人员为空 | 企业员工固定所属企业；不以 0 伪造一家企业 |
| `username` | `username` | VARCHAR(64)，非空 | 登录名，企业范围内唯一 |
| `name` | `name` | VARCHAR(100)，非空，候选字段 | 显示名称，不参与登录名唯一性判断 |
| `password_hash` | `passwordHash`，仅后端 | VARCHAR(255)，非空 | 密码哈希，绝不进入响应或操作记录 |
| `role` | `role` | VARCHAR(32)，非空 | 候选代码 `platform_admin` / `company_admin` / `employee` |
| `status` | `status` | VARCHAR(16)，非空 | 候选代码 `enabled` / `disabled` |
| `create_time` | `createTime` | DATETIME(3)，非空 | 创建时间 |
| `update_time` | `updateTime` | DATETIME(3)，非空 | 最后修改时间 |

约束建议：企业用户必须有有效 `company_id`；平台角色必须没有企业归属。角色名称不授予跨边界权限，仍需接口授权检查。

唯一性必须同时覆盖企业用户和平台用户。MySQL 的普通 `UNIQUE(company_id, username)` 允许多个 NULL 企业行重名，不能单靠它限制平台账号。建议使用 MySQL 8.4 的函数唯一索引，对 `COALESCE(company_id, 0)` 与 `username` 联合约束；0 仅是索引表达式中的平台作用域，真实外键仍为空。最终迁移须验证实际索引语法、大小写语义和并发重复创建。

### 平台操作记录：`operation_log`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `operation_log_id` | `operationLogId` | BIGINT，主键自增 | 记录标识 |
| `operator_user_id` | `operatorUserId` | BIGINT，非空 | 已认证的实际操作者 |
| `company_id` | `companyId` | BIGINT，可空 | 企业操作的目标；个人账号操作可为空 |
| `action` | `action` | VARCHAR(64)，非空 | 创建、修改、停用、恢复、管理员重置或自身改密等操作代码，清单待定 |
| `target_type` | `targetType` | VARCHAR(32)，非空 | 企业或用户等目标类型 |
| `target_id` | `targetId` | BIGINT，可空 | 已存在的目标标识；创建失败可能尚无标识 |
| `result` | `result` | VARCHAR(16)，非空 | 候选代码 `success` / `failure` |
| `summary` | `summary` | VARCHAR(1000)，可空 | 允许展示的非敏感结果说明 |
| `create_time` | `createTime` | DATETIME(3)，非空 | 操作时间；记录只追加，不设更新时间 |

候选索引：`company_id, create_time, operation_log_id` 和 `create_time, operation_log_id`。记录范围、失败留痕和查询条件待操作记录票确定；业务回滚与失败记录的提交不能错误地共用一个必然回滚的事务。禁止记录密码、哈希、令牌或原样请求体。

## 真实资源汇总所需的表

以上三张表能支撑企业和员工数量，不能支撑接待组、渠道接入账号的真实数量。既有资源汇总范围要求后端有对应数据来源，不能暂时返回硬编码 0。

| 候选表 | 最小字段方向 | 本轮边界 |
| --- | --- | --- |
| `reception_group` | `group_id/groupId`、`company_id/companyId`、`group_name/groupName`、时间字段；状态是否存在待业务确认 | 企业内平级接待组；Admin 只读取汇总 |
| `channel_account` | `channel_account_id/channelAccountId`、`company_id/companyId`、`group_id/groupId`、`channel/channel`、`account_name/accountName`、渠道外部账号标识、时间字段 | 一个账号只归属一个组；账号启停、授权与连接健康须区分，状态口径待定 |
| `user_group`，后续 Console | `company_id/companyId`、`user_id/userId`、`group_id/groupId` | 员工与组的成员关系；不属于本轮 Admin 操作界面 |

企业、组、账号及成员关系通过复合企业键约束不得跨企业关联。渠道密钥与协议配置随真实渠道接入另行设计，不为了 Admin 汇总引入通用秘密字段。汇总接口只返回已定义且可真实计算的数据；资源模型未实现时该项处于未完成状态。

## 接口与前端字段边界

- 继续使用 `/api` 和 `{ code, msg, data }`；应用结果按既有业务码表达，网络和网关失败单独处理。
- 平台登录请求：`{ username, password }`。企业登录请求：`{ companyCode, username, password }`。不能让客户端传入 `role` 决定登录权限。
- 企业查询与维护使用上表的 `companyId/companyCode/companyName/contactName/contactInfo/remark/status/createTime/updateTime`，不另起 `tenantId/enterpriseName/createdAt` 等同义字段。
- 创建企业请求建议由企业资料与 `initialAdmin` 对象组成；`initialAdmin` 内使用 `username/password` 及最终确认的显示资料。密码是只写入参，不属于企业响应。
- 企业详情可以组合企业与管理员的非敏感资料；初始管理员目标和最终对象结构在凭据流程确定后冻结。实体、创建入参、编辑入参和详情返回可以是不同的字段子集，不能因“统一字段名”把只读 ID、角色或哈希放开给客户端写入。
- 前端只对日期、状态文案等做展示格式化，不改接口字段名。统计结果是聚合 DTO，不为每个统计字段新建数据库列。
- 当前 Desk 使用 `id/agentId/workspaceId`、`createdAt/updatedAt` 等既有契约。本次不重命名这些代码；企业登录增加 `companyCode` 是后续明确需要同步的界面与契约变更。

## 定稿前必须收敛

1. 企业同名处理与编辑约束；企业编号生成规则与登录名大小写规则。
2. 管理员显示资料、稳定定位、凭据交付和重置目标，以及密码校验规则。
3. 企业停用原因、恢复后的显示与可操作范围；用户和资源的状态代码与统计口径。
4. 列表分页、排序、请求字段及操作记录查询契约；再写完整 DTO 和接口清单。
5. 将上述候选类型、索引和 UTC / ID 序列化要求落实到最终 DDL、Flyway 迁移与契约测试，验证空库和已有版本升级。

这份草案用于先对齐字段和发现约束，不代表已完成最终表结构或接口验收。
