# B站开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 `open.bilibili.com`（SPA 壳，仅回 `哔哩哔哩开放平台` 标题，正文抓不到）+ WebSearch 官方站内原文摘录（标注 `[摘录]`）+ 非 primary 镜像 `bilibili.apifox.cn` 全文（标注 `[镜像]`，为开放平台文档的 Apifox 同步页，非 primary，仅作待核验线索）。
> 标注约定：`[摘录]` = WebSearch 返回的 `open.bilibili.com` 页面官方原文（未取全文）；`[镜像]` = `bilibili.apifox.cn` 镜像页全文（非 primary，不可当事实）；无标注 = 本次已核验的门户级事实（URL 可打开验壳）；`待核验(09-27)` = 未能取得官方原文，需复核。
> 诚实声明：`open.bilibili.com` 文档中心为 JS 动态渲染，本次未能逐字抓到任何文档正文；§2–§4 中标 `[摘录]` 的条目均有官方 URL 可回查，标 `[镜像]` 的条目均未获官方原文印证。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.bilibili.com/ —— 导航含 **开平文档中心 / 开平管理中心 / 账号管理 / 应用管理 / 授权管理 / 直播创作者服务中心 / 互动玩法**（`[摘录]` 门户页）
- 文档中心：https://open.bilibili.com/doc（门户/仓库旁证：官方 org bilibili-openplatform/SignatureAlgorithm_DotnetDemo 自述“开放平台文档中各项接口的签名实现案例”；README 逐字引文未取）
- 管理中心（应用管理 / 查看应用详情 / Webhooks 配置入口指向）：https://openhome.bilibili.com/company-core（`[镜像]` https://bilibili.apifox.cn/doc-895911 ；管理中心域名本身在门户导航“开平管理中心”可验壳）
- 能力总览（OPEN API 六域 + 三端 SDK + 运营指南）：https://openhome.bilibili.com/doc（`[摘录]`，见 §2.1）
- 接口签名实现标准和状态码：https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b（`[摘录]`，头表/包络/签名机制有官方原文；4000 系错误码未见官方原文；WebFetch 仅回 SPA 壳）
- 第三方应用接入 OAuth 2.0：https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c（`[摘录]`，code→token / refresh 提前刷新语义；“expires_in 过期时间（UTC时间）”措辞出自镜像非官方页；“refresh 一次性”未见官方原文）
- 第三方网页应用接入 OAuth 2.0：https://open.bilibili.com/doc/4/aac73b2e-4ff2-b75c-4c96-35ced865797b（`[摘录]`，简介+四步流程+302 重定向 `${return_url}?code=${code}&state=${state}` 有官方原文；其余细节待核验(09-27)）
- 推送事件列表：https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623（既有`[摘录]`存档：公共参数 + deauthorize 事件体 + 注销广播语义；本次未能复现该页正文，降级为镜像+侧页印证，正文待复核(09-27)）
- 视频稿件提交：https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f（`[摘录]`，`Scope: ARC_BASE` + 非正式会员每日 5 稿）
- 通用应用基于 OAuth 2.0 与直播互动（两套体系声明 + 报备邮箱）：https://open.bilibili.com/doc/4/19350a57-2e2d-43cf-3e6d-c7de132b24b6（`[摘录]`）
- 直播间数据：https://open.bilibili.com/doc/4/c7b549c9-d5d6-0331-b510-465ed4107e01（`[摘录]`，正文含 OPEN_LIVEROOM_DM/DM_MIRROR 等 CMD；wss 建连/心跳细则待核验(09-27)）
- 管理规约（含私信禁令原文）：https://openhome.bilibili.com/agreement/management-protocol（`[摘录]`；注：open.bilibili.com 同路径仅验壳）
- 第三方移动应用接入 OAuth 2.0（SDK 授权）：https://open.bilibili.com/doc/4/1f1cd948-de8f-6a9f-3b9c-2cb484da3cbb（`[摘录]`，简介+授权四步+SDK 初始化/回调设置有官方原文）
- 获取投稿连接 / union_id 等资源页（标题实锤，正文未取）：https://open.bilibili.com/doc/4/8b825dee-e49e-5843-7e80-f289b878076a 、https://open.bilibili.com/doc/4/22e9cc93-1559-f262-0375-bdcefe9257ee → 待核验(09-27)

