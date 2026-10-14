# QQ开放平台（QQ机器人） 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 bot.q.qq.com 官方文档正文（全部成功，逐字）+ WebSearch 官方站内摘录（标注 `[摘录]`）。
> 复核记录：2026-10-14（#114 动工前置）以页面抓取直取官方现网版本复核 §7.1/§7.5（webhook 页 2026-07-21 版、api-call-guide 页 2026-07-21 版、access-token 页 2026-09-16 版），新增取凭证失败报文补证（§5.10/§6）；结论已回填对应条目。
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`待核验(09-27)` = 未能取得官方原文，需复核。
> 事实分级参照 `feishu.md`：本库 §2–§6 均为官方来源。
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文）。

## 1. 官方文档入口与关键页面地址

- 门户/控制台：开放平台官网 https://bot.q.qq.com/open ；注册地址 https://q.qq.com/#/ ；Webhook 回调配置页 https://q.qq.com/qqbot/#/developer/webhook-setting
- 文档根：https://bot.q.qq.com/wiki/ ；开发文档（api-v2）：https://bot.q.qq.com/wiki/develop/api-v2/
- 运营规范：https://bot.q.qq.com/wiki/business/
- 官方 SDK（出自启动接入页原文，附"SDK 仅提供接入参考，详情能力以官方文档能力描述为准"）：Go `botgo`（https://github.com/tencent-connect/botgo）、Python `botpy`（https://github.com/tencent-connect/botpy）`[摘录]`（`pip install qq-botpy`，python3.8+，出自 pythonsdk 页摘录）、Node `bot-node-sdk`（https://github.com/tencent-connect/bot-node-sdk）`[摘录]`（`npm i qq-guild-bot`，老包已废弃，出自 nodesdk 页摘录）

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| 介绍与接入指南（准入/发布/沙箱/IP白名单/使用范围） | https://bot.q.qq.com/wiki/ | WebFetch 全文 |
| 启动接入（注册/AppID+AppSecret/SDK） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/getting-started.html | WebFetch 全文 |
| 获取访问凭证 access_token | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html | WebFetch 全文 |
| 接口调用与鉴权（含 getAppAccessToken 细节） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html | WebFetch 全文 |
| API 调用指南（统一地址/响应结构/错误码/Trace） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/api-call-guide.html | WebFetch 全文 |
| 事件订阅与通知（总览，含 Webhook+WebSocket+Intents 全表） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html | WebFetch 全文 |
| 通用数据结构 payload（信封/OpCode/Intents） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/payload.html | WebFetch 全文 |
| Webhook 方式（含 op13 回调验证全过程） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/webhook.html | WebFetch 全文 |
| WebSocket 方式（含 Identify/心跳/Resume/分片/错误码） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/websocket.html | WebFetch 全文 |
| 安全和授权（Ed25519 验签全过程+向量） | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html | WebFetch 全文 |
| 消息收发概述（场景矩阵/主动被动/频控/去重/撤回） | https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html | WebFetch 全文 |
| 发送单聊消息 | https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html | WebFetch 全文 |
| 发送群聊消息 | https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html | WebFetch 全文 |
| 单聊消息事件 C2C_MESSAGE_CREATE | https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html | WebFetch 全文 |
| 群@机器人消息 GROUP_AT_MESSAGE_CREATE | https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_at_message_create.html | WebFetch 全文 |
| 群消息全量 GROUP_MESSAGE_CREATE | https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html | WebFetch 全文 |
| 用户添加好友 FRIEND_ADD | https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/friend_add.html | WebFetch 全文 |
| 机器人加入群聊 GROUP_ADD_ROBOT | https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_add_robot.html | WebFetch 全文 |
| 频道消息事件（AT/MESSAGE/DIRECT/AUDIT） | https://bot.q.qq.com/wiki/develop/api-v2/server-inter/channel/message/event.html | WebFetch 全文（注：MESSAGE_CREATE 小节标题误写 PUBLIC_GUILD_MESSAGES，以 payload 页 GUILD_MESSAGES(1<<9)私域为准） |
| 获取通用 WSS 接入点 GET /gateway | https://bot.q.qq.com/wiki/develop/api-v2/openapi/wss/url_get.html | WebFetch 全文 |
| 获取带分片 WSS 接入点 /gateway/bot | https://bot.q.qq.com/wiki/develop/api-v2/openapi/wss/shard_url_get.html | WebFetch 全文（注：官方本页示例缺 "url" 键且 shards/remaining 与 websocket 页示例不同，§3.4 引 websocket 页归一化示例） |
| 消息收发事件总页（单聊/群@/群全量/频道/私信） | https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/event.html | 死链（实抓回退为启动接入页；收发矩阵以 overview 页为准，待核验(09-27)） |
| NodeSDK 接入指南 | https://bot.q.qq.com/wiki/develop/nodesdk | `[摘录]` |
| PythonSDK 接入指南 | https://bot.q.qq.com/wiki/develop/pythonsdk | `[摘录]` |
| WebSocket 错误码页 | https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html | `[摘录]` |

---

## 2. 消息/事件推送全清单

推送信封统一（Webhook/WebSocket 同构，见 §5.1）。下表 `t` 即事件名，`Intent` 即订阅位。

### 2.1 消息类（单聊/群/频道，MockPulse 核心）

