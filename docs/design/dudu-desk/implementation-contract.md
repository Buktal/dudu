# DuduDesk 最小对接契约

定稿日期：2026-10-10。对应 [最终表结构与前端字段](https://github.com/Buktal/dudu/issues/83)。这是本轮实施依据，取代此前讨论中的候选字段、发送核实、事件重放和复杂冲突协议；**契约定稿不表示业务已经实现**。

用户已认可的桌面功能保持；只沿用此前明确的星标移除、卡片最后摘要和附件发送延期。实现采用三表、普通 HTTP 查询/写入、直接 Socket 通知。现有身份/组权限、无状态 JWT、组件与消息虚拟滚动保持。下列字段、分页大小和路由是实现方依据这些要求确定的工程选择。

所有源码路径相对仓库根，迁移路径相对 dudu-server。认证完整字段沿用[企业认证子契约](https://github.com/Buktal/dudu/issues/85)，本地镜像为 docs/design/dudu-desk/ticket-01-login.md。

## 1. 数据库

沿用 company、user、operation_log、user_group、user_group_member、company_channel 六表，不修改已提交的 V1–V3。第一张访客实施票新增 V4__desk_conversations.sql，一次建立以下三表；后续名片票只接通读写，不重复建表。

三表均用 InnoDB、utf8mb4，普通文本沿用 utf8mb4_0900_ai_ci。外部身份和外部消息标识使用 utf8mb4_0900_bin，保留大小写差异。除标明外无默认值，NULL 与空串含义不同；不设 FOREIGN KEY。时间由服务端按 ADR0012 写入，数据库 DATETIME(3)，接口输出 uuuu-MM-dd HH:mm:ss；所有 BIGINT 业务 ID 对外为十进制字符串。

### visitor

| 列 | 类型 / 空值 / 默认 | 用途 |
| --- | --- | --- |
| visitor_id | BIGINT NOT NULL AUTO_INCREMENT，主键 | 固定访客及会话共用 ID |
| company_id | BIGINT NOT NULL | 企业隔离 |
| company_channel_id | BIGINT NOT NULL | 渠道账号，组权限从账号现有关系查询 |
| external_user_id | VARCHAR(255) NOT NULL，二进制排序规则 | 渠道访客身份 |
| name | VARCHAR(255) NULL | 名称；缺失时前端显示外部 ID |
| avatar_url | VARCHAR(2048) NULL | 渠道头像 |
| status | VARCHAR(16) NOT NULL DEFAULT 'needs-reply' | needs-reply / waiting / closed |
| last_message_id | BIGINT NULL | 当前最后一条持久消息 |
| last_message_preview | VARCHAR(500) NOT NULL DEFAULT '' | 列表和卡片摘要，也支持既有摘要关键词搜索 |
| last_message_time | DATETIME(3) NULL | 最后消息活动时间，不被名片保存改变 |
| waiting_since | DATETIME(3) NULL | 本轮进入待回复的时间 |
| message_count | INT UNSIGNED NOT NULL DEFAULT 0 | 全部持久消息数量；同时分配会话内 sequence |
| version | INT UNSIGNED NOT NULL DEFAULT 1 | 对应现有 Conversation.version |
| create_time / update_time | DATETIME(3) NOT NULL | 创建和修改时间 |

索引：PRIMARY KEY(visitor_id)；UNIQUE uk_visitor_source(company_id, company_channel_id, external_user_id)；KEY idx_visitor_account_status(company_channel_id, status)。不复制 group_id、员工所有权、个人已读或星标。

最后消息 ID 用于关联正文；500 字摘要直接支撑现有列表展示和搜索，避免查询列表时逐个加载消息。摘要由同一条消息生成规则维护：文本取正文；图片/文件/音视频用类型和文件名；链接/卡片取标题，位置取名称，引用取回复文字；最多 500 字。不保存另一份完整正文。

### visitor_profile

| 列 | 类型 / 空值 / 默认 | 用途 |
| --- | --- | --- |
| visitor_id | BIGINT NOT NULL，主键 | 与 visitor 一对一，不另生成名片 ID |
| channel_fields | JSON NOT NULL，无 SQL 默认 | 右侧只读资料数组，创建时显式写 [] |
| tags | JSON NOT NULL，无 SQL 默认 | 字符串标签数组，创建时显式写 [] |
| note | VARCHAR(4000) NOT NULL DEFAULT '' | 共享备注 |
| version | INT UNSIGNED NOT NULL DEFAULT 1 | 对应现有 VisitorProfile.version |
| create_time / update_time | DATETIME(3) NOT NULL | 资料时间 |

只需主键索引。创建访客时同一事务创建空名片，后续取得渠道资料再更新。channel_fields 使用现有 fields 结构：每项含 label 与 value；value 为 available + value 字符串，或 not-provided / empty。标签最多 20 个，每个 1–30 字，去首尾空白、去除完全相同项；备注最多 4000 字，允许空串清空。

### message

| 列 | 类型 / 空值 / 默认 | 用途 |
| --- | --- | --- |
| message_id | BIGINT NOT NULL AUTO_INCREMENT，主键 | 所有查询和通知共用的消息 ID |
| visitor_id | BIGINT NOT NULL | 所属固定会话 |
| sequence | INT UNSIGNED NOT NULL | 会话内稳定顺序，新增消息时使用递增后的 message_count |
| direction | VARCHAR(16) NOT NULL | incoming / outgoing / system |
| sender_user_id | BIGINT NULL | outgoing 必填，来自登录员工；其他方向为空 |
| client_request_id | VARCHAR(64) NULL | outgoing 的本地气泡关联标识；不承诺重试幂等协议 |
| external_message_id | VARCHAR(255) NULL，二进制排序规则 | 保存渠道已提供的消息标识 |
| content | JSON NOT NULL | 第 4 节的统一消息体 |
| send_status | VARCHAR(16) NULL | outgoing 为 sending / sent / failed，其他方向为空 |
| failure_reason | VARCHAR(500) NULL | failed 时记录实际发送失败说明，其余为空 |
| version | INT UNSIGNED NOT NULL DEFAULT 1 | 对应现有 InboxMessage.version |
| create_time / update_time | DATETIME(3) NOT NULL | 消息创建与结果更新时间 |

索引：PRIMARY KEY(message_id)；UNIQUE uk_message_sequence(visitor_id, sequence)，同时服务历史分页。当前无按 client_request_id 单查的接口，不额外建请求索引、重试表、回执表或事件表。消息不单独重复 company_id 和渠道账号，权限通过 visitor 查询。

## 2. 一条直接的读写流程

- **收到来信**：按来源唯一键找到或创建访客及名片，保存消息，message_count 加一并分配 sequence，更新 last_message_id/preview/time；设待回复。已待回复时保留 waiting_since，否则写当前时间。事务完成后通知完整消息和访客摘要。
- **发送文本**：校验当前员工权限和正文，保存 outgoing/sending 及实际发送员工，按上述方式更新最后消息和计数，但此时不改变接待状态、不推送。直接调用渠道发送；返回成功写 sent，返回失败或调用异常写 failed 和原因。保存结果后发送一次消息＋访客摘要通知，HTTP 返回同一条最终消息。没有后台投递队列或自动重试；调用尚未返回时记录保持 sending。
- **手动重发**：保留现有失败气泡的重试入口。点击后使用原访客和正文，生成新的 clientRequestId，调用同一个发送接口，按新消息处理；已经入库的原失败消息保留。不复用旧请求标识覆盖失败记录，不新增重试接口。
- **发送成功后的接待状态**：未结束，且该 outgoing.sequence 之后没有更新的 incoming 消息时改 waiting、清空 waiting_since；否则保留当前状态。直接查询本会话消息判断，不新增回复基线表或并发框架。失败不把咨询算作已回复。
- **最后摘要**：所有入库消息计数一次，包含已受理失败发送。结果改变不新增消息、不再增加计数；只有结果对应最后消息时更新其展示结果。消息发送结果通过消息本身的 delivery 表达，不能把访客 status 当发送结果。
- **结束 / 继续**：结束写 closed 并清空 waiting_since；继续写 needs-reply，原来不是待回复时写当前 waiting_since。结束后来信重新待回复；来信后结束则已结束。HTTP 返回并通知后端保存的访客。
- **保存名片**：只更新标签/备注，资料 version 加一，返回并推送完整名片。编辑期间收到别人更新时，前端保存前提示一次覆盖；确认后普通保存，以后保存为准。没有服务器版本冲突拒绝和反复确认。
- 每次资源内容变化增加对应 version；沿用前端现有合并函数。这里只做普通事务和返回数据，不设计全局事件版本、确认回执或持久通知平台。

## 3. HTTP 路径

认证沿用 POST /api/desk/login、GET /api/desk/profile、POST /api/desk/logout，完整字段见企业认证子契约。其余接口携带 Authorization: Bearer token，企业/员工从登录身份取得。请求中的 visitorId 必须在当前账号/组权限内；不信任客户端提交的员工身份或渠道目标。

除媒体二进制外，沿用 R：HTTP 200，JSON 为 code/msg/data。成功 code=0；认证沿用 10100–10104，越权 10106，参数 11000/11100/11200，不存在 12100，当前渠道不允许发送 12200；不得用业务失败伪装空列表。

| 方法与路径 | 输入 | 成功 data |
| --- | --- | --- |
| POST /api/desk/visitors/query | search、channelId、status、order、page、pageSize，见下文 | items、total、page、pageSize、counts、channels |
| GET /api/desk/visitors/{visitorId} | 无业务参数 | Conversation |
| GET /api/desk/visitors/{visitorId}/profile | 无业务参数 | VisitorProfile |
| PUT /api/desk/visitors/{visitorId}/profile | tags 字符串数组、note 字符串 | VisitorProfile |
| GET /api/desk/visitors/{visitorId}/messages | 可选 beforeSequence；limit 默认 30，1–100 | items、nextCursor，见历史分页 |
| POST /api/desk/visitors/{visitorId}/messages | clientRequestId、text | InboxMessage；渠道失败也返回保存的 delivery.failed |
| PUT /api/desk/visitors/{visitorId}/status | status 仅 closed / needs-reply | Conversation |
| GET /api/desk/visitors/{visitorId}/capability | 无业务参数 | ReplyCapability |
| GET /api/desk/messages/{messageId}/media | index 默认 0，指定该消息内第几个媒体（从 0 开始） | 媒体字节；索引不存在/鉴权/渠道错误时返回普通 R 错误 |

文本必须含非空白字符且最多 4000 字，保留用户实际文字和换行；clientRequestId 为 1–64 字符。接口不接受附件或客户端发送员工字段。当前渠道有更低文本限制时按其真实发送能力反馈，不把文本上限当作所有渠道的能力保证。

### 访客查询

输入默认 search=""、channelId="all"、status="active"、order="wait"、page=1、pageSize=30。page >= 1，pageSize 1–100，search 去首尾空白、最多 100 字。channelId 为 all 或现有 ChannelEnum；status 为 active/all/needs-reply/waiting/closed；order 为 wait/messages。

先按当前授权范围筛选，再执行数据库普通分页；不使用持久列表快照。搜索按包含关系匹配姓名、外部用户 ID、账号名、渠道名、最后摘要及共享标签/备注，使用数据库普通 LIKE/JSON 查询；不新建搜索引擎。SQL 参数绑定，不能拼接用户输入。

wait：待回复优先，待回复按 waiting_since 升序，之后按 last_message_time 降序、visitor_id 升序；messages：message_count 降序，再按 last_message_time 降序、visitor_id 升序。空消息时间用 create_time。名片更新不改变消息排序。

counts 为当前全部授权账号范围的 active/needsReply/waiting/closed 数量，不受本次关键词、状态、渠道筛选影响。active = needsReply + waiting。channels 是授权账号使用到的渠道代码/显示名。总数 total 则是本次筛选的访客总数。数据库直接查询，不保存第二份统计表。

查询响应使用 R.data 容纳这些已有 Desk 元信息，不改通用 P 或 Admin 分页。真实适配器把 items 映射到 ConversationPage，将下页页码字符串作为其本地 nextCursor；到尾页返回 null。条件变化、重连或通知影响成员/排序时重新读取第一页与计数，不修复旧排名快照。

### 历史分页

按 visitor_id 取 sequence 降序的 limit + 1 条；beforeSequence 存在时只取小于它的消息。返回给界面的 items 按 sequence 升序；还有更早消息时 nextCursor 为本页最小 sequence 的十进制字符串，否则 null。接口不计算全历史总数，访客已有 messageCount。

Socket 到来不改变已加载历史的更早游标。第一次打开对话即查询最近页；从未打开时只维护访客摘要。专注/并排/完整对话共用已有缓存；卡片只展示摘要。重连丢弃旧历史缓存并重新取最近页，更早记录照常向上加载。

## 4. 返回对象与前端映射

使用 dudu-desk/src/features/inbox/types.ts 的既有对象名称，按下表对接，不为三个布局各建一套 DTO。

| 对象 | 字段与来源 |
| --- | --- |
| Conversation | id=visitor_id；identity 见下；status、preview=last_message_preview、updatedAt=last_message_time（无消息则 create_time）、waitingSince（非待回复省略）、messageCount、version、capability |
| identity | id 与 Conversation.id 相同；externalUserId、可选 name/avatarUrl；channelId/channelName 和 accountId/accountName 由现有 company_channel 派生 |
| VisitorProfile | conversationId=visitor_id、version、fields=channel_fields、tags、note；不重复身份字段 |
| InboxMessage | id=message_id、conversationId=visitor_id、可选 clientRequestId、direction、body=content、createdAt=create_time、sequence、version；outgoing 增加 senderUserId、senderName 和 delivery={state, 可选 reason} |
| ReplyCapability | 沿用 state、kinds、可选 reason/nextStep/expiresAt/remaining；可发时 allowed + ["text"]，未配置或不支持时 restricted 并说明原因；不编造可发能力 |
| counts / channels | counts 四个数字；channels 每项为 id（平台代码）、name（显示名） |

所有业务 ID 为字符串，sequence/version/messageCount/counts 为普通整数。消息 senderName 查询现有员工显示名，不新增员工快照表。Server 不返回 unread；真实 Desk 在本次运行维护待处理提示，重新初始化不制造旧提示，别人处理后清除。原 markRead 不调用服务端。

content 沿用现有 MessageBody：text、image/audio/video/file、reply、link、location、quote、card、unknown。各类型字段直接采用 types.ts 的 body 分支；outgoing 本轮只能 text。渠道不提供的可选信息省略，不填假值。媒体 name/mimeType/size 改为可选以表达渠道缺失；id 取渠道标识，只有 URL 时使用“消息 ID:媒体下标”派生的稳定标识。单媒体的 index=0，reply 使用 attachments 数组下标；服务端仅按消息中已保存的引用读取，不接受任意外部 URL 参数。

媒体只保存现有链接/标识和展示字段。公开链接直接使用；需要渠道凭据的素材经上述 media 接口校验权限后按需读取并返回字节，不建立媒体表、下载任务或永久副本。Desk 使用已有认证请求取得 Blob 再展示/打开，不将 JWT 放进图片 URL。失效沿用现有失败提示。

capability 从当前账号的实际渠道接入方式取得，沿用现有字段；不额外推送能力事件或新增能力表。发送端再正常校验一次。账号凭据和 channel_info 不发给 Desk。

## 5. Socket

使用现有 Spring WebSocket 依赖，不引入消息中间件。地址 /ws/desk。浏览器建立连接后先发 {"type":"auth","token":"当前JWT"}；服务端用同一认证及员工启用/企业权限规则校验，成功发 {"type":"ready"}。未经认证不订阅业务数据；失败发 {"type":"error","code":10102,"msg":"登录状态无效，请重新登录"} 并关闭，其他身份错误沿用相应业务码。

ready 后客户端读取初始化接口。连接中只发送以下四类业务报文；type 为固定区分，嵌套对象就是第 4 节的对象：

| type | 报文字段 | 触发 |
| --- | --- | --- |
| message | type、message、conversation | 访客来信保存后；坐席发送成功或失败保存后。两者共用完整报文，发送中不通知 |
| conversation | type、conversation | 结束、继续或访客身份信息变化 |
| profile | type、profile | 渠道资料或共享标签/备注保存后 |
| access-changed | type | 现有员工组/账号权限变更，需要重新查询工作区 |

本次消息引起的访客更新合在 message 中，不再为同一结果另发 conversation。所有通知发送给当前有权的已连接员工，包括发送者本人。没有 eventId、ack、持久游标或重放参数；客户端现有 InboxEvent 的 id/cursor 不映射为新的服务端功能，真实适配器不强制要求。

收到 message 时应用访客摘要；只有历史已经加载或当前对话正在展示时加入消息集合。其他端此前没有坐席发送中气泡，也能依据完整结果新增；首次打开仍加载最近页。调用同一个现有 store 更新消息和访客，沿用其 ID/version 合并，不新建同步层。

access-changed 后重新查询身份/列表，并清除不再有权的对话、名片和草稿；服务端本身按当前权限停止无权分发。断线后重新连接并执行同一初始化流程，不新增差量恢复接口。临时断线保留合法文字/名片草稿，退出重登清空运行缓存。

## 6. 渠道与现有基础能力的边界

Desk 上述接口不依赖渠道原始报文形状。入站适配只需交给消息业务：companyChannelId、externalUserId、可选名称/头像/资料、externalMessageId、direction、content。账号指定企业；外部调用不得任意提交 companyId。出站取已授权 visitor 关联的账号、外部用户和纯文本，直接调用对应渠道 API，返回成功/失败说明及可用的外部消息 ID。

渠道回调统一路由 /api/channels/{companyChannelId}/callback，GET 用于渠道要求的验证，POST 接收渠道原格式；只开放该回调路径并执行真实渠道签名/来源校验，不使用 Desk JWT 代替渠道验证。未知或尚未配置的协议返回不支持，不模拟成功。具体签名/素材获取是对应渠道适配器的普通实现，复用仓库 docs/research/channels 的已核实资料，不改变 Desk 路由或三表。

既有 channel_info 继续保存该账号的接入参数和 externalAccountId，不新增重复的来源表。ChannelEnum 是已有平台代码，不当作全部生产协议已接通。接口实施与验收可以使用先前获准的受控渠道替身，但 Server HTTP/Socket、数据库和两个 Desk 客户端必须真实；实际接入哪些生产渠道如实记录，不把全部渠道账号/凭据准备变成三表设计的门槛。

## 7. 逐项接通与验收

顺序：企业登录 → 访客摘要/筛选 → 按需历史 → 来信 → 文本回复 → 结束/继续 → 名片 → 全部已有消息展示 → 权限变化 → 重连重新加载。三种接待方式、并排固定、草稿、表情/快捷回复插入、主题/设置及原滚动保留；静态/本地功能不加后端表。

新增迁移验证空库及 V3 升级，已有 Admin 数据保留；其余逐项验证正常接口、持久化、两个客户端同步及真实界面，最后核验打包桌面。运行所改项目已有 lint/类型/编译与相关测试。不要求先建立重复投递、复杂并发、断点重放或故障补偿专项测试体系。

上述范围已足以实施；字段/路径/报文不再等待新的讨论票。实现时发现真实问题再就地解决，不重建这轮已撤回的复杂方案。
