# DuduConsole 数据与接口契约

2026-10-20 定稿，待实施。业务权限见 [规格](README.md) 和 [ADR 0015](../../adr/0015-console-management-scope.md)，渠道字段只在 [字段表](channel-fields.md) 定义。本文件相对路径以仓库根为基准；Java 路径特别注明子项目。

## 公共报文

- 前缀 `/api/console`；只有 `POST /login` 公开，其余请求带 `Authorization: Bearer <token>`。登录与退出沿用项目已确认的动词路径例外。
- 应用响应 HTTP 200，成功 code=0。单对象为 `{code,msg,data}`；分页直接为 `{code,msg,list,total,page,pageSize}`，不能包装为 `data.list`。
- 所有业务 ID 为十进制字符串；companyId 严格六位 100000–999999。JWT 过期时间仍是数字秒。时间为北京时间 `yyyy-MM-dd HH:mm:ss` 文本。
- 查询默认 page=1、pageSize=20，最大100，沿用现有 PageQuery 的归一化和越界末页行为。默认按 createTime DESC、ID DESC 稳定排序；成员无时间列，按 userId ASC。
- 查询 keyword trim，空串当未筛选；姓名、组名、账号名 trim 后校验。登录名创建与登录时 trim，内部空格不额外新增正则禁止，大小写唯一性沿用现有数据库排序规则。密码、密钥和 PEM 不 trim。
- 非法/缺少参数沿用 11000/11100/11200；不可见对象统一12100；本企业可见对象的状态禁止操作12200；重名登录名12300；原密码错误12310。认证10100–10104，Console 身份或动作无权限10106。复用 ApiEnum，不照抄旧 ADR 0006 中过时的13xxx数据段。
- 登录/恢复身份时10106清除 Console 会话；业务操作10106仅显示无权限并刷新 profile/当前列表，不因为一次操作被拒就等同退出。不可见对象12100关闭失效详情并回列表。
- POST 创建成功返回创建对象的安全详情；PUT 返回更新后的安全详情（密码操作、成员操作例外见表）；退出和密码操作为 `data:null`。
- 未声明的写入字段拒绝；companyId、ID、角色等只读字段不得经“更新对象”随意绑定。请求中的 userId/groupId 也必须在当前企业与管理范围内重新解析。

## 身份

每个请求从 token 定位持久员工、企业，确认 companyId 匹配、均启用、当前 role=console；再由 company.initUserId 和当前成员关系计算管理范围。不能把旧 token 的 console 角色作为降级后仍可管理的依据。role=admin/user 拒绝 Console。普通管理员无组仍可读个人账号。

`Profile = { company:{companyId,companyName}, user:{userId,username,name,role,isInitialAdmin}, managedGroupIds:string[] }`。isInitialAdmin 来自持久关系，role 固定 console；不含凭据或密码。

| 方法与路径（相对前缀） | 请求 | 成功 data / 限制 |
| --- | --- | --- |
| POST `/login` | `{companyId,username,password}` | `{token,expiresAt,profile:Profile}`；expiresAt 为 epoch 秒；错误凭据10104，普通员工/平台角色10106 |
| GET `/profile` | 无 | Profile；每次重查身份及管理组 |
| POST `/logout` | 无 | null；客户端清理 token，旧 token 不加入黑名单 |
| PUT `/profile/password` | `{oldPassword,newPassword}` | null；验证本人原密码，成功后当前前端清会话 |

登录名非空且≤64；登录密码非空且≤72，旧密码同此。创建/重置/改密的新密码为8–72字符，沿用现有 Bean Validation 和 PasswordHasher，不擅自改为字节长度规则。客户端 token 用 Console 独立 sessionStorage key，不与 Admin 或 Desk 混用。

## 员工

以下员工管理接口仅初始管理员可用。`Employee = {userId,username,name,role,status,isInitialAdmin,groupIds:string[],createTime,updateTime}`，不返回 passwordHash。

| 方法与路径 | 请求 | 规则 |
| --- | --- | --- |
| POST `/employees/query` | `{keyword?,status?,role?,page?,pageSize?}` | 分页 Employee；keyword 匹配登录名/名称；status=0/1，role=user/console |
| GET `/employees/{userId}` | 无 | Employee，身份必须同企业 |
| POST `/employees` | `{username,name,password}` | username2–64，name1–100；返回 Employee；固定role=user、status=1，不隐式加入组 |
| PUT `/employees/{userId}` | `{name}` | name1–100；仅改显示名称，允许编辑初始管理员本人名称 |
| PUT `/employees/{userId}/status` | `{status:0或1}` | 初始管理员禁止停用；重复目标状态幂等，返回 Employee |
| PUT `/employees/{userId}/role` | `{role:"user"或"console"}` | 不允许修改初始管理员；返回 Employee；不隐式修改组 |
| PUT `/employees/{userId}/password` | `{newPassword}` | 不能以此重置自己或初始管理员；返回null |