| 事件类型 | Intent | 触发语义 | 出处 |
|---|---|---|---|
| `C2C_MESSAGE_CREATE` | `GROUP_AND_C2C_EVENT (1<<25)` | 用户在单聊发消息给机器人 | C2C 事件页全文 |
| `GROUP_AT_MESSAGE_CREATE` | `GROUP_AND_C2C_EVENT (1<<25)` | 用户在群里 @机器人 发消息；`content` 已自动去除 @前缀 | 群@页全文 |
| `GROUP_MESSAGE_CREATE` | `GROUP_AND_C2C_EVENT (1<<25)` | 全量模式：开启"接收所有消息"后群内每条消息都推（页首句逐字）；字段与 GROUP_AT 完全一致，另有 `mentions`（@用户列表） | group_message_create 页全文（2026-09-10 复核直抓；事件体字段表+3 示例见 §5 新增） |
| `AT_MESSAGE_CREATE` | `PUBLIC_GUILD_MESSAGES (1<<30)` | 文字子频道内 @机器人或回复机器人消息时（公域） | 频道事件页全文 |
| `MESSAGE_CREATE` | `GUILD_MESSAGES (1<<9)`，仅私域机器人可设 | 文字子频道内全部消息（私域） | 频道事件页全文 + payload 页全文 |
| `DIRECT_MESSAGE_CREATE` | `DIRECT_MESSAGE (1<<12)` | 用户通过频道私信发消息给机器人；私信不支持沙箱环境 | 频道事件页全文 |
| `MESSAGE_DELETE` | `GUILD_MESSAGES (1<<9)` | 频道消息删除（撤回） | payload 页全文 |
| `PUBLIC_MESSAGE_DELETE` | `PUBLIC_GUILD_MESSAGES (1<<30)` | 频道消息删除（公域版） | payload 页全文 |
| `DIRECT_MESSAGE_DELETE` | `DIRECT_MESSAGE (1<<12)` | 私信删除（撤回） | payload 页全文 |
| `MESSAGE_AUDIT_PASS` / `MESSAGE_AUDIT_REJECT` | `MESSAGE_AUDIT (1<<27)` | 主动消息审核通过/不通过，载荷为 MessageAudited | 频道事件页全文 |

- 消息内容类型 `message_type`（C2C/群事件页原文）：`0`=普通文本，`3`=结构化卡片（`ark_data` 有值），`101`=并行消息，`102`=聊天记录，`103`=引用消息（`msg_elements` 有值，`message_scene.ext` 含 `ref_msg_idx`）。
- 单聊/群事件时间 `timestamp` 为 RFC3339；`id` 形如 `ROBOT1.0_xxx`，可用于被动回复与撤回。
- 频道事件内容为 Message 对象；官方明示"尽量有序但不保证严格有序，对顺序有严格需求自行按 `Message.seq` 缓冲排序"（频道事件页全文）。
- 私信事件不支持沙箱，官方建议用用户 id 白名单调试（频道事件页全文）。

### 2.2 关系链/开关类（同属 `GROUP_AND_C2C_EVENT (1<<25)`，payload 页全文）

| 事件类型 | 触发语义 | 出处 |
|---|---|---|
| `FRIEND_ADD` | 用户添加机器人为好友；`scene` 区分来源（1000 缺省/1001-1004 搜索群空间/2001-2004 分享链接），`scene_param` 为开发者自定义 callback_data | friend_add 页全文（示例见 §5.4） |
| `FRIEND_DEL` | 用户删除机器人 | payload 页全文（事件体待核验(09-27)） |
| `C2C_MSG_RECEIVE` / `C2C_MSG_REJECT` | 用户在资料卡手动开启/关闭"主动消息"推送 | payload 页全文（事件体待核验(09-27)）；二者同时是单聊被动回复可用 `event_id` 类型 |
| `GROUP_ADD_ROBOT` | 机器人被添加到群聊（`group_openid` + `op_member_openid` + Unix 秒 `timestamp`） | group_add_robot 页全文（示例见 §5.5）；同时是群被动回复可用 `event_id` 类型 |
| `GROUP_DEL_ROBOT` | 机器人被移出群聊 | payload 页全文（事件体待核验(09-27)） |
| `GROUP_MSG_RECEIVE` / `GROUP_MSG_REJECT` | 群管理员在资料页开启/关闭通知 | payload 页全文（事件体待核验(09-27)） |
| 群成员加入/退出（`group_member_add` 等）/用户申请加群（`group_join_request`） | 群成员变更 | `[摘录]` autogen 索引（事件体待核验(09-27)） |

### 2.3 频道域其余事件（payload 页全文，事件体不展开）

- `GUILDS (1<<0)`：`GUILD_CREATE/UPDATE/DELETE`、`CHANNEL_CREATE/UPDATE/DELETE`。
- `GUILD_MEMBERS (1<<1)`：`GUILD_MEMBER_ADD/UPDATE/REMOVE`。
- `GUILD_MESSAGE_REACTIONS (1<<10)`：`MESSAGE_REACTION_ADD/REMOVE`。
- `INTERACTION (1<<26)`：`INTERACTION_CREATE`（按钮回调；同时是单聊/群被动回复可用 `event_id` 类型）。
- `FORUMS_EVENT (1<<28)`（仅私域）：`FORUM_THREAD_CREATE/UPDATE/DELETE`、`FORUM_POST_CREATE/DELETE`、`FORUM_REPLY_CREATE/DELETE`、`FORUM_PUBLISH_AUDIT_RESULT`。
- `AUDIO_ACTION (1<<29)`：`AUDIO_START/FINISH/ON_MIC/OFF_MIC`。
- 权限规则（payload 页逐字）：`GUILDS`、`PUBLIC_GUILD_MESSAGES`、`GUILD_MEMBERS` 为基础事件默认有权限；其余特殊事件须申请，鉴权传无权限 intents 则 websocket 报错并关闭连接；权限被取消后当前连接不报错但收不到事件，重连则报错。

---

## 3. 回调机制

### 3.1 两种订阅通道

