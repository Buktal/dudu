# WhatsApp Cloud API 事件推送 事实库

> 研究日期：2026-09-11。方法：WebSearch 官方站内摘录（developers.facebook.com / whatsappbusiness.com 全文片段）+ WebFetch（`whatsappbusiness.com/products/platform-pricing/` 全文成功；`developers.facebook.com` 文档页 WebFetch 返回 400，直抓失败，故全部标 `[摘录]`）。
> 标注约定：`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；无标注 = 本次已核验的公开原文（仅定价主站 WebFetch 全文）；`待核验(09-27)` = 未能取得官方原文或口径矛盾，需复核。
> 事实分级参照 `feishu.md`：本库 §2–§6 均为官方来源摘录；第三方解读（如 Hookdeck/WebhookRelay/黄页式博客）仅作机制互证，不作事实依据。
> 所有示例载荷均为官方文档摘录原文逐字拷贝（含官方占位符原文）。

## 1. 官方文档入口与关键页面地址

- 门户与 App 后台：Meta App Dashboard > WhatsApp > Configuration（Callback URL + Verify token 配置与字段订阅）—— https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ `[摘录]`
- Webhook 总览（新版）：https://developers.facebook.com/docs/whatsapp/webhooks/ `[摘录]`
- Webhook 总览（旧版镜像路径，同文）：https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview `[摘录]`
- 创建 Webhook 端点（GET 握手 + POST 签名）：https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/ `[摘录]`
- 回声机器人测试端点示例（含 GET/POST 示例代码）：https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-whatsapp-echo-bot/ `[摘录]`
- Graph API Webhooks 入门（hub.mode/challenge/verify_token 通用语义 + X-Hub-Signature-256 通用语义）：https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ `[摘录]`
- messages webhook 参考：https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages `[摘录]`
- statuses（status webhook）参考：https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status `[摘录]`
- 载荷示例集：https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples/ `[摘录]`
- 载荷组件参考：https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/ `[摘录]`
- 管理面 webhooks 组件表：https://developers.facebook.com/docs/whatsapp/business-management-api/webhooks/components/ `[摘录]`
- 发送消息指南：https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/ `[摘录]`
- Messages API 参考（`POST /{Version}/{Phone-Number-ID}/messages`）：https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages `[摘录]`
- 文本消息发送示例：https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages/ `[摘录]`
- 接入指南（含临时 token + 系统用户永续 token + `POST graph.facebook.com/v23.0/.../messages` 示例版本，text-messages 页已演进至 v25.0/v26.0，路径语义不变）：https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started `[摘录]`
- Access Token 指南（系统用户 token）：https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens `[摘录]`
- Auth token 博客（临时 token <24h）：https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/ `[摘录]`
- Messaging Limits（阶梯 250/2K/10K/100K/Unlimited，`whatsapp_business_manager_messaging_limit`）：https://developers.facebook.com/docs/whatsapp/messaging-limits/ `[摘录]`
- Throughput（默认 80 mps，可升 1000 mps，错误码 `130429`）：https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput `[摘录]`
- 定价（开发者文档，含 2026-10-01 service/utility 收费预告）：https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing `[摘录]`
- 定价-非模板消息（service/Meta Business Agent 收费时间表）：https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages `[摘录]`
- 定价主站（WebFetch 全文，仍写 service 免费——与上两页矛盾，见 §6 注）：https://whatsappbusiness.com/products/platform-pricing/
- 官方示例代码语言：官方文档以 `curl` + Node.js（Express）示例为主；未见飞书式四语言官方 SDK 包名。Graph API 通用 SDK 另计 → 待核验(09-27)。

---

## 2. 消息/事件推送全清单

推送方式统一为 **Webhook**（Meta 服务器向指定公网 URL 发 HTTPS POST JSON；订阅字段在 App Dashboard > WhatsApp > Configuration 勾选）—— https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ `[摘录]`。

权限门槛（同页 `[摘录]`）：

| 字段组 | 所需权限 |
|---|---|
| `messages`（含 calls，按新版口径 "messages and calls webhooks"） | `whatsapp_business_messaging` |
| 其余全部管理面字段 | `whatsapp_business_management` |

### 2.1 核心字段：messages（必订）

- `messages`：描述"用户发给商家的消息 + 商家发给用户的消息的状态"—— https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ `[摘录]`。
- 判型规则（`[摘录]` messages 参考页）：含 `messages[]` 数组 = 用户 inbound 消息；含 `statuses[]` 数组 = 商家 outbound 消息的状态（sent/delivered/read/failed，最多 3 个独立 webhook：sent、delivered、read）。
- inbound `messages[]` 元素按 `type` 区分形态，各形态有独立参考页（文本/图片/音频/视频/文档/sticker/位置/联系人/interactive/reaction/flow/unsupported 等，左侧菜单链入）—— https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages `[摘录]`。各 `type` 载荷细节 → 待核验(09-27)。
- status 取值（`[摘录]` status 参考页）：`sent`（已从 Meta 服务器发出，一勾）/`delivered`（到用户设备，两勾）/`read`（已在打开的聊天线程展示，两蓝勾）/`failed`（发送/投递失败，红三角）/`played`（语音消息首次播放，蓝麦克风）。
- 错误挂载三处（`[摘录]` components 页）：系统/应用/账户级错误在 `entry.changes.value.errors`；inbound 错误在 `messages[]` 内（`type: unsupported`）；outbound 错误在 `statuses[]` 内（`statuses[].errors`）。

### 2.2 管理面字段（`whatsapp_business_management` 权限组）

来源：https://developers.facebook.com/docs/whatsapp/business-management-api/webhooks/components/ `[摘录]`（下表语义为官方表原文）：

| field | 触发语义（官方原文意译） | 出处 |
|---|---|---|
| `account_update` | WABA 变更：伙伴主导企业验证、auth-intl 费率资格、主营业地、Solution Partner 共享、政策违规/offboard/重连/删除 | components 表 `[摘录]` + 参考页 https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update `[摘录]` |
| `business_capability_update` | WABA/商业组合能力变更（消息限额、号码上限等）；`max_daily_conversations_per_business`（v24.0+）/`max_daily_conversation_per_phone`（v23.0 及更早，2026-02 移除） | components 表 `[摘录]` + messaging-limits 页 `[摘录]` |
| `message_template_status_update` | 模板状态变更（APPROVED/REJECTED/PENDING/PAUSED/DISABLED/FLAGGED/ARCHIVED/DELETED 等） | 参考页 https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update `[摘录]` |
| `message_template_quality_update` | 模板质量分变更（GREEN/YELLOW/RED/UNKNOWN） | 参考页 message_template_quality_update `[摘录]` |
| `message_template_components_update` | 模板组件变更 | components 表 `[摘录]`（载荷细节 → 待核验(09-27)） |
| `phone_number_quality_update` | 号码 throughput 等级变更；事件 `THROUGHPUT_UPGRADE`，`current_limit`（旧）/`max_daily_conversations_per_business`（新） | 参考页 phone_number_quality_update `[摘录]` |
| `phone_number_name_update` | 号码显示名验证结果 | components 表 `[摘录]`（载荷细节 → 待核验(09-27)） |

- 另有 `smb_*`（SBM 相关行，摘录截断）与 calls 通道字段（新版总览称 messages 权限覆盖 "messages and calls webhooks"）→ 待核验(09-27)。
- 错误参考页独立存在（errors/unsupported/status 三页互链）→ 待核验(09-27)。

---

## 3. 回调机制

### 3.1 配置与订阅（messages field）

来源：https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ `[摘录]` + create-webhook-endpoint 页 `[摘录]`。

1. 自建公网 HTTPS 端点（必须有效 TLS/SSL 证书，自签不接受——Graph API webhooks getting-started `[摘录]`）。
2. App Dashboard > WhatsApp > Configuration 填 **Callback URL** + 自选任意字符串 **Verify token**，点 Verify and save。
3. 保存即触发 GET 验证（§3.2）；通过后面板刷出可订阅字段列表，按需订阅（几乎必订 `messages`）。
4. 调试链（`[摘录]` set-up-webhooks 页）：端点是否 accept → Configuration 面板发 test payload → App 是否 Live mode（部分 webhook 仅 Live 下发）→ 或用 test webhook endpoint（echo bot）对照。
5. 回调约束：**每个 Meta App 配一个 Callback URL**（第三方互证，官方页未见多 URL 口径）→ 待核验(09-27)。

### 3.2 首次验证握手（GET hub.mode/hub.challenge/hub.verify_token）

来源：create-webhook-endpoint 页 `[摘录]` + Graph API getting-started `[摘录]` + echo-bot 示例 `[摘录]`。

- 触发：每次设置/修改 Callback URL 或 Verify token，Meta 发 GET：
```text
GET <CALLBACK_URL>?hub.mode=subscribe&hub.challenge=<HUB.CHALLENGE>&hub.verify_token=<HUB.VERIFY_TOKEN>
```
- 参数语义（Graph API 页 `[摘录]`）：`hub.mode` 恒为 `subscribe`；`hub.challenge` 为 Meta 生成的随机 int/字符串，须原样返回；`hub.verify_token` 取自后台 Verify Token 字段，与服务器存量比对。
- 应答：合法 → `HTTP 200` + **body 为 `hub.challenge` 裸值（纯文本，非 JSON）**；非法 → 任何非 200（示例用 `403`）。官方示例（echo-bot 页 `[摘录]`）：
```js
const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
if (mode === 'subscribe' && token === verifyToken) {
  console.log('WEBHOOK VERIFIED');
  res.status(200).send(challenge);
} else {
  res.status(403).end();
}
```
- 常见坑（第三方互证，非官方）：回 `{"hub.challenge": …}` JSON 会失败；verify token 与 app secret 是两个无关值。→ 待核验(09-27)（官方页未明写"裸值非 JSON"字样，示例代码 `send(challenge)` 为实锤）。
- 验证成功后 Meta 即开始 POST 事件；失败则视为 unverified，不发事件（create-webhook-endpoint `[摘录]`）。

### 3.3 投递、重试、幂等、有序

- 成功判定：端点回 `HTTP 200` 即成功；**其他状态码或不可达即失败**，Meta 以递减频率重试直到成功，**最长 7 天**（set-up-webhooks / webhooks 总览页 `[摘录]` 原文）："Meta retries delivery with decreasing frequency until the request succeeds, for up to 7 days."
- 7 天重试为 Cloud API 默认；**No Storage 号码限 1 小时**，超限丢弃并改发 `131035` 错误 webhook（no-storage 页 `[摘录]`）。消息发送侧 TTL 另计（除 auth 模板 10 分钟外均为 30 天，send-messages 页 `[摘录]`）——**勿与 webhook 7 天重试混淆**。
- 去重：官方只承诺"重试发往所有订阅了该 WABA webhook 的 App，可能产生重复通知"（同页 `[摘录]`），**未指定幂等键**。实践以 `messages[].id`（`wamid.*`）/ `statuses[].id` 去重为通行做法（第三方工程指南），官方口径 → 待核验(09-27)。
- 同一用户多设备时同一消息可同时触发 success 与 failure 两类 status（`delivered` + `failed` 并存，support 页 `[摘录]`）。
- 响应时限：官方 webhook 页摘录未给出秒级 SLA；第三方称期望 3s 内 2xx。是否 3s 超时即判失败 → 待核验(09-27)。
- 批量/大小上限：官方 webhooks 总览明写 Webhook payloads can be up to 3 MB（已核验）；单 POST 最多 entry 数仍无官方摘录 → 待核验(09-27)。
- 有序性：官方未承诺有序 → 待核验(09-27)（默认按无序设计）。

### 3.4 可选加固：mTLS / IP 白名单（均为可选项，非必选）

来源：https://developers.facebook.com/docs/whatsapp/webhooks/ `[摘录]`（"Mutual TLS" + "IP addresses" 两节）。

- **mTLS**：webhook 支持 mutual TLS，按 Graph API 的 mTLS 文档启用（`[摘录]` 原文）："Webhooks support mutual TLS (mTLS) for added security. See Graph API's mTLS for webhooks document…"。CA 迁移等细节（第三方称 2026-03-31 DigiCert→Meta 自有 CA）→ 待核验(09-27)。
- **IP 白名单**：Meta 公布 webhook 服务器 IP 获取方式（`[摘录]` 原文命令）：
```bash
whois -h whois.radb.net — '-i origin AS32934' | grep '^route' | awk '{print $2}' | sort
```
另有 geofeed CSV。但官方同时提示 **IP 会周期性变化，"consider using mTLS instead"**（`[摘录]` 原文），即官方推荐签名/mTLS 而非写死 IP。
- 默认必备仍是 §4 签名校验；mTLS/IP 为叠加层。

---

## 4. 验签与加密算法

载荷不设加密字段，仅 HTTPS 传输 + §4.1 签名校验（官方未提供消息体加密机制；“无加密”为缺席推断，表述以本句为准）。来源：create-webhook-endpoint 页 `[摘录]` + Graph API getting-started `[摘录]`。

### 4.1 签名算法（唯一机制）

- 公式：`X-Hub-Signature-256: sha256=<hex(HMAC-SHA256(key=App Secret, msg=POST 原始 body))>`（create-webhook-endpoint 页 `[摘录]` 表原文：`<SHA256_PAYLOAD_HASH>` = "HMAC-SHA256 hash, calculated using the post body payload and your app secret as the secret key"，示例 hash `b63bb3…0b1f7d2`）。
- 校验步骤（同页 `[摘录]`）：1) 用 JSON 载荷作输入、App Secret 作 key 算 HMAC-SHA256；2) 与头中 `sha256=` 之后部分比对；一致即合法，否则丢弃。
- App Secret 位置：App Dashboard > App Settings > Basic（第三方互证）→ 待核验(09-27)（官方页摘录未含路径）。
- 关键实现约束（官方页未明写，第三方一致警告；标待核验）：**必须对原始字节算 MAC**，先 `JSON.parse` 再重序列化会因空白/键序/Unicode 转义改变 digest；比对用常量时间比较（如 `crypto.timingSafeEqual` / `hmac.compare_digest`）；旧头 `X-Hub-Signature`（SHA-1）忽略之。→ 待核验(09-27)。
- Verify token **不参与** POST 验签（仅 GET 握手用）。

### 4.2 官方示例（逐字，摘录）

POST 信头形状（create-webhook-endpoint `[摘录]`）：
```text
POST <CALLBACK_URL>
Content-Type: application/json
X-Hub-Signature-256: sha256=<SHA256_PAYLOAD_HASH>
Content-Length: <CONTENT_LENGTH>
<JSON_PAYLOAD>
```

Node.js 验签（官方 echo-bot 仓库无验签；下为例行 HMAC 写法，非官方逐字，仅示意）：
```js
const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
```

---

## 5. 示例载荷原文（逐字，均为官方摘录）

### 5.1 inbound 文本消息（含 contacts + messages）

来源：set-up-webhooks 页 `[摘录]`：
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550783881",
              "phone_number_id": "106540352242922"
            },
            "contacts": [
              {
                "profile": {
                  "name": "Sheena Nelson"
                },
                "wa_id": "16505551234"
              }
            ],
            "messages": [
              {
                "from": "16505551234",
                "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
                "timestamp": "1749416383",
                "type": "text",
                "text": {
                  "body": "Does it come in another color?"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```
