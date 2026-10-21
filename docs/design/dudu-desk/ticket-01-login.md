> 历史标注（2026-10-13）：DuduDesk Mock 模式已整体移除，`VITE_DESK_MOCK` 开关与开发适配器不存在；本文中涉及 Mock 开关与「关闭 Mock」的步骤仅作存档，当前行为一律按真实适配器理解

## Parent

[DuduDesk 对接 Spec：共享接待、访客名片与消息同步 #84](https://github.com/Buktal/dudu/issues/84)

## What to build

让企业员工使用企业 ID、登录名和密码进入 DuduDesk，恢复身份后看到当前企业与可接待账号范围，并能安全退出和切换员工

本票从真实认证贯通到工作台身份与范围展示，不要求此时已有访客数据。沿用现有 AccountApi、无状态 JWT、统一响应与权限规则，不重新设计用户体系

2026-10-10 收敛：以下认证子契约是依据现有企业/员工/组规则确定的实施选择，已足以独立开工。只读取已有基础表，不依赖 visitor、visitor_profile、message 或 Socket；后续访客业务使用 #83 已定稿契约，本票无开放前置

### 本票的 HTTP 契约

所有应用响应沿用 HTTP 200 与 code/msg/data，成功 code=0；业务 ID 均为十进制字符串，JWT exp 沿用 epoch 秒数字。请求 JSON，认证接口之外使用 Authorization: Bearer token

| 方法与路径 | 请求 | 成功 data |
| --- | --- | --- |
| POST /api/desk/login | companyId、username、password | token、exp、user、company、access |
| GET /api/desk/profile | 无业务参数，从 JWT 定位企业及员工 | user、company、access，与登录同一投影 |
| POST /api/desk/logout | 无业务参数；沿用鉴权 | null；不写撤销记录，不宣称旧 token 失效 |

登录 companyId 必须为 100000–999999 的六位数字字符串；username 去首尾空白后非空且不超过 64 字符，数据库沿用企业内不区分大小写的现有唯一性；password 非空且不超过现有登录上限 72 字符，不去除其首尾空白，不把新密码的最短长度要求套到登录

| 对象 | 必须返回的字段 | 语义 |
| --- | --- | --- |
| user | userId、username、name、role | role 仅 console/user；平台 admin 不能作为企业坐席登录。没有真实头像时不伪造头像字段。 |
| company | companyId、companyName | 来自已认证员工所在企业，不接受客户端另指定工作区。 |
| access | allGroups、groups、accounts | allGroups 为布尔值，仅本企业 initUserId 指向的员工为 true；空数组只表示当前无相应数据。 |
| access.groups 的每项 | groupId、groupName | 当前有权访问的本企业组；初始管理员列出当前全部组，普通管理员及员工取真实成员关系。 |
| access.accounts 的每项 | companyChannelId、groupId、channel、accountName | 仅属于上述当前授权组且属于本企业的账号。channel 采用当前 ChannelEnum 代码，不表示已经具备发送能力；不返回 channelInfo 或渠道凭据。 |

groups、accounts 按各自主键数值升序返回，空集合返回 []。账号必须能关联到当前企业的有效组，不能因无外键而放行脏关联。allGroups 在每次登录/身份恢复时根据 company.initUserId 计算；组/账号集合从当前持久数据读取，不写进 JWT 当长期授权快照

登录校验企业及员工存在、启用、企业归属和角色，使用现有密码校验；凭据错误、不存在或停用统一使用 10104。profile 从合法 JWT 定位当前身份，不存在、归属不符或停用时使用 10102；平台身份访问 Desk 资源使用 10106。缺失/无效/过期令牌沿用 10100–10103，参数问题沿用 11000/11100/11200，不新增错误码。获取动态身份失败不能伪装成成功的空授权范围

仅新增精确公开的 POST /api/desk/login；其他 Desk 路径仍默认鉴权，并校验企业员工身份。Admin 的公开入口、角色边界与无状态 JWT 保持不变；这里读取当前身份不等于引入令牌撤销

### Desk 适配与独立验收边界

- LoginCredentials 增加 companyId。AccountApi 方法保持，服务端 user 映射为现有 agent 元数据，companyId/companyName 映射 workspace.id/name，AgentSession 增加 access；roleName 由前端按 console/user 显示。workspaceId 表示企业，不表示某一个组
- token 由真实适配器管理，界面与业务 store 只接收身份/授权元数据。沿用现有 Admin 的内存与 sessionStorage 模式，使用 Desk 独立键并绑定 API origin；同一窗口刷新可恢复，关闭重开不承诺记住登录，不保存密码或运行中的接待数据。存储不可用时保持当前内存登录可用
- 无 token 时 getSession 直接返回 null；有 token 时查询 profile，不能仅解码 JWT 就当身份已恢复。10100–10103 清除凭据并回到登录态，网络失败保留凭据供重试但不放行未经恢复的身份。10106 展示无访问权限，不将空组视为认证失败
- signOut 成功或令牌已无效时清除凭据、取消旧请求并销毁工作区；其他网络/业务失败沿用现有退出失败交互，保留当前会话供重试。请求的旧响应不能写入新一代身份，也不能重新保存旧 token
- 开发 HTTP 通过 Vite 同源代理转发 /api 到本地 Server 8080；生产沿用 Admin 的 VITE_API_ORIGIN 构建注入方式，网关负责跨域。复用现有 fetch/统一响应能力，匿名登录不发 Bearer 头，不新增传输或认证依赖
- 显式 VITE_DESK_MOCK=true 继续使用 Mock；关闭时选真实 AccountApi。此阶段 InboxApi 尚未实现时仍明确显示服务未接入，有权账号范围可在现有坐席信息/工作台上下文核验，不为演示伪造访客或成功收发
- 本票需要的 group/member/company_channel 测试数据通过已有隔离测试准备，不新增 Console 管理功能或持久表。实时收权通知仍属后续票，本票保证每次身份读取按当前授权重新查询

## Acceptance criteria

- [ ] 两个企业可以使用相同登录名分别登录；企业 ID 参与身份定位，伪造企业或员工输入不能改变已认证身份
- [ ] 登录及恢复身份返回当前企业、员工和多组授权范围；只有初始企业管理员自动拥有本企业全部组权限，包括新建组。普通管理员与员工的空组均表示无接待权限
- [ ] Desk 登录表单、工作台上下文及无权限空态接入真实结果；身份恢复失败与业务失败按既有业务码展示，网络失败单独处理
- [ ] 退出、切换员工和过期身份处理会清除旧运行数据及提示，取消旧请求；迟到认证或初始化响应不能写入新员工工作区。不承诺退出立即撤销旧 JWT
- [ ] 新企业登录入口与默认鉴权边界一致，既有 Admin 登录和数据行为保持兼容；同步受本次实现影响的认证文档
- [ ] 三个 HTTP 接口严格按以上字段、ID 类型、响应和错误码对接；组/账号数组与 allGroups 的语义正确，不泄漏渠道凭据。现有三种接待模式均使用企业而非单组作为工作上下文
- [ ] 关闭 Mock 后可以通过真实 Server 登录并查看身份/授权范围；无访客业务时明确显示尚未接入，不能用 unavailableAccountApi 或 Mock 冒充实现。浏览器实际验证同窗口刷新恢复与失败重试
- [ ] 在独立 MySQL 的真实 Server HTTP 边界验证跨企业登录、初始管理员、多组与空组；用 AccountApi 可控延迟测试身份替换，实际核验登录和退出界面
- [ ] Desk 类型检查、lint、相关测试及 Server 编译、相关测试通过；实施记录区分已验证结果和未验证范围，不引用 Mock 登录证明真实对接