| | WebSocket（长连接） | Webhook（HTTP 回调） |
|---|---|---|
| 形态 | WSS 长连接收 Dispatch；先调网关接口取地址再连 | 平台向 HTTPS 回调地址 POST 事件；管理端 `webhook-setting` 配置回调地址并选定监听事件类型 |
| 网络要求 | 出站可达即可 | 必须是 HTTPS；允许端口仅 `80、443、8080、8443` |
| 鉴权 | Op2 Identify，`token: "QQBot {AccessToken}"` + `intents` + `shard` | 每次请求 Ed25519 验签（§4）；首次配置有 op13 验证握手（§3.2） |
| 会话/可靠 | Hello 心跳周期 → 定时 Heartbeat(op1, d=最新 s)→ACK(op11)；断线用 Resume(op6, token+session_id+seq) 补发 seq 之后遗漏事件，补完下发 `RESUMED` | 通用信封同构；op12 `HTTP Callback ACK` 定义为"仅用于 http 回调模式的回包"——正常 Dispatch 应答体格式待核验(09-27)（§7.1） |
| 集群语义 | 官方分片：`shard=[i,n]` 多连接水平分割；分片按 `shard_id = (guild_id >> 22) % num_shards`；连接数受 `session_start_limit.remaining` 约束 | — |
| 环境 | 正式/沙箱网关地址不同（§3.4） | 沙箱事件仅来自配置的沙箱频道/群/号（wiki 首页全文） |
| 正常 Dispatch 回包 | op12 `HTTP Callback ACK`（payload 页定义逐字："仅用于 http 回调模式的回包，代表机器人收到了平台推送的数据"）；回包体具体格式（空 200 / `{"op":12}` / 其他）webhook 页全文无口径（§7.1） | — |

### 3.2 首次验证握手（op13，webhook 页逐字）

- 平台请求：`headers: User-Agent:[QQBot-Callback] X-Bot-Appid:[11111111]`，`body: {"d":{"plain_token":"Arq0D5A61EgUu4OxUvOp","event_ts":"1725442341"},"op":13}`。
- 开发者回包：`{"plain_token": "Arq0D5A61EgUu4OxUvOp","signature": "87befc99..."}`，其中 `signature = hex(Ed25519.Sign(priv, event_ts + plain_token))`，`priv` 由 Bot Secret 按 §4 方法派生（webhook 页 Go 代码逐字，见 §5.2）。
- 官方示例账号：`appid: 11111111` / `secret: DG5g3B4j9X2KOErG`（webhook 页原文）。

### 3.3 WebSocket 连接维护（websocket 页逐字，示例见 §5）

1. `GET /gateway`（或 `/gateway/bot` 带分片）取 `wss://api.bot.qq.com/websocket/`。
2. 建连首条 `{"op":10,"d":{"heartbeat_interval":45000}}`（毫秒）。
3. 发 Identify：`{"op":2,"d":{"token":"token string","intents":513,"shard":[0,4],"properties":{"$os":"linux","$browser":"my_library","$device":"my_library"}}}`；`token` 格式 `"QQBot {AccessToken}"`；无需分片用 `[0,1]`；`properties` 无实际作用。
4. 成功下发 Ready：`{"op":0,"s":1,"t":"READY","d":{"version":1,"session_id":"082ee18c-...","user":{"id":"6158788878435714165","username":"群pro测试机器人","bot":true},"shard":[0,0]}}`。
5. 按周期发心跳 `{"op":1,"d":251}`（d 为最新 s，首次 null），回 `{"op":11}`。
6. 断线重连发 Resume `{"op":6,"d":{"token":"my_token","session_id":"session_id_i_stored","seq":1337}}`，补发后下发 `{"op":0,"s":2002,"t":"RESUMED","d":""}`。官方建议处理完事件即记录 `s`。
7. 错误码（websocket 页全文）：`4009` 可 resume（identify 亦可）；`4914`（下架，仅许连沙箱）、`4915`（封禁）不可连；`4008`（payload 过快）可 resume+identify；`4900~4913`（内部错误）仅可 identify（resume 列为否）；`4006/4007` 转 identify；`4001/4002/4010~4014` 不可重试。

### 3.4 网关/域名地址

- `GET /gateway` → `{"url": "wss://api.bot.qq.com/websocket/"}`（url_get 页全文）。
- `/gateway/bot` → `{"url":"wss://api.bot.qq.com/websocket","shards":1,"session_start_limit":{"total":1000,"remaining":1000,"reset_after":86400000,"max_concurrency":1}}`（`[摘录]` websocket 页）。
- OpenAPI 统一地址 `https://api.bot.qq.com`（api-call-guide 页全文）；取凭证 `POST https://api.bot.qq.com/app/getAppAccessToken`（access-token 页全文）。
- 正式环境 `https://api.sgroup.qq.com/`、沙箱 `https://sandbox.api.sgroup.qq.com`、取凭证 `https://bots.qq.com/app/getAppAccessToken`（wiki 首页 §8.5 全文：取凭证"不区分正式环境、沙箱环境"；正式/沙箱 openapi 各走一址；与下条并存关系待核验(09-27)，见 §7.5）。
- OpenAPI 统一请求地址 `https://api.bot.qq.com`（api-call-guide 页"统一请求地址"节逐字，2026-09-10 复核直抓）；单聊/群发送示例 curl 均以此为 host。
- 沙箱约束（wiki 首页全文）：沙箱频道/群须为当前用户任频道主或群主/管理员且成员 ≤20 人；沙箱地址只收配置过的沙箱来源事件、openapi 仅能操作沙箱环境；IP 白名单仅作用正式环境。

### 3.5 重试、幂等、有序