创建用户时同一事务完成唯一性检查与插入，数据库唯一索引承担并发冲突的最终裁决；不生成另一个登录名。编辑完整字段 name 不能为空，也不能通过省略表达“清空”。不提供员工DELETE、登录名修改、初始管理员转让接口。

## 用户组与成员

`Group = {groupId,groupName,memberCount,channelAccountCount,createTime,updateTime}`。计数仅统计本企业有效关联；memberCount 是实际成员行，不把初始管理员自动授权伪造成成员数。

| 方法与路径 | 请求 | 规则 |
| --- | --- | --- |
| POST `/user_groups/query` | `{keyword?,page?,pageSize?}` | 分页 Group，管理范围内；关键词匹配组名 |
| POST `/user_groups` | `{groupName}` | 仅初始管理员，1–100，允许同名；返回 Group |
| GET `/user_groups/{groupId}` | 无 | Group，必须有组管理权 |
| PUT `/user_groups/{groupId}` | `{groupName}` | 有组管理权，返回 Group |
| GET `/user_groups/{groupId}/members` | `page?,pageSize?` | 分页 `{userId,username,name,role,status}`，含已停用的实际成员；不合并自动全组身份 |
| GET `/user_groups/{groupId}/member_candidates` | `keyword?,page?,pageSize?` | 分页 `{userId,username,name,role}`；仅本企业启用、尚未加入该组且非初始管理员的员工；普通管理员只得role=user，初始管理员还可见console |
| PUT `/user_groups/{groupId}/members/{userId}` | 无 | 幂等添加；仅启用员工；普通管理员不得添加任何console；返回 `{groupId,userId,member:true}` |
| DELETE `/user_groups/{groupId}/members/{userId}` | 无 | 幂等移除；同企业已存在员工；普通管理员不得移除任何console；返回 `{groupId,userId,member:false}` |

所有候选读取也先校验目标组管理权，不以目录接口绕过范围。初始管理员不可作为显式成员添加/移除，返回12200。组不提供DELETE或status接口。

## 渠道目录与企业渠道账号

`GET /channels` 返回 `{channels:[ChannelDefinition]}`；源自实际适配器与 Console 配置定义，不从枚举直接展示全部。

`ChannelDefinition = {channel,name,available,restriction,fields:[{key,label,secret,requiredForReceive,requiredForSend,immutableOnceConfigured,control}],notes:string[]}`。control 仅 text/password/textarea；条件要求见字段表，notes 向企业管理员解释协议限制与渠道侧准备，不向其展示Java内部实现。required 标记按接收/发送分别表达，不表示齐全即可生产连通。普通固定身份字段immutableOnceConfigured=true；Telegram可轮换秘密但Bot ID不可换，采用专门的前缀校验说明。

`Account = {companyChannelId,groupId,groupName,channel,accountName,receiveConfigured,sendConfigured,missingReceiveFields:string[],missingSendFields:string[],createTime,updateTime}`。

`AccountDetail = Account + {callbackUrl,fields:Record<string,string>,configuredSecretFields:string[],notes:string[]}`。fields 只含目录允许显示的非秘密字段，绝不返回原始channelInfo。列表不含 fields。详情仍需实时组管理权，HTTP设 `Cache-Control:no-store`。

| 方法与路径 | 请求 | 成功与权限 |
| --- | --- | --- |
| POST `/company_channels/query` | `{keyword?,groupId?,channel?,page?,pageSize?}` | 分页 Account；keyword匹配accountName；仅管理组内账号；显式指定不可管理groupId按12100 |
| POST `/company_channels` | `{groupId,channel,accountName,fields:Record<string,string>}` | 返回 AccountDetail；组必须可管理，channel必须实际支持且当前部署available；接收配置齐全后才提交 |
| GET `/company_channels/{companyChannelId}` | 无 | AccountDetail，必须管理账号当前组 |
| PUT `/company_channels/{companyChannelId}` | `{accountName,credentialChanges:{set:Record<string,string>,clear:string[]}}` | 返回 AccountDetail；原子合并最终配置并校验；channel和groupId不在本接口可写字段中 |
| PUT `/company_channels/{companyChannelId}/group` | `{groupId}` | 源、目标均可管理且同企业；返回AccountDetail；同组幂等 |

accountName1–100，可同名。查询的可见账号限定条件须在数据库查询/分页中应用，不能查询全企业再在前端过滤。候选组复用 `/user_groups/query` 分页，不截断前100条冒充全部。

