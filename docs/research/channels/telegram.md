# Telegram Bot API 事件推送 事实库

> 研究日期：2026-09-11。方法：WebFetch 直抓 core.telegram.org 官方文档正文（`bots`、`bots/api`、`bots/webhooks`、`bots/faq`、`bots/tutorial`、`bots/features#creating-a-new-bot` 全部成功，逐字）+ WebSearch 官方站内摘录（标注 `[摘录]`）。
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`待核验(09-27)` = 未能取得官方原文，需复核。
> 只认 primary sources（core.telegram.org/bots 官方文档、官方 Bot API 本体）。所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文）。
> 补证（2026-09-11）：§7 十一项逐条复核。`bots/api` 长页（约 860KB）经本地镜像按锚点分段对敲（`#sendmessage`、`#formatting-options`、`#messageentity`、`#businessbotrights`、`#answerguestquery`、`#sentguestmessage`、`#getfile`、`#sendmessagedraft`、`#responseparameters` 全文）+ `bots/features`、`bots/samples` 直抓 + CA 链接实测 200。全文关键字 census：`attempts` 1 处、`429` 1 处（与限流无关）、`out of order` 1 处、`last_error` 2 处。

## 1. 官方文档入口与关键页面地址

- 门户（Bot 平台总览，10M+ bots、免费、无需手机号、BotFather 准入）：https://core.telegram.org/bots
- 完整 API 参考（Getting updates / Update / setWebhook / sendMessage 全量定义，本库主要依据）：https://core.telegram.org/bots/api
- Webhook 指南（Marvin's Marvellous Guide：短版要求/长版端口/TLS/证书/自测 curl）：https://core.telegram.org/bots/webhooks
- Bot FAQ（双通道互斥/长轮询去重/限流三档/自签证书/secret path 建议）：https://core.telegram.org/bots/faq
- 功能详解（含 BotFather 建机器人/用户名规则/token 吊销/转让）：https://core.telegram.org/bots/features
- 建机器人分节（`/newbot`、name/username/token 三件套）：https://core.telegram.org/bots/features#creating-a-new-bot
- 入门教程（From BotFather to 'Hello World'，token 形态、`api.telegram.org/bot<token>/getMe`、sendMessage 4096）：https://core.telegram.org/bots/tutorial
- 本地 Bot API 服务器源码（tdlib/telegram-bot-api，2000MB/任意端口/HTTP webhook 特权）：https://github.com/tdlib/telegram-bot-api

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| 平台总览（bot 定义/中介服务器/HTTPS 接口/`@BotFather` 注册+token 保管警告） | https://core.telegram.org/bots | WebFetch 全文 |
| API 参考：鉴权/请求形态/本地服务器/Getting updates/Update/getUpdates/setWebhook/deleteWebhook/getWebhookInfo/sendMessage/ResponseParameters | https://core.telegram.org/bots/api | WebFetch 全文（超长截断后按 offset 分段复核关键节） |
| Webhook 指南：短版 6 要求/端口/IP 段/TLS1.2+/证书链/setWebhook curl/自测 Update curl 组 | https://core.telegram.org/bots/webhooks | WebFetch 全文 |
| FAQ：双通道互斥/offset 去重/端口 443·80·88·8443/secret path/限流三档+付费广播/文件 50MB·20MB | https://core.telegram.org/bots/faq | WebFetch 全文 |
| 建机器人：`/newbot`→name/username/token；username 5–32 字符仅拉丁+数字+下划线且须 `bot` 结尾；`/token` 重签；`/mybots` 转让 | https://core.telegram.org/bots/features#creating-a-new-bot | WebFetch 全文（features 页分段） |
| 教程：token 形如 `4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc`；`getMe` 浏览器直调；sendMessage 需三件套+1–4096 字符 | https://core.telegram.org/bots/tutorial | WebFetch 全文 |

---

## 2. 消息/事件推送全清单

推送方式统一为 **Update 对象 JSON**（两种传输二选一，语义相同；`At most one of the optional fields can be present in any given update` —— https://core.telegram.org/bots/api ）。

### 2.1 Update 信封

- `update_id: Integer` —— "The update's unique identifier. Update identifiers start from a certain positive number and increase sequentially." Webhook 下用途原文："it allows you to ignore repeated updates or to restore the correct update sequence, should they get out of order." 空闲 ≥1 周后下一个 id 随机而非顺序："If there are no new updates for at least a week, then identifier of the next update will be chosen randomly instead of sequentially."（https://core.telegram.org/bots/api#update）
- 其余即事件类型字段；任一 Update 至多含一个可选事件字段（同页原文）。

### 2.2 事件类型全表（27 类可选字段，本次抓取时点 Bot API 10.3）

来源：https://core.telegram.org/bots/api#update 全表逐字。触发语义为该页 Description 列原文转述。