- 幂等（已核验）：单聊/群事件页逐字"为确保消息可达，相同 msg_id 可能重复推送"——单聊页要求结合 `msg_seq` 去重，C2C 页另要求结合 `message_scene.ext` 中的 `msg_idx` 去重；overview 页逐字"相同 `msg_id` 可能多次推送，请结合 `msg_seq` 去重。被动回复时，相同的 `msg_id + msg_seq` 重复发送会失败，可递增 `msg_seq` 实现对同一消息的多次回复。"
- 有序（已核验）：频道事件"尽量有序，不保证严格有序，按 `Message.seq` 自行排序"（频道事件页 AT/MESSAGE 两节同句，2026-09-10 复核直抓）；单聊/群事件页（C2C 页全文）无有序口径，仅去重口径（同 `msg_id` 可能重复推，结合 `msg_seq` 去重；另结合 `message_scene.ext` 的 `msg_idx` 去重，两句并存）→ 单聊/群有序性官方无口径（§7.3 残留）。
- Webhook 超时/重试次数与间隔：官方文档未给出 → 待核验(09-27)（§7.1）。WebSocket 侧断线补发以 Resume/seq 为准（已核验）。

---

## 4. 验签与加密算法

来源：安全和授权页全文 + Webhook 页全文。事件无 AES 加密体（与飞书不同），只有 Ed25519 签名；密钥为管理端 `AppSecret`/`Bot Secret`（getting-started 页：`AppSecret` 为"用于请求签名的密钥"；sign 页："Bot Secret 用于加密签名字符串和服务器端验证签名字符串的密钥，须严格保管"）。

### 4.1 签名验证参数（sign 页逐字）

| 字段 | 说明 | 参考值 |
|---|---|---|
| `X-Signature-Ed25519` | Header 透传 Signature（hex，64 字节） | `3ecd***` |
| `X-Signature-Timestamp` | Header 透传签名时间戳 | `1636373772` |
| HTTP Body | 请求 Body 原始值 | `{"msg":"hello"}` |

### 4.2 验证过程（Go，sign 页逐字）

1. 由 Bot Secret 求 32 字节 seed：`seed := botSecret; for len(seed) < ed25519.SeedSize { seed = strings.Repeat(seed, 2) }`，取前 32 字节 `GenerateKey` 得公钥（签名生成侧取私钥，见 §5.2）。
2. 取 Header 的 `X-Signature-Ed25519` 做 hex 解码，长度须为 `ed25519.SignatureSize` 且 `sig[63]&224 == 0`。
3. 签名体 `msg = timestamp + 原始Body字节`（timestamp 为 Header 的 `X-Signature-Timestamp` 字符串，Body 用原始字节）。
4. `ed25519.Verify(publicKey, msg.Bytes(), sig)`。

官方向量（sign 页逐字）：`secret: naOC0ocQE3shWLAfffVLB1rhYPG7` → `seed: naOC0ocQE3shWLAfffVLB1rhYPG7naOC` → `publicKey: [215 195 98 254 120 ... 103 58]`（32 字节，`privateKey` 前 32 字节即 seed ASCII）；`body` 为换行缩进的 pretty-print JSON——`{\n  "op": 0,\n  "d": {},\n  "t": "GATEWAY_EVENT_NAME"\n}`（无结尾换行；2026-10-14 复核：页面渲染为内联形态致 09-10 记录失真，按字面字节穷举勘定与 `sig` 吻合者即此形态）+ `timestamp: 1725442341` → `sig: 865ad13a61752ca65e26bde6676459cd36cf1be609375b37bd62af366e1dc25a8dc789ba7f14e017ada3d554c671a911bfdf075ba54835b23391d509579ed002`。可用作验签回归向量（须按上述原始字节）。

### 4.3 回调验证签名（op13，webhook 页逐字）

与 §4.2 同一派生（secret→repeat→32 字节 seed→`GenerateKey` 取私钥），`msg = event_ts + plain_token`，`hex(Ed25519.Sign(priv, msg))` 回填 `signature`。官方向量见 §3.2/§5.2。

### 4.4 op13 签名预言机弱点与 DUDU 缓解（2026-10-14 review 记录，官方页无此口径）

- **弱点（协议固有）**：op13 握手请求本身无任何签名材料（仅 `plain_token` + `event_ts`，§3.2），而应答签名与 op0 事件验签（§4.2）用**同一把** AppSecret 派生密钥——任何人都能对任选 `plain_token`/`event_ts` 取得一条 `(event_ts + plain_token)` 的合法 Ed25519 签名。该签名虽不直接伪造 op0 推送（op0 签名体是 `timestamp头 + 原始Body`，攻击者无密钥不可伪造），但"无条件回签任意串"的预言机面是不必要的暴露；官方 webhook 页对握手频次、event_ts 时效均无任何要求（逐字口径无校验步骤）。
- **DUDU 缓解（#114 实现追加，官方未定窗口）**：适配器只在 `event_ts`（秒级 Unix 时间戳）落在当前时间 **±300 秒窗口**内才回签握手，超窗与非数字 `event_ts` 按参数错误（HTTP 400）拒绝——把无条件预言机收敛为"时间近邻才签"，窗口外的历史/未来握手报文不可复用；窗口值 300s 为通用回调防重放口径（官方未给出推荐值，非官方事实）。op13 黄金向量（§3.2/§5.2）因此只在协议层单测锚定（`QqProtocolTest`），适配器/集成层握手用例改用测试时刻现算的新鲜时间戳。

---

## 5. 示例载荷原文（逐字）

### 5.1 通用信封（payload 页逐字）

```json
{
  "id": "event_id",
  "op": 0,
  "d": {},
  "s": 42,
  "t": "GATEWAY_EVENT_NAME"
}
```

字段：`id`=事件id；`op`=opcode（§3）；`s`=下行序列号（心跳携带最新 s）；`t`=事件类型（op=0 Dispatch 时）；`d`=事件内容。

### 5.2 op13 回调验证（webhook 页逐字）

