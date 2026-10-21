# 钉钉开放平台 事件推送 事实库

> 研究日期：2026-09-10；复核：2026-09-10（WebFetch 直抓 3 页全文逐字复验 + WebSearch 官方站内摘录补强）
> 方法：WebFetch 直抓 `open.dingtalk.com` 官方文档 `.md` 原文（逐字）+ WebSearch 官方站内摘录（标注 `[摘录]`）+ `help.dingtalk.io` 官方镜像摘录（标注 `[镜像]`，原文同 open.dingtalk.com）
> 只认 primary sources：`open.dingtalk.com` 官方文档、官方 SDK（`github.com/open-dingtalk/*`）、API 本体。每个 claim 标来源 URL；抓不到标 `待核验(09-27)`
> 用途：mock-pulse 高保真模拟「钉钉 → 开发者回调地址」的推送（旧 oapi 回调 `encrypt+signature` 体系 / 新事件订阅 Stream+HTTP 双通道 / 机器人收消息独立验签体系）
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符 `xxxx` 原文）

## 1. 官方文档入口与关键页面地址

- 门户：https://open.dingtalk.com/ ；开发者后台：https://open-dev.dingtalk.com/ ；API Explorer：https://open-dev.dingtalk.com/apiExplorer
- 事件订阅总览（企业内部应用，全部事件目录）：https://open.dingtalk.com/document/orgapp/org-event-overview.md
- 事件订阅总览（第三方企业应用，全文已直抓）：https://open.dingtalk.com/document/isvapp/event-subscription-overview.md （`.md` 直抓全文，2026-09-10 复核；授权 4 事件/通讯录 18 事件/会话 11 事件/审批广播+定向 4 事件/考勤 11/待办 3/日程 1/存储 3/AI 助理 2/项目 7/钉工牌 3/直播 4/会议 4/服务群 3/应用管理 4/应用市场 5/人事 6/招聘 5/财务 10/机器人 2/CRM 2/荣誉 2/专属 2/教育 10/医疗 2/行业通用 4，见 §2 各节）
- 事件订阅概述（新版 development 树，Stream vs HTTP 一页讲清）：https://open.dingtalk.com/document/development/event-subscription-overview.md
- 服务端 Stream 模式（原理/五零优势/50 连接限制/三 topic）：https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md
- 新版 accessToken（`api.dingtalk.com`）：https://open.dingtalk.com/document/development/obtain-the-access-token-of-an-internal-app.md ；旧版 access_token（`oapi.dingtalk.com/gettoken`）：https://open.dingtalk.com/document/development/obtain-orgapp-token.md

本次实际抓到并核实的页面清单（`.md` 直抓全文）

| 主题 | URL | 核验方式 |
|---|---|---|
| 事件订阅概述（Stream/HTTP 适用应用/加解密对照） | https://open.dingtalk.com/document/development/event-subscription-overview.md | WebFetch 全文 |
| 服务端 Stream 模式（WebSocket 鉴权/50 连接/topic 常量/SDK） | https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md | WebFetch 全文 |
| 企业内部应用事件总目录（通讯录/审批/IM/考勤等全量链接） | https://open.dingtalk.com/document/orgapp/org-event-overview.md | WebFetch 全文 |
| 回调事件消息体加解密（EncodingAESKey/AESKey/sha1/调试向量） | https://open.dingtalk.com/document/app/callback-event-message-body-encryption-and-decryption.md | WebFetch 全文 |
| 通用回调事件（check_url/suite_ticket/check_create_suite_url/success 加密回包） | https://open.dingtalk.com/document/development/event-subscription-callback-test-url-event.md | WebFetch 全文 |
| 注册回调事件（旧 oapi `register_call_back`，单 URL/token/aes_key） | https://open.dingtalk.com/document/isvapp/register-callback-events.md | WebFetch 全文 |
| 获取推送失败的事件列表（重试 10s/30s/3~5min 查询/最多 200） | https://open.dingtalk.com/document/development/obtain-the-event-list-of-failed-push-messages.md | WebFetch 全文 |
| 机器人接收消息（含 HTTP header HmacSHA256 验签/6 种消息体） | https://open.dingtalk.com/document/orgapp/receive-message.md | WebFetch 全文 |
| 服务号接收单聊消息 `isw_user_msg_received` | https://open.dingtalk.com/document/orgapp/event-isw-user-msg-received.md | WebFetch 全文 |
| 审批实例 `bpms_instance_change`（订阅规则 bizCategoryId/processCode/type） | https://open.dingtalk.com/document/development/event-bpms-instance-change.md | WebFetch 全文 |
| 审批任务 `bpms_task_change` | https://open.dingtalk.com/document/development/event-bpms-task-change.md | WebFetch 全文 |
| 通讯录用户更改 `user_modify_org`（diffInfo prev/curr） | https://open.dingtalk.com/document/orgapp/event-v3user-modify-org.md | WebFetch 全文 |
| 通讯录用户离职 `user_leave_org` | https://open.dingtalk.com/document/orgapp/event-v3user-leave-org.md | WebFetch 全文 |
| 群会话添加人员 `chat_add_member`（Stream/HTTP/SyncHTTP 三形态+biz_type=177） | https://open.dingtalk.com/document/orgapp/event-chat-add-member.md | WebFetch 全文 |
| 套件票据 `suite_ticket`（5 小时推送/biz_type=2） | https://open.dingtalk.com/document/isvapp/event-suite-ticket.md | WebFetch 全文 |
| 获取企业内部应用 access_token（旧 oapi 版） | https://open.dingtalk.com/document/orgapp/obtain-orgapp-token.md | `[摘录]`（WebSearch 官方页原文，与 development/obtain-orgapp-token.md 同文） |
| 获取企业内部应用 accessToken（新 api 版） | https://open.dingtalk.com/document/development/obtain-the-access-token-of-an-internal-app.md | WebFetch 全文（2026-09-10 复核升级） |
| 获取第三方应用授权企业 accessToken（新版 corpAccessToken） | https://open.dingtalk.com/document/isvapp/obtain-the-access_token-of-the-authorized-enterprise.md | WebFetch 全文 |
| 服务商获取授权企业 access_token（旧版 service/get_corp_token） | https://open.dingtalk.com/document/isvapp/obtains-the-enterprise-authorized-credential.md | WebFetch 全文 |
| 发送工作通知 `asyncsend_v2` | https://open.dingtalk.com/document/development/asynchronous-sending-of-enterprise-session-messages.md | WebFetch 全文（2026-09-10 复核升级） |
| 机器人发送群聊消息 `POST /v1.0/robot/groupMessages/send` | https://open.dingtalk.com/document/development/the-robot-sends-a-group-message.md | WebFetch 全文（2026-09-10 复核升级） |
| 配置 Stream 推送（推荐，开发配置>事件订阅四步） | https://open.dingtalk.com/document/orgapp/configure-stream-push | `[摘录]`（2026-09-10 复核：前提开发者权限+内部应用+先完成服务端开发；保存后事件列表才展示） |
| 旧回调审批事件（type start/finish/terminate/cancel 语义） | https://open.dingtalk.com/document/isvapp/approval-events-2 | `[摘录]`（2026-09-10 复核：更新于 2024-01-11；实例 `type` start/finish/terminate，任务 `type` finish/cancel；`result` agree/refuse） |
| 旧回调通讯录事件（15 类 call_back_tag 字典） | https://open.dingtalk.com/document/app/tvgq1n | WebFetch 全文（2026-09-10 复核升级；15 行：user_add/modify/leave/active + org_admin_add/remove + org_dept_create/modify/remove + org_remove/org_change + label_user_change/conf_add/conf_del/conf_modify） |
| API 调用步骤详解（准入：建应用→配权限→取 Token→调 API） | https://open.dingtalk.com/document/development/server-api-calling-guide.md | `[摘录]`（2026-09-10 复核：`server-api-calling-guide` 全流程页；敏感权限走 authCode 换 user token） |
| 新 HTTP 回调握手（1500ms 回 success 加密包） | https://open.dingtalk.com/document/development/configure-event-subscription （镜像英文版全文 https://help.dingtalk.io/open/development/configure-event-subscription） | `[镜像]`全文（2026-09-10 复核：握手 `{"encrypt":"…"}` + 1500ms 内回 `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`；运行时同 1500ms；OWNER_KEY 控制台订阅=APP_KEY/注册API=组织维度；`getEncryptedMap("success")`；解密后通讯录示例；FAQ 调试向量，见 §3.2/§5.10） |

每种事件消息的文档地址（§1 必备：代表事件 → 文档 URL，同一目录 pattern 类推；全量目录见 org-event-overview 页正文）