- 信封路径：`object`（恒 `whatsapp_business_account`）→ `entry[]`（`id` = WABA ID）→ `changes[]`（`field: messages`）→ `value`（`messaging_product: whatsapp` + `metadata{display_phone_number, phone_number_id}` + `contacts[]`/`messages[]` 二选结构）。
- `messages[].id` 即 `wamid`（去重键候选，见 §3.3）；`timestamp` 为秒级字符串；`contacts[].wa_id` 为用户 WhatsApp ID。

### 5.2 outbound 状态（delivered，含 conversation + pricing）

来源：messages 参考页 `[摘录]`：
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550783881",
              "phone_number_id": "106540352242922"
            },
            "statuses": [
              {
                "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA",
                "status": "delivered",
                "timestamp": "1750263773",
                "recipient_id": "16505551234",
                "conversation": {
                  "id": "6ceb9d929c9bdc4f90e967a32f8639b4",
                  "origin": {
                    "type": "service"
                  }
                },
                "pricing": {
                  "billable": true,
                  "pricing_model": "CBP",
                  "category": "service"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```
- `statuses[].id` 回指发送响应中的 `wamid`；`conversation.origin.type` 为会话类别（service/marketing/utility/authentication）；`pricing` 含 `billable/pricing_model/category`（v24.0+ 起 `conversation`/`pricing` 只出现在 sent 与 delivered/read 其中之一，status 参考页 `[摘录]`）。
- 另一官方 sent 例（marketing，`pricing_model: PMP`，`category: marketing`，含 `expiration_timestamp`）见 status 参考页 `[摘录]`（§3.2 同源）。

### 5.3 发送文本消息请求/响应（Messages API）

请求（get-started 页 `[摘录]`，`v23.0`）：
```bash
curl 'https://graph.facebook.com/v23.0/<TEST_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SYSTEM_USER_ACCESS_TOKEN>' \
-d '
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<WHATSAPP_USER_PHONE_NUMBER>",
  "type": "text",
  "text": {
    "body": "Hello!"
  }
}'
```
- 基址 `https://graph.facebook.com`，路径 `POST /{Version}/{Phone-Number-ID}/messages`（messages 参考页 `[摘录]`）；`to` 为用户号码（E.164，示例带 `+` 前缀）；正文 `text.body` 最长 4096 字符，`preview_url` 可选（text-messages 页 `[摘录]`）。
- 响应只代表"API 已受理"，**不代表已投递**，投递状态走 §5.2 webhooks（send-messages 页 `[摘录]`）。响应形状（send-messages 页 `[摘录]`）：
```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    {
      "input": "<WHATSAPP_USER_PHONE_NUMBER>",
      "wa_id": "<WHATSAPP_USER_ID>"
    }
  ],
  "messages": [
    {
      "id": "<WHATSAPP_MESSAGE_ID>"
    }
  ]
}
```
- `messages[].id` 即 `wamid`（如 `wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA`，text-messages 页 `[摘录]`）；模板消息 pacing 时附 `message_status`（accepted/held_for_quality_assessment/paused，messages 参考页 `[摘录]`）。

### 5.4 模板状态变更（message_template_status_update）

来源：message_template_status_update 参考页 `[摘录]`：
```json
{
  "entry": [
    {
      "id": "102290129340398",
      "time": 1751247548,
      "changes": [
        {
          "value": {
            "event": "APPROVED",
            "message_template_id": 1689556908129832,
            "message_template_name": "order_confirmation",
            "message_template_language": "en-US",
            "reason": "NONE",
            "message_template_category": "UTILITY"
          },
          "field": "message_template_status_update"
        }
      ]
    }
  ],
  "object": "whatsapp_business_account"
}
```

### 5.5 号码能力/质量变更（phone_number_quality_update / business_capability_update）

来源：phone_number_quality_update 参考页 `[摘录]`：
```json
{
  "entry": [
    {
      "id": "102290129340398",
      "time": 1748454394,
      "changes": [
        {
          "value": {
            "display_phone_number": "15550783881",
            "event": "THROUGHPUT_UPGRADE",
            "current_limit": "TIER_UNLIMITED"
          },
          "field": "phone_number_quality_update"
        }
      ]
    }
  ],
  "object": "whatsapp_business_account"
}
```
- 组合限额提升时另触发 `business_capability_update`（`max_daily_conversations_per_business` / 旧 `max_daily_conversation_per_phone`，messaging-limits 页 `[摘录]`）。

---

## 6. token / 凭证与计费模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| 临时 User token（API Setup 面板 Generate access token） | App Dashboard > WhatsApp > API setup，每次访问面板生成新 token，作用域绑定当前登录开发者 | **<24 小时**（官方博客原文 "expires in less than 24 hours"），仅发首条 `hello_world` 测试用，不可生产 | https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/ `[摘录]` + get-started `[摘录]` |
| 系统用户 token（System User，生产用） | Business Settings > System Users 建用户 → Assign Assets（App: Manage app Full control；WABA: Manage 权限）→ Generate token，勾 `business_management` + `whatsapp_business_messaging` + `whatsapp_business_management` | 长效，可选永不过期（Never）或 60 天过期（`set_token_expires_in_60_days`，marketing-api 系文档 `[摘录]`；WhatsApp 侧 UI 有 Never 选项，第三方互证）→ 有效期选项原文待核验(09-27) | https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens `[摘录]` + get-started Step 5 `[摘录]` |
| 调用传参 | `Authorization: Bearer <token>` + `Content-Type: application/json` | 发消息支持系统用户 token；Business Integration System User（Tech Provider/伙伴）另计 | messages 参考页 `[摘录]` |
| 发送去重 | 响应 `wamid` 即幂等关联键；请求侧无飞书式 `uuid` 去重参数 | 同一条下发最多触发 sent/delivered/read 三个 status webhook，按 `statuses[].id`（= wamid）归一 | send-messages `[摘录]` + status 参考页 `[摘录]` |
| 准入阶梯（Messaging Limits） | 新组合 250 → 完成验证/高质量 2000 条（30 天）→ 自动 10K → 100K → Unlimited；7 天内用掉 ≥50% 当前限额 + 全号码高质量则 6 小时内升一档；查询字段 `whatsapp_business_manager_messaging_limit`（旧 `messaging_limit_tier` 已废弃） | 仅约束"窗口外 business-initiated（模板）可达去重用户数/24h 滚动"；窗口内回复不限 | https://developers.facebook.com/docs/whatsapp/messaging-limits/ `[摘录]` |
| 吞吐（Throughput） | 默认 80 mps（含 inbound+outbound 全类型）；达标自动升 1000 mps（组合 Unlimited + 单号 24h 内触达 100K+ 去重用户 + quality ≥ Medium/YELLOW，12h 内生效）；超限报 `130429` | 升吞吐不加价 | throughput 页 `[摘录]` |

### 计费（存疑区，如实记录矛盾）

- 开发者文档口径（`[摘录]` pricing + non-template-messages 页）：2025-07-01 起**按条计费**（per-message，delivered 才收费）；模板三类 marketing/utility/authentication 按 market–category 费率卡收费，utility/authentication 有月度量阶梯；**2026-08-01 起 Meta Business Agent 按 token 收费；2026-10-01 起 service 消息按条收费（费率同 utility/authentication，无量阶梯，每号码每月前 1000 条免费），窗口内 utility 模板亦开始收费**。service 需 2026-09-30 前绑支付方式，否则停发。
- **存疑**：定价主站 https://whatsappbusiness.com/products/platform-pricing/（本次 WebFetch 全文）**仍写** "we do not charge for service messages, or for utility messages businesses send in response to users" 且 service 类别页写 "respond with service messages, at no charge"。与开发者文档 10-01 收费预告直接矛盾。任务提示"10-01 全按条收费口径存疑（Meta 主定价页仍写 service 消息免费）"属实，**以开发者文档未来生效条款为准还是以主站现状为准 → 待核验(09-27)**；模拟器不得写死任一口径，应将 service 计费做成可配置开关。
- 免费入口：Click-to-WhatsApp 广告 / Facebook Page CTA 进线后 72 小时免费窗口（模板+非模板均免，主站 WebFetch 全文 + non-template 页 `[摘录]` 一致）。
- 24h customer service window：用户来信/来电即开 24h 窗口，再次来信重置；窗口内可发非模板 service 消息（send-messages/service-messages `[摘录]`）。

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **全文直抓**：`developers.facebook.com` 文档页 WebFetch 均 400，本库全为 `[摘录]`，需换链路（`documentation/business-messaging/...` 镜像路径、Graph API 版本化路径、或官方 GitHub 示例）复核 §2–§5 全文。→ 待核验(09-27)
2. **GET 握手"裸值非 JSON"**：官方示例 `res.status(200).send(challenge)` 实锤裸值，但无"must NOT return JSON"字样；超时/时限（第三方称无）亦无官方 SLA。→ 待核验(09-27)
3. **POST 响应时限与批量上限**：3s/2xx、单 POST entry 上限、3MB 上限等第三方口径无官方摘录。→ 待核验(09-27)
4. **幂等键官方化**：`wamid` 去重为工程通行做法，官方仅承认"重试致重复"，未指定键；`statuses[].id` 与发送响应 `messages[].id` 同源已实锤，可写实现，标注非官方强制。→ 待核验(09-27)
5. **有序性**：官方未承诺，默认无序。→ 待核验(09-27)
6. **mTLS 启用步骤与 CA**：Graph API mTLS 文档未取；2026-03-31 CA 迁移（DigiCert→Meta CA）为第三方单源。→ 待核验(09-27)
7. **App Secret 路径**：App Settings > Basic 为第三方口径。→ 待核验(09-27)
8. **单 App 单 Callback URL**：官方页未明写"只能配一个"。→ 待核验(09-27)
9. **系统用户 token 有效期选项**（Never vs 60 天）与 Business Integration System User 伙伴链路全文。→ 待核验(09-27)
10. **各 inbound `type` 载荷细节**（image/audio/video/document/sticker/location/contacts/interactive/reaction/unsupported 等）与 calls 字段。→ 待核验(09-27)
11. **管理面字段载荷细节**：`account_update` 全事件表（PARTNER_*/VOLUME_BASED_PRICING_TIER_UPDATE 等）、`message_template_components_update`、`phone_number_name_update`、`smb_*`。→ 待核验(09-27)
12. **10-01 计费口径**：开发者文档（service/utility 开收）vs 定价主站（service 免费）矛盾；以何者为准、何时切换、既有 WABA 过渡条款。→ 待核验(09-27)（存疑，不得写死）
13. **官方 SDK 本体**：官方 `whatsapp` Node SDK（发送用）仓库与 webhook 验签 helper 是否存在；Graph API SDK 覆盖范围。→ 待核验(09-27)
14. **阶梯旧口径**（1K/10K/100K 四档）与新口径（250/2K/10K/100K/Unlimited，2025-10-07 组合化）并存于第三方文档，模拟器按新口径实现并保留旧档映射。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"Meta 推事件给回调"：`POST` JSON 信封 `{object:"whatsapp_business_account", entry:[{id:<WABA_ID>, changes:[{field:"messages", value:{messaging_product:"whatsapp", metadata:{display_phone_number, phone_number_id}, contacts?/messages?/statuses?}}]}]}`，头 `X-Hub-Signature-256: sha256=<hex(HMAC-SHA256(AppSecret, 原始body))>`、`Content-Type: application/json`。
- 模拟首次配置校验：`GET ?hub.mode=subscribe&hub.challenge=<同值>&hub.verify_token=<token>`，期望 200 + 裸 `hub.challenge`（非 JSON）。
- ID 形态：`wamid.HBgL…`（inbound `messages[].id` = outbound `statuses[].id` = 发送响应 `messages[].id`，三处同源归一）；`wa_id`/电话为纯数字（如 `16505551234`）；`phone_number_id` 数字串（如 `106540352242922`）；`timestamp` 秒级字符串。
- 重试语义：非 200/不可达即递减重试最长 7 天（No Storage 号 1 小时），重试广播给所有订阅该 WABA 的 App，消费方按 `wamid` 幂等；不保证有序。
- 发送模拟：`POST https://graph.facebook.com/v23.0/{phone_number_id}/messages` + `Authorization: Bearer <token>`，同步仅返回受理（含 `wamid`），投递经 status webhooks（sent→delivered→read）异步到达。
- 计费模拟：service/utility 收费做可配置开关（默认按主站现状免费，10-01 口径标存疑可切换），不得写死。