请求：`headers: User-Agent:[QQBot-Callback] X-Bot-Appid:[11111111]`，`body: {"d":{"plain_token":"Arq0D5A61EgUu4OxUvOp","event_ts":"1725442341"},"op":13}`。
应答：`{"plain_token": "Arq0D5A61EgUu4OxUvOp","signature": "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706"}`（账号 `appid: 11111111` / `secret: DG5g3B4j9X2KOErG`）。
计算代码（Go，webhook 页逐字，`Payload.Data` 即 `d` 的二次反序列化，`msg = eventTs + plainToken`）：

```go
seed := botSecret
for len(seed) < ed25519.SeedSize {
    seed = strings.Repeat(seed, 2)
}
seed = seed[:ed25519.SeedSize]
reader := strings.NewReader(seed)
_, privateKey, err := ed25519.GenerateKey(reader)
var msg bytes.Buffer
msg.WriteString(validationPayload.EventTs)
msg.WriteString(validationPayload.PlainToken)
signature := hex.EncodeToString(ed25519.Sign(privateKey, msg.Bytes()))
rspBytes, err := json.Marshal(&ValidationResponse{PlainToken: validationPayload.PlainToken, Signature: signature})
rw.Write(rspBytes)
```

### 5.3 C2C_MESSAGE_CREATE（C2C 事件页逐字，示例1）

```json
{
  "id": "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "author": {
    "id": "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
    "user_openid": "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
    "union_openid": "",
    "username": "",
    "bot": false
  },
  "content": "你好，今天有什么推荐的活动吗？",
  "message_type": 0,
  "message_scene": {
    "source": "default",
    "ext": [
      "msg_idx=REFIDX_xxxxxxxxxxxxxxx=="
    ]
  },
  "timestamp": "2026-07-21T10:00:00+08:00"
}
```

### 5.4 GROUP_AT_MESSAGE_CREATE（群@页逐字，示例1）

```json
{
  "id": "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "author": {
    "id": "A1B2C3D4E5F6A1B2C3D4",
    "member_openid": "A1B2C3D4E5F6A1B2C3D4",
    "member_role": "member",
    "username": "小明",
    "bot": false
  },
  "content": " /今日天气 ",
  "group_openid": "B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
  "message_type": 0,
  "timestamp": "2026-07-21T10:00:00+08:00",
  "message_scene": {
    "source": "default",
    "ext": [
      "msg_idx=REFIDX_xxxxxxxxxxxxxxx==",
      "auth_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    ]
  }
}
```

### 5.5 FRIEND_ADD（friend_add 页逐字）

```json
{
  "openid": "A1B2C3D4E5F6A1B2C3D4",
  "timestamp": 1784570523,
  "scene": 1001,
  "scene_param": "",
  "author": {
    "union_openid": "DB85A74E07BA08B5B44CD9ED332FCBD2"
  }
}
```

### 5.6 GROUP_ADD_ROBOT（group_add_robot 页逐字）

```json
{
  "group_openid": "A1B2C3D4E5F6A1B2C3D4",
  "op_member_openid": "A1B2C3D4E5F6A1B2C3D4",
  "timestamp": 1784570534
}
```

### 5.7 AT_MESSAGE_CREATE 频道（频道事件页逐字）

```json
{
  "author": {
    "avatar": "http://thirdqq.qlogo.cn/0",
    "bot": false,
    "id": "1234",
    "username": "abc"
  },
  "channel_id": "100010",
  "content": "ndnnd",
  "guild_id": "18700000000001",
  "id": "0812345677890abcdef",
  "member": {
    "joined_at": "2021-04-12T16:34:42+08:00",
    "roles": ["1"]
  },
  "timestamp": "2021-05-20T15:14:58+08:00",
  "seq": 101
}
```

### 5.8 发送单聊消息请求/响应（api-call-guide + 单聊发送页逐字）

```bash
curl -X POST 'https://api.bot.qq.com/v2/users/A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4/messages' \
-H 'Authorization: QQBot {ACCESS_TOKEN}' \
-H 'Content-Type: application/json; charset=utf-8' \
-d '{
  "content": "Hello World",
  "msg_type": 0,
  "msg_id": "previous_msg_id"
}'
```

```json
{
  "id": "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "timestamp": "2026-07-21T10:30:00+08:00"
}
```

要点：`POST /v2/users/{user_openid}/messages`；`msg_type: 0`=文本(`content`)、`2`=Markdown(`markdown`)、`6`=输入中状态(`input_notify`)、`7`=富媒体(`media.file_info`，来自 `/v2/users/{user_openid}/files`)；被动回复 `msg_id` 取自事件 `d.id`（同页双口径并存已坐实：页头"被动消息有效时间 60 分钟，每个消息最多回复 4 次" vs 请求体 `msg_id` 行"5 分钟内有效"，2026-09-10 复核直抓，见 §7.4）或 `event_id` 取事件外层 `id`（与 `msg_id` 二选一，仅 `INTERACTION_CREATE`、`C2C_MSG_RECEIVE`、`FRIEND_ADD`）；`msg_seq` 默认 1，同 `msg_id+msg_seq` 重发失败（`40054005` 消息被去重）；`is_wakeup` 与二者互斥（互动召回）；引用回复另用 `message_reference.message_id`（取 `msg_idx`/`ref_idx`）；过期类错误码 `304103/40034005/40034026/40034128`（"已过期/超限"）。

### 5.9 发送群消息请求（群发送页逐字）

```
POST /v2/groups/B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5/messages
{
  "msg_type": 0,
  "content": "欢迎使用本群助手，有什么可以帮你的吗？",
  "msg_id": "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "msg_seq": 1
}
```