credentialChanges.set和clear仅接受目录可编辑API键（Telegram使用botToken，派生url/botId及固定system拒绝）；set空白值拒绝，同键不能既set又clear。省略键保持原值，不用星号串代替秘密。清除后若接收必需参数缺失或违反字段表的固定身份规则，则整体12200回滚；发送参数可不齐全，返回缺项。默认编辑只提交用户实际修改字段，避免两个管理员相互覆盖未改密钥。

维护历史配置时保留目录以外的既有channelInfo键，但不接受客户端新增未知键、也不回显它们。只读的派生字段和固定system由后端维护；Telegram botToken 与持久url的映射见字段表。保留字段不意味着已被适配器读取。

接收/发送参数齐全状态仅由对应适配器和字段规则导出，不持久化，不等于授权有效或在线。无接入检测、OAuth、账号启停、删除接口。

## 回调地址与部署

增加一项有实际必要的部署配置 `dudu.channel.callback-base-url`：公开回调服务根URL（只含scheme、host和可选port，无路径/查询/凭据）。解决反代后Console生成的公网回调地址和WhatsApp必需url的来源，不新增租户字段或通用环境管理页。

配置后服务端统一产生 `<base>/api/channels/{companyChannelId}/callback`；留空仅在本地开发按服务端请求origin产生地址，并提示其非公网承诺。生产按真实渠道要求设置公开入口；不盲信客户端提交的任意base或Forwarded头。WhatsApp派生url在创建事务取得ID后写入，外部不能覆写；事务最终校验成功后才提交。

美团现有协议明确用 `http://Host/...` 验签，不能强行套HTTPS。只有公开base为HTTP且有效端口80或8080时目录才可将美团标为available；入口还必须保留实际公网Host（含显式端口），这项由部署验收确认，不能只凭配置推断已通过。HTTPS-only或其他端口环境该条目available=false，并说明当前HTTP入口限制。首版不借Console规划改写适配器或声称HTTPS验签已实现，验收必须覆盖它的实际签名URL。

## 持久数据与通知

复用现有 user、user_group、user_group_member、company_channel，ID及索引沿用现有迁移；没有新表/列，不需要新增Flyway迁移。不更改已提交V1–V6，不加外键、状态列、角色表、外部账号唯一索引、撤销表或审计表。

所有Console持久写命令先开启事务，按身份中的companyId锁定既有company行，再重新读取持久员工角色、企业状态、组成员与目标对象并执行。锁前的拦截器检查只作早期拒绝，不能替代锁后授权。当前企业管理写入频率低，按企业串行化比新增版本列、权限快照或跨表锁协议更简单，能覆盖“检查user后同时升为console”“检查源组后同时换组/收权”等实际竞态。其他入口若以后修改这些管理关系，也须采用同一约定。

实现优先使用MyBatis-Plus IService/Lambda，在固定公司主键查询上使用固定的 `.last("FOR UPDATE")` 片段（Lambda没有锁语义，故使用MP支持的SQL片段；不拼用户字符串、不写XML/注解SQL）。锁顺序为company在前、其余对象在后，事务回滚后不得留下成员、账号或权限通知。成员重复添加由既有唯一索引保证幂等，删除只作用于指定companyId/groupId/userId的一条关系。

成员增删复用已有 UserGroupMemberServiceImpl.save/removeById；账号新增/修改复用 CompanyChannelServiceImpl.save/updateById。不能以未覆盖事件的批量写绕过通知。员工启停和角色变化需补发布同一 DeskAccessChangedEvent；使用已有AFTER_COMMIT处理，回滚不通知。不新增消息总线或补偿表。

并发按上述公司行锁、现有事务和唯一索引处理；不为规划新增乐观锁列或冲突协商协议。员工停用由Desk现有持久身份校验拦截；新增通知让现有工作区重查并退出/清理失效范围，不等于撤销JWT。

## 复用入口

DUDU Server（下列路径相对 dudu-server）：`src/main/java/com/dudu/duduserver/common/{R,P,PageQuery}.java`、`constant/ApiEnum.java`、`service/impl/DeskAuthServiceImpl.java`、`DeskAccessServiceImpl.java`、`UserGroupMemberServiceImpl.java`、`CompanyChannelServiceImpl.java`、`socket/DeskSocketGateway.java`；实体与迁移为实际字段来源。

DuduAdmin（路径相对 dudu-admin）：`src/api/`、`src/navigation.ts`、`src/components/`、`vite.config.ts` 作为请求、路由、表单和主题参考。它们是Admin本地模块而非现成跨项目包：Console按需移用最小适用代码，不能直接跨项目导入平台认证/API，也不为本轮先建共享框架。