| 事件英文名 | 中文名 | 文档 URL |
|---|---|---|
| `user_add_org` | 企业增加员工事件 | https://open.dingtalk.com/document/orgapp/event-v3user-add-org.md |
| `user_modify_org` | 通讯录用户更改 | https://open.dingtalk.com/document/orgapp/event-v3user-modify-org.md |
| `user_leave_org` | 通讯录用户离职 | https://open.dingtalk.com/document/orgapp/event-v3user-leave-org.md |
| `user_active_org` | 加入企业后用户激活 | https://open.dingtalk.com/document/orgapp/event-v3user-active-org.md |
| `org_admin_add` / `org_admin_remove` | 设为/取消管理员 | https://open.dingtalk.com/document/orgapp/event-org-admin-add.md ；https://open.dingtalk.com/document/orgapp/event-org-admin-remove.md |
| `org_dept_create` / `org_dept_modify` / `org_dept_remove` | 部门创建/修改/删除 | https://open.dingtalk.com/document/orgapp/event-org-dept-create.md ；https://open.dingtalk.com/document/orgapp/event-org-dept-modify.md ；https://open.dingtalk.com/document/orgapp/event-v3org-dept-remove.md |
| `org_change` / `org_remove` | 企业信息变更/企业删除 | https://open.dingtalk.com/document/orgapp/event-org-change.md ；https://open.dingtalk.com/document/orgapp/event-v3org-remove.md |
| `label_user_change` / `label_conf_add` / `label_conf_modify` / `label_conf_del` | 角色变更系 | https://open.dingtalk.com/document/orgapp/event-label-user-change.md ；https://open.dingtalk.com/document/orgapp/event-label-conf-add.md ；https://open.dingtalk.com/document/orgapp/event-label-conf-modify.md ；https://open.dingtalk.com/document/orgapp/event-label-conf-del.md |
| `bpms_instance_change` | 审批实例开始/结束/终止/删除 | https://open.dingtalk.com/document/orgapp/event-bpms-instance-change.md （development 树同文：https://open.dingtalk.com/document/development/event-bpms-instance-change.md） |
| `bpms_task_change` | 审批任务开始/结束/转交 | https://open.dingtalk.com/document/orgapp/event-bpms-task-change.md （development 树同文：https://open.dingtalk.com/document/development/event-bpms-task-change.md） |
| `workflow_instance_change_directed` | 审批实例状态变更（第三方定向，ISV 归属模板） | https://open.dingtalk.com/document/development/event-workflow-instance-change-directed （`[摘录]`全文结构见 §5.4） |
| `isw_user_msg_received` | 服务号接收单聊消息 | https://open.dingtalk.com/document/orgapp/event-isw-user-msg-received.md |
| 机器人收消息（无 eventType，独立 topic `/v1.0/im/bot/messages/get`） | 机器人接收消息 | https://open.dingtalk.com/document/orgapp/receive-message.md |
| `chat_add_member` / `chat_remove_member` / `chat_disband` / `chat_update_owner` / `chat_update_title` / `chat_quit` | 群会话管理系 | https://open.dingtalk.com/document/orgapp/event-chat-add-member.md （其余 slug 类推：`event-chat-remove-member`/`event-chat-disband`/`event-chat-update-owner`/`event-chat-update-title`/`event-chat-quit`/`event-chat-template-change`） |
| `event-robot-msg-read` / `event-robot-msg-recall` | 机器人消息已读/撤回 | https://open.dingtalk.com/document/orgapp/event-robot-msg-read.md ；https://open.dingtalk.com/document/orgapp/event-robot-msg-recall.md |
| `todo-task-create` / `todo-task-update` / `todo-task-delete` | 待办系 | https://open.dingtalk.com/document/orgapp/event-todo-task-create.md （update/delete 类推） |
| `check-in` / 考勤打卡/加班/班次/考勤组/假期 | 签到考勤系 | https://open.dingtalk.com/document/orgapp/event-check-in.md ；https://open.dingtalk.com/document/orgapp/event-attendance-check-record.md （其余见总目录页） |
| `calendar-event-change` | 日程变更 | https://open.dingtalk.com/document/orgapp/event-calendar-event-change.md |
| `meeting-status-change` / `meeting-member-status-change` | 视频会议系 | https://open.dingtalk.com/document/orgapp/event-meeting-status-change.md ；https://open.dingtalk.com/document/orgapp/event-meeting-member-status-change.md |
| `live-status-change-event` 等 4 页 | 直播系 | https://open.dingtalk.com/document/orgapp/event-live-status-change-event.md （其余见总目录页） |
| `storage-dentry-create/update/delete` | 存储文件系 | https://open.dingtalk.com/document/orgapp/event-storage-dentry-create.md （update/delete 类推；须配订阅文件变更接口） |
| `suite_ticket` | 套件票据（第三方） | https://open.dingtalk.com/document/isvapp/event-suite-ticket.md |
| `check_url` / `check_create_suite_url` / `check_update_suite_url` / `suite_ticket` / `tmp_auth_code` | 通用回调/握手系 | https://open.dingtalk.com/document/development/event-subscription-callback-test-url-event.md |
| `tmp_auth_code`（企业授权开通应用/推送授权码） | 第三方授权开通，解密后 `{TimeStamp,AuthCode,AuthCorpId,EventType:tmp_auth_code,SuiteKey}`，须回 success 加密包 | https://open.dingtalk.com/document/isvapp/enterprise-authorized-application-activation-event-1.md （全文，2026-09-10 复核直抓，见 §5.10） |
| `org_suite_auth`（套件授权/企业授权最新状态） | 第三方 Stream+SyncHTTP/RDS（HTTP 不支持）；RDS 高优表 `open_sync_biz_data`，`biz_type=4`（snake_case 字段） | https://open.dingtalk.com/document/isvapp/event-org-suite-auth.md （全文，2026-09-10 复核直抓，见 §5.10） |
| `user_add_org` / `user_modify_org`（第三方版） | 第三方 Stream+SyncHTTP/RDS（HTTP 不支持）；用户详情字段体；RDS `open_sync_biz_data_medium`，`biz_type=13`（add/modify 同值） | https://open.dingtalk.com/document/isvapp/event-user-add-org.md ；https://open.dingtalk.com/document/isvapp/event-user-modify-org.md （全文，2026-09-10 复核直抓，见 §5.10） |
| `chat_remove_member`（第三方版） | 企业内部 Stream+HTTP / 第三方 Stream+SyncHTTP/RDS；RDS `biz_type=178`（add=177） | https://open.dingtalk.com/document/isvapp/event-chat-remove-member.md （全文，2026-09-10 复核直抓，见 §5.10） |
| `robot_msg_read` / `robot_msg_recall`（isvapp 版三信封） | 企业内部 Stream+HTTP / 第三方 Stream+SyncHTTP/RDS；RDS `biz_type=260/261` | https://open.dingtalk.com/document/isvapp/event-robot-msg-read.md ；https://open.dingtalk.com/document/isvapp/event-robot-msg-recall.md （全文，2026-09-10 复核直抓，见 §5.10） |
| `workflow_instance_change_broadcast` / `workflow_task_change_directed` | 第三方 Stream+SyncHTTP/RDS（HTTP 不支持）；RDS `biz_type=245`（广播实例）/`248`（定向任务，实例定向=247） | https://open.dingtalk.com/document/isvapp/event-workflow-instance-change-broadcast.md ；https://open.dingtalk.com/document/isvapp/event-workflow-task-change-directed.md （全文，2026-09-10 复核直抓，见 §5.10） |

官方 SDK（包名/坐标出自官方文档正文）

- Stream Java：`com.dingtalk.open:dingtalk-stream`（新）/ 旧示例工程 `app-stream-client`；示例工程 https://github.com/open-dingtalk/dingtalk-stream-sdk-java-quick-start ；仓库 https://github.com/open-dingtalk/dingtalk-stream-sdk-java — 来源 https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md + `[摘录]` WebSearch 仓库 README + 2026-09-10 复核直抓仓库页（模块 `app-stream-api/app-stream-client/app-stream-network/app-stream-protocol/dingtalk-stream`，README "Java SDK for DingTalk Stream Mode API"，教程指 https://opensource.dingtalk.com/developerpedia/docs/explore/tutorials/stream/overview；版本号未取，见 §7.12）
- Stream Go：`go get github.com/open-dingtalk/dingtalk-stream-sdk-go`（orgapp 开发页示例为 `/v0.0.5` 后缀）— 来源同上 + `[摘录]` https://open.dingtalk.com/document/orgapp/develop-stream-mode-push-server.md
- Stream Python：`pip install dingtalk-stream`，`dingtalk_stream.DingTalkStreamClient` + `ChatbotHandler`/`Credential(client_id, client_secret)` — 来源 `[摘录]` https://github.com/open-dingtalk/dingtalk-stream-sdk-python
- Stream Node：`dingtalk-stream`（npm，周下载 26k 量级为镜像站数据仅参考）— 来源 `[摘录]` https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs
- 回调加解密库：https://github.com/open-dingtalk/dingtalk-callback-Crypto（注册页原文"单击这里获取回调加解密类库和对应demo"）— 来源 https://open.dingtalk.com/document/isvapp/register-callback-events.md ；旧三语 demo：Java QuickStart `CallbackController`、PHP `injekt/openapi-demo-php/isv/crypto`、C# `ian-cuc/suite-demo-c-` — 来源 https://open.dingtalk.com/document/app/callback-event-message-body-encryption-and-decryption.md
- 服务端 oapi SDK（`DefaultDingTalkClient` + `Oapi*Request`，如 `OapiGettokenRequest`/`OapiCallBackRegisterCallBackRequest`/`OapiMessageCorpconversationAsyncsendV2Request`）— 来源各 API 页请求示例（JAVA SDK 节）

---

## 2. 消息/事件推送全清单

钉钉至少有 **三套并行推送体系**，验签与载荷完全不同，模拟时必须区分

| 体系 | 适用 | 载荷信封 | 验签 | 握手 |
|---|---|---|---|---|
| A. 新事件订阅 Stream | 企业内部应用、第三方企业应用（推荐） | `{eventUnifiedAppId, eventCorpId, eventType, eventId, eventBornTime, data:{...}}` | 无（建连时 ClientID/Secret 鉴权，TLS 传输加密，业务明文） | WebSocket 反向连接，无 challenge |
| B. 新事件订阅 HTTP 推送 | 企业内部应用（第三方：HTTP 不支持，走 SyncHTTP/RDS，见群事件表） | `{EventType, EventTime, CorpId, BizId, eventId, ...业务字段平铺}` | AES 密文 `encrypt` + `signature/timestamp/nonce`（同旧体系算法） | 加密 challenge（审批/通讯录页称"订阅设置"，握手细节待核验(09-27)） |
| C. 旧 oapi 回调（`call_back/register`） | 企业内部应用、第三方企业应用 | `POST body {"encrypt":"..."}` + URL 参 `signature/timestamp/nonce`；解密后 `{"EventType":...}` | `sha1(sort(token,timestamp,nonce,msg_encrypt))` + AES 解密 | `check_url` 事件 + 返回 `success` 加密包 |
| D. 机器人收消息（独立通道） | 企业机器人（HTTP 或 Stream 二选一） | 明文 JSON（`msgId/conversationType/msgtype/text/...`，见 §5.1） | HTTP 模式：header `timestamp/sign=HmacSHA256(timestamp+\n+appSecret)`；Stream 模式：零验签 | 消息接收模式在创建机器人时二选一 |