本次实际抓到并核实的状态清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| 门户导航（文档中心/管理中心/授权管理/直播创作者服务中心/互动玩法） | https://open.bilibili.com/ | WebFetch 验壳 + `[摘录]` |
| 能力总览六域（账号授权/用户管理/视频管理/数据开放/专栏管理/直播能力） | https://openhome.bilibili.com/doc | `[摘录]` |
| 请求头签名表 + 响应包络 + 错误码表 | https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b | `[摘录]`（正文待核验(09-27)） |
| OAuth 授权/换 token/刷新/重授权 | https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c | `[摘录]` |
| 推送事件公共参数 + deauthorize + 注销广播 | https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 | `[摘录]` |
| 视频投稿 Scope/审核/会员限额 | https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f | `[摘录]` |
| 直播双体系 + 报备邮箱 | https://open.bilibili.com/doc/4/19350a57-2e2d-43cf-3e6d-c7de132b24b6 | `[摘录]` |
| 私信禁令条款 | https://open.bilibili.com/agreement/management-protocol | `[摘录]` |
| Webhooks 校验/重试/验签/四事件表 | https://bilibili.apifox.cn/doc-895911 、https://bilibili.apifox.cn/doc-895917 | `[镜像]` 全文（非 primary，全部待核验(09-27)） |

---

## 2. 消息/事件推送全清单

推送方式：**Webhooks HTTPS POST**（`[镜像]` 概述页原文：“当特定事件（Event）发生时，开放平台可以通过 HTTPS POST 的方式将事件推送到开发者配置好的回调地址，开发者无须通过查询即可第一时间获取到事件的变化。”https://bilibili.apifox.cn/doc-895911 ）。官方事件列表页标题实锤“推送事件列表”（`[摘录]` https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 ）。

### 2.1 开放域（`[摘录]` https://openhome.bilibili.com/doc ）

| 域 | 官方原文能力描述 | 有无消息推送 |
|---|---|---|
| 账号授权 | 包括B站账号授权、账号绑定的能力 | 有（授权类事件 authorize/deauthorize，见 §2.2） |
| 用户管理 | 包括获取用户公开信息的能力 | 无推送（仅读接口） |
| 视频管理 | 包括视频稿件的发布、删除和查询的能力 | 有（稿件状态事件 video_open/video_fail，`[镜像]` + 视频投稿页印证 `ARC_BASE`） |
| 数据开放 | 包括用户授权后的用户数据、稿件数据等能力 | 无推送（仅读接口） |
| 专栏管理 | 包括专栏稿件的发布、删除和查询的能力 | 无推送事件实锤 → 待核验(09-27)（事件表仅 video_*，无专栏事件） |
| 直播能力 | 包括开播和直播间消息长连的能力 | 有（**长连接**通道，非 Webhooks；细则待核验(09-27)） |

### 2.2 Webhooks 事件表（`[镜像]` https://bilibili.apifox.cn/doc-895917 ；其中 deauthorize 有官方原文印证，其余三行待核验(09-27)）

| 事件名 | 所需权限（镜像原文） | 触发语义 | 官方印证 |
|---|---|---|---|
| `authorize` | 用户信息能力 | B站用户授权给开发者的应用 | 无官方摘录 → 待核验(09-27) |
| `deauthorize` | 用户信息能力 | B站用户解除对应用的授权（含**注销账号广播**） | 有：`[摘录]` “Scope: `USER_INFO` 需要用户授权”“当用户解除对应用授权时触发”“当用户注销B站账号时，开放平台会向所有已授权的厂商、第三方、接入应用推送该用户解除授权的业务消息” https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 |
| `video_open` | 视频稿件基础能力 | 通过开发者应用投递的视频稿件开放浏览 | 间接：视频投稿页 `Scope: ARC_BASE`（ https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f ）；事件行本身待核验(09-27) |
| `video_fail` | 视频稿件基础能力 | 通过开发者应用投递的视频稿件投稿失败 | 同上 → 待核验(09-27) |