| # | Update 字段 | 触发语义（官方原文要点） | 出处 |
|---|---|---|---|
| 1 | `message` | 新收消息（文本/照片/贴纸等任意） | api#update 全文 |
| 2 | `edited_message` | 已知消息被编辑（有时由 bot 不用字段变更触发） | api#update 全文 |
| 3 | `channel_post` | 新频道帖（任意类型） | api#update 全文 |
| 4 | `edited_channel_post` | 已知频道帖被编辑 | api#update 全文 |
| 5 | `business_connection` | bot 与商业账号连接建立/断开/被编辑 | api#update 全文 |
| 6 | `business_message` | 来自已连接商业账号的新消息 | api#update 全文 |
| 7 | `edited_business_message` | 来自已连接商业账号消息的新版本 | api#update 全文 |
| 8 | `deleted_business_messages` | 已连接商业账号的消息被删 | api#update 全文 |
| 9 | `guest_message` | 新 guest 消息（用 `Message.guest_query_id` + `answerGuestQuery` 回复，Bot API 10.0 Guest Mode） | api#update 全文 |
| 10 | `message_reaction` | 用户更改消息 reaction（bot 须为管理员且 `allowed_updates` 显式含本类型；bot 设的不收） | api#update 全文 |
| 11 | `message_reaction_count` | 匿名 reaction 计数变更（须管理员+显式订阅；可分组延迟数分钟） | api#update 全文 |
| 12 | `inline_query` | 新 inline query | api#update 全文 |
| 13 | `chosen_inline_result` | 用户选中某 inline 结果并发出（feedback 收集见 inline 文档） | api#update 全文 |
| 14 | `callback_query` | 新 callback query（内联按钮点击） | api#update 全文 |
| 15 | `shipping_query` | 新 shipping query（仅弹性价格发票） | api#update 全文 |
| 16 | `pre_checkout_query` | 新 pre-checkout query（含结账全信息） | api#update 全文 |
| 17 | `purchased_paid_media` | 用户购买 bot 发的非空 payload 付费媒体（非频道聊天） | api#update 全文 |
| 18 | `poll` | 投票状态更新（仅 bot 自己发的投票+手动停止的投票） | api#update 全文 |
| 19 | `poll_answer` | 用户在非匿名投票中改答案（仅 bot 自己发的投票的新票） | api#update 全文 |
| 20 | `my_chat_member` | bot 自身成员状态变更（私聊仅 block/unblock 时收到） | api#update 全文 |
| 21 | `chat_member` | 群成员状态变更（须管理员+显式订阅 `chat_member`） | api#update 全文 |
| 22 | `chat_join_request` | 入群申请（须 `can_invite_users` 管理权） | api#update 全文 |
| 23 | `chat_boost` | boost 增加/变化（须管理员） | api#update 全文 |
| 24 | `removed_chat_boost` | boost 被移除（须管理员） | api#update 全文 |
| 25 | `managed_bot` | 新托管 bot 创建/其 token 或 owner 变更（Managed Bots，Bot API 10.x） | api#update 全文 |
| 26 | `subscription` | 用户付费订阅变更（`BotSubscriptionUpdated`，Bot API 10.2+） | api#update 全文 |
| 27 | `stopped_message_generation` | 用户要求停止消息生成（Stop 按钮，Bot API 10.3 + `sendMessageDraft` 体系） | api#update 全文 |

- 默认订阅：`allowed_updates` 传空列表 = 收除 `chat_member`、`message_reaction`、`message_reaction_count` 外全部；不传 = 沿用上次设置；调用前已产生的 updates 不受新设置影响（短暂仍会收到不需要的类型）。来源：https://core.telegram.org/bots/api#getupdates / #setwebhook 两处同文。
- Bot 可见性约束（FAQ 原文，已核验）：全部 bot 均收 service messages + 私聊全量 + 其为成员的频道；privacy mode 开启时群消息仅收 `@本bot` 命令/上条为本 bot 时的通用命令/经本 bot 发的/inline 经本 bot 的/回复给本 bot 的；**bot 永远看不到其他 bot 的消息**（防循环）。来源：https://core.telegram.org/bots/faq#what-messages-will-my-bot-get 、#why-doesnt-my-bot-see-messages-from-other-bots 。例外放宽（Bot-to-Bot 模式，10.0+，须双方/至少一方在 BotFather 开启 + 防循环三件套去重/限速/最大深度，群内 @/reply 或私聊 `@username` 直发）：https://core.telegram.org/bots/features （Bot-to-Bot Communication 节）。

---

## 3. 回调机制

### 3.1 两种接收通道（二选一互斥）

来源：https://core.telegram.org/bots/api#getting-updates + https://core.telegram.org/bots/faq#how-do-i-get-updates + https://core.telegram.org/bots/webhooks 全文互证。