### 2.1 通讯录类（企业内部应用：Stream+HTTP 均支持，SyncHTTP/RDS 不支持）

来源：https://open.dingtalk.com/document/orgapp/org-event-overview.md（目录）+ 全文页（modify/leave）+ `[摘录]` development/org-event-overview.md（第三方版目录）+ `[摘录]` apifox 镜像（旧回调字段 `UserId/OptStaffId/TimeStamp`，非官方，仅对照）

| 事件英文名 | 触发语义 | 备注 |
|---|---|---|
| `user_add_org` | 通讯录用户增加 | 新事件体 `data:{timeStamp, userId[]}`（leave 页同构，add 全文待核验(09-27)）；旧回调体为 `{CorpId, EventType, UserId[], TimeStamp}`（`[摘录]`非官方镜像，对照用）；第三方版（isvapp）为用户详情字段体（§5.10，biz_type=13） |
| `user_modify_org` | 通讯录用户更改 | 仅企业内用户信息变更触发，个人头像/昵称/钉钉号不触发；`data` 含 `diffInfo{prev, curr, userid}` + `userId[]`（§5.2 全文） |
| `user_leave_org` | 通讯录用户离职 | `data:{timeStamp(string), userId[]}`（§5.3 全文） |
| `user_active_org` | 加入企业后用户激活 | 目录页有链，全文待核验(09-27) |
| `org_admin_add` / `org_admin_remove` | 设为/取消管理员 | 全文待核验(09-27)；不计入 Webhook 用量（见 §3.5） |
| `org_dept_create` / `org_dept_modify` / `org_dept_remove` | 部门创建/修改/删除 | 全文待核验(09-27)；不计入用量 |
| `org_change` / `org_remove` | 企业信息变更/企业解散 | 全文待核验(09-27)；不计入用量的是 `org_change` |
| `label_user_change` / `label_conf_add` / `label_conf_modify` / `label_conf_del` | 员工角色变更/角色组增删改 | 全文待核验(09-27)；不计入用量 |

### 2.2 审批类

| 事件英文名 | 触发语义 | 支持通道 | 出处 |
|---|---|---|---|
| `bpms_instance_change` | 审批实例开始/结束/终止/删除 | 企业内部应用：Stream+HTTP；SyncHTTP/RDS 不支持 | 全文 https://open.dingtalk.com/document/development/event-bpms-instance-change.md |
| `bpms_task_change` | 审批任务开始/结束/转交 | 同上 | 全文 https://open.dingtalk.com/document/development/event-bpms-task-change.md |
| `workflow_instance_change_directed` | 审批定向事件：ISV 建的官方 OA 审批或"ISV 套件"模板的实例/任务变更，定向推给归属 ISV | 第三方企业应用：Stream 支持、HTTP 不支持、SyncHTTP/RDS 支持 | 全文 https://open.dingtalk.com/document/development/event-workflow-instance-change-directed.md（finsh 拼写照录，biz_type=247） |
| `workflow_instance_change_broadcast` | 审批广播事件：归属某 ISV/官方 OA 的模板经 jsapi 授权后，给所有已授权 ISV 推回调 | 第三方：Stream+SyncHTTP/RDS（HTTP 不支持） | 全文 https://open.dingtalk.com/document/isvapp/event-workflow-instance-change-broadcast.md（2026-09-10 复核直抓；biz_type=245，`finshTime` 拼写照录） |
| `workflow_task_change_directed` | 审批任务状态变更（定向） | 第三方：Stream+SyncHTTP/RDS（HTTP 不支持） | 全文 https://open.dingtalk.com/document/isvapp/event-workflow-task-change-directed.md（2026-09-10 复核直抓；biz_type=248） |
| 请假/加班/出差/外出状态变更 | 审批单发起/完成/撤销/删除（考勤视角） | — | 目录有链 `events-attendance-approve-status-change`，全文待核验(09-27) |

- 订阅规则（实例页逐字）：` /v1.0/event/bpms_instance_change/bizCategoryId/{bizCategoryId}/processCode/{processCode}/type/{type}` 或 `/v1.0/event/bpms_instance_change/processCode/{processCode}/type/{type}`；`type` 取 start/finish/terminate（页内示例用 `start`）。常用 `bizCategoryId` 表（打卡 `open.com.dd.at.approveCheck`、外出 `attendance.goout`、出差 `alitrip.business`、离职 `hrm.termination`、报销 `dingtalk.businessFinance.reimbursement` 等 30+ 行）见原文页
- `bpms_task_change.data`：`result/processInstanceId/finishTime/createTime/processCode/bizCategoryId/businessId/remark/type/title/taskId/staffId`；`type` 取 start/finish（含转交：type:finish + result:redirect），结束另有 cancel（或签）；`result` 如 `agree`。来源 https://open.dingtalk.com/document/isvapp/approval-events-2.md（直抓）
- `bpms_instance_change.data`：`result/processInstanceId/finishTime/createTime/processCode/bizCategoryId/businessId/type/title/businessType/url/staffId`；`type` 如 `finish`

### 2.3 IM / 群会话 / 机器人

| 事件/消息 | 触发语义 | 通道与备注 | 出处 |
|---|---|---|---|
| 机器人收消息（`msgtype: text/richText/picture/audio/video/file`） | 用户 @群机器人或与机器人单聊发消息 | HTTP（明文 POST + header timestamp/sign）或 Stream（topic `/v1.0/im/bot/messages/get`，零验签）；群 @不支持语音/文件/视频；人与人会话不支持语音/文件/视频；人与机器人会话全支持 | 全文 https://open.dingtalk.com/document/orgapp/receive-message.md |
| `isw_user_msg_received` | 服务号收到用户单聊消息 | 企业内部应用 Stream+HTTP；`data:{toUser,msgType,fromUser,createTime,fromUserId,sessionWebhook,msgId,tmpPicUrl,senderNick,sessionWebhookExpiredTime,content}` | 全文 https://open.dingtalk.com/document/orgapp/event-isw-user-msg-received.md |
| `chat_add_member` / `chat_remove_member` / `chat_quit` / `chat_disband` / `chat_update_owner` / `chat_update_title` | 群加人/删人/主动退群/解散/换群主/改群名 | 企业内部：Stream+HTTP；第三方：Stream+SyncHTTP/RDS（HTTP 不支持）；RDS 表 `open_sync_biz_data_medium`，add_member 的 `biz_type=177`、remove_member 的 `biz_type=178`（2026-09-10 复核直抓 isvapp 版全文；remove 体与 add 同构，operator/operatorUnionId 在列） | 全文（add_member）https://open.dingtalk.com/document/orgapp/event-chat-add-member.md；remove 全文 https://open.dingtalk.com/document/isvapp/event-chat-remove-member.md；其余 slug 类推，全文待核验(09-27) |
| 机器人消息已读/撤回 | 机器人发出的消息被读/被撤回 | 企业内部 Stream+HTTP；第三方 Stream+SyncHTTP/RDS（HTTP 不支持）；RDS `biz_type=260`（read）/`261`（recall），表 `open_sync_biz_data_medium`；三信封字段：`unionId/operatTime(字符串)/robotCode/openConversationId/userId/processQueryKey` | 全文 https://open.dingtalk.com/document/isvapp/event-robot-msg-read.md ；https://open.dingtalk.com/document/isvapp/event-robot-msg-recall.md（2026-09-10 复核直抓，见 §5.10） |
| 服务号用户交互（菜单点击） `isw_user_event_received` | 服务号收到用户菜单点击 | 目录有链，全文待核验(09-27) | https://open.dingtalk.com/document/orgapp/event-isw-user-event-received.md |
| 服务窗关注/取关/授权结果 | 用户关注服务窗等 | 全文待核验(09-27) | 总目录 `event-official-account-*` |

- 机器人收消息 ID 形态：`conversationId: cid…==`、`senderId/chatbotUserId/atUsers[].dingtalkId: $:LWCP_v1:$…`、`msgId: msgr…==`、`robotCode: dingo…`（自定义机器人无 robotCode）、`sessionWebhook: https://oapi.dingtalk.com/robot/sendBySession?session=…`、`conversationType: "1"单聊/"2"群聊`（字符串型）
- 媒体消息不直接给二进制，给 `downloadCode`，调服务端 API 换临时下载链接（图片/语音/视频/文件均同；语音多 `recognition` + `duration` 毫秒；视频多 `videoType`；文件多 `fileName`）。换链 API 已直抓落定：`POST /v1.0/robot/messageFiles/download`（见 §5.11）

### 2.4 待办 / 日程 / 文档 / 签到考勤

来源：总目录 https://open.dingtalk.com/document/orgapp/org-event-overview.md（链级；事件体全文待核验(09-27)）

- 待办：`event-todo-task-create/update/delete`（发起/更新状态与执行人/删除）
- 日程：`event-calendar-event-change`；另有订阅/取消订阅/创建/查询日历接口系（`subscribe-to-a-public-calendar` 等）
- 文档存储：`event-storage-dentry-create/update/delete`（仅开后台开关收不到，必须配"订阅文件变更事件"接口）
- 签到：`event-check-in`；考勤：打卡 `event-attendance-check-record`、加班转调休 `event-attendance-overtime-duration`、班次/考勤组/假期规则/余额/日统计/报表字段变更等 10+ 页