公共包络（deauthorize 页 `[摘录]`，与镜像消息结构一致）：

| 参数名称 | 参数类型 | 参数描述 | 出处 |
|---|---|---|---|
| `event` | string | 事件名 | https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 |
| `timestamp` | string | 事件发生时间标签，格式 `yyyy-MM-dd HH:mm:ss`（UTC+8） | 同上 |
| `content` | Struct | 具体消息结构体 | 同上 |

### 2.3 私信 / 客服：无公开推送（诚实结论）

- **结论：`open.bilibili.com` 开放域内无私信/客服事件推送，无发送私信 API。**
- 证据 1（能力域穷举）：官方能力总览六域为账号授权/用户管理/视频管理/数据开放/专栏管理/直播能力，无“私信/客服/会话”域（`[摘录]` https://openhome.bilibili.com/doc ）。
- 证据 2（站内检索零命中）：`site:open.bilibili.com 私信 OR 客服 OR 会话消息` 仅命中管理规约禁令条款，无任何私信推送/API 文档页（检索事实，可复现）。
- 证据 3（反向禁令）：管理规约原文“不得滥用接口能力，如擅自在关联 UP 主的账号内上传、发布未经授权的文字、图片、音乐、视频等内容，或**以关联 UP 主名义对外发布评论、弹幕、私信**等信息”（`[摘录]` https://open.bilibili.com/agreement/management-protocol ）——平台明确限制以用户名义发私信，与“无发送私信 API”一致。
- 证据 4（事件表封闭）：镜像事件表仅 4 事件（authorize/deauthorize/video_open/video_fail），无 `im/dm/message` 类事件（`[镜像]` https://bilibili.apifox.cn/doc-895917 ；官方页 deauthorize 行印证该表至少部分忠实）。
- 注意区分（非 primary，不可混入）：`api.vc.bilibili.com/web_im/...` 私信读写接口出自社区逆向文档（GitHub `bilibili-API-collect`），需 Cookie + WBI，不属于开放平台；bilibili 小程序消息订阅（`activity.hdslb.com/.../notification-push.html`，HMAC-SHA256 + `msg_id` 去重）是小程序体系，非 `open.bilibili.com`；直播弹幕长连（`open-live.bilibili.com`）是独立鉴权体系（见 §3.3）。

---

## 3. 回调机制

### 3.1 回调 vs 轮询 vs 长连

| 通道 | 语义 | 出处 |
|---|---|---|
| Webhooks（HTTPS POST 回调） | 事件发生即推，开发者无需轮询（镜像概述原文，见 §2 首段） | `[镜像]` https://bilibili.apifox.cn/doc-895911 → 待核验(09-27) |
| 轮询 | 未提供事件轮询接口；数据域接口为主动读（用户数据/稿件数据），非事件语义 | `[摘录]` 能力总览 https://openhome.bilibili.com/doc |
| 直播间消息长连 | 直播能力含“直播间消息长连”；通用 OAuth 应用与直播文档的关系见 §3.3 | `[摘录]` https://openhome.bilibili.com/doc + https://open.bilibili.com/doc/4/19350a57-2e2d-43cf-3e6d-c7de132b24b6 ；长连协议细则待核验(09-27) |

### 3.2 首次验证握手（`verify_webhooks`，`[镜像]` 全文待核验(09-27)）

来源：https://bilibili.apifox.cn/doc-895911 。

