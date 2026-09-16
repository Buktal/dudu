# Desk 开发联调与服务接入

本阶段交付 Desk 前端，规格见 [#50](https://github.com/Buktal/dudu/issues/50)。真实账户认证与会话收发服务留到下一阶段。正式入口使用 `unavailableAccountApi` 显示登录页，登录操作明确报服务不可用；注入确认过的账户后，未接入的 inbox 仍通过 `unavailableInboxApi` 表达服务未连接。后续分别实现 account 与 inbox 的适配器，通过各自 `runtime.ts` 或 `App` 注入复用界面与状态模型。

## 启动开发数据

复制项目根 `.env.example` 为 `.env.development.local`，将 `VITE_DESK_MOCK` 改为 `true`，运行 `yarn dev` 或 `yarn tauri:dev`。修改环境变量后重启开发服务。开发与真实适配器使用同一套工作台 UI；页面不显示开发说明、演示标签或常驻健康状态栏。

只有 `import.meta.env.DEV && import.meta.env.VITE_DESK_MOCK === "true"` 同时成立，运行时才动态导入开发适配器。`yarn build` 与 `yarn tauri:build` 生成的正式包不会导入开发工厂，即使构建环境误设了此开关也一样。开发开关不会获取登录令牌或访问真实渠道。

开发模式首次自动进入“林舟 · 嘟嘟服务中心”的工作台，方便直接查看会话。可以从右上角头像打开账户信息或设置，也可完整体验退出与重新登录。开发账号为 `linzhou`，密码为 `desk123`；这两项只存在于开发适配器，不进入正式产物，不在产品页面展示提示。退出后，同一标签页刷新仍停留在登录页，重新登录恢复开发身份。此行为通过 `sessionStorage` 中的 `dudu-desk.development-signed-out` 标记实现，不保存密码或令牌；新标签页重新进入初始开发会话。

退出成功会卸载 inbox，取消请求和订阅、清空草稿、附件与固定对象。主题、接待方式和减少动态效果保留在独立偏好中。账号资料由 `features/account/mocks.ts` 提供，来访会话由 `features/inbox/mocks.ts` 提供，均通过正式组件展示。

`mocks.ts` 使用已安装的 Faker，固定 seed 为 `20260916`。默认 36 个会话，每页 12 个；消息历史每页 20 条，页内按 `sequence` 升序，`nextCursor` 指向更早的历史。前三个来访用户都叫“林小满”，但渠道或账号不同；第 5 个回复受限，第 6 个权限未知，第 7 个仅支持文字，第 8 个没有昵称。

前三位初始等待分别为 18、4、11 分钟，完整历史分别为 34、52、26 条，方便观察“等待最久”和“消息最多”的不同顺序。名单排序后不保证这三位都在首屏；可以搜索姓名或按来源定位。头像为本地稳定 SVG，接待内容来自 12 组连贯场景。

第一个会话包含所有消息体类型：文字、图片、文件、语音、视频、链接、位置、引用、卡片、不支持的渠道内容和附带文件的回复。图片与文本附件使用本地数据；语音和视频样本刻意没有可用资源地址，用于验收媒体不可读取时的降级界面。所有资料、附件、发送和回执只保存在该开发实例的内存中。

## 明确的异常场景

在 `.env.development.local` 设置 `VITE_DESK_SCENARIO` 后重启开发服务。未设置或值不识别时使用 `default`。失败场景使用正常业务错误文案，不带开发前缀。

| 值 | 行为 |
| --- | --- |
| `default` | 固定会话、资料和媒体样本；手动操作才改变数据 |
| `empty` | 合法的空会话列表 |
| `list-error` | 第一次读取会话列表失败，重试可恢复 |
| `read-error` | 第一次读取消息历史失败，重试可恢复 |
| `profile-error` | 第一次读取资料失败，重试可恢复 |
| `send-rejected` | 第一次发送收到明确业务拒绝；保留原内容可重试 |
| `send-unconfirmed` | 第一次发送实际已被开发服务接受，但请求返回网络错误；查询历史或以相同发送编号重试可确认，始终只有一条消息 |
| `upload-error` | 第一次准备附件时模拟上传中断 |
| `auth-expired` | 第一次读取列表返回认证业务错误 `10101` |
| `offline` | 数据访问持续失败，订阅报告断开；控制器显式切回 `connected` 后恢复 |

这些场景每个工作区与坐席分别初始化。应用不会通过计时器制造新来信、投递成功或已读状态。发送正常完成返回 `accepted`，后续状态必须来自显式回执。

## 开发控制器

逻辑测试可直接创建 `createDevelopmentInboxApi({ scenario, now })`，获得 `{ api, controls, dispose }`。`api` 与生产接口同形；`controls` 只用于开发验证，不进入正式 UI。

| 控制器方法 | 用途 |
| --- | --- |
| `receive(context, conversationId, text)` | 添加来信，更新未读和待回复状态，推送消息与会话事件 |
| `receipt(context, { conversationId, messageId, state, reason? })` | 添加真实受控回执，同步更新历史消息的版本与状态 |
| `connection(context, state)` | 改变订阅连接状态；重新连通时补收断开期间的事件 |
| `replay(context, cursor)` | 再投递某条既有事件，验证重复或乱序投递的去重 |
| `capability(context, conversationId, capability)` | 更新渠道回复权限并发送版本化事件 |
| `remove(context, conversationId)` | 移除失效会话并发送移除事件 |
| `failNext(context, operation, DeskApiError)` | 让下一次指定 API 操作失败 |
| `holdNext(context, operation)` | 挂起下一次指定操作，返回手动放行函数；中途取消不会提交操作 |
| `dispose()` | 清理该开发实例的全部订阅、挂起操作和内存数据 |

例如，可先 `holdNext(context, "send")`，发起回复后切换会话或修改草稿，再手动放行，用于验证迟到响应不会清掉新的输入。订阅返回退订函数，`AbortSignal` 也可立即退订。

## 真实适配器契约

接口定义位于 `src/features/inbox/api.ts`，载体定义位于 `types.ts`。以下名称是前端适配器的方法，不是已发布的 HTTP 路由。实际 URL、认证入口与传输协议由后续 Server 阶段确定。

| 方法 | 关键约定 |
| --- | --- |
| `listConversations` | 接受完整搜索、渠道、状态、星标、等待/消息量排序和分页游标；返回列表、游标、可选总数/全量汇总/来源目录 |
| `listMessages` | 按会话 ID 读取历史；消息有稳定 ID、会话 ID、序号与版本；页内升序，游标继续更早历史 |
| `readProfile` / `saveProfile` | 缺失、空值与读取失败分开表达；保存携带版本，拒绝过期版本覆盖新资料 |
| `getCapability` | 返回允许、受限或未知，支持的内容类型、原因、下一步及可选时间、数量与附件约束 |
| `send` | 接受完整目标身份、稳定 `clientRequestId`、文字及已准备附件；相同编号和内容重复请求应幂等返回同一消息 |
| `prepareAttachment` | 绑定完整回复目标；返回服务确认的资源 ID、名称、类型、大小与可选访问地址；支持取消 |
| `markRead` | 仅确认到 `throughSequence` 的已读，不把更新的来信清为已读，不修改待回复业务状态 |
| `setStarred` / `endConversation` / `resumeConversation` | 返回服务确认后的会话快照及新版本；继续接待保留真实渠道能力 |
| `subscribe` | 使用工作上下文、取消信号、恢复游标，独立报告连接状态与业务事件；返回退订函数 |

每个请求显式携带 `{ workspaceId, agentId }` 和 `AbortSignal`。真实服务必须结合认证验证上下文权限；客户端标识本身不构成授权。发送目标包含会话、来访用户、外部用户、渠道、渠道账号 ID，不能用昵称或数组下标代替。

`InboxEvent.id` 在上下文内唯一，`cursor` 是客户端不应解析的恢复检查点；真实订阅需支持从检查点补收，或提供重连后的等价查询补偿。开发适配器内部采用数字字符串，客户端不得依赖该实现。会话与权限快照使用会话版本；消息快照与该消息的回执共用单调递增的消息版本。回执可通过消息 ID 或 `clientRequestId` 关联，可能先于发送请求的响应到达。

## HTTP 与失败语义

`src/lib/desk-http.ts` 的 `requestDesk` 只使用调用方提供的 URL、Bearer token、取消信号和数据解析器。它不会推断路由、调用开发登录端点或注入示例数据。真实接口的解析器应在返回业务载体之前校验所需字段。

遵守 Server 的 `R<T>` 约定：HTTP 200 只说明请求已被处理，只有 `{ code: 0, msg, data }` 才代表业务成功。`101xx` 是认证错误，其余非零码为业务错误。网关或网络传输失败、取消、无效 JSON、缺字段以及载体解析失败分别返回明确的 `DeskApiError.kind`。

发送被服务接受不等于渠道投递或来访用户已读。网络中断或超时不能推定发送失败；需要保留原始发送编号与内容，等待回执、查询补偿或幂等重试。明确业务拒绝才可以直接显示确定失败。订阅关闭、坐席切换和应用卸载必须取消在途工作并清理事件监听。

## 验证

针对 API seam 的回归用例位于 `src/lib/desk-http.test.ts` 与 `src/features/inbox/development-api.test.ts`：

```powershell
yarn test src/lib/desk-http.test.ts src/features/inbox/development-api.test.ts
yarn check:type
yarn lint
```

全应用验收及桌面构建随本阶段实施票统一执行。开发适配器的测试通过不能代表真实渠道已经联通。