### 2.5 会议 / 直播 / 项目 / 组织其他域

来源：同总目录（链级，全文待核验(09-27)）

- 视频会议：设备属性/告警/投屏/会议状态/设备绑定/成员状态变更 6 页；智能会议室：预定成功取消+创建更新删除（`nqrbp8`）
- 直播：状态变更/信息修改/回放观看/结束统计完成 4 页
- Teambition 项目：工时/项目/属性/应用/成员/任务 7 页
- 荣誉勋章：授予/审核；客户管理（CRM/主数据）：4 页；服务群：群信息/联系人/表单/工单 13 页；教育（家校 2.0）：部门/人员/关系增删改 + 支付状态同步 10 页；医疗：用户/科室属性与组变动 + 全量同步 5 页；专属：文件检测/群扩容审批/数据迁移

### 2.6 第三方专属事件（套件票据/授权/地址校验）

来源：全文 https://open.dingtalk.com/document/development/event-subscription-callback-test-url-event.md + 全文 https://open.dingtalk.com/document/isvapp/event-suite-ticket.md

| EventType | 触发语义 | 通道 |
|---|---|---|
| `check_url` | 注册 `register_call_back` 时测 URL 合法性 | 旧回调；须回 `success` 加密包 |
| `check_create_suite_url` / `check_update_suite_url` | 新建/更新应用回调 URL 时验有效性（后台点"验证有效性"） | 须回 `success` 加密包；解密后 `{"EventType","Random"}`（更新版多 `TestSuiteKey`） |
| `check_update_suite_url`（应用回调地址更新） | 后台改套件回调地址 | 同上 |
| `suite_ticket` | 套件票据，每 5 小时推一次；换 corp token 的原料 | 第三方：Stream + SyncHTTP/RDS（RDS 高优表 `open_sync_biz_data`，`biz_type=2`）；HTTP 不支持 |
| `tmp_auth_code`（授权开通企业事件） | 企业开通授权第三方应用后向回调 URL 推临时授权码；解密后 `{"TimeStamp","AuthCode","AuthCorpId","EventType":"tmp_auth_code","SuiteKey"}`；须回 success 加密包否则判推送失败 | 全文 https://open.dingtalk.com/document/isvapp/enterprise-authorized-application-activation-event-1.md（2026-09-10 复核直抓，见 §5.10） |
| `org_suite_auth`（套件授权） | 企业授权应用最新状态（含 authCorpInfo/authInfo/authUserInfo/permanentCode/authScope） | 第三方：Stream + SyncHTTP/RDS（HTTP 不支持）；RDS 高优表 `open_sync_biz_data`，`biz_type=4`（RDS 体为 snake_case）— 全文 https://open.dingtalk.com/document/isvapp/event-org-suite-auth.md（2026-09-10 复核直抓，见 §5.10） |

### 2.7 企业内部 vs 第三方通道矩阵（官方原文对照）

- 新事件订阅概述页逐字（https://open.dingtalk.com/document/development/event-subscription-overview.md）：Stream 适用"企业内部应用、第三方企业应用"；HTTP 适用"企业内部应用"
- 群事件页实测：企业内部 Stream+HTTP；第三方 Stream + SyncHTTP/RDS（HTTP 不支持）— 来源 https://open.dingtalk.com/document/orgapp/event-chat-add-member.md
- 审批实例/任务/通讯录/服务号事件页：企业内部 Stream+HTTP，SyncHTTP/RDS 不支持 — 来源各事件页"支持应用类型"表
- 定向审批 `workflow_instance_change_directed`：第三方 Stream + SyncHTTP/RDS，HTTP 不支持 — 来源 `[摘录]`
- 旧 `register_call_back`：企业内部 + 第三方企业支持，第三方个人不支持；单应用只能注册一个 URL — 来源 https://open.dingtalk.com/document/isvapp/register-callback-events.md

---

## 3. 回调机制

### 3.1 新事件订阅：Stream（推荐）

来源：https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md（全文）+ https://open.dingtalk.com/document/development/event-subscription-overview.md（全文）

- 本质：应用集成 SDK 与开放平台建一条 WebSocket 反向连接；建连用 `ClientID/Secret` 鉴权（ClientID=旧 AppKey/SuiteKey，ClientSecret=旧 AppSecret/SuiteSecret）；传输 TLS 加密；业务事件明文推送，**零加解密/零签名/零证书管理/零防火墙白名单/零网关/零内网穿透**（"五零"为官方原话）
- 适用：企业内部开发 + 第三方企业应用；部署环境须能访问公网；**每应用默认最多 50 条 WebSocket 连接**；每个客户端实例默认 1 条
- 三类 topic（Java 页逐字）：机器人回调 `/v1.0/im/bot/messages/get`、事件订阅（`registerAllEventListener` 全量监听）、卡片回调 `/v1.0/card/instances/callback`
- 消费语义（Java 示例逐字）：`onEvent` 取 `eventId/eventType/eventBornTime/data`，成功回 `EventAckStatus.SUCCESS`，失败回 `LATER`（重投语义；重试间隔原文未给 → 待核验(09-27)）
- Python 语义：`ChatbotHandler.process(callback)` 回 `(AckMessage.STATUS_OK, 'OK')`；`start_forever()` 起 asyncio loop，异常（`CancelledError/ConnectionClosedError`）需自重启 — 来源 `[摘录]` SDK README

### 3.2 新事件订阅：HTTP 推送（不推荐）与 SyncHTTP/RDS

- HTTP 推送"适用于本地部署，以 HTTP POST 加密方式推送"；企业内部应用可用；推送密文，开发者自验签加解密 — 来源 event-subscription-overview.md 全文
- 同一事件 Stream 与 HTTP 两套信封（审批/通讯录/群事件页均双示例）：Stream `{eventUnifiedAppId, eventCorpId, eventType, eventId, eventBornTime, data}`；HTTP `{EventType, EventTime, CorpId, BizId, eventId, ...}`（字段首字母大写系）。群事件另有第三套 SyncHTTP/RDS：`{corp_id, biz_id, biz_type, biz_data:{syncAction, eventId, ...}}`，RDS 表 `open_sync_biz_data_medium`（普通）/`open_sync_biz_data`（高优如 suite_ticket）
- HTTP 首次订阅握手/加密参数配置页（token 3~32 字符/aes_key/公网 URL）与 SyncHTTP 服务端 2500ms 回包：本次仅 `[摘录]`（`configure-synchttp-event-push` / `develop-synchttp-push-server` 搜索摘要），全文待核验(09-27)。已知逐字：SyncHTTP 示例 `callbackCrypto.getEncryptedMap("success")` 回包、`OWNER_KEY` 传 ClientID（原 appKey）、"收到 POST 验证请求后 2500ms 内响应并返回" — 来源 `[摘录]`
- 新 HTTP 推送失败重试间隔：镜像全文（help.dingtalk.io 英文版，2026-09-10 复核）只给"1500ms 内未回正确加密信息即判推送失败"，重推次数/间隔未给 → 待核验(09-27)（残：重推次数与间隔；旧体系 10s/30s+失败列表不沿用断言）

### 3.3 机器人收消息通道（HTTP vs Stream 二选一）

来源：全文 https://open.dingtalk.com/document/orgapp/receive-message.md

- 创建企业内部应用机器人时选消息接收模式：HTTP 或 Stream（`[摘录]` quick-start：Stream 机器人"消息接收模式选择 Stream 模式"）
- HTTP 模式：钉钉 POST 明文 JSON 到机器人回调服务；安全靠 header：`{Content-Type: application/json; charset=utf-8, timestamp(ms), sign}`；`timestamp` 与现在差 >1h 判非法；`sign` 自算比对，不一致判非法
- 超量行为：Webhook/Stream 用量超量后收到的消息无 `text/content`，多 `errorMessage`，`errorCode 20001`（"受调用量超量影响…"，升专业版/买增购包）

### 3.4 旧 oapi 回调（`register_call_back`）握手与重试

来源：全文 https://open.dingtalk.com/document/isvapp/register-callback-events.md + 全文 https://open.dingtalk.com/document/development/event-subscription-callback-test-url-event.md + 全文 https://open.dingtalk.com/document/development/obtain-the-event-list-of-failed-push-messages.md

- 注册：`POST https://oapi.dingtalk.com/call_back/register_call_back?access_token=ACCESS_TOKEN`，body `{call_back_tag[], token(≥6且<64字符), aes_key(43字符), url(公网)}`；单应用单 URL。注册时钉钉发 `check_url` 测活，须回 `success` 加密包否则判 URL 非法
- 运行时：`suite_ticket` 不回 `success` 则"连续推送，直到超 100 次不再推"；后台可点"重新推送"
- 失败重试（`get_call_back_failed_result` 页逐字）：第 1 次重试隔 10s，第 2 次隔 30s；"直至第 2 次重试失败后，可在 3~5 分钟内通过本接口获取推送失败的事件列表"：`GET https://oapi.dingtalk.com/call_back/get_call_back_failed_result?access_token=…`，一次最多 200 条，`has_more` 翻页；按 `call_back_tag` 取 `callbackData/bpmsCallBackData/roleLabelChange` 三 key（§5.9 全文示例）
- 幂等键：新事件 `eventId`（Stream `eventId`/HTTP `eventId`，审批/通讯录/群页均带）；机器人消息 `msgId`；`suite_ticket` 以最新值为准（旧 ticket 失效）。官方未明示"至少一次"字样 → 模拟按至少一次 + `eventId/msgId` 去重实现（推导，非原文）

### 3.5 用量与免计事件

来源：`[摘录]` https://open.dingtalk.com/document/development/appendix-a-list-of-events-not-included-in-webhook.md