| | 长轮询 getUpdates（pull） | Webhook setWebhook（push） |
|---|---|---|
| 形态 | `GET/POST https://api.telegram.org/bot<token>/getUpdates`，长轮询（`timeout` 秒；0=短轮询仅测试用）；返回 `Update[]` | 向公网 URL 发 `HTTPS POST`，body 为 JSON 序列化 `Update` |
| 网络要求 | 本机能出公网即可，无需公网 IP/域名证书 | 必须 HTTPS（纯 HTTP 不可能）；IPv4 only（IPv6 不支持）；域名（自签可用 IP 作 CN）；TLS1.2+；CN/SAN 与建 webhook 域名一致；中间证书链齐全；受信根见 Ubuntu ca-certificates 列表 |
| 端口 | 不涉及（出向） | 仅 **443、80、88、8443**（https://core.telegram.org/bots/api#setwebhook Note 3 + webhooks 短版 + FAQ 三处同文） |
| 互斥 | "This method will not work if an outgoing webhook is set up."（getUpdates Note 1） | "You will not be able to receive updates using getUpdates for as long as an outgoing webhook is set up."（setWebhook Note 1）；FAQ："it's not possible to get updates via long polling while an outgoing Webhook is set." |
| 保留 | 服务端暂存未确认 updates，**不超过 24 小时**："Incoming updates are stored on the server until the bot receives them either way, but they will not be kept longer than 24 hours." | 同左 |
| 确认/去重 | `offset = 最后处理 update_id + 1`，≤offset 全标确认不再返回；每次响应后重算 offset 防重复；`limit` 1–100 默认 100；负 offset 取队尾倒数（之前全遗忘） | 用 `update_id` 忽略重复/恢复顺序（§2.1 原文）；`max_connections` 1–100 默认 40 控并发吞吐；`getWebhookInfo.pending_update_count` 看积压 |
| 切换 | 直接调 `getUpdates` 即收（需先清 webhook） | `setWebhook(url="")` 空串即清除；`deleteWebhook` 切回 getUpdates；两者均可选 `drop_pending_updates: True` 丢弃积压 |
| 状态查询 | — | `getWebhookInfo` 无参，返回 `WebhookInfo{url, has_custom_certificate, pending_update_count, ip_address?, last_error_date?, last_error_message?, last_synchronization_error_date?, max_connections?, allowed_updates?}`；用 getUpdates 时 `url` 为空 |

- 发包源 IP（防火墙放行用，webhooks 短版+长版原文）："Accepts incoming POSTs from subnets `149.154.160.0/20` and `91.108.4.0/22`"；"Our IP-range might change in the future."（https://core.telegram.org/bots/webhooks）
- 自签证书：`certificate` 参数以 `multipart/form-data` 的 InputFile 上传公钥 PEM（传 String 无效）；CN 可用 IP；不受信根 CA 同理把根证书当 InputFile 传（https://core.telegram.org/bots/api#setwebhook Note 2 + https://core.telegram.org/bots/webhooks 自签节 + https://core.telegram.org/bots/faq#im-having-problems-with-webhooks）。
- 通配符证书可能不支持、重定向不支持、CN 必须精确匹配域名（https://core.telegram.org/bots/faq#im-having-problems-with-webhooks）。

### 3.2 首次验证握手：无 challenge

- **Telegram 官方未记述任何 `challenge`/echostr 式握手**。`setWebhook` 同步返回 `True` 即成功（官方未记述向 URL 发验证请求；与飞书/微信/企微握手形成对照）。来源：https://core.telegram.org/bots/api#setwebhook 全文 + https://core.telegram.org/bots/webhooks 全文（setWebhook curl 即设即用，无验证往返记述）。
- 自测靠官方示例 Update 自发 curl（§5.2）打到自己端口验证链路，而非平台下发 challenge（https://core.telegram.org/bots/webhooks#testing-your-bot-with-updates）。

### 3.3 重试、幂等、有序

- Webhook 重试（官方仅定性，不给时刻表）："In case of an unsuccessful request (a request with response HTTP status code different from `2XY`), we will repeat the request and give up after a reasonable amount of attempts."（https://core.telegram.org/bots/api#setwebhook 全文）。**精确间隔/次数官方未公开 → 待核验(09-27)。**补证：api 全页 `attempts` 仅此 1 处，无任何时刻表数字。
- 长轮询去重：`offset` 确认制 + "recalculate offset after each server response" 防重复（https://core.telegram.org/bots/api#getupdates Note 2 + https://core.telegram.org/bots/faq#long-polling-gives-me-the-same-updates-again-and-again）。
- Webhook 去重：`update_id` 顺序递增，乱序/重复时凭它恢复（§2.1 原文，https://core.telegram.org/bots/api#update）。
- 错误包络：`{ok: Bool, result?, description?, error_code: Int, parameters?: ResponseParameters{migrate_to_chat_id?, retry_after?}}`；`retry_after` 定义原文："In case of exceeding flood control, the number of seconds left to wait before the request can be repeated"（https://core.telegram.org/bots/api#making-requests 、#responseparameters）。补证：api 全页 `429` 仅 1 处且与限流无关（`close` 方法"will return error 429 in the first 10 minutes after the bot is launched"）；限流 429 出自 FAQ 三档节，未与 `retry_after` 逐字挂钩 → 精确映射待核验(09-27)。
- 有序性：官方无全局有序承诺（api 全页 `out of order` 仅 1 处，即 #update 凭 `update_id` 恢复顺序）；仅 `message_reaction_count` 声明分组延迟可达数分钟（"The updates are grouped and can be sent with delay up to a few minutes." https://core.telegram.org/bots/api#update）。业务侧按 `update_id` 排序消费。