要点：`POST /v2/groups/{group_openid}/messages`（不支持流式参数）；被动 `msg_id` 取自 `GROUP_AT_MESSAGE_CREATE` 等事件 `d.id`，5 分钟有效、每条 5 次；`event_id` 二选一，仅 `INTERACTION_CREATE`、`GROUP_ADD_ROBOT`、`GROUP_MSG_RECEIVE`；`media.file_info` 来自 `/v2/groups/{group_openid}/files`（与单聊上传不互通）；`file_info` 有 ttl。

### 5.10 access_token 请求/响应（access-token 页逐字）

```bash
curl --location 'https://api.bot.qq.com/app/getAppAccessToken' \
--header 'Content-Type: application/json' \
--data '{
  "appId": "APPID",
  "clientSecret": "CLIENTSECRET"
}'
```

```json
{
  "access_token": "ACCESS_TOKEN",
  "expires_in": "7200"
}
```

失败响应（access-token 页全文，2026-10-14 复核直抓）：`{"code": "xxx", "message": "description"}`——HTTP 状态码恒为 200，业务失败通过 `code` 判断（官方明示不要通过 HTTP 状态码判断、也不要通过 `message` 判断）；官方错误码：`100001` Too many requests（请求过于频繁，请稍后再试）、`100007` appid invalid（无效的 AppID）、`100016` invalid appid or secret（无效的 AppID 或 AppSecret）、`10004` 机器人不存在。注意字段名与 OpenAPI 业务失败体 `{err_code, message, trace_id}` 不同（§6）；`expires_in` 页内表格口径为 number、返回示例为字符串 `"7200"`，解析按两者兼容。

调用：`Authorization: QQBot ACCESS_TOKEN`（api-use 页：`Authorization: string, 必填, "QQBot ACCESS_TOKEN"`）。

### 5.11 WebSocket 握手载荷（websocket 页逐字，见 §3.3）

Identify `{"op":2,"d":{"token":"token string","intents":513,"shard":[0,4],"properties":{"$os":"linux","$browser":"my_library","$device":"my_library"}}}`；Hello `{"op":10,"d":{"heartbeat_interval":45000}}`；心跳 `{"op":1,"d":251}`→`{"op":11}`；Resume `{"op":6,"d":{"token":"my_token","session_id":"session_id_i_stored","seq":1337}}`→`{"op":0,"s":2002,"t":"RESUMED","d":""}`；Ready 见 §3.3（含 `session_id` + `user{id,username,bot}` + `shard`）。

### 5.12 群全量事件体与频道发送补证（2026-09-10 复核直抓逐字）