- 不纳入 Webhook/Stream 用量限制的事件（逐字 16 个）：`user_add_org/user_modify_org/user_leave_org/user_active_org/org_dept_create/org_dept_modify/org_dept_remove/org_change/label_user_change/label_conf_add/label_conf_del/label_conf_modify/org_admin_add/org_admin_remove/industry_medical_user_add/org_annual_certification_submission`

---

## 4. 验签与加密算法

### 4.1 旧回调/新 HTTP 推送：`sha1(sort(token,timestamp,nonce,msg_encrypt))` + AES（全文逐字）

来源：https://open.dingtalk.com/document/app/callback-event-message-body-encryption-and-decryption.md（术语/验证步骤/加解密/调试向量逐字）

- 术语逐字：`EncodingAESKey` 43 字符（a-zA-Z0-9），是 AESKey 的 Base64 编码，解码 32 字节；`AESKey=Base64_Decode(EncodingAESKey + "=")`，AES-CBC，PKCS#7 填充，IV 取 AESKey 前 16 字节（RFC 2315）；`msg` 为 JSON 明文；`encrypt = Base64_Encode(AES_Encrypt[random(16B) + msg_len(4B) + msg + $key])`，`msg_len` 为 msg 字节数网络字节序
- `$key`（对照表逐字）：企业内部应用=Corpid；企业定制应用=customKey；第三方企业应用=suiteKey
- 验签逐字：`dev_msg_signature=sha1(sort(token、timestamp、nonce、msg_encrypt))`，sort=字典序从小到大拼接；与推送字段 `signature` 比对（新 HTTP 页又作 `msg_signature`，大小写差异照录，见 §5.6）
- 解密逐字：取 JSON 的 `encrypt` → Base64 解 → AES 解（`AES_Decrypt(aes_msg)`）→ 逆拼包
- JS 用法逐字：`new DingTalkEncryptor(TOKEN, ENCODING_AES_KEY, KEY)` → `getDecryptMsg(msgSignature, timeStamp, nonce, encrypt)`；Java（SyncHTTP 页 `[摘录]`）另有 `getEncryptedMap(plaintext, timeStamp, nonce)` 回 `{msg_signature, encrypt, timeStamp, nonce}`，签名算法 `Arrays.sort({token,timestamp,nonce,encrypt})` 拼串后 SHA-1 hex（`getSignature` 全文见搜索摘录）
- 调试向量（逐字，可作回归）：URL 参 `signature=5a65ceeef9aab2d149439f82dc191dd6c5cbe2c0&timestamp=1445827045067&nonce=nEXhMP4r`；POST `{"encrypt":"1a3NBxmCFwkCJvfoQ7WhJHB+iX3qHPsc9JbaDznE1i03peOk1LaOQoRz3+nlyGNhwmwJ3vDMG+OzrHMeiZI7gTRWVdUBmfxjZ8Ej23JVYa9VrYeJ5as7XM/ZpulX8NEQis44w53h1qAgnC3PRzM7Zc/D6Ibr0rgUathB6zRHP8PYrfgnNOS9PhSBdHlegK+AGGanfwjXuQ9+0pZcy0w9lQ=="}`；`TOKEN=123456`；`ENCODING_AES_KEY=4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij`；`KEY=suite4xxxxxxxxxxxxxxx`。解密后明文官方未给 → 待核验(09-27)（仅作加解密链路向量，不作明文断言）
- 注册页约束（https://open.dingtalk.com/document/isvapp/register-callback-events.md 逐字）：`token` 长度 ≥6 且 <64；`aes_key` 43 字符；iSV 推荐用注册套件的 EncodingAESKey

### 4.2 机器人 HTTP 回调：HmacSHA256（全文逐字）

来源：https://open.dingtalk.com/document/orgapp/receive-message.md（"相关内容"节）

- header：`timestamp`（毫秒）+ `sign`；`stringToSign = timestamp + "\n" + appSecret`；`sign = Base64(HmacSHA256(stringToSign, key=appSecret))`；appSecret=应用 Client Secret；timestamp 差 >1h 拒收。Java 示例（`Mac.getInstance("HmacSHA256")` + `Base64.encodeBase64`）见 §5.7
- 注意与企微/飞书不同：不参与 body，不用 token/encrypt_key，key 即 Client Secret

### 4.3 Stream：无业务验签（全文逐字）

来源：https://open.dingtalk.com/document/development/event-subscription-overview.md + https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md

- "加解密：无需加解密，接收到的为事件详细数据"；"安全性：不需要暴露公网 ip…传输层 TLS，每条连接建立都有完整鉴权"。鉴权凭据即 `AuthClientCredential(clientId, clientSecret)`

---

## 5. 示例载荷原文（逐字）

### 5.1 机器人收文本消息（receive-message.md 全文逐字）

```json
{
  "senderPlatform": "Mac",
  "conversationId": "cid6EUvB2O8qVF2RYQtHTKEsg==",
  "atUsers": [
    {
      "dingtalkId": "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5"
    }
  ],
  "chatbotCorpId": "ding9733d095*******6cb783455b",
  "chatbotUserId": "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5",
  "msgId": "msgrK2ckHkMbaiUWt5xQU+riw==",
  "senderNick": "小钉",
  "isAdmin": true,
  "senderStaffId": "014728255240768602",
  "sessionWebhookExpiredTime": 1708332604316,
  "createAt": 1708327204136,
  "senderCorpId": "ding9733d095*******6cb783455b",
  "conversationType": "2",
  "senderId": "$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9",
  "conversationTitle": "测试群",
  "isInAtList": true,
  "sessionWebhook": "https://oapi.dingtalk.com/robot/sendBySession?session=66d7c695a9e1f18782a7cba1d9deb885",
  "text": {
    "content": " text"
  },
  "robotCode": "dingohropvkloy0xdm3k",
  "msgtype": "text"
}
```

其余 msgtype 片段（同页逐字）：文本 `{"msgtype":"text","text":{"content":"你好"}}`；图片 `{"msgtype":"picture","content":{"downloadCode":"mIofN681YE3f/…"}}`；语音 `{"msgtype":"audio","content":{"duration":4000,"downloadCode":"mIofN…","recognition":"钉钉，让进步发生"}}`；视频 `{"msgtype":"video","content":{"duration":4000,"downloadCode":"mIofN…","videoType":"mp4"}}`；文件 `{"msgtype":"file","content":{"downloadCode":"mIofN…","fileName":"钉钉让进步发生.pdf"}}`（原文 file 节 `msgtype` 表头误写 `video:文件消息`，照录）；富文本 `{"msgtype":"richText","content":{"richText":[{"text":"你好"},{"downloadCode":"mIofN…","type":"picture"}]}}`

### 5.2 `user_modify_org` 双信封（event-v3user-modify-org.md 全文逐字）

Stream

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "user_modify_org",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "timeStamp": "1608017258073",
    "diffInfo": {
      "prev": {
        "managerUserid": "205xxx91",
        "hiredDate": "20xx-xx-xx",
        "name": "测试01",
        "telephone": "1234",
        "email": "xxx@xx.com",
        "jobNumber": "112x422",
        "workPlace": "北京"
      },
      "curr": {
        "managerUserid": "205xxx91",
        "hiredDate": "20xx-xx-xx",
        "name": "测试1",
        "email": "xxx@xx.com",
        "jobNumber": "112x422",
        "workPlace": "北京"
      },
      "userid": "user123456"
    },
    "userId": [
      "user123456"
    ]
  }
}
```

HTTP（同页逐字；`EventType/EventTime/CorpId/BizId/eventId` + 业务平铺）

```javascript
{
  "EventType": "user_modify_org",
  "EventTime": 1663143335567,
  "CorpId": "ding9f50b15bxxxx16741",
  "BizId": "1663**35567",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "timeStamp": "1608017258073",
  "diffInfo": {
    "prev": {
      "managerUserid": "205xxx91",
      "hiredDate": "20xx-xx-xx",
      "name": "测试01",
      "telephone": "1234",
      "email": "xxx@xx.com",
      "jobNumber": "112x422",
      "workPlace": "北京"
    },
    "curr": {
      "managerUserid": "205xxx91",
      "hiredDate": "20xx-xx-xx",
      "name": "测试1",
      "email": "xxx@xx.com",
      "jobNumber": "112x422",
      "workPlace": "北京"
    },
    "userid": "user123456"
  },
  "userId": [
    "user123456"
  ]
}
```

### 5.3 `user_leave_org` 双信封（event-v3user-leave-org.md 全文逐字）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "user_leave_org",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "timeStamp": "1685501863357",
    "userId": [
      "015xxxx227"
    ]
  }
}
```

```javascript
{
  "EventType": "user_leave_org",
  "EventTime": 1663143335567,
  "CorpId": "ding9f50b15bxxxx16741",
  "BizId": "1663**35567",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "timeStamp": "1685501863357",
  "userId": [
    "015xxxx227"
  ]
}
```

### 5.4 审批双信封 + 第三方定向（全文/`[摘录]`逐字）