---

## 4. 验签与加密算法

来源：https://core.telegram.org/bots/api#setwebhook （secret_token 行）+ https://core.telegram.org/bots/faq#how-can-i-make-sure-that-webhook-requests-are-coming-from-telegram + https://core.telegram.org/bots/webhooks （TLS/证书节）。

### 4.1 恒等头 `X-Telegram-Bot-Api-Secret-Token`（无 HMAC、无签名）

官方原文（setWebhook 节逐字）："If you'd like to make sure that the webhook was set by you, you can specify secret data in the parameter *secret_token*. If specified, the request will contain a header “X-Telegram-Bot-Api-Secret-Token” with the secret token as content."

- 规则：`secret_token: String` 可选，**1–256 字符**，仅允许 `A-Z`、`a-z`、`0-9`、`_`、`-`；每个 webhook 请求原样回显于该头；校验 = 字符串相等比较。官方原文："A secret token to be sent in a header “X-Telegram-Bot-Api-Secret-Token” in every webhook request, 1-256 characters. Only characters `A-Z`, `a-z`, `0-9`, `_` and `-` are allowed. The header is useful to ensure that the request comes from a webhook set by you."
- **无 HMAC/SHA 加签**：官方从未定义对 body 的签名算法；安全 = TLS + 该头恒等比对 + URL 隐蔽。可叠加 FAQ 建议的 secret path："we recommend using a secret path in the URL you give us, e.g. www.example.com/your_token. Since nobody else knows your bot's token, you can be pretty sure it's us."（https://core.telegram.org/bots/faq）。
- 与飞书 `X-Lark-Signature=hex(sha256(...))` / 企微 `msg_signature` / QQ Ed25519 形成对照：Telegram 是四者中唯一无密码学验签、纯 bearer-secret-echo 的。

### 4.2 传输层加密（TLS 即全部）

- Webhook 强制 SSL/TLS（任何端口都一样；明文 HTTP webhook 不可能）；服务端要求 TLS1.2+（SSLv2/3、TLS1.0/1.1 不支持）；证书 CN/SAN 须匹配 webhook 域名（自签可用 IP）；须补齐中间证书；本地 Bot API 服务器特权下才可用 HTTP webhook/任意 IP/任意端口（https://core.telegram.org/bots/webhooks 全文 + https://core.telegram.org/bots/api#using-a-local-bot-api-server）。
- 事件体本身不做应用层 AES 加密（无 Encrypt Key/EncodingAESKey 概念）。

---

## 5. 示例载荷原文（逐字）

### 5.1 setWebhook / getUpdates 请求形态（官方原文转写）

```bash
# verified 证书（https://core.telegram.org/bots/webhooks#how-do-i-set-a-webhook-for-either-type 逐字）
curl -F "url=https://<YOURDOMAIN.EXAMPLE>/<WEBHOOKLOCATION>" https://api.telegram.org/bot<YOURTOKEN>/setWebhook
# 自签证书（同页逐字，加 certificate InputFile，multipart/form-data）
curl -F "url=https://<YOURDOMAIN.EXAMPLE>/<WEBHOOKLOCATION>" -F "certificate=@<YOURCERTIFICATE>.pem" https://api.telegram.org/bot<YOURTOKEN>/setWebhook
# 清 webhook（同页逐字）
curl -F "url=" https://api.telegram.org/bot<YOURTOKEN>/setWebhook
# 非默认端口须写进 URL（同页逐字例）
# url=https://<YOURDOMAIN.EXAMPLE>:88/<WEBHOOKLOCATION>
```

```bash
# 长轮询确认（https://core.telegram.org/bots/faq#long-polling-gives-me-the-same-updates-again-and-again 逐字）
# offset = update_id of last processed update + 1
```

请求基式（https://core.telegram.org/bots/api#making-requests 逐字）：
`https://api.telegram.org/bot<token>/METHOD_NAME`，如 `https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/getMe`；支持 GET/POST；参数四形态 URL query / x-www-form-urlencoded / application/json（传文件除外）/ multipart/form-data（传文件用）；方法名大小写不敏感；全 UTF-8。