- 配置位置：管理中心 → 应用管理 → 查看应用详情 → Webhooks 模块“编辑”，填写回调地址；**鼠标失焦时**平台即发 `application/json` POST 校验，校验成功后点“提交”完成配置。
- 验证请求示例（镜像原文逐字）：
```json
{ "event": "verify_webhooks", "content": { "data": 1371848576 }, "timestamp": "2021-01-01 12:01:01" }
```
- 应答（镜像原文逐字）：解析出 `data` 值并原样返回：
```json
{ "data": 1371848576 }
```

### 3.3 重试、幂等、有序（`[镜像]` 全文待核验(09-27)）

来源：https://bilibili.apifox.cn/doc-895911 。

- 超时：“开放平台每次发送 POST 请求会与开发者回调地址建立 **5s** 的连接，超时自动断开。”
- 重试：“若推送 Webhooks 消息失败则重试，**最多推送 3 次**。在这种情况下，你的服务器应进行**去重**操作。”
- 幂等键：官方包络无 `message_id`/`event_id` 字段（`{event, content, timestamp}`）；镜像未指定幂等键 → 以 `(event + openid/resource_id + timestamp)` 业务去重为实现建议，官方口径待核验(09-27)。
- 有序：无官方/镜像表述 → 待核验(09-27)（默认按无序处理）。

### 3.4 直播双体系（`[摘录]` https://open.bilibili.com/doc/4/19350a57-2e2d-43cf-3e6d-c7de132b24b6 ）

- “直播创作者服务中心和开放平台目前接口和鉴权为**两套服务**，需要单独接入和申请开发者权限。（后续功能以及直播其他能力都将逐步接入 OAuth 2.0 授权体系）”
- “该页面下为直播相关能力的接入，**非互动玩法**接入，直播互动玩法能力请到直播创作者服务中进行入驻和接入。”
- 直播能力因风控需**单独申请报备**通过后方可开通，直接申请不会通过；先入驻开放平台并接标准授权流程，再发邮件报备（收件 `yangshuo03@bilibili.com` + 可能的事先业务方，抄送 `openplatform-feedback@bilibili.com`）。
- 长连协议（wss/心跳/cmd 如 `OPEN_LIVEROOM_*`）仅见 `open-live.bilibili.com` 文档及社区文章，非 `open.bilibili.com` → 全部待核验(09-27)，本库不收录载荷。

---

## 4. 验签与加密算法

### 4.1 Webhooks 回调验签（`[镜像]`，SHA1，待核验(09-27)）

来源：https://bilibili.apifox.cn/doc-895911 。

- 平台使用 **SHA1** 签署所有推送消息，签名放在请求头 **`x-bilibili-signature`**。
- 校验步骤（镜像原文）：将收到的消息体与应用的**应用密钥**（`secret + request body`）生成 SHA1 签名；“接收开发平台消息的结构体字段顺序需与上面发送的消息格式字段顺序保持一致，否则签名结果会不一致”；与 `x-bilibili-signature` 比对，一致即来源合法。
- 风险提示：该描述中 `secret` 参与拼接的方式含糊（拼接顺序/编码未定义），且官方页无印证 → **不可直接实现**，待核验(09-27)。

### 4.2 服务端 API 请求签名（`[摘录]` https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b ）

下表为官方摘录原文（请求头公共参数）：

| 名称 | 必填 | 官方原文描述 |
|---|---|---|
| `Accept` | 是 | 只支持 JSON，取值 `application/json` |
| `Content-Type` | 是 | `application/json` 或 `multipart/form-data` |
| `x-bili-content-md5` | 是 | 请求体当字符串做 MD5（全小写）；GET 或 body 为空时对**空字符串**求 MD5 |
| `x-bili-timestamp` | 是 | unix 秒级时间戳；与当前时间差超 **10 分钟**丢弃 |
| `x-bili-signature-method` | 是 | 取值 `HMAC-SHA256` |
| `x-bili-signature-nonce` | 是 | 全网唯一随机数，防重放，建议每次不同（如 GUID） |
| `x-bili-accesskeyid` | 是 | B站给的 Access Key（申请应用获得的 `client_id`） |
| `x-bili-signature-version` | 是 | 如无单独说明取 `2.0` |
| `access-token` | version 2.0 时必填 | 经 OAuth2 授权拿到的 `access_token` |
| `Authorization` | 是 | 请求签名（计算法见“签名机制”，正文未取 → 待核验(09-27)） |

