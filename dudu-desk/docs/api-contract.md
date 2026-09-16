# Desk 接待 API 契约

本文件说明 [规格 #50](https://github.com/Buktal/dudu/issues/50) 对应的前端接入边界。准确的方法签名以 [api.ts](../src/features/inbox/api.ts) 为准，领域字段以 [types.ts](../src/features/inbox/types.ts) 为准；跨 feature 使用 [公开入口](../src/features/inbox/index.ts)。

当前正式适配器为 `unavailableInboxApi`。本阶段未提供真实会话、历史、发送、上传或订阅服务；下文方法名是前端契约，实际 HTTP 路由、传输协议、登录入口和 Server 实现由下一阶段确定。开发替身遵循相同接口，开关及场景见 [开发联调说明](development.md)。

## 工作上下文与身份

除可选的 `dispose()` 外，每个方法都接收 `RequestOptions`：

```ts
type WorkContext = { agentId: string; workspaceId: string };
type RequestOptions = { context: WorkContext; signal: AbortSignal };
```

`workspaceId` 与 `agentId` 限定本次坐席工作上下文。服务端必须结合 Bearer 凭据验证权限；客户端传入的标识本身不构成授权。默认未连接上下文仅用于打开工作台，不代表已登录身份。

`VisitorIdentity` 分别保留稳定来访标识 `id`、渠道内用户标识 `externalUserId`、`channelId`、`accountId` 及真实取得的显示信息。同名但来源不同的来访用户保持独立，不通过昵称、头像或列表下标合并。

发送时固定完整 `SendTarget`：`conversationId`、`visitorId`、`channelId`、`accountId`、`externalUserId`。在途请求和重试使用该目标快照，不能重新从当前选中行推导目标。所有业务数据、事件和临时编辑状态都受工作上下文隔离。

## 方法一览

下表的附加输入均与 `RequestOptions` 合并；仅 `dispose` 无输入。

| 方法 | 附加输入 | 结果 |
| --- | --- | --- |
| `listConversations` | `query: ConversationQuery`、可选 `cursor` | `Promise<ConversationPage>` |
| `listMessages` | `conversationId`、可选 `cursor` | `Promise<Page<InboxMessage>>` |
| `readProfile` | `conversationId` | `Promise<VisitorProfile>` |
| `getCapability` | `conversationId` | `Promise<ReplyCapability>` |
| `send` | `clientRequestId`、`target`、`text`、`attachments: MediaReference[]` | `Promise<InboxMessage>` |
| `prepareAttachment` | `target: SendTarget`、`file: File` | `Promise<PreparedAttachment>` |
| `markRead` | `conversationId`、`throughSequence` | `Promise<Conversation>` |
| `setStarred` | `conversationId`、`starred` | `Promise<Conversation>` |
| `saveProfile` | `conversationId`、`tags`、`note`、`version` | `Promise<VisitorProfile>` |
| `endConversation` | `conversationId` | `Promise<Conversation>` |
| `resumeConversation` | `conversationId` | `Promise<Conversation>` |
| `subscribe` | 可选 `cursor`、`onEvent`、`onConnection` | 同步返回退订函数 `() => void` |
| `dispose?` | 无 | `void`，可选的适配器实例清理 |

能力暂不支持时返回明确的 `DeskApiError`，例如 `unavailable`；不能用空数据或假成功冒充已完成操作。合法空列表、缺失资料和请求失败使用不同表示。

## 查询、实体与版本

`ConversationQuery` 包含 `search`、`channelId`、`status`、`starred` 和 `order`。会话状态为 `needs-reply`、`waiting`、`closed`；查询另有 `active`（排除已结束，界面“全部”的默认值）和 `all`（包含已结束，供星标等查询使用）。筛选和排序作用于整个授权范围，在服务分页之前执行。

`order: "wait"` 表示“等待最久”：待回复优先，再按最早的 `waitingSince` 排列；`order: "messages"` 表示“消息最多”，按完整的 `messageCount` 降序。已知的等待起点或数量优先于缺失值；相同值用 `updatedAt` 降序和稳定会话 ID 决定次序。前端不能用最后活跃时间冒充等待时间，也不能用已加载历史条数冒充总消息数。

`waitingSince` 是本轮未回复来信开始等待的 ISO 时间；后续追问不重置起点，恢复或回复后的状态由服务确认。`messageCount` 是完整会话的消息总数。两者可省略，缺失时界面只显示真实已知信息。搜索应覆盖访客姓名、渠道名、账号名、外部身份、标签和完整消息历史；本地未加载的历史不能被当成不存在。服务返回的搜索结果是成员依据，标签保存和重连后需重新查询。

分页统一返回 `{ items, nextCursor, total? }`；`nextCursor: null` 表示没有后续页，`total` 可省略。游标由适配器提供，前端不依据列表长度生成，也不解析它的内部格式。

会话页 `ConversationPage` 另可返回 `counts: { active, needsReply, waiting, closed, starred }` 和 `channels: { id, name }[]`。`total` 是当前筛选的总数；`counts` 和 `channels` 是当前坐席授权范围内的完整汇总与来源目录，不受当前分页限制。缺少汇总时不把已加载行数显示成全量计数。

普通刷新从第一页重新定位当前已加载的成员，直到全部找到，或读到末页确认其不再匹配；新排名不能把仍匹配的编辑中卡片挤出列表。刷新保留有效行的相对顺序与下一页游标；搜索、渠道或状态变化会从第一页重建。专注和并排按当前排序派生展示顺序，卡片模式保持卡片位置，新命中项追加到后方。固定访客选择器和“下一位”使用独立查询，不修改主队列的搜索、筛选或分页。

实时事件需要刷新列表时，先等待正在读取的分页完成，再合并执行一次刷新。读取失败保留原数据与失败的刷新／分页意图；`retryConversations` 重试对应读取，成功后再处理待刷新需求，后台刷新不能吞掉分页错误。

历史第一页返回最新一段，页内按 `sequence` 升序；下一页游标继续读取更早历史。分页和订阅可以重叠，但实体身份与版本必须一致，使前端能够归并。消息 `id` 在工作上下文内应稳定且不跨会话冲突；`serverId` 和 `clientRequestId` 用于关联服务端消息与本地发送记录。

| 字段 / 版本域 | 约定 |
| --- | --- |
| `Conversation.version` | 会话快照的可比较版本，包含队列查询和操作返回的快照 |
| 能力事件与移除事件的 `version` | 与所属会话使用可比较的版本域，旧事件不能覆盖或复活更新状态 |
| `InboxMessage.sequence` | 会话内的消息排序依据，不等于数组下标，也不依赖展示时间排序 |
| `InboxMessage.version`、回执的 `version` | 同一消息共用单调版本域；旧历史或旧响应不能覆盖新回执 |
| `VisitorProfile.version` | 资料快照版本，保存时用来检测并发修改 |
| 本地草稿 revision | 仅用于保护提交期间的新编辑，不代替服务端实体版本 |

相同实体的相同版本应表达一致事实。`createdAt`、`updatedAt` 和能力的 `expiresAt` 使用可解析的 ISO 时间。版本用于判断新旧，时间用于展示与能力到期判断。

`VisitorProfile.fields` 的每个字段区分 `available`（有实际值）、`not-provided`（渠道未提供）和 `empty`（未填写）；读取失败由请求错误表达。标签与内部备注通过 `saveProfile` 保存，`version` 使用开始编辑时的基准版本。服务端应拒绝过期版本覆盖，新失败不能清掉坐席的本地编辑。

`setStarred` 返回服务确认的会话快照；`endConversation` 成功返回该会话的 `closed` 快照。`resumeConversation` 必须返回相同会话的 `needs-reply` 或 `waiting` 快照及当前真实回复能力，失败时仍保持已结束状态和草稿。继续接待不代表重开渠道回复窗口，不能把 `restricted` / `unknown` 权限改为允许；迟到的恢复响应也不能覆盖较新的关闭事件。来信未读、是否待回复、出站投递和渠道可回复能力是独立维度。`markRead` 只确认 `throughSequence` 及以前的来信，不能清掉之后的新来信，也不能因此改变待回复状态。

## 发送与回执

`send` 的一次逻辑提交包含稳定的 `clientRequestId`、完整目标、文字和已准备的附件引用。明确失败后的重试沿用原编号、原目标和原内容；服务端需要以该关联实现幂等，前端去重本身不保证渠道只收到一次。

成功响应应是所属会话的 `outgoing` 消息，并携带有实际证据的 `accepted`、`sent`、`delivered` 或 `read` 状态。若返回 `clientRequestId`，必须与提交一致；真实适配器应保留关联标识，以便历史、响应和早到回执归并。响应不匹配或无法确认受理时按无效响应处理。

| 投递状态 | 含义 |
| --- | --- |
| `sending` | 本地正在提交 |
| `accepted` | 服务已受理，尚不能推断渠道送达 |
| `sent` | 有依据确认已发送 |
| `delivered` | 有真实送达依据 |
| `read` | 有真实已读依据 |
| `failed` | 收到明确失败，保留原内容并允许受能力约束的重试 |
| `unconfirmed` | 结果尚未确认，需要回执或查询补偿 |

网络中断、超时、取消或无法解析的响应不能证明服务端未接收消息。前端保留未确认状态并等待补偿，不自动重发；也不通过计时器推进送达或已读。查询和回执确认原提交后，可以更新同一条本地消息。

发送结果只清理该次提交仍对应的文字版本和附件，提交期间的新输入继续保留。普通发送保持当前会话；“发送并下一位”在明确受理后，从全局待回复队列按等待顺序分页寻找可进行文字回复的另一位访客，不受当前搜索、渠道或星标筛选限制，也不隐含结束接待。

若坐席期间改变了回复对象、当前会话已结束，或收到同访客的新来信，则不自动推进。提交时保存已知入站消息和事件的最高序号；随后实时入站事件与该快照比较，即使新追问先经历史查询到达也能阻止推进。仅补读既有历史或重放提交前已知事件不会被误认为新来信。查找下一位失败只提示手动选择，不把已受理的消息改为发送失败；卡片模式中的下一位不在当前筛选结果内时，打开该访客的完整对话，保留原筛选和草稿。

消息体可表示文字、图片、音频、视频、文件、文字与附件组合、链接、位置、引用、渠道卡片及未知类型。`unknown` 保留原类型与可用说明；仅有商品或订单标识时不得补造价格、状态或处理动作。收到某种类型不代表该渠道也支持发送此类型。

## 回复能力与附件

`ReplyCapability.state` 为 `allowed`、`restricted` 或 `unknown`；`kinds` 明确允许的 `text`、`image`、`file`、`audio`、`video`。限制可附带真实的 `reason`、`nextStep`、`expiresAt`、`remaining` 及附件约束 `{ maxBytes, maxCount, mimeTypes }`。未知不能当作允许，下一步提示不能暗示未实现的平台能力。

发送前检查连接、会话是否关闭、能力状态、有效期、剩余额度和本次提交涉及的全部类型。附件还需满足数量、单文件大小及 MIME 约束，并已准备完成；服务端仍是最终判定方。

`getCapability` 的独立响应不带版本。前端记录请求开始时的会话版本与已知能力事件版本，防止迟到查询覆盖较新的事件；订阅中的能力变更必须携带版本。

`prepareAttachment` 绑定完整发送目标，输入本地 `File`，返回服务确认的 `PreparedAttachment`（即 `MediaReference`）：素材 `id`、`kind`、`name`、`mimeType`、`size` 和可选 `url`。本地文件或预览地址不代表上传完成，也不能充当服务端素材引用。上传传输、素材访问鉴权与路由由真实适配器负责。

Redux 只保存可序列化元数据；本地文件、预览 URL 和取消控制器由运行时资源表持有。移除附件、确认提交、会话失效或销毁上下文时清理对应资源；失败和未确认提交继续保留所需内容。已上传但未使用的远端素材清理由适配器与 Server 的资源策略承担，当前契约没有虚构删除素材接口。

## 增量事件与重连

每个 `InboxEvent` 包含上下文内唯一的 `id`、`context` 和不透明恢复游标 `cursor`，另包含以下载荷之一：

| `type` | 载荷 |
| --- | --- |
| `conversation` | 会话快照 `conversation` |
| `message` | 消息快照 `message` |
| `receipt` | `conversationId`、`messageId?`、`clientRequestId?`、`version`、`delivery` |
| `capability` | `conversationId`、`capability`、`version` |
| `removed` | `conversationId`、`version` |

回执至少通过 `messageId` 或 `clientRequestId` 之一关联消息，并可能早于发送请求的响应到达。重复、乱序事件使用事件 ID 和实体版本归并；当前上下文之外的事件不能影响工作台。

`onConnection` 独立报告 `unavailable`、`connecting`、`connected`、`reconnecting` 或 `disconnected`，不能仅凭收到一条消息推断连接健康。`subscribe` 接收恢复游标，适配器应支持从检查点补收，或与查询补偿协调，避免重连期间漏消息。

当前前端重连时补读当前查询的会话队列、已加载会话的新历史与能力，补偿完成后才恢复为 `connected`；失败保留原数据和草稿并提供重试。恢复查询中的分页游标必须向前推进，循环返回同一游标会被视为 `invalid-response`。这不同于允许重复投递同一事件。

`removed` 表示会话失效：解除主接待、固定窗、回复目标与完整历史引用，取消相关工作并释放媒体资源。过期请求不能复活已移除会话，也不能把原待发送内容自动改投另一位来访用户。

## 取消、所有权与销毁

适配器应在开始请求前和等待期间响应 `AbortSignal`，并在取消后停止交付结果。前端同时使用请求身份与工作上下文 generation 防止迟到结果回写。取消网络等待不代表远端操作回滚，尤其不能据此自动重复发送。

`subscribe` 同步返回退订函数；退订函数或该订阅的 `signal` 取消都只清理这一订阅及其监听。清理应可重复调用，已退出的订阅不再触发回调。

可选的 `dispose()` 同步清理整个适配器实例拥有的连接、监听、计时器、挂起请求和资源，并应可安全重复调用。它与取消一次请求、退订一次订阅的作用范围不同。

| 创建 / 注入方式 | 适配器所有者 | 清理责任 |
| --- | --- | --- |
| `InboxWorkspace` 未传 `api`，通过 `loadInboxApi()` 创建 | 工作台 | 卸载或上下文 / 适配器变更时，先销毁 store 运行状态，再调用自有实例的 `dispose?.()`；失效后才完成加载的自有实例也立即销毁 |
| 显式传入 `<InboxWorkspace api={adapter} context={context} />` | 调用方 | 工作台取消自己的请求与订阅，调用方在所有消费者释放后销毁适配器 |
| 调用 `createInboxStore({ api, context })` | 调用方 | 通过 `store.dispatch(destroyInbox())` 清理运行状态，按自己的实例生命周期调用 `api.dispose?.()` |

通过 `store.dispatch` 执行的 `destroyInbox` 与 `resetContext` 命令会取消请求、退订、撤销本地预览并清空临时状态，不代替调用方销毁外部适配器。`InboxWorkspace` 依据 `api` 引用及 `context.agentId` / `context.workspaceId` 的变化重建运行上下文；传入稳定的适配器引用，避免普通渲染意外重置工作区。

主题和模式由独立偏好入口保存；临时草稿、附件、固定对象和旧选择不跨运行恢复。临时断线不会销毁本次草稿。登出或身份切换时应更换工作上下文或卸载工作台，而非将原 store 交给新身份使用。

## HTTP 与失败语义

遵循 [统一响应 ADR](../../docs/adr/0006-always-200-segmented-error-codes.md) 与 [JWT ADR](../../docs/adr/0007-jwt-auth-chain.md)。共享 [requestDesk](../src/lib/desk-http.ts) 接受调用方提供的 `url`、`token`、`signal`、`parse`，以及可选 `method`、`body`、`fetcher`；路由和载体校验属于适配器。

受保护 HTTP 请求使用 `Authorization: Bearer`。`requestDesk` 解析 `{ code, msg, data }`，要求整数业务码、字符串消息和存在的 `data` 字段；只有 `code: 0` 代表业务成功，HTTP 200 本身不够。适配器提供的 `parse` 还需校验实际领域载体，响应封装合法不等于消息、身份或能力合法。

| `DeskApiError.kind` | 含义 / 当前 HTTP 映射 |
| --- | --- |
| `authentication` | 业务码 `10100`–`10199`，或 HTTP 401 / 403 |
| `business` | 其余非零业务码，保留服务端消息和业务码 |
| `invalid-response` | 非法 JSON、响应封装不完整、领域解析异常或不匹配的业务结果 |
| `unavailable` | 服务或操作尚不可用 |
| `network` | 网络传输失败或其它非 2xx HTTP 状态 |
| `aborted` | 请求已取消 |

[DeskApiError](../src/lib/api-response.ts) 携带 `kind`、`message` 和可选 `code`；状态层转换为可序列化的 `ApiFailure`。未知异常不会被默认为业务成功。发送结果未确认的处理仍遵循上文语义，不能直接把所有异常统一显示为确定失败。

真实凭据由外部认证会话提供，不硬编码、不写入主题偏好，也不自动调用开发 token 端点。正式登录服务和凭据生命周期留给后续接入阶段。

## 后续接入顺序

1. 与 Server 对齐实际路由、认证来源、身份映射、版本域、发送幂等及事件恢复策略，逐项实现 `InboxApi`。
2. 在适配器边界校验响应并转换为领域载体；通过 `runtime.ts` 或显式 `api` / `context` 注入接入同一工作台，保持布局组件不依赖传输协议。
3. 使用可控请求与事件验证身份隔离、迟到结果、失败重试、重复与乱序、重连补偿和资源清理；现有开发场景见 [development.md](development.md)。
4. 再进行真实渠道收发、附件与回执验收。前端构建或契约替身通过不能替代这一步，也不能作为真实服务已接通的声明。