### 5.2 Webhook 自测 Update（webhooks 指南逐字，`YOUR.BOT.URL:YOURPORT` 为官方占位符原文）

文本消息：

```bash
curl --tlsv1.2 -v -k -X POST -H "Content-Type: application/json" -H "Cache-Control: no-cache"  -d '{
"update_id":10000,
"message":{
    "date":1441645532,
    "chat":{
       "last_name":"Test Lastname",
       "id":1111111,
       "type": "private",
       "first_name":"Test Firstname",
       "username":"Testusername"
    },
    "message_id":1365,
    "from":{
       "last_name":"Test Lastname",
       "id":1111111,
       "first_name":"Test Firstname",
       "username":"Testusername"
    },
    "text":"/start"
}
}' "https://YOUR.BOT.URL:YOURPORT/"
```

callback_query（按钮点击，同页逐字）：

```json
{
"update_id":10000,
"callback_query":{
    "id": "4382bfdwdsb323b2d9",
    "from":{
       "last_name":"Test Lastname",
       "type": "private",
       "id":1111111,
       "first_name":"Test Firstname",
       "username":"Testusername"
    },
    "data": "Data from button callback",
    "inline_message_id": "1234csdbsk4839"
}
}
```

同页另有 edited_message / entities（bold+italic）/ audio / voice / document / inline_query / chosen_inline_result / forward / reply 版式 curl 全套，结构同上（`update_id: 10000` 固定示意）。

### 5.3 sendMessage 请求/响应包络（api#sendmessage + #making-requests 逐字拼合）

请求：`POST https://api.telegram.org/bot<token>/sendMessage`，`chat_id`（目标 chat id 或 `@username`）+ `text` 必填。

```json
{
  "chat_id": 123456789,
  "text": "Hello World!"
}
```

要点（https://core.telegram.org/bots/api#sendmessage 全文）：`text` **1–4096 字符（entities 解析后计）**；`parse_mode`（Markdown/HTML 见 formatting options）与 `entities` 二选一；`message_thread_id`（forum topic）、`disable_notification`（静默）、`protect_content`（禁转存）、`reply_parameters`、`reply_markup`、`link_preview_options`、`message_effect_id`、`business_connection_id`、`allow_paid_broadcast` 可选。成功返回 `{"ok": true, "result": {<Message>}}`；失败 `{"ok": false, "description": "...", "error_code": 429, "parameters": {"retry_after": N}}`（包络见 #making-requests，`retry_after` 见 #responseparameters）。