签名算法归属（官方 realization 证据）：GitHub `bilibili-openplatform/SignatureAlgorithm_DotnetDemo` README 自述为“开放平台文档中各项接口的 C# 版签名实现案例”，并回链本签名页 URL；但仓库代码本身非 primary，拼接串（`x-bili-` 头字典排序 + `\n` 连接 + `app_secret` 做 HMAC-SHA256）→ 待核验(09-27)。

统一响应包络（`[摘录]` 同签名页）：
`{ code: int（0 为成功）, message: string, data: object, request_id: string（每次请求唯一，用于排查） }`。
错误码节选（`[摘录]` 同页）：`4000` 参数错误 / `4001` 配置无效 / `4002` 签名异常 / `4003` 请求过期 / `4004` 重复请求 / `4005` 签名 method 异常 / `4006` 签名版本异常 / `4007` Content-Type 非 application/json / `4008` MD5 校验失败 / `4009` Accept 非 application/json / `4012` BizCode 不支持该方法。

### 4.3 加密：Webhooks 无加密记载

- 镜像页无加密信封描述（明文 JSON + 头签名）；官方事件页示例均为明文。**默认按明文回调实现**，AES/RSA 解密不适用 → 若官方后续补加密说明，待核验(09-27)。

---

## 5. 示例载荷原文（逐字）

> `verify_webhooks` 与四事件示例出自 `[镜像]` https://bilibili.apifox.cn/doc-895911 / https://bilibili.apifox.cn/doc-895917 ，官方示例时间戳 `2021-01-01 12:01:01` 与示例 ID（`9205eeaa1879skxys969ed47874f225c3` / `395c8275dd674f17` / `BV1S9L90H082`）明显为占位；其中 **deauthorize 一条有官方原文印证**（ https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 ），其余待核验(09-27)。

### 5.1 verify_webhooks（`[镜像]`）

```json
{ "event": "verify_webhooks", "content": { "data": 1371848576 }, "timestamp": "2021-01-01 12:01:01" }
```

```json
{ "data": 1371848576 }
```

### 5.2 authorize（`[镜像]`，待核验(09-27)）

```json
{ "event": "authorize", "content": { "openid": "9205eeaa1879skxys969ed47874f225c3 ", "client_id": "395c8275dd674f17", "permits": "USER_INFO, USER_DATA" }, "timestamp": "2021-01-01 12:01:01" }
```

### 5.3 deauthorize（`[摘录]` 官方页 + `[镜像]` 一致）

```json
{ "event": "deauthorize", "content": { "openid": "9205eeaa1879skxys969ed47874f225c3 ", "client_id": "395c8275dd674f17", "permits": "ATC_DATA, ATC_BASE" }, "timestamp": "2021-01-01 12:01:01" }
```

官方字段表（`[摘录]` https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623 ）：`openid` 用户 openid / `client_id` 应用 id / `permits` 用户解除授权的权限列表（逗号分割）。

### 5.4 video_open（`[镜像]`，待核验(09-27)）

```json
{ "event": "video_open", "content": { "openid": "9205eeaa1879skxys969ed47874f225c3 ", "client_id": "395c8275dd674f17", "resource_id": "BV1S9L90H082", "state": 0, "state_desc": "开放浏览" }, "timestamp": "2021-01-01 12:01:01" }
```

### 5.5 video_fail（`[镜像]`，待核验(09-27)）