`bpms_instance_change` Stream（event-bpms-instance-change.md 全文逐字）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "bpms_instance_change",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "result": "agree",
    "processInstanceId": "9Qgx5QqjR7axMwxxxx",
    "finishTime": 1495592272000,
    "createTime": 1495592305000,
    "processCode": "Pro-xxx",
    "bizCategoryId": "20230xxx",
    "businessId": "yewu1",
    "type": "finish",
    "title": "自测-1016",
    "businessType": "yewu1",
    "url": "https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?corpid\\u003dding2c015874d817xxxx\\u0026dd_share\\u003d",
    "staffId": "manager75"
  }
}
```

HTTP 版把信封换成 `{"EventType":"bpms_instance_change","EventTime":1663143335567,"CorpId":"ding9f50b15bxxxx16741","BizId":"1663**35567","eventId":"c7c7120f2c07419**ebdba0318c8", …同上业务字段}`（同页逐字）

`bpms_task_change` Stream（event-bpms-task-change.md 全文逐字）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "bpms_task_change",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "result": "agree",
    "processInstanceId": "ce133dd0-5b22-9516-xxxxxxxxxxxx",
    "finishTime": 1670983893000,
    "createTime": 1670983873000,
    "processCode": "PROC-27BBC5E6-DFFA-4EC3-A1F1-xxx",
    "bizCategoryId": "attendance.goout",
    "businessId": "20xxxx38",
    "remark": "同意",
    "type": "finish",
    "title": "考勤-测试",
    "taskId": 811165,
    "staffId": "08058646137"
  }
}
```

第三方定向 `workflow_instance_change_directed` Stream（`[摘录]` event-workflow-instance-change-directed）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "workflow_instance_change_directed",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "result": "agree",
    "processInstanceId": "adlB-HLWSEGKe_m-xxx",
    "createTime": 1670983873000,
    "finshTime": 1670983893000,
    "processCode": "PROC-27BBC5E6-DFFA-4EC3-A1F1-xxx",
    "businessId": "1",
    "type": "finsh",
    "title": "xx提交的审批模版测试",
    "version": "2",
    "url": "https://pre-aflow.dingtalk.com/xxx",
    "staffId": "managerxxx"
  }
}
```

（注意官方原文 `finsh`/`finshTime` 拼写即如此，非 finish，保真照抄。）

### 5.5 服务号单聊消息 + 群加人 + 套件票据（全文逐字）

`isw_user_msg_received` Stream（event-isw-user-msg-received.md）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "isw_user_msg_received",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "toUser": "U4n9RTxxxxxx4AiEiE",
    "msgType": "image",
    "fromUser": "VsIS5Rxxxxxx8ygiEiE",
    "createTime": 145265545673,
    "fromUserId": "2003xxx19",
    "sessionWebhook": "https://oapi.dingtalk.com/xxx",
    "msgId": "dsa8d87y2c3d6",
    "tmpPicUrl": "https://down-cdn.dingtalk.com/dsa8d87y7c8d8c.jpg",
    "senderNick": "发送者01",
    "sessionWebhookExpiredTime": 1442027997327,
    "content": "test content"
  }
}
```

HTTP 版信封为 `{"EventType":"isw_user_msg_received","EventTime":1663143335567,"CorpId":"…","BizId":"1663**35567","eventId":"…", …同上}`（同页逐字）

`chat_add_member` Stream（event-chat-add-member.md 全文逐字）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "chat_add_member",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "timeStamp": 1608027106990,
    "unionId": [
      "3rBUxxxQiEiE"
    ],
    "chatId": "chat28367b03e4b4ca4b5074e1dbfb5d6088",
    "corpId": "dinge8a56572f80bxxxx",
    "operatorUnionId": "iis6fGqqqt87xxxxiEiE",
    "eventType": "chat_add_member",
    "userId": [
      "user456"
    ],
    "openConversationId": "iis6fGqqqt87xxxxiEiE",
    "operator": "10203029011219896"
  }
}
```

`suite_ticket` Stream（event-suite-ticket.md 全文逐字）

```javascript
{
  "eventUnifiedAppId": "bbb381b6-f01xxxxx58daac",
  "eventCorpId": "ding9f50b15bxxxx16741",
  "eventType": "suite_ticket",
  "eventId": "c7c7120f2c07419**ebdba0318c8",
  "eventBornTime": 1683533823336,
  "data": {
    "suiteTicket": "QsfJCEVF1h6E9fAaGwnAzbvYzxxxxxxxx"
  }
}
```

### 5.6 握手事件与 `success` 回包（event-subscription-callback-test-url-event.md 全文逐字）

- `check_url` 解密后：`{"EventType" : "check_url"}`；回包 `{"msg_signature":"111108bb8e6dbce3c9671d6fdb69d150xxxx","timeStamp":"1783610513","nonce":"w2WPvWxxxxGOmIB","encrypt":"1ojQf0NSvw2WPvWxxxxGOmIBNbWetRg7IP0vdhxxxx"}`（`encrypt` 为 `"success"` 的加密值）
- `check_create_suite_url` 解密后：`{"EventType":"check_create_suite_url","Random":"brdkKLMW"}`；`check_update_suite_url`：`{"EventType":"check_update_suite_url","Random":"xxxxxx","TestSuiteKey":"suited6db0pze8yao1b1y"}`；`check_update_suite_url`（地址更新）：`{"EventType":"check_update_suite_url","Random":"xxxxxx","TestSuiteKey":"suited6db0pze8yao1b1y"}`（页内两节同形，照录）
- `suite_ticket` 解密后：`{"SuiteKey":"xxxxxx","EventType":"suite_ticket","TimeStamp":123456,"SuiteTicket":"xxxxxx"}`
- 回包通用形（更新地址节逐字）：`{"msg_signature":"111108bb8e6dbce3c9671d6fdb69d15066227608","timeStamp":"1783610513","nonce":"123456","encrypt":"1ojQf0NSvw2WPvW7LijxS8UvISr8pdDP+rXpPbcLGOmIBNbWetRg7IP0vdhVgkVwSoZBJeQwY2zhROsJq/HJ+q6tp1qhl9L1+ccC9ZjKs1wV5bmA9NoAWQiZ+7MpzQVq+j74rJQljdVyBdI/dGOvsnBSCxCVW0ISWX0vn9lYTuuHSoaxwCGylH9xRhYHL9bRDskBc7bO0FseHQQasdfghjkl"}`（为 `"success"` 加密数据）

### 5.7 机器人 HTTP 验签示例（receive-message.md 全文逐字）

header：`{"Content-Type": "application/json; charset=utf-8", "timestamp": "1577262236757", "sign":"xxxxxxxxxx"}`

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.apache.commons.codec.binary.Base64;

public class Test {
    public static void main(String[] args) throws Exception {
        Long timestamp = 1577262236757L;
        String appSecret = "this is a secret";
        String stringToSign = timestamp + "\n" + appSecret;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(appSecret.getBytes("UTF-8"), "HmacSHA256"));
        byte[] signData = mac.doFinal(stringToSign.getBytes("UTF-8"));
        String sign = new String(Base64.encodeBase64(signData));
        System.out.println(sign);
    }
}
```

### 5.8 注册与失败列表示例（全文逐字）

注册请求（register-callback-events.md）：`POST https://oapi.dingtalk.com/call_back/register_call_back?access_token=ACCESS_TOKEN` + `{"call_back_tag":["user_add_org", "user_modify_org", "user_leave_org"],"aes_key":"hvnzd2y8jkhx8yoo4483xxxx","url":"www.dingtalk.com","token":"dingtalk"}`；返回 `{"errcode":0,"errmsg":"ok"}`

失败列表响应（obtain-the-event-list-of-failed-push-messages.md 全文逐字）

```json
{
    "errcode": 0,
    "errmsg": "ok",
    "failed_list": [
        {
            "user_add_org": {
                "userid": [
                    "zhangsan"
                ],
                "corpid": "ding241f334c339e175b35c2f4657xxxx"
            },
            "call_back_tag": "user_add_org",
            "event_time": 1606126433000
        },
        {
            "bpms_instance_change": {
                "bpmsCallBackData": {},
                "corpid": "ding241f334c339e175b35c2f4657xxxx"
            },
            "call_back_tag": "bpms_instance_change",
            "event_time": 1606126433000
        },
        {
            "label_conf_add": {
                "roleLabelChange": {},
                "corpid": "ding241f334c339e175b35c2f4657xxxx"
            },
            "call_back_tag": "label_conf_add",
            "event_time": 1606126433000
        }
    ],
    "has_more": false
}
```

### 5.9 发送与凭证示例（`[摘录]`逐字，页内原文）

- 旧 token：`GET https://oapi.dingtalk.com/gettoken?appkey=appkey&appsecret=appsecret` → `{"access_token":"fw8ef8we8f76e6f7s8dxxxx","expires_in":7200,"errcode":0,"errmsg":"ok"}`
- 新 token：`POST https://api.dingtalk.com/v1.0/oauth2/accessToken` body `{"appKey":"dingeqqpkv3xxxxxx","appSecret":"GT-lsu-taDAxxxsTsxxxx"}` → `{"accessToken":"fw8ef8we8f76e6f7s8dxxxx","expireIn":7200}`
- 第三方 corp token：`POST https://api.dingtalk.com/v1.0/oauth2/corpAccessToken` body `{"suiteKey":"suitep1f5lzyglm7fryxxxx","suiteSecret":"_FP5PpZF3irDKjxxx","authCorpId":"ding123456","suiteTicket":"1f5lzyglm7fryxxxx"}` → `{"accessToken":"1cc1bb3xxxx","expireIn":7200}`
- 工作通知：`POST https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=ACCESS_TOKEN` body `{agent_id, userid_list/dept_id_list/to_all_user, msg:{msgtype,text/image/voice/file/link/oa/markdown/action_card}}` → `{errcode:0, errmsg:"ok", task_id:256271667526, request_id:"4jzllmte0wau"}`
- 机器人群消息：`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` header `x-acs-dingtalk-access-token` body `{"msgParam":"{\"content\":\"钉钉，让进步发生\"}","msgKey":"sampleText","openConversationId":"cid6KeBBLoveMJOGXoYKF5x7EeiodoA==","robotCode":"dingue4kfzdxbynxxxxxx","coolAppCode":"COOLAPP-1-10182EEDD1AC0BA600D9000J"}` → `{processQueryKey}`（可查已读/撤回）

### 5.10 第三方事件/握手补证（2026-09-10 复核直抓逐字）

