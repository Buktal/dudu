# DuduAdmin 表结构与接口字段草案

状态：首版候选设计。首版后端已按本契约实现（2026-09-30，dudu-server `controller/admin/` + 迁移 V1，验证范围见[功能图谱](../../features/dudu-server.md)）：`/api/admin` 下的登录、账号、企业、概览与操作记录接口，company/user/operation_log/reception_group/channel_account 五表，业务 ID 十进制字符串序列化与北京时间 `yyyy-MM-dd HH:mm:ss` 时间格式均已落地；企业登录接口与企业侧字段保留给后续阶段。2026-10-07 路径整体调整为手册风格（小写下划线、资源化动作），disable/enable 合并为 status 端点，前后端同步实施。其余待定项收敛后才能发布最终契约。范围限于 Admin 首版及其真实资源汇总所需的数据，不展开消息、访客和会话全库

决策跟踪：[Admin 表结构与接口字段如何统一？](https://github.com/Buktal/dudu/issues/67)

## 已确认输入

- 企业资料采用基础范围：名称必填，联系人、联系方式、备注选填；企业 ID 在创建前由平台管理员随机生成或手动输入并检测，创建时间和状态由系统维护
- 企业员工登录名在企业内唯一，跨企业允许同名。企业登录直接使用企业 ID、登录名和密码；平台登录使用账号和密码。企业 ID 同时用于数据关联与页面展示，不再维护第二套企业登录编号。见 [企业隔离与身份决策](../../adr/0011-enterprise-group-access.md)
- 企业 ID 严格固定六位，范围为 `100000–999999`，采用随机生成或手动指定并查重，不使用自增。创建后固定，不补零、不自动扩位、不回收已使用 ID
- 初始企业管理员登录名默认 `admin`、允许修改，密码由运营方填写；企业与初始管理员共同创建成功或共同失败
- 沿用单用户表加角色的既有约定；企业是隔离边界，平台管理员不属于某家企业的员工
- Admin 不使用模拟数据；查询、统计和操作结果均来自真实接口。概览不另建统计表，不在企业行上手工维护资源计数

## 命名与类型建议

| 内容 | 数据库 | Java / HTTP JSON / Admin TypeScript |
| --- | --- | --- |
| 企业 ID（内部关联、登录与展示共用） | `company_id` | `companyId` |
| 企业名称 | `company_name` | `companyName` |
| 用户标识 | `user_id` | `userId` |
| 登录名 | `username` | `username` |
| 创建时间 | `create_time` | `createTime` |
| 更新时间 | `update_time` | `updateTime` |

- 表名已确认不加产品前缀：独立的 `dudu` 数据库已经限定项目归属，直接采用业务名称。表名建议使用单数下划线命名；SQL 列用下划线，Java、JSON、Admin 用同一套小驼峰字段名。语义、空值和枚举同时统一
- 数据库与 Java 的命名差异交由既有 MyBatis-Plus 映射；不在前端增加 `company_name → companyName` 等通用转换层。HTTP DTO 仅暴露公开字段，不能把实体直接序列化以省略安全边界
- 数据库 ID 建议 `BIGINT`、Java `Long`；企业 ID 显式指定，不设 `AUTO_INCREMENT`，MyBatis-Plus 使用输入主键策略，不能自动生成自增或雪花 ID。用户、操作记录等其他 ID 保留各自的自增候选方案。HTTP 和 TypeScript 中业务 ID 统一十进制字符串，避免 JavaScript 大整数丢精度；业务 ID 在 VO 层以 `String` 类型表达，序列化即为十进制字符串（已落地）。JWT `exp` 仍是数字秒值
- 日期列建议 `DATETIME(3)`，Java 沿用 `createTime/updateTime`；存储与 HTTP 输出统一用服务器本地时间（北京时间，见 [ADR 0012](../../adr/0012-beijing-time-end-to-end.md)），格式 `yyyy-MM-dd HH:mm:ss`（到秒，无时区标记，前端直接展示）
- 名称为非空文本；选填联系资料和备注，在响应中统一用 `null` 表示未填写。完整编辑表单提交 `null` 表示清空；不能用省略字段同时表达保留与清空
- 下列长度是候选存储上限，最终表单校验和接口校验必须采用相同值。用户名大小写规则、名称重名规则等业务选择仍见末尾待定项

## 首批核心表

### 企业：`company`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `company_id` | `companyId` | BIGINT，显式输入的主键，不自增 | 随机生成或手动指定并检测；限于 100000–999999，创建后不变 |
| `company_name` | `companyName` | VARCHAR(100)，非空 | 企业名称；是否唯一尚待用户确认 |
| `contact_name` | `contactName` | VARCHAR(100)，可空 | 联系人 |
| `contact_info` | `contactInfo` | VARCHAR(200)，可空 | 联系方式，首版按文本表达，不限定只有手机号 |
| `remark` | `remark` | VARCHAR(1000)，可空 | 运营备注 |
| `status` | `status` | TINYINT，非空 | 数据库与接口统一 1/0（启用/停用） |
| `disable_reason` | `disableReason` | VARCHAR(500)，可空，候选字段 | 停用原因；必填与恢复后显示规则待停用流程确认 |
| `create_time` | `createTime` | DATETIME(3)，非空 | 创建时间 |
| `update_time` | `updateTime` | DATETIME(3)，非空 | 最后修改时间 |

`company_id` 由主键保证唯一，创建后固定，同时作为登录输入；不另设企业代码字段或其唯一索引。号码范围严格为 `100000–999999`，共 90 万个候选值。随机生成避免企业 ID 按开通顺序递增，从号码大小直接反映服务企业规模

创建请求显式提交选定的 `companyId`。后端验证范围，并在创建企业与初始管理员的同一事务中插入该 ID。查重结果不预留号码，主键唯一约束才是并发提交时的最终裁决：若 ID 已被占用，返回对应字段冲突并整体回滚，不改成另一个随机 ID，不覆盖已有企业

登录、检测及查询接口中的 `companyId` 均按统一 ID 契约传十进制字符串，必须是六位数字且在上述范围内；前后端共同校验。数据库整数显示宽度（例如 `INT(6)`）不能保证六位限制，不采用它代替范围校验。不扩位或回收旧号

候选索引：按 `status, create_time, company_id` 支持状态列表和稳定分页。不预先给 `company_name` 加唯一索引，待同名规则确认

企业与初始管理员需要稳定关联，不能用“查出第一个管理员”代替。候选是企业记录关联 `init_user_id`，与创建事务共同维护；该字段及复合外键要等管理员定位和重置目标流程确认后定稿，当前不将它视为已批准 DDL

### 创建前的企业 ID 选择与检测

企业 ID 输入框旁提供“随机生成”和“检测”两个按钮；已有企业的详情和编辑界面只读展示 ID

| 操作 | 正式行为与结果 |
| --- | --- |
| 随机生成 | 点击后调用后端；后端用现有 JDK 随机能力在六位范围生成候选并查询数据库，遇到重复重新抽取，返回当前未占用的 ID。前端填入结果并显示“当前可用” |
| 手动输入 | 平台管理员可输入六位 ID；修改输入即清除先前检测结果，不自动占号 |
| 检测 | 本地先校验六位格式，再调用后端查询该 ID 是否存在；分别显示“当前可用”或“已被占用” |
| 请求失败 | 显示检测或生成失败并允许重试；不能把服务不可用当作“ID 可用”或“已占用” |
| 创建提交 | 前端要求当前 ID 的检测状态为可用；后端独立验证输入并依赖主键约束，不信任前端状态 |
| 提交冲突 | 提示“企业 ID 已被占用，请重新选择”，保留其他表单内容并清除 ID 的可用状态，不自动替换用户选定的号码 |

- 生成和检测接口仅向已认证的平台管理员开放；返回可用性所需信息，不返回已占用企业的资料
- 后端生成建议复用 JDK `SecureRandom`，无需新依赖。随机查重采用有界重试；若重试后仍未找到，返回暂未找到可用 ID，不得仅凭有限次碰撞断言全部号码耗尽，也不改为按最大 ID 加一
- 检测不写企业表、不创建初始管理员，也不增加号码预留表。随机或检测请求成功都不代表已经开通企业
- 输入变化、切换服务环境或重新生成时，旧的检测结果失效；只应用仍匹配当前输入、环境和请求次序的结果。随机请求期间若用户改了输入，迟到响应不能覆盖手输值
- 同一个 ID 即使刚检测可用，也可能在提交前被另一请求占用；成功开通以创建事务提交结果为准

拟定接口形态如下，供前后端按同一字段对接；完整路径清单见「接口与前端字段边界」。响应继续使用 `{ code, msg, data }`，分页响应平铺为 `{ code, msg, list, total, page, pageSize }`

| 接口候选 | 成功数据 | 约束 |
| --- | --- | --- |
| `POST /api/admin/companies/id_candidates` | `{ companyId: string }` | 后端随机并查重后返回六位数字字符串，不预留 |
| `GET /api/admin/companies/id_availability?companyId=六位数字` | `{ companyId: string, available: boolean }` | 不缓存检测结果；占用属于正常查询结果，网络或数据库失败单独返回错误 |

实现验收需覆盖六位上下界与越界、随机碰撞后重试、有限次生成失败、手输可用与占用、服务不可达、修改输入后的旧响应、检测后并发抢占、创建失败的完整回滚。测试不得用“随机尝试恰好无碰撞”代替稳定的冲突场景验证

### 用户：`user`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `user_id` | `userId` | BIGINT，主键自增 | 平台人员或企业员工的稳定身份 |
| `company_id` | `companyId` | BIGINT，平台人员为空 | 企业员工固定所属企业；不以 0 伪造一家企业 |
| `username` | `username` | VARCHAR(64)，非空 | 登录名，企业范围内唯一 |
| `name` | `name` | VARCHAR(100)，非空，候选字段 | 显示名称，不参与登录名唯一性判断 |
| `password_hash` | `passwordHash`，仅后端 | VARCHAR(255)，非空 | 密码哈希，绝不进入响应或操作记录 |
| `role` | `role` | VARCHAR(32)，非空 | 按客户端命名：`admin` / `console` / `user` |
| `status` | `status` | TINYINT，非空 | 数据库与接口统一 1/0（启用/停用） |
| `create_time` | `createTime` | DATETIME(3)，非空 | 创建时间 |
| `update_time` | `updateTime` | DATETIME(3)，非空 | 最后修改时间 |

约束建议：企业用户必须有有效 `company_id`；平台角色必须没有企业归属。角色名称不授予跨边界权限，仍需接口授权检查

唯一性必须同时覆盖企业用户和平台用户。MySQL 的普通 `UNIQUE(company_id, username)` 允许多个 NULL 企业行重名，不能单靠它限制平台账号。建议使用 MySQL 8.4 的函数唯一索引，对 `COALESCE(company_id, 0)` 与 `username` 联合约束；0 仅是索引表达式中的平台作用域，真实外键仍为空。最终迁移须验证实际索引语法、大小写语义和并发重复创建

### 平台操作记录：`operation_log`

| SQL 列 | Java / JSON 字段 | 候选类型与空值 | 含义 |
| --- | --- | --- | --- |
| `operation_log_id` | `operationLogId` | BIGINT，主键自增 | 记录标识 |
| `operator_user_id` | `operatorUserId` | BIGINT，非空 | 已认证的实际操作者 |
| `company_id` | `companyId` | BIGINT，可空 | 企业操作的目标；个人账号操作可为空 |
| `action` | `action` | VARCHAR(64)，非空 | 操作代码，前缀为目标对象域、点后为动词短语，只有 `company` 与 `admin` 两个域：`company.create` / `company.update` / `company.disable` / `company.enable` / `admin.password_reset` / `admin.password_change`；不用 `account.`、`user.` 前缀 |
| `target_type` | `target` | VARCHAR(32)，非空 | 企业或用户等目标类型 |
| `target_id` | `targetId` | BIGINT，可空 | 已存在的目标标识；创建失败可能尚无标识 |
| `summary` | `summary` | VARCHAR(1000)，可空 | 允许展示的非敏感结果说明 |
| `create_time` | `createTime` | DATETIME(3)，非空 | 操作时间；记录只追加，不设更新时间 |

候选索引：`company_id, create_time, operation_log_id` 和 `create_time, operation_log_id`。仅记录已完成操作，与业务事务共同提交；失败不入操作记录，不设结果字段或结果筛选。禁止记录密码、哈希、令牌或原样请求体

## 真实资源汇总所需的表

以上三张表能支撑企业和员工数量，不能支撑用户组、渠道接入账号的真实数量。既有资源汇总范围要求后端有对应数据来源，不能暂时返回硬编码 0

| 候选表 | 最小字段方向 | 本轮边界 |
| --- | --- | --- |
| `user_group` | `group_id/groupId`、`company_id/companyId`、`group_name/groupName`、时间字段；状态是否存在待业务确认 | 企业内平级用户组；Admin 只读取汇总 |
| `company_channel` | `company_channel_id/companyChannelId`、`company_id/companyId`、`group_id/groupId`、`channel/channel`、`account_name/accountName`、`channel_info/channelInfo` JSON、时间字段 | 一个账号只归属一个组；2026-10-07 已确认移除当前未使用的 external_account_id，渠道信息存 JSON，出现查找或唯一性需求后再提取字段；已通过 V2 实施 |
| `user_group_member` | `company_id/companyId`、`user_id/userId`、`group_id/groupId` | 2026-10-07 已确认本轮补员工与组的多对多关联及企业隔离约束；管理接口与角色等级留待后续，不扩展 Admin 操作界面 |

企业、组、账号及成员关系通过复合企业键约束不得跨企业关联。渠道密钥与协议配置随真实渠道接入另行设计，不为了 Admin 汇总引入通用秘密字段。汇总接口只返回已定义且可真实计算的数据；资源模型未实现时该项处于未完成状态

组权限按 [ADR 0011](../../adr/0011-enterprise-group-access.md)：仅 initUserId 指向且属于本企业的初始管理员自动拥有本企业全部组（含未来新组）；其他用户含普通管理员按成员关系授权，未加入组则无组权限。2026-10-07 本轮不调整数据库或 HTTP 的 ID 类型，保留当前 BIGINT/Long 与接口字符串契约；HTTP 应用层响应固定 200

## 接口与前端字段边界

- 继续使用 `/api` 和 `{ code, msg, data }`；应用结果按既有业务码表达，网络和网关失败单独处理
- 首版已实现的完整路径清单（15 个），资源与动作直接挂在 `/api/admin` 下，不设 `/auth/*`、`/account/*` 中间层（模块概念不进路径）。路径遵循《阿里巴巴 Java 开发手册》风格：全小写、下划线分隔、纯名词、不在 URL 中暴露 create/list/disable 等动词，动作用 HTTP 方法表达
  - 管理员自身：`POST /api/admin/login`、`POST /api/admin/logout`、`GET /api/admin/profile`、`PUT /api/admin/profile/password`。按用户明确偏好保留 login/logout 动词路径例外；登录签发 JWT，退出仅清理客户端 token，不新增服务端撤销表
  - 概览：`GET /api/admin/overview`
  - 操作记录：`POST /api/admin/operation_logs/query`
  - 企业：`POST /api/admin/companies`（创建）、`POST /api/admin/companies/query`（JSON 分页查询）、`POST /api/admin/companies/id_candidates`（随机候选）、`GET /api/admin/companies/id_availability`（可用性检测）、`GET /api/admin/companies/{companyId}`（详情）、`PUT /api/admin/companies/{companyId}`（编辑资料）、`PUT /api/admin/companies/{companyId}/status`（启停合并，请求体 `{ status, disableReason? }`：`0` 停用且原因必填，`1` 恢复并忽略清空原因）、`PUT /api/admin/companies/{companyId}/initial_admin/password`（重置初始管理员密码）、`GET /api/admin/companies/{companyId}/resource_summary`
  - 查询参数与请求体字段保持小驼峰（如 `companyId`、`disableReason`），路径段才用下划线
- 平台登录请求：`{ username, password }`。企业登录请求：`{ companyId, username, password }`，直接按企业 ID 定位，不先查询另一套代码。不能让客户端传入 `role` 决定登录权限
- 企业查询与维护使用上表的 `companyId/companyName/contactName/contactInfo/remark/status/createTime/updateTime`，不另起 `tenantId/enterpriseName/createdAt` 等同义字段
- 创建企业请求包含选定的 `companyId`、企业资料与 `adminInit` 对象；`adminInit` 内使用 `username/password` 及最终确认的显示资料。密码是只写入参，不属于企业响应。编辑企业资料不允许变更 `companyId`
- 企业详情可以组合企业与管理员的非敏感资料；初始管理员目标和最终对象结构在凭据流程确定后冻结。实体、创建入参、编辑入参和详情返回可以是不同的字段子集，不能因“统一字段名”把只读 ID、角色或哈希放开给客户端写入
- 前端只对日期、状态文案等做展示格式化，不改接口字段名。统计结果是聚合 DTO，不为每个统计字段新建数据库列
- 当前 Desk 使用 `id/agentId/workspaceId`、`createdAt/updatedAt` 等既有契约。本次不重命名这些代码；企业登录增加 `companyId` 是后续明确需要同步的界面与契约变更，不能顺带假定 `workspaceId` 的映射已经完成

## 定稿前必须收敛

1. 企业同名处理与编辑约束、登录名大小写规则；企业 ID 六位分配范围已经确认
2. 管理员显示资料、稳定定位、凭据交付和重置目标，以及密码校验规则
3. 企业停用原因、恢复后的显示与可操作范围；用户和资源的状态代码与统计口径
4. 列表分页、排序、请求字段及操作记录查询契约；再写完整 DTO 和接口清单
5. 将上述候选类型、索引和北京时间 / ID 序列化要求落实到最终 DDL、Flyway 迁移与契约测试，验证空库和已有版本升级

这份草案用于先对齐字段和发现约束，不代表已完成最终表结构或接口验收

## 2026-10-07 改造落地

V2 将原 reception_group/channel_account 改为 user_group/company_channel，新增 user_group_member，删除操作记录 result；旧 external_account_id 非空值保留到 channelInfo.externalAccountId 后删除旧列。Java DO/DTO/VO 的有限状态、角色、操作、目标和渠道均用枚举，持久化及 JSON 保持业务代码

统计字段统一为 companyCount、companyEnabledCount、companyDisabledCount、companyCreatedLast7DaysCount、recentCompanies；企业资源使用 companyId、userCount、userEnabledCount、userGroupCount、companyChannelCount。分页响应平铺 code/msg/list/total/page/pageSize。渠道类型当前为 wechat、alipay、douyin、xiaohongshu、bilibili，表示平台，具体授权协议随渠道接入实现