```json
{ "event": "video_fail", "content": { "openid": "9205eeaa1879skxys969ed47874f225c3 ", "client_id": "395c8275dd674f17", "resource_id": "BV1S9L90H082", "state": -2, "state_desc": "已退回" }, "timestamp": "2021-01-01 12:01:01" }
```

### 5.6 OAuth 换 token 响应（`[摘录]` 二次印证：官方 OAuth 页 + 镜像 OpenAPI）

官方 OAuth 页（ https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c ）只给字段语义：`access_token` / `refresh_token` 续期令牌 / `expires_in` 过期时间（UTC 时间）/ `scopes` 已授权权限点。示例值出自镜像 OpenAPI（`POST /x/account-oauth2/v1/token?grant_type=authorization_code`，參 `client_secret + grant_type=authorization_code + code`）：

```json
{ "code": 0, "message": "0", "ttl": 1, "data": { "access_token": "d30bedaa4d8eb3128cf35ddc1030e27d", "expires_in": 1630220614, "refresh_token": "WxFDKwqScZIQDm4iWmKDvetyFugM6HkX" } }
```

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `client_id` / `secret`（应用凭证） | 管理中心创建应用，平台审核后分配 | 接口调用凭证；`x-bili-accesskeyid` 即 `client_id`；回调验签密钥即 `secret`（拼接法待核验） | `[摘录]` 应用管理页 https://bilibili.apifox.cn/doc-885665 为镜像流程 + `[摘录]` 签名页头表 https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b |
| `code`（授权临时票据） | 用户在 B站授权页同意后，经 SDK 返回（客户端）或 `302` 重定向 `${return_url}?code=${code}&state=${state}`（网站） | 一次性；`state` 原样返回防 CSRF；`gourl` 为创建应用时填的授权回调域（需 URL encode 后拼授权 URL） | `[摘录]` https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c + `[镜像]` https://bilibili.apifox.cn/doc-885676 |
| `access_token` | `code` + `client_id/client_secret + grant_type=authorization_code` 换取 | 有效期见 `expires_in`（UTC 时间）；过期后需用户**重新授权**，基础授权功能不受影响；请求头 `version 2.0` 时必填 | `[摘录]` https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c + 签名页头表 |
| `refresh_token` | `grant_type=refresh_token` 续期 | **每个 refresh_token 只能使用一次**；妥善保管，按有效期提前刷新 | `[摘录]` https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c |
| `scope/permits` | 授权页仅显示应用**已申请通过**的权限；申请新 scope 后**老用户必须重新授权勾选**方可调用新接口 | `permits` 逗号分割（如 `USER_INFO, USER_DATA` / `ATC_DATA, ATC_BASE`，示例值） | `[摘录]` OAuth 页 + `[摘录/镜像]` 事件示例 |
| 调用传参 | 请求头 `x-bili-*` 全套 + `Authorization`；`access-token` 头（2.0） | 时间戳超 10 分钟丢弃；`nonce` 每次不同防重放 | `[摘录]` 签名页 |
| 发送 API | **无发送私信/客服消息 API**（见 §2.3）；内容侧有视频稿件提交（`ARC_BASE`，需用户授权，投递后有审核，不对外立即开放） | 非正式会员单日最多投递 5 稿（主站答题转正解限） | `[摘录]` https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f |
| 频控 | 签名页错误码含 `4004` 重复请求；另有 `27009` 繁忙 / `127304` 访问受限等（`[摘录]` 同签名页） | 完整限频表未取 → 待核验(09-27) | `[摘录]` https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **Webhooks 全文直抓**：`verify_webhooks` 握手、5s 超时、最多 3 次重试、去重要求、SHA1 + `x-bilibili-signature` 拼接法、字段顺序约束（现仅 `[镜像]` https://bilibili.apifox.cn/doc-895911 ）。→ 待核验(09-27)
2. **authorize / video_open / video_fail 事件原文**：三行仅镜像有载荷（ https://bilibili.apifox.cn/doc-895917 ），官方事件列表页仅实锤 deauthorize。→ 待核验(09-27)
3. **请求签名“签名机制”节**：`x-bili-` 头字典排序 + `\n` 拼接 + `app_secret` HMAC-SHA256 + `Authorization`（现仅社区 DotnetDemo 仓库自述 + 腾讯云文章实现，无官方正文）。→ 待核验(09-27)
4. **直播间消息长连协议**：wss 获取/鉴权/心跳/cmd（`OPEN_LIVEROOM_*`）与 `open-live.bilibili.com` 文档关系（该域非 primary，且与开放平台为两套鉴权）。→ 待核验(09-27)
5. **专栏/数据域有无推送**：事件表仅 video_*，专栏提交页正文未取。→ 待核验(09-27)
6. **OAuth 网页授权参数全文**：`client_id/gourl/state` 拼授权 URL、`code` 有效期、`expires_in` 单位（秒 vs 时间戳，镜像示例 `1630220614` 似时间戳与字段名矛盾）。→ 待核验(09-27)
7. **应用准入链路全文**：身份认证材料 → 创建应用 → 接口权限申请（批量申请/申请理由）→ 审核中/已开通/已驳回 → 分配 `client_id/secret`（现为镜像流程页 + 门户“身份认证”横幅摘录）。→ 待核验(09-27)
8. **限频限流表全文**：等级/QPS/错误码 `27009/127304` 触发条件。→ 待核验(09-27)
9. **timestamp 口径**：事件 `timestamp` 为 `yyyy-MM-dd HH:mm:ss`（UTC+8）字符串（官方实锤），而请求签名 `x-bili-timestamp` 为 unix 秒（官方实锤）——两者并存，需在模拟器中分开实现，已记录，无需再验；回调幂等键官方未定义 → 待核验(09-27)。
10. **私信缺席的反证补强**：复核文档中心全文索引，确认无新增 `im/dm/message/notify` 事件（本次站内检索零命中为检索事实）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟“B站推事件给回调”：`POST` JSON `{event, content:{...}, timestamp:"2021-01-01 12:01:01"}`（UTC+8 字符串，非毫秒戳），头 `x-bilibili-signature: <SHA1>`——**签名算法待核验，实现前必须留开关**，默认按镜像语义（`secret + 原始 body`，字段顺序敏感）并标不可信。
- 模拟首次配置校验：`POST {"event":"verify_webhooks","content":{"data":<int>},"timestamp":...}`，期望原样回 `{"data":<int>}`。
- 事件枚举（封闭 4 个）：`authorize`（`{openid, client_id, permits}`）/ `deauthorize`（同构，含注销广播）/ `video_open`（`{openid, client_id, resource_id: BV*, state: 0, state_desc: 开放浏览}`）/ `video_fail`（`state: -2, state_desc: 已退回`）。**无私信/客服事件，不模拟**。
- 重试语义（镜像口径，实现时标待核验）：5s 建连超时即断；失败最多共推 3 次；消费方业务去重（官方无幂等键）。
- 服务端调用签名（官方实锤头表）：`x-bili-accesskeyid(=client_id)` / `x-bili-content-md5` / `x-bili-signature-method: HMAC-SHA256` / `x-bili-signature-nonce` / `x-bili-signature-version: 2.0` / `x-bili-timestamp`（秒，±10min）/ `access-token` / `Authorization`；响应包络 `{code: 0, message, data, request_id}`。
- ID 形态：`openid: 9205eeaa1879skxys969ed47874f225c3`（示例，32 hex 混淆串）；`client_id: 395c8275dd674f17`（16 hex）；`resource_id: BV1S9L90H082`（BV 号）；`timestamp` 字符串型。
- 准入链路：身份认证审核 → 建应用 → 申请接口权限 → 获 `client_id/secret` → 用户 OAuth 授权（`code→access_token→refresh_token` 一次性续期）→ 配 Webhooks；直播能力另走创作者服务中心报备（双体系）。