- `tmp_auth_code` 解密后（enterprise-authorized-application-activation-event-1.md 全文逐字）：`{"TimeStamp":1553709079062,"AuthCode":"xxxxxx","AuthCorpId":"xxxxxx","EventType":"tmp_auth_code","SuiteKey":"xxxxxx"}`；须回 success 加密包 `{"msg_signature","timestamp","nonce","encrypt":enc("success")}`，否则判推送失败。同页另有 `main_data_subscribe` 主数据订阅事件体（targetApp/MainEventModelId/SubAuth/IsCreate）
- `org_suite_auth` Stream `data`（event-org-suite-auth.md 全文逐字）：`{authCorpInfo:{authChannel,corpid,corpType,fullCorpName,corpTypeV2,industry,corpName,isAuthenticated,licenseCode,corpLogoUrl,inviteUrl,inviteCode,isEcologicalCorp,authLevel,authChannelType},permanentCode,authUserInfo:{userId},authScope:{errcode,authUserField,authOrgScopes:{authedDept},errmsg},authInfo:{agent:[{agentid,adminList,appid,agentName,logoUrl}]}}`；RDS（高优表 `open_sync_biz_data`，`biz_type=4`）同构 snake_case
- `user_add_org` / `user_modify_org` 第三方版 Stream `data`（event-user-add/modify-org.md 全文逐字，用户详情字段）：`{errcode,unionEmpExt:{corpId,unionEmpMapList:[{corpId,staffId}],staffId},unionid,exclusiveAccount,orderInDepts,dingId,active,errmsg,avatar,isAdmin,userid,isHide,jobnumber,isLeaderInDepts,isBoss,isSenior,name,position,department,realAuthed}`；RDS（`open_sync_biz_data_medium`）`biz_type=13`（add/modify 同值）+ `syncAction` + `eventId`
- `chat_remove_member`（event-chat-remove-member.md 全文逐字）：Stream/HTTP/RDS 三信封与 add_member 同构（`timeStamp/unionId/chatId/corpId/operatorUnionId/userId/openConversationId/operator`）；RDS `biz_type=178`（add=177）
- `robot_msg_read` / `robot_msg_recall`（event-robot-msg-read/recall.md 全文逐字）：三信封 `{unionId,operatTime(字符串型毫秒),robotCode,openConversationId,userId,processQueryKey}`（HTTP 版首字母大写系）；RDS `biz_type=260`（read）/`261`（recall），表 `open_sync_biz_data_medium`
- `workflow_instance_change_broadcast`（biz_type=245）/ `workflow_task_change_directed`（biz_type=248）：Stream `data` 与定向实例体同构（含 `finshTime` 原文拼写）；RDS `open_sync_biz_data_medium` + `syncAction`
- 新 HTTP 握手/运行时（help.dingtalk.io 镜像英文版全文逐字）：配置 URL 后平台发 `POST {"encrypt":"ajls384kdjx98XX"}`；须 1500ms 内回 JSON `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`；运行时同 1500ms，超时即判推送失败；URL 形 `http://<url>?signature=…&timestamp=…&nonce=…`；`OWNER_KEY`：控制台订阅=App 维度 APP_KEY，注册 API=组织维度（内部 appkey / 第三方 SUITE_KEY）；解密后通讯录示例 `{"EventType":"user_add_org","TimeStamp":43535463645,"UserId":["user1","user2"],"CorpId":"dinge8a56572f80b02a8ffexxxx"}`；FAQ 调试向量 `DingTalkEncryptor("123456","1234567890123456789012345678901234567890123","dingsnotzck6pm5veliw")` + `getDecryptMsg("9a95a004dd16f5c307e849b994173f76aa26e5eb","1614767836","A7Co0cJLMzIDtMMI","YvkvaGe4hQxd3VxRmEty0dVlnCOAqwf56xwTRHDHoOURqhalbmBJQk5FNcRk42Gl5T0YQXZNwpwWSm1xAFJ5ZA==")`
- 第三方通道总规则（callback-events-overview.md 搜索摘录，developers 域）：第三方必须注册事件回调收"企业授权开通应用事件"以初始化企业信息；RDS 推送支持第三方，SyncHTTP 强烈建议第三方使用，HTTP 仅历史第三方可用（不推荐）；小程序用 `dd.corpId`、微应用用 `$CORPID$` 占位取 corpId

### 5.11 实施补证（2026-10-14 复核直抓）

- 中文 `configure-http-push`（https://open.dingtalk.com/document/orgapp/configure-http-push）全文直抓（§7.2 残项消项）：① token：**3~32 个字符**（只能使用英文或数字），aes_key：**43 位字符，只支持大小写字母和数字**；② `owner_key`：当前开发者后台应用上的事件订阅，**owner_key 需要传当前应用的 appkey 值**（控制台订阅=APP_KEY 维度的中文页原文背书）；③ 回包须为 JSON 且四字段值正确，否则钉钉报错 `HTTP请求结果校验返回字段值失败`；④ 服务端代码示例 `getEncryptedMap(params, accessToken, encodingAesKey, ownerKey)` 注明 **四个参数均来自钉钉服务器请求时带来的值**——回包 `timeStamp`/`nonce` 原样取请求带来的值获官方背书（MockPulse `verify_and_decrypt_reply` 同样以请求值重算签名）
- 机器人收消息（receive-message.md 全文直抓复核）：`msgtype` 全集 `text/richText/picture/audio/video/file` 六种；媒体字段嵌在 `content` 对象下——`picture:{downloadCode}`、`audio:{duration,downloadCode,recognition}`、`video:{duration,downloadCode,videoType}`、`file:{downloadCode,fileName}`、`richText:{richText:[{text}|{downloadCode,type:"picture"}]}`（§5.1 片段逐字为准，页面字段表格渲染是拍平的）；群 @ 不支持语音/文件/视频，人与人会话同限，人与机器人会话全支持
- `downloadCode` 换临时链接 API（机器人收消息页"获取媒体文件"直抓）：`POST https://api.dingtalk.com/v1.0/robot/messageFiles/download`，header `x-acs-dingtalk-access-token`，body `{"robotCode":"…","downloadCode":"…"}` → `{"downloadUrl":"…","fieldName":"…"}`；`downloadUrl` 为临时链接（短时效），按 `robotCode + downloadCode` 对取链；`robotCode` 取值与机器人所属应用的 `appKey` 同源（见下方实施假设）
- 工作通知 `asyncsend_v2`（asynchronous-sending-of-enterprise-session-messages.md 全文直抓确证 §5.9 摘录）：`POST https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=xxx`；`agent_id` Long 必填（应用 agentId）、`userid_list` String 逗号分隔 **max 100**（与 `dept_id_list`/`to_all_user` 三选一）、`msg` JSON 必填，text 型 `content` **最长 2048 字节**；成功返回 `{errcode:0, errmsg:"ok", task_id:256271667526, request_id:"4jzllmte0wau"}`；**频控四条**：单次推送内部企业 max 5000 人（第三方 1000）、同一用户同一内容 1 天 1 条、每人每天内部 500 条（第三方 100）、每分钟 max 5000 人——**超出后接口返回成功但用户收不到**（对接防坑：errcode=0 不代表触达）。消息通知权限创建应用时默认添加，无需额外申请
- MockPulse 对拍基线（代码直读，2026-10-14）：连接 `system=http_crypto` 时**所有模板明文（含机器人六 msgtype）统一经密文信封推送**（`shared.ts` 头注：解密后即各模板明文；`dispatch_event` 只按连接 `system` 路由）——Server 密文通道 receive 须同时承载事件信封（`EventType` 大写系）与机器人消息（`msgtype`）两类解密明文；回包由 `verify_and_decrypt_reply` 以请求原值重算 sha1 四参签名后解密，明文须含 `success`，`timeStamp` 为字符串型毫秒
- 实施假设（Server 落地取径，非官方原文，须在验收时如实标注）：① `robotCode == appKey`（owner_key=appKey 的中文页原文 + 机器人创建于企业内部应用之下推得）；② 单一新版 `accessToken`（`POST /v1.0/oauth2/accessToken`）同时用于 oapi 系 query `access_token` 与新 api 系 header `x-acs-dingtalk-access-token`（§6.1 单 token 准入链路：取 Token → 调工作通知/机器人发消息）；③ 发送侧 `channel_info` 追加键 `appKey/appSecret/agentId`（接收侧三元组 + url 之外，沿公众号 `appSecret` 先例，Server 专用）

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/约束 | 出处 |
|---|---|---|---|
| 旧 `access_token`（oapi，企业内部） | `GET https://oapi.dingtalk.com/gettoken?appkey=&appsecret=`（ClientID=原 AppKey） | 7200s；有效期内重复获取返回相同并续期；须按应用缓存；频调被拦截 | `[摘录]` https://open.dingtalk.com/document/orgapp/obtain-orgapp-token.md |
| 新 `accessToken`（api，企业内部） | `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` `{appKey, appSecret}` | 7200s；同上缓存约束；需 `qyapi_base` 权限 | `[摘录]` https://open.dingtalk.com/document/development/obtain-the-access-token-of-an-internal-app.md |
| 第三方 corp `accessToken`（新） | `POST https://api.dingtalk.com/v1.0/oauth2/corpAccessToken` `{suiteKey, suiteSecret, authCorpId, suiteTicket}` | 7200s；有效期内重复获取返回**新的**（与内部版不同）；频调被拦截 | 全文 https://open.dingtalk.com/document/isvapp/obtain-the-access_token-of-the-authorized-enterprise.md |
| 第三方 corp `access_token`（旧） | `POST https://oapi.dingtalk.com/service/get_corp_token`（SDK 或 HTTP signature 方式，参 `suiteTicket`） | 7200s；同缓存约束；suiteTicket 约 5h 推一次，须读最新 | 全文 https://open.dingtalk.com/document/isvapp/obtains-the-enterprise-authorized-credential.md |
| `suiteTicket` | 推送取得（Stream/RDS），非换取 | 5h 推一次；旧 ticket 失效；须持久化、无失效缓存 | 全文 https://open.dingtalk.com/document/isvapp/event-suite-ticket.md |
| 回调三元组 token/aes_key/owner_key | 后台配置（旧注册接口或事件订阅页） | token 旧体系 ≥6<64 / 新 SyncHTTP 3~32 英数；aes_key 43 字符；owner=ClientID（原 appKey）/suiteKey/customKey/Corpid | 全文 register-callback-events.md + 加解密页 + `[摘录]` SyncHTTP 页 |
| 机器人 `robotCode` / `openConversationId` | 建机器人/建群或 chooseChat 取得 | 发群消息必填；酷应用安装时须 `coolAppCode` | `[摘录]` the-robot-sends-a-group-message.md |
| 发消息去重/频控 | `asyncsend_v2`：单次内部 5000 人/第三方 1000 人；同人同内容 1 天 1 条；每人每天内部 500 条/第三方 100 条；每分钟 5000 人可达 | `[摘录]` asynchronous-sending-of-enterprise-session-messages.md |
| 调用凭证传递 | oapi 系：query/body `access_token`；新 api 系：header `x-acs-dingtalk-access-token`；`api.dingtalk.io` 系另可用 `Authorization: Bearer <access_token>` | 各 API 页请求示例 + `[摘录]` authorization-overview |