### 5.4 getMe 鉴权自测（tutorial 页逐字）

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
```

浏览器粘贴即调；token 形如 `4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc`（tutorial 页原文，`getMe` 返回 `User` 对象）。

---

## 6. token / 凭证模型

| 凭证 | 换取/获取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| bot token（`123456:ABC-DEF…` / 例 `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`、`4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc`） | `@BotFather` `/newbot` → 给 name + username → 当场生成；调用时前缀 `bot` 即 `https://api.telegram.org/bot<token>/METHOD` | 长期有效；泄露/丢失用 `/token` 重签；owner 可 `/mybots` 转让（须对方与 bot 交互过一次；永久不可撤销）；"Keep your token secure … it can be used by anyone to control your bot." | https://core.telegram.org/bots + https://core.telegram.org/bots/features#creating-a-new-bot + #generating-an-authentication-token + #transfer-ownership + https://core.telegram.org/bots/api#authorizing-your-bot + https://core.telegram.org/bots/tutorial |
| `secret_token`（webhook 恒等头） | `setWebhook.secret_token` 自选传入 | 1–256 字符，`[A-Za-z0-9_-]`；每请求原样回显于 `X-Telegram-Bot-Api-Secret-Token`；纯比对无 HMAC | https://core.telegram.org/bots/api#setwebhook 全文 |
| 调用传参 | URL 路径 `bot<token>` 即鉴权（无需 Authorization 头/签名） | GET/POST 四形态；webhook 回包内直接带 `method` 字段调 API 则不知成功与否、拿不到 result | https://core.telegram.org/bots/api#making-requests + #making-requests-when-getting-updates + https://core.telegram.org/bots/faq#how-can-i-make-requests-in-response-to-updates |
| 发送去重 | 无 `uuid` 去重键（与飞书不同）；长轮询靠 `offset`，webhook 靠 `update_id` | 误重发靠业务幂等 | https://core.telegram.org/bots/api#getupdates 、#update |
| 频控（免费档，FAQ 原文） | 单聊：每 chat ≲1 条/秒（允许短突发，超了收 429）；群：每群 20 条/分钟；广播：全网约 30 条/秒 | 超限 `error_code 429` + `parameters.retry_after` 秒；广播超 30/s 须铺长到 8–12h | https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this |
| 频控（付费档，FAQ+sendMessage 参数原文） | BotFather 开 paid broadcasts → 最高 1000 条/秒；超免费 30/s 部分按 0.1 Stars/条从 bot 余额扣（仅成功计费）；`sendMessage.allow_paid_broadcast: True` 逐调用声明 | 开通门槛：余额 ≥100,000 Stars 且月活 ≥100,000 | https://core.telegram.org/bots/faq#how-can-i-message-all-of-my-bots-subscribers-at-once + https://core.telegram.org/bots/api#sendmessage（allow_paid_broadcast 行） |
| 文件尺寸 | 上传 ≤50MB，`getFile` 下载 ≤20MB（FAQ 口径）；本地 API 服务器：上传 ≤2000MB、下载不限、可用本地路径/file URI | 云端默认够用绝大多数 bot | https://core.telegram.org/bots/faq#how-do-i-download-files 、#how-do-i-upload-a-large-file + https://core.telegram.org/bots/api#using-a-local-bot-api-server + https://core.telegram.org/bots/api#getfile 、#file（补证：api#sending-files 三档细分——multipart 上传照片 10MB/其他 50MB，URL 投喂照片 5MB/其他 20MB，已发文件 file_id 复发不限；#file "The maximum file size to download is 20 MB"；现行值与 FAQ 一致，未上调） |
| 文本尺寸 | `sendMessage.text` 1–4096 字符（entities 解析后）；`sendMessageDraft` 0–4096（空=Thinking 占位）；caption 类 0–1024 | 超限调 API 直接失败 | https://core.telegram.org/bots/api#sendmessage 、#sendmessagedraft（本次分段复核行） + #formatting-options 、#messageentity（补证：`parse_mode` 三值 `Markdown`（legacy，向后兼容，不可嵌套）/`MarkdownV2`/`HTML`；entity type 全表 24 种 mention/hashtag/cashtag/bot_command/url/email/phone_number/bold/italic/underline/strikethrough/spoiler/blockquote/expandable_blockquote/code/pre/text_link/text_mention/custom_emoji/date_time；`offset`/`length` 按 UTF-16 code units 计；caption/quote 均为 0–1024 after entities parsing，多方法同文） |
| 准入 | **零门槛**：Telegram 账号 + 对话 `@BotFather` 发 `/newbot`，给 name/username 即得 token；username 5–32 字符、仅拉丁字母数字下划线、不分大小写、须 `bot` 结尾（如 `tetris_bot`）；无需企业资质/审核/付费；username 定后不可改（name 可 `/setname` 改） | 测试另有独立测试环境（正式隔离，另建 bot，见 features Testing 节） | https://core.telegram.org/bots#how-do-i-create-a-bot + https://core.telegram.org/bots/faq#how-do-i-create-a-bot + https://core.telegram.org/bots/features#creating-a-new-bot + https://core.telegram.org/bots/tutorial#obtain-your-bot-token |

---

## 7. 待核验清单（2026-09-11 逐条补证：✅=官方原文对敲通过；→待核验(09-27)=官方未公开，保留）