- `GROUP_MESSAGE_CREATE`：页首句"当机器人开启了'接收所有消息'功能后，群里的每条消息（不限于@机器人）都会推送此事件。各字段含义与 GROUP_AT_MESSAGE_CREATE 完全一致。"事件体字段：`id/author/content/group_openid/timestamp/message_type/message_scene/attachments/mentions/ark_data/msg_elements`（`mentions`=消息中@的用户列表，为相对 GROUP_AT 新增字段）；示例1（文本"大家早上好呀"，`member_role=member`）/示例2（含 `attachments[content_type=image/jpeg, filename, url=multimedia.nt.qq.com.cn/download?…&spec=0, width/height/size]`）/示例3（`message_type=103` 聊天记录合并，`msg_elements[0].content` 为"=== 消息 N ==="拼接，`ext` 含 `ref_msg_idx=TMP_uuid`），见原文页。
- 频道发送：`POST /channels/{channel_id}/messages`（send 页逐字）；被动 5 分钟超时报错；子频道每秒 5 条；主动默认每天每子频道 20 条、每天至多 2 个子频道；**要求 WS 在线**（"发送消息接口要求机器人接口需要连接到 websocket 上保持在线状态"，对应错误码 `304018 SESSION_NOT_EXIST 机器人没连上 gateway`，api-call-guide 错误码表逐字）；Content-Type 支持 `application/json` 与 `multipart/form-data`（回包统一 `application/json`）；审核码 `304023/304024`（data 带 `message_audit.audit_id`）；被动支持事件类型含 `GUILD_MEMBER_ADD/UPDATE/REMOVE`、`MESSAGE_REACTION_ADD/REMOVE`、论坛系 7 种。
- 频道私信（dms 页逐字）：`POST /users/@me/dms` 建会话（`recipient_id`+`source_guild_id`，须同频道；回 `{guild_id, channel_id, create_time}`）→ `POST /dms/{guild_id}/messages` 发私信（参数/返回同子频道发送页）；主动每用户每天 2 条、累计 200 条，被动无条数限制；撤回 `DELETE /dms/{guild_id}/messages/{message_id}?hidetip=`。
- C2C 事件页 User 表（2026-09-10 复核）：`union_openid`="跨应用统一用户 OpenID（可能为空）"、`union_user_account`="跨应用统一用户账号（可能为空）"；去重双口径同页并存："结合 msg_seq 做去重"与"结合 message_scene.ext 中的 msg_idx 做去重"；`message_type` 0/3/101/102/103（101 并行消息、102 聊天记录为相对旧版新增枚举）。

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `access_token`（机器人身份，唯一凭证类型） | `POST {api域名}/app/getAppAccessToken`，body `{appId, clientSecret}` | 默认 7200 秒；有效期内重复获取返回相同值；临过期 60 秒内获取发新值、老值 60 秒内仍有效；过期自行刷新，建议服务端定时刷 | access-token 页全文 + api-use 页全文 |
| `AppID` / `AppSecret`（`clientSecret`） | 注册创建机器人获得（管理端开发基础设置；`QQ号`、`AppID`、`Token`、`AppSecret` 同页展示） | 须长期保密，"不要对外传播"；`AppSecret` 即验签 secret；老 `Token` 鉴权已废弃（getting-started 接入票据节逐字："Token 的鉴权方式已废弃，请使用更安全的 Access Token 鉴权方式"，2026-09-10 复核直抓；存量兼容性见 §7.9） | wiki 首页 §8.1 + getting-started 页全文 |
| 调用传参 | `Authorization: QQBot {ACCESS_TOKEN}`；`Content-Type: application/json; charset=utf-8` | 不要在前端使用凭证，服务端发起 | access-token/api-call-guide 页全文 |
| 取凭证失败 | 失败响应 `{"code": "xxx", "message": "description"}`，HTTP 状态码恒为 200，按 `code` 判定（官方明示不按 HTTP 状态码、不按 `message`）；`100001` Too many requests / `100007` appid invalid / `100016` invalid appid or secret / `10004` 机器人不存在；字段名与 OpenAPI 业务失败体 `{err_code, message, trace_id}` 不同 | — | access-token 页全文（2026-10-14 复核直抓） |
| 身份隔离 | 不同 bot 取到的 `user_openid`/`group_openid` 均不同；群内用户另有 `member_openid`；跨 App 关联靠后续类 unionid 机制（api-call-guide"唯一身份机制"节逐字："若跨业务有关联用户身份需求，后续提供跨 AppID 绑定后，使用类似 unionid 的机制打通身份"；`union_openid`/`union_user_account` 字段已存在，C2C/群全量页 User 表逐字"跨应用统一用户 OpenID/账号（可能为空）"，2026-09-10 复核直抓） | — | api-call-guide 唯一身份节 + C2C/群事件 User 表全文 |
| 发送去重 | `msg_id + msg_seq`（默认 1；递增实现多次回复；重复发送失败 `40054005`） | 接收侧按 `msg_seq`/`msg_idx` 去重（§3.5） | overview + 单聊/群发送页全文 |
| 频控（已核验） | 单聊主动：认证（企业/个人）Bot 10/qps、未认证 5/qps & 30/qpm；单关系 20/qpm；1000 条/天/用户。群主动：认证 Bot 60/qpm、未认证 30/qpm；单关系 20/qpm；1000 条/天/群。接口级：单聊/群发送页各标 100 QPS。被动窗口：单聊 60 分钟×4 次（发送页另写 msg_id 5 分钟，双口径见 §7.4）、群 5 分钟×5 次、频道 5 分钟。频道：子频道 5 条/秒、主动 20 条/天/子频道且每天至多 2 个子频道、发消息要求 WS 在线；私信：每用户每天 2 条主动、累计 200 条。 | — | overview 频率节 + 单聊/群发送页全文 |
| 频控错误 | HTTP `429` 频率限制；`40034100` 主动消息超频控；`1100100` 安全打击限频；`20028` 子频道写限频；`304045/304049/304050` 主动消息数限频；`AT@全体 304019` | 按 `err_code` 判定失败，不看 `message` | api-call-guide 错误码表全文 + 发送页错误码表全文 |
| 可重试性标注 | 公共码中 `11281/11252/11263`（系统错误，一般重试一次好，最多一次）；`306003-306006` 撤回类多标"可重试"；发送异常 `50055001/50055002/50055006` 建议稍后重试；`40034004` 富媒体转存失败"请重试" | — | api-call-guide 页全文 |
| 链路追踪 | 响应头 `X-Tps-trace-ID` 或响应体 `trace_id`；失败体 `{err_code, message, trace_id}`；成功体直接业务数据 `{id, timestamp}`（`+08:00` RFC3339） | — | api-call-guide 页全文 |
| IP 白名单 | 新增机器人默认启用；正式环境只有白名单 IP 能连 websocket 与调 openapi；须填白名单才可提审上线；仅作用正式环境 | — | wiki 首页 §8.5 全文 |
| 互动召回 | 用户主动对话后 30 天内可下发召回（当天/1-3/3-7/7-30 天各 1 条，共 4 周期），`is_wakeup=true`，与 `msg_id/event_id` 互斥 | — | overview + 发送页全文 |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **Webhook 正常 Dispatch 应答体**：op12 定义已坐实（payload 页逐字"仅用于 http 回调模式的回包，代表机器人收到了平台推送的数据"，2026-09-10 复核直抓）；正常事件回包体具体格式（空 200 / `{"op":12}` / 其他）webhook 页全文无口径；2026-10-14 复核直抓现网 webhook 页（2026-07-21 版）全文仍仅 op13 握手与端口要求，无新增口径 → 维持待核验（残：回包体格式）；#114 实现按应答 HTTP 200、回包体不作承诺（MockPulse 对正常事件仅校验状态码）。
2. **Webhook 超时与重试策略**：webhook 页/各事件页全文无超时秒数、重试间隔/次数口径（仅 WS 侧 Resume/seq 补发已核验）→ 待核验(09-27)。
3. **事件有序性（单聊/群）**：频道侧已坐实（频道事件页 AT/MESSAGE 两节同句"尽量有序…基于 Message.seq 排序"，2026-09-10 复核直抓）；单聊/群页（C2C 页全文）无有序口径、仅去重口径 → 待核验(09-27)（残：单聊/群是否有序）。
4. **被动窗口双口径（已坐实双写，模拟器口径不变）**：单聊发送页同页双写已坐实——页头"被动消息有效时间 60 分钟，每个消息最多回复 4 次" vs 请求体 `msg_id` 行"5 分钟内有效"（2026-09-10 复核直抓）；概述页被动表为单聊 60min×4/群 5min×5/频道 5min → 双口径照录，模拟器按概述页 60min×4 实现（已定稿不动）。
5. **域名关系**：三址并存已坐实——api-call-guide"统一请求地址 https://api.bot.qq.com"（2026-09-10 复核直抓）vs wiki 首页 §8.5"取凭证 https://bots.qq.com/app/getAppAccessToken（不区分正式/沙箱）/正式 https://api.sgroup.qq.com/沙箱 https://sandbox.api.sgroup.qq.com"；2026-10-14 复核直抓：api-call-guide（2026-07-21 版）请求示例仍统一 `https://api.bot.qq.com`，access-token 页（2026-09-16 版）已明确 `HTTP URL: https://api.bot.qq.com/app/getAppAccessToken`，wiki 首页三址未删、迁移/等价状态仍无口径 → 维持待核验（残：迁移状态）；#114 实现默认 api-base 取 `https://api.bot.qq.com`，可用 `dudu.channel.qq.api-base` 覆盖。
6. **其余事件体**：`GROUP_MESSAGE_CREATE` 全文已落定（§5.12，2026-09-10 复核直抓）；`FRIEND_DEL`、`C2C_MSG_RECEIVE/REJECT`、`GROUP_DEL_ROBOT`、`GROUP_MSG_RECEIVE/REJECT`、`group_member_add/remove`、`group_join_request`、`DIRECT_MESSAGE_DELETE`、`MESSAGE_DELETE/PUBLIC_MESSAGE_DELETE` 仍仅 Intent+语义级 → 待核验(09-27)（残：上述事件体）。
7. **全量群消息开通条件**：触发语义已坐实（group_message_create 页首句"开启'接收所有消息'功能后…"，2026-09-10 复核直抓）；开关位置/权限/审核要求官方页无口径 → 待核验(09-27)（残：开通条件）。
8. **`union_openid` 跨应用打通状态**：字段存在已坐实（C2C/群全量页 User 表"跨应用统一用户 OpenID/账号（可能为空）"，2026-09-10 复核直抓）+ api-call-guide"唯一身份机制"节"后续提供跨 AppID 绑定后，使用类似 unionid 的机制打通" → 当前可用性（可能为空/后续提供）照录 → 待核验(09-27)（残：实际打通可用性）。
9. **老 Token 鉴权下线状态**：废弃声明已坐实（getting-started 接入票据节"Token 的鉴权方式已废弃，请使用更安全的 Access Token 鉴权方式"，2026-09-10 复核直抓）；存量兼容性官方无口径 → 待核验(09-27)（残：存量兼容）。
10. **频道发送消息接口细节**：子频道发送（send 页）与私信/DMS（dms 页）已落定（§5.12：接口/频控/WS 在线/`304018 SESSION_NOT_EXIST`/审核码/私信额度，2026-09-10 复核直抓）→ 本项消项。
11. **官方 SDK 仓库直验**：仓库地址+免责已坐实（getting-started"SDK DEMO"节：botgo/botpy/bot-node-sdk 三仓库链接+"SDK 仅提供接入参考，详情能力以官方文档能力描述为准"，2026-09-10 复核直抓）；仓库本体内容未取 → 待核验(09-27)（残：本体直验）。
12. **准入审核时效与企业/个人能力差异**：入驻链路已坐实（wiki 首页：企业工商+对公打款验证/个人实名绑定管理员/公域转私域不可逆/使用范围白名单各 20 条/基础信息每月改 5 次，2026-09-10 复核直抓）；审核时效数字、提审材料细则以管理端与运营规范页为准 → 待核验(09-27)（残：时效数字）。

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"QQ 推事件给回调"：`POST` 通用信封 `{id, op:0, d:{...}, s, t}`，头 `X-Signature-Ed25519: hex(Ed25519.Sign(priv, timestamp+rawBody))` + `X-Signature-Timestamp: <秒级字符串>` + `X-Bot-Appid`；`priv` 由 AppSecret repeat→32B→`GenerateKey` 派生；回归向量用 §4.2（secret `naOC0ocQE3shWLAfffVLB1rhYPG7` / ts `1725442341` / sig `865ad13a…ed002`）。
- 模拟首次配置校验：`POST {"d":{"plain_token":"<同值>","event_ts":"<ts>"},"op":13}`（头 `User-Agent: QQBot-Callback`），期望回 `{"plain_token":"<同值>","signature":"hex(Ed25519.Sign(priv, ts+plain_token))"}`；向量用 §3.2（secret `DG5g3B4j9X2KOErG`）。
- 模拟 WS 网关：`GET /gateway` → `{url}`；建连先发 Hello(`op:10`)；收 Identify(`op:2`, token=`QQBot <access_token>`) 回 Ready；心跳 `op:1(d=最新s)` 回 `op:11`；重连 Resume(`op:6`) 后补发再回 `RESUMED`；错误码按 §3.3（`4009→resume`，`4914/4915→断开`，余者→identify）。
- ID 形态：消息 `id: ROBOT1.0_*`；用户 `user_openid`、群 `group_openid`、群成员 `member_openid`（均为 32 位十六进制样）；`timestamp` RFC3339 东八区；`s` 数字序列号。
- 幂等语义：同 `msg_id` 可重复推，按 `msg_seq`（C2C 另按 `message_scene.ext: msg_idx=REFIDX_…`）去重；同 `msg_id+msg_seq` 主动重发必失败。
- 收发配对：C2C 事件 `d.id`→`POST /v2/users/{user_openid}/messages`；群@事件 `d.id`→`POST /v2/groups/{group_openid}/messages`；`msg_id` 与外层 `id` 取值的 `event_id` 二选一（可用类型见 §5.8/§5.9）；`Authorization: QQBot <access_token>`。
- 频控模拟：认证 Bot 单聊 10/qps、群 60/qpm；单关系 20/qpm；超限回 HTTP 429 或 `40034100`；被动窗口单聊 60min×4、群 5min×5。
- 勘误（相对常见误解）：Token 直调已废弃，一律 Access Token；`content` 群@事件已去前缀；频道私信无沙箱；发频道消息要求 WS 在线（`304018 SESSION_NOT_EXIST`）。