### 6.1 准入链路（最小闭环，`[摘录]`为主，全文待核验(09-27)）

来源：`[摘录]` https://open.dingtalk.com/document/development/server-api-calling-guide.md（API 调用步骤详解：建应用→配权限→取 Token→调用户详情 API）+ `[摘录]` https://open.dingtalk.com/document/orgapp/configure-stream-push（事件订阅四步）+ `[摘录]` authorization-overview（四种 access token 选型）

- 步骤一：注册企业并在开发者后台（https://open-dev.dingtalk.com/）创建企业内部应用，得 `ClientID`（旧称 AppKey/SuiteKey）+ `ClientSecret`（旧称 AppSecret/SuiteSecret）
- 步骤二：按接口配权限（普通 `qyapi_base` 直接取 app token；敏感权限需用户授权走 `authCode` 换 user token）
- 步骤三：取 Token（§6 表，7200s 缓存，提前 10min/200s 刷新）→ 调业务 API（工作通知/机器人发消息）
- 步骤四：配事件订阅：开发配置 > 事件订阅 > 选 Stream（推荐，需先完成服务端 SDK 开发再点"已完成接入，验证连接通道"）或 HTTP（配公网 URL + 加解密三元组，1500ms 回 success 加密包）；保存后事件列表才展示
- 第三方企业应用另需：上架审核 + 企业授权（得 `authCorpId` + `suiteTicket` 定时推送）→ 换 corpAccessToken；`suiteTicket` 约 5h 推一次（Stream/RDS `biz_type=2`）
- 控制台截图级流程与第三方上架审核要求 → 待核验(09-27)（见 §7.10）

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **第三方事件总览全文**：已落定（https://open.dingtalk.com/document/isvapp/event-subscription-overview.md `.md` 直抓全文，2026-09-10 复核；授权 4/通讯录 18/会话 11/审批 4/考勤 11/待办 3/日程 1/存储 3/AI 助理 2/项目 7/钉工牌 3/直播 4/会议 4/服务群 3/应用管理 4/应用市场 5/人事 6/招聘 5/财务 10/机器人 2/CRM 2/荣誉 2/专属 2/教育 10/医疗 2/行业通用 4；第三方通道规则见 §5.10 末）→ 本项消项
2. **新 HTTP 推送握手部分落定**：握手+运行时 1500ms、`{"encrypt"}` 信封、`getEncryptedMap("success")` 回包、`OWNER_KEY` 双维度语义、FAQ 调试向量均已由镜像英文版全文落定（见 §1 更新行/§3.2/§5.10，2026-09-10 复核）；中文 `configure-http-push` 全文已直抓（token 3~32 英数、aes_key 43 位字母数字、owner_key=appKey、回包字段校验报错原文、getEncryptedMap 四参取请求值，见 §5.11，2026-10-14 复核）→ 本项消项
3. **SyncHTTP 服务端全文**：`develop-synchttp-push-server` / `configure-synchttp-event-push` 中文页直抓仍失败（`.md` 变体回"淘宝网"反爬壳；镜像 404）；仅搜索摘录（2500ms、`getEncryptedMap("success")`、OWNER_KEY=ClientID）；RDS 表与 `biz_type` 见本项 §7.11 部分落定。→ 待核验(09-27)（残：SyncHTTP 服务端中文全文）
4. **新事件重试/幂等原文**：新 Stream `LATER` 重投间隔、HTTP 重推次数、失败列表兜底仍未见（镜像全文仅"1500ms 超时判失败"，重推次数未给；旧体系 10s/30s + 失败列表已实锤）→ 待核验(09-27)
5. **`tmp_auth_code` 授权事件体**：已落定（enterprise-authorized-application-activation-event-1.md 全文直抓，解密体 5 字段 + success 回包，见 §2.6/§5.10，2026-09-10 复核）→ 本项消项
6. **通讯录 add/active/admin/dept/org/label 全文**：第三方版 add/modify 全文已落定（§5.10，biz_type=13）；旧回调 12 类 `call_back_tag` 字典已由 `[摘录]` app/tvgq1n 落定（2022-12-09 版）；active/admin/dept/org/label 新事件体仍为目录链级。→ 待核验(09-27)（残：新事件体全文）
7. **群事件其余全文**：remove 全文已落定（biz_type=178，2026-09-10 复核直抓）；quit/disband/owner/title/template/cool-app 仍 slug 类推。→ 待核验(09-27)（残：其余全文）
8. **机器人已读/撤回、待办、考勤、日程、会议、直播、项目、存储、日历订阅接口全文**：已读/撤回已落定（三信封全文，biz_type=260/261，2026-09-10 复核直抓）；待办/考勤/日程/会议/直播/项目/存储仍目录链级。→ 待核验(09-27)（残：其余全文）
9. **加解密调试向量明文**：`1a3NBxmC…` 对应明文官方仍未给；新增 FAQ 调试向量（`DingTalkEncryptor("123456","1234…0123","dingsnotzck6pm5veliw")` + `getDecryptMsg(…)` 四参，见 §5.10，2026-09-10 复核）可作链路向量。→ 待核验(09-27)（残：明文闭环）
10. **准入链路全文**：企业注册→管理员建内部应用→取 ClientID/Secret→配权限→选 Stream/HTTP（控制台流程页未直抓；第三方上架审核要求未取；第三方通道选型规则见 §5.10 末搜索摘录）。→ 待核验(09-27)
11. **RDS `biz_type` 全表**：已知 2（suite_ticket，高优表）/4（org_suite_auth，高优表）/13（user_add/modify）/177（chat_add_member）/178（chat_remove_member）/245（审批广播实例）/247（审批定向实例）/248（审批定向任务）/260（robot_msg_read）/261（robot_msg_recall）（2026-09-10 复核直抓 isvapp 各事件页；其余未知）。→ 待核验(09-27)（残：全表）
12. **官方 SDK 本体版本**：仓库存在性+模块结构已由仓库页直抓确认（`app-stream-api/client/network/protocol/dingtalk-stream`，README"Java SDK for DingTalk Stream Mode API"，教程指 opensource.dingtalk.com，2026-09-10 复核）；各语言最新版与 `DingTalkEncryptor/DingCallbackCrypto` 源码常量（PKCS7/32 字节块）未下载核验。→ 待核验(09-27)（残：版本与源码常量）

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"钉钉推事件（Stream）"：WebSocket 明文 `{eventUnifiedAppId, eventCorpId, eventType, eventId, eventBornTime, data}`，`data` 按事件取 §5；消费回 SUCCESS/LATER
- 模拟"钉钉推事件（HTTP 新）"：`POST` JSON `{EventType, EventTime, CorpId, BizId, eventId, ...}`（加密 envelope 形态待 §7.2 落定前先按旧 `encrypt` 体系实现，二者算法同源）
- 模拟"钉钉推事件（旧回调）"：`POST https://<url>?signature=…&timestamp=…&nonce=…` body `{"encrypt":"…"}`，`signature=sha1hex(sort(token,timestamp,nonce,encrypt))`，AES-256-CBC（key=`Base64Decode(EncodingAESKey+"=")`，iv=前 16B，包=`random16+len4BE+msg+ownerKey`，PKCS#7）；握手 `{"EventType":"check_url"}` 期望回 `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`
- 模拟"机器人收消息（HTTP）"：明文 POST §5.1 + header `timestamp/sign=Base64(HmacSHA256(timestamp+"\n"+appSecret))`；`conversationType` 为字符串 `"1"/"2"`；媒体给 `downloadCode` 不给二进制
- ID 形态：`eventCorpId/CorpId: ding…`；`eventId: 十六进制`；`userId: 数字串/user…`；`chatId: chat…`；`openConversationId: cid…==`；`senderId: $:LWCP_v1:$…`；`msgId: msgr…==/dsa…`；`processInstanceId: uuid/混合`；`suiteTicket: 字母数字`；时间 `eventBornTime/EventTime/createTime/finishTime` 毫秒，`timeStamp` 为字符串型毫秒
- 重试语义（旧体系实锤）：10s→30s→3~5min 后查失败列表（≤200，`has_more` 翻页）；`suite_ticket` 不回连推 100 次；幂等键 `eventId`（机器人 `msgId`）