1. **Webhook 重试精确时刻表/次数上限**：→ 待核验(09-27)。api 全页 `attempts` 仅 1 处，即 setWebhook 原文 "we will repeat the request and give up after a reasonable amount of attempts"（https://core.telegram.org/bots/api#setwebhook），无间隔/次数数字。Mock 按通用指数退避可配置实现（见附）。
2. **429/`retry_after` 与三档限流的精确映射**：定义 ✅、映射 → 待核验(09-27)。`retry_after` 定义已核验："In case of exceeding flood control, the number of seconds left to wait before the request can be repeated"（https://core.telegram.org/bots/api#responseparameters）；api 全页 `429` 仅 1 处且与限流无关（`close` 方法 10 分钟 note）；FAQ 三档（1/s·20/min·30/s，超限收 429，https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this）未与 `retry_after` 逐字挂钩，突发容忍量/计数窗口/必带性官方未给。
3. **全局有序性**：✅（阴性结论：官方无全局有序承诺）。api 全页 `out of order` 仅 1 处（#update，凭 `update_id` 恢复顺序，https://core.telegram.org/bots/api#update）；仅 `message_reaction_count` 声明 "The updates are grouped and can be sent with delay up to a few minutes." 业务按 `update_id` 排序消费即可，无需再核验。
4. **`getWebhookInfo.last_error_*` 错误文案枚举**：→ 待核验(09-27)。api 全页 `last_error` 仅 2 处，即 WebhookInfo 两字段定义（`last_error_date` Unix time + `last_error_message` human-readable，https://core.telegram.org/bots/api#webhookinfo），message 取值表官方未给。
5. **文件尺寸现行值**：✅ 现行值确认未变。api#sending-files 三档细分：multipart 上传照片 10MB/其他 50MB，URL 投喂照片 5MB/其他 20MB，已发文件 file_id 复发不限；#getfile "bots can download files of up to 20MB"；#file "The maximum file size to download is 20 MB"（https://core.telegram.org/bots/api#getfile）；与 FAQ 50MB/20MB 一致，无上调。
6. **`parse_mode`/formatting options 全表与 entities 解析后 4096 计数细节**：✅。`parse_mode` 三值：`Markdown`（legacy，"retained for backward compatibility"，不可嵌套）/`MarkdownV2`/`HTML`（https://core.telegram.org/bots/api#formatting-options）；entity type 全表 24 种（#messageentity：mention/hashtag/cashtag/bot_command/url/email/phone_number/bold/italic/underline/strikethrough/spoiler/blockquote/expandable_blockquote/code/pre/text_link/text_mention/custom_emoji/date_time）；`offset`/`length` 按 UTF-16 code units 计；`text` 1–4096 / caption、quote 0–1024，均 "after entities parsing"，多方法同文（https://core.telegram.org/bots/api#sendmessage）。
7. **Business Bot 权限矩阵（`can_reply` 等 + 24h 窗）**：✅。`BusinessBotRights` 全表 14 字段已逐字：`can_reply`（"True, if the bot can send and edit messages in the private chats that had incoming messages in the last 24 hours"）、`can_read_messages`、`can_delete_sent_messages`、`can_delete_all_messages`、`can_edit_name`、`can_edit_bio`、`can_edit_profile_photo`、`can_edit_username`、`can_change_gift_settings`、`can_view_gifts_and_stars`、`can_convert_gifts_to_stars`、`can_transfer_and_upgrade_gifts`、`can_transfer_stars`、`can_manage_stories`（https://core.telegram.org/bots/api#businessbotrights）；动线见 https://core.telegram.org/bots/features#business-bots（Secretary Mode + BusinessConnection + `rights` + `business_connection_id`）。
8. **Guest Mode 三 bot 上限与 `answerGuestQuery` 一次回复语义**：✅。"You can mention up to 3 guest bots in your message at the same time" + "the bot receives a dedicated update and is able to issue one reply"（https://core.telegram.org/bots/features#guest-bots）；API 侧 `answerGuestQuery(guest_query_id, result: InlineQueryResult) → SentGuestMessage{inline_message_id}`（https://core.telegram.org/bots/api#answerguestquery 、#sentguestmessage），API 页无"单次"字样、单次语义以 features "one reply" 为准。
9. **自签/不受信根/中间链的现行 CA 根列表**：✅（指针级）。官方唯一指针即 Ubuntu ca-certificates 清单 https://packages.ubuntu.com/jammy/all/ca-certificates/filelist（2026-09-11 实测 200 可达，https://core.telegram.org/bots/webhooks#supported-certificates）；官方明示 "the list isn't always exhaustive"（#an-untrusted-root），不受信根可当 `certificate` InputFile 传（#setting-a-verified-webhook-with-an-untrusted-root），中间链补发见 #supplying-an-intermediate-certificate。清单内容为 Ubuntu 包文件列表，不逐条抄录。
10. **测试环境地址与正式环境隔离细节**：✅。https://core.telegram.org/bots/features#testing-your-bot 全段已逐字：双轨——简易轨（另建 bot 跑第二份代码）+ 专用测试环境（"completely separate"，须新账号 + 新 bot；客户端 Test Server 登录动线 iOS/Desktop/macOS）；测试根 `https://api.telegram.org/bot<token>/test/METHOD_NAME`；测试环境 Web Apps/Web Login 可用 HTTP 无 TLS；flood limits 不放宽（"may at times be stricter"，须 retry policies、不硬编码限值）；`file_id` 单 bot 绑定不可跨 bot 共库。
11. **官方 SDK 本体**：✅（结论：无官方 SDK）。https://core.telegram.org/bots/samples 原文："This page lists some libraries and frameworks developed by the Telegram community … these projects are not maintained by Telegram." 各语言封装均为社区实现，无需回归向量。

---

## 8. 实施记录（2026-10-14，#107）

Server 侧按本事实库落地 `dudu-server` 的 `channel/telegram/` 四件套（`TelegramAdapter`/`TelegramProtocol`/
`TelegramCredentials`/`TelegramTextSender`/`TelegramMediaReader`）。以下为实现选择与边界，均标注依据：

1. **`channel_info.url` 的语义 = 含 `/bot<token>` 路径段的 Bot API 基址**（§5.4 请求基式
   `https://api.telegram.org/bot<token>/METHOD` 的直接展开）。票面钉死 `channel_info` 只有两键
   `url`/`secretToken`（与 mock-pulse `config.rs` Telegram 变体一致，`secret_token` 1–256 字符
   `[A-Za-z0-9_-]`），而发送/素材必须携带 bot token 走 URL 路径鉴权——两者唯一的自洽组合就是
   url 本身含 token 段：发送 `POST {url}/sendMessage`、素材 `GET {url}/getFile`，下载地址由基址在
   `bot` 段前插 `file` 段派生为 `/file/bot<token>/<file_path>`（§6 文件下载路径，同源同 token）。
   先例：QQ 也是「键对齐 mock-pulse、语义由 Server 侧定义」。
2. **验签即恒等头原样比对**（§4.1）：头值与配置 secretToken 经 `MessageDigest.isEqual`（UTF-8 字节）
   常量时间比较，无 HMAC、无签名、无 query 参数参与；伪造与缺失头一律 403 拒绝且不落任何数据。
   官方无 challenge 握手，GET 验证按接口默认不支持应答（501）。
3. **入站映射**（§2.1 Update 信封 + 契约第 4 节统一消息体）：只处理 `message` 字段——text 文本；
   photo 取面积最大一档的 `file_id` 归 image；voice/audio 归 audio（name 取 `title`，缺则
   `file_name`）；video/video_note 归 video；document 归 file（name 取 `file_name`）；sticker 等
   契约外内容与纯服务消息如实落 unknown（`originalType` 取排除结构键后首个内容键名）。
   `caption` 契约无处承载，不落（同飞书先例）。幂等以 `update_id` 为准（§3.3 官方以 update_id
   排序、处理方自行去重）；`chat.id`/`from.id` 按 64 位处理。其余 26 类事件字段只应答 `success`
   不落库。
4. **发送成功判据**（§5.3 + #making-requests）：HTTP 2XY 且包络 `ok=true` 才算成功，取
   `result.message_id` 作渠道消息标识；`ok=false` 的 `error_code`/`description`/`parameters.retry_after`
   （429 频控，§6 三档超限）原样转述落库，不模拟成功、不做自动重试。`chat_id` 数字标识按官方样本
   以数字下发（64 位），非数字（`@channelusername` 形态）原样字符串。
5. **素材**（§6 文件尺寸行 + api#getfile）：凭消息中已存 `file_id` 换 `file_path` 再下载；上传
   ≤50MB/下载 ≤20MB 超限由渠道自身在 getFile/下载时拒绝（官方明示 bots can download files of up
   to 20MB），错误包络如实透传（13100），不伪装字节；凭据缺失 12200、空素材标识不发请求。
6. **凭据保护**：token 在 URL 路径上，RestClient 异常消息可能含完整带 token 的地址——发送/素材的
   失败原因与日志只记异常类简单名，不落异常消息，凭据不写日志也不返回 Desk。
7. **集成验收**（`TelegramChannelIntegrationTest`，独立评审库 `dudu_review_telegram` 自建自删）：
   mock-pulse `GOLDEN_PROBE_PLAINTEXT`（即 §5.2 官方自测样本）逐字探针 + 合规恒等头直发对拍；
   发送/素材经本地 HttpServer 替身按 §5.3 包络与 §6 下载路径形状应答。

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"TG 推事件给回调"：`POST {update_id: Int, <事件字段其一>: {...}}`，头 `X-Telegram-Bot-Api-Secret-Token: <1–256字符 [A-Za-z0-9_-]>` 原样比对（无 HMAC）；成功判 `2XY`，否则按"合理次数"重推（精确时刻表未知，按通用指数退避实现并可配置）。
- 模拟首次配置：`setWebhook` 同步回 `{"ok":true,"result":true}` 即成功，**不发 challenge**；`getWebhookInfo.url==""` 即长轮询态。
- 模拟长轮询：`getUpdates?offset=<last+1>&limit=<1–100>&timeout=<s>&allowed_updates=[...]`；`limit` 越界/已设 webhook 时直接按官方 Note 返回失败；默认 `allowed_updates=[]` = 除 `chat_member/message_reaction/message_reaction_count` 外全收。
- ID 形态：`update_id` 正整数顺序递增（≥周空闲后随机）；`chat.id` 可超 32 位（按 64 位存）；`message_id` chat 内唯一；`callback_query.id` 字符串；bot token `数字:35字符级`。
- 发送模拟：`POST https://api.telegram.org/bot<token>/<METHOD>`（大小写不敏感）；`sendMessage.text` 1–4096（entities 解析后计）；超限/超速回 `{"ok":false,"error_code":429,"description":"...","parameters":{"retry_after":N}}`；免费三档 1/s·20/min·30/s，付费 `allow_paid_broadcast` 1000/s。
- 互斥模拟：webhook 非空时 `getUpdates` 拒绝；`setWebhook(url="")`/`deleteWebhook` 切回 pull，可选 `drop_pending_updates` 清积压（24h 到期自动丢）。
- 勘误（相对起点线索）：27 类事件非约数，`business_message` 独立于 `message`，`my_chat_member`（自身）与 `chat_member`（他人，须显式订阅）分开，`subscription`/`stopped_message_generation`/`managed_bot`/`guest_message` 为 10.x 新增；端口四值 `443/80/88/8443` 三页互证一致；验签是恒等头回显而非签名。
