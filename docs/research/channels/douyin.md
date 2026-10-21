# 抖音开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch（内置）+ curl 直抓 SSR HTML（正文内嵌于服务端渲染 DOM，用脚本抽取逐字文本）
> 站内搜索引擎为 JS 空壳，改走其文档 BFF 搜索接口发现页面：`POST https://developer.open-douyin.com/bff_api_v2/platform/helpCenter/OpenPlatformSearchService/searchDoc`，body `{"Keyword": "...", "PageNo": 1, "PageSize": 15}`
> mcp webReader 配额耗尽（2026-09-27 恢复），本次未使用。所有事实标注来源 URL；示例载荷逐字保留

## 1. 官方文档入口与关键页面

- 门户首页：https://developer.open-douyin.com/
- 文档根：https://developer.open-douyin.com/docs/resource/zh-CN/（多棵文档树共存：`dop` 移动/网站应用、`mini-app` 小程序、`mini-game` 小游戏、`local-life` 生活服务、`thirdparty` 服务商；`interaction` 直播互动、`developer` 抖音云等树在本次抓取中未采样，2026-09-10 复核注）
- 抖音开放平台使用指引：https://developer.open-douyin.com/docs/resource/zh-CN/dop/overview/usage-guide

本次实际抓到并核实的页面清单

| 主题 | URL |
|---|---|
| Webhooks 概述（握手/重试/验签） | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/summarize |
| Webhooks 事件列表（全量事件+统一信封） | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/event-list |
| 获取事件订阅状态 API | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/get-event-subscription-status |
| 更新事件订阅状态 API | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/update-event-subscription-status |
| 抖音服务市场订单事件 | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/service-market-order |
| 接收私信消息事件（IM 明细，mini-app 树） | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook |
| 私信消息撤回事件 | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-withdraw |
| 消息已读事件 | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/message-read-webhook |
| 进入私信会话页事件 | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/enter-direct-msg-webhook |
| 企业号线索私信能力（线索组件+webhook 新增字段） | https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/enterprise-account-open-ability/leads-b2c-im-ability/clue-component-open |
| 小游戏 消息推送配置接入指引（x-signature 体系） | https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push/msg-push-config-guide |
| 小游戏 消息推送客服（sha1 echostr 体系，2025-06-30 已下线迁移） | https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push-customer-service |
| 服务商 消息推送及加解密说明（Encrypt/MsgSignature 体系） | https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/encryption/ |
| 生活服务 WebHooks 接入 | https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/webhooks |
| 生活服务 消息推送说明（SPI vs WebHooks） | https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/message-push-configuration-access |
| 生活服务 加密字段解密方法（AES-256-CBC） | https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/decrypt |
| OpenAPI 通用参数（凭证定义） | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/common-params |
| 获取 access_token | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/get-access-token |
| 刷新 access_token | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/refresh-access-token/ |
| 生成 client_token | https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/client-token |
| 发送私信消息（/im/send/msg/ 专章，2026-10-14 补证） | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/send-message |
| 即时消息 FAQ（token 分类/错误排查，2026-10-14 补证） | https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/FAQ |

页面时效参考：event-list 页内元数据显示 `saved_time: 2025-10-13`；clue 页标注 PR 编号 2024112059215、能力版本 v1.0.5（2026.6）

## 2. 消息/事件推送全清单

抖音系至少有 **四套并行推送体系**，验签与载荷完全不同，模拟时必须区分

| 体系 | 适用 | 载荷信封 | 验签 | 握手 |
|---|---|---|---|---|
| A. dop Webhooks | 移动/网站应用（含 IM 私信、企业号线索私信） | `{event, from_user_id, to_user_id, client_key, content, log_id}` | `X-Douyin-Signature` = sha1(client_secret + body) | POST `verify_webhook` + challenge 回显 |
| B. 小游戏 消息推送配置 | 小游戏（客服消息/礼包） | JSON/XML `{ToUserName, FromUserName, CreateTime, MsgType, ...}` | `x-signature` = base64(md5(排序拼接)) | POST `verify_request`（旧客服：GET + echostr + sha1） |
| C. 服务商（第三方小程序） | 小程序第三方平台 | `{Nonce, TimeStamp, Encrypt, MsgSignature}` | MsgSignature（sha1，TOKEN 参与） + AES 解密 Encrypt | 无独立 challenge（授权事件 URL 直接推送） |
| D. 生活服务 WebHooks/SPI | 生活服务商家/服务商 | `{event, client_key, content(json字符串), log_id}` | `X-Douyin-Signature` = sha1(AppSecret + body) | 同 A（verify_webhook challenge） |

### 2.1 dop Webhooks 事件全清单

来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/event-list （事件目录表，逐字）

| 事件名 | 需要 scope | 描述（逐字） |
|---|---|---|
| create_video | aweme.forward（默认开通） | 用户使用开发者应用分享视频到抖音（携带分享id) |
| authorize | 无 | 抖音用户授权给开发者 App |
| unauthorize | 无 | 抖音用户解除授权，推送事件给开发者 App |
| im_receive_msg | im.direct_message | 接收私信，用户收到私信触发 |
| im_send_msg | im.direct_message | 发送私信，用户发送私信触发 |
| im_enter_direct_msg | im.direct_message | 接收用户进入私信会话页事件，用户主动进入私信会话页触发 |
| enter_group_audit_change | im.group_fans.create_list | 用户加群申请 |
| group_fans_event | im.group_fans.create_list | 用户加群成功 |
| contract_authorize | 无 | 用户给应用经营关系（scope 名为 xxx.bind，或私信相关能力）授权 |
| contract_unauthorize | 无 | 用户解除应用经营关系（scope 名为 xxx.bind，或私信相关能力）授权 |
| union_auth_info_for_c | unionauth.identification | 联合授权完成后，对c端应用进行授权信息通知 |
| union_auth_info_for_b | unionauth.identification | 联合授权完成后，对b端应用进行授权信息通知 |

同一页「事件结构」一节还给出以下事件（未列入上表但含示例结构）：`im_group_receive_msg`（群聊收消息）、`im_group_send_msg`（群聊发消息）、`new_video_digg`（视频点赞，content 含 action_type/action_time/item_id）、`new_follow_action`（新增关注，content 含 action_type/action_time）

mini-app 树补充（同信封同机制）
- `im_recall_msg` 撤回私信 — https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-withdraw
- `im_message_read` 消息已读 — https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/message-read-webhook
- `service_market_order` 服务市场订单事件 — https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/service-market-order （scope: market.service.user；order_event 1=用户支付订单 2=服务商接单 3=服务商确认实施订单 4=用户确认订单 5=取消订单）

约束（event-list 页原文）：「当前抖音用户是指: 授权给开发者应用的抖音用户。其中 IM 事件，需要当前抖音用户是企业号」——即 dop 树的 IM 私信事件本质就是**企业号私信**推送

### 2.2 IM 私信事件 content 字段（im_receive_msg / im_send_msg）

来源：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook

信封字段：`event`（string，im_receive_msg/im_send_msg）、`from_user_id`（发送方 open_id）、`to_user_id`（接收方 open_id）、`client_key`、`log_id`（string，事件推送 log_id）、`content`（struct）

content 字段

| 字段 | 类型 | 含义 |
|---|---|---|
| conversation_short_id | string | 会话 ID（加密串，`@` 开头 base64 风格；**长期有效**） |
| server_message_id | string | 消息 ID（**有效期 24 小时**，clue 页 2.1 节注明） |
| conversation_type | int | 会话类型（1：私聊） |
| message_type | string | text / image / user_local_image / emoji / video / user_local_video / retain_consult_card / other |
| source | string | 区分发出应用：通过发送私信消息接口发送显示具体 clientkey；端上主动发送为空 |
| create_time | int | 消息创建时间，13 位毫秒时间戳 |
| user_infos | list<struct> | 用户基本信息（open_id / nick_name / avatar） |
| index | int | 会话内消息 index 索引，逐条递增（用于已读对齐） |

企业号线索能力对 webhook content 的新增字段（来源：clue-component-open 页「Webhook 新增字段」）：`im_mode`、`content_title`（视频标题）、`group_info`、以及按 message_type 附带组件字段。组件消息 message_type 与发送侧 msgType 数值对照（同页）

| message_type（推送侧） | msgType（发送侧数值） | 组件 |
|---|---|---|
| video | - | 分享视频 |
| premium_online_appointment_card | 16 | 高级在线预约（marketing_tool 内 link_type=45） |
| leads_phone_card | 20 | 一键收集电话 |
| lead_commodity_card | 21 | 线索商品卡 |
| poi_card | 22 | 门店/POI 卡 |
| applet_card | 10 | 小程序引导卡片（发送侧） |
| text / image | 1 / 2 | 文本 / 图片（发送侧；text=1 已复核，image=2 待补抓 2026-09-10 注） |

线索私信事件开放（同页 5 节）：scope `ad.leads.im_event_open`，content 额外含 `invalid_conversation`（0-否 1-是折叠）、`enter_chat_from`（0-自然 1-广告）、`item_enter_from`（0-短视频 1-直播 5-未知）、`is_clued`、`guest_id`、`enterprise_id`、`conversation_short_id`、`create_time`

### 2.3 其余 dop 事件触发语义

- `im_enter_direct_msg` content（来源：enter-direct-msg-webhook 页）：conversation_short_id、server_message_id、conversation_type、objectId（视频 ID）、scene_type（3:视频页 4:主页 5:消息页 6:直播页 100:其他）、create_time、`data-im-extra`（小程序透传字段）、user_infos、ad_info（广告信息：adv_id/adv_name/ad_id/ad_name/creative_id/promotion_id/material_*_id）、query/path（小程序跳转来源）。注意该页 content 是 **json 字符串**（string 类型）
- `im_recall_msg` content：仅 `server_message_id`；信封额外带 `msg_id`。授权/未授权双端推送规则见该页表格（A/B 授权组合决定推给谁）
- `im_message_read` content：conversation_short_id、conversation_type、read_open_id、index（与 im_receive/im_send 的 index 匹配判定已读）
- 群聊三事件（im_group_receive_msg / im_group_send_msg / enter_group_audit_change / group_fans_event）官方仅给空 content `{}`，字段明细文档未找到 → 见待核验

## 3. 回调机制

来源（除单独标注外）：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/summarize

### 3.1 URL 配置与首次校验握手（dop / 生活服务 同款）

- 配置路径：「控制台 - 设置 - 开发配置 - Webhooks」；生活服务另有解决方案详情页「基础配置 - Webhooks 配置」入口（来源：local-life webhooks 页）
- 保存时平台向该 URL 发 **POST、Content-Type: application/json** 的验证请求；通过后 URL 才生效，之后才能订阅事件
- 验证请求示例（**逐字**）

```json
{
  "event": "verify_webhook",
  "client_key": "",
  "content": {
    "challenge": 12345
  }
}
```

- 应答要求（逐字要点）：「解析出 challenge 值，并立即返回该 challenge 值作为响应」「返回内容需要放入 ResponseBody 里,不能直接返回；并且返回内容为 text 格式的 json 数据」。应答示例（逐字）

```json
{"challenge": 12345}
```

- 生活服务页补充（逐字）：「注：验证用的 content 不是 string 类型，而是 object 类型」；URL 必须 https:// 开头（小游戏侧另注明端口 443）；同一应用只能配置一个接收地址

### 3.2 订阅管理

- 控制台开关或 OpenAPI 订阅：「需要在管理中心打开该事件的订阅才可收到通知」
- OpenAPI：获取订阅状态 `GET /event/status/list/`（无参数，不需授权）；更新订阅状态 `POST /event/status/update/`（已复核 2026-09-10：event-list 页内联表格原文为 `GET /event/status/update/`，专页原文为 `POST /event/status/update/`，官方自相矛盾；模拟器按 POST 实现）。均为 `https://open.douyin.com` 域，Content-Type: application/json
- 「如果开发者服务器长时间未响应事件推送请求，可能会取消开发者的订阅状态，开发者需重新订阅」

### 3.3 重试与响应判定

- dop（逐字）：「抖音服务器会 POST 消息到开发者的 Callback 域名，连接超过 5s 会自动断开，共重试 3 次。用户可通过请求头中的 Msg-Id 进行去重」
- 生活服务（逐字）：「HTTP code 响应 200 且响应时间小于 2.5s，抖音侧即认为推送成功。若 HTTP 响应 code 非 200 或响应时间超过 2.5s，抖音侧会间隔发起重试，区分接口做最多N次重试。抖音侧收到成功请求时也可能会继续重复推送」「webhook 通知为异步通知，抖音不保证消息必达、有序、不重复。请开发者自行根据消息唯一键去重」
- 小游戏客服（旧，逐字）：「如果两秒内没收到响应，将认为失败，然后 sleep 几秒再重试，总共重试三次」「直接回复 success 或者长度为 0 的空串」才算成功
- 服务商（逐字）：收到推送「必须直接返回字符串 success，不是 "success"（不带引号），否则认为推送失败，重试 3 次」
- 请求头：`Msg-Id`（去重键）、`X-Douyin-Signature`（验签）、`Content-Type: application/json`（生活服务页明确列为固定值）

### 3.4 小游戏推送握手（体系 B，供对照）

- 配置项：URL（https，443）、Token（3~32 字符）、消息数据格式 JSON（默认）/XML
- 保存时 POST `verify_request`，Header：`x-appid`、`x-msg-type`、`x-nonce-str`、`x-timestamp`（毫秒）、`x-signature`。Header 实际是数组形态（逐字示例）

```json
{
    "x-appid": ["tt12321"],
    "x-msg-type": ["verify_request"],
    "x-nonce-str": ["313932313532383034"],
    "x-timestamp": ["1737635474798"],
    "x-signature": ["AoOtx/dFR5MFrCTqUmtmDg=="]
}
```

- x-msg-type 枚举：`verify_request`（验证请求）、`gift_delivery`（游戏站礼包推送）、`douyin_microgame_im`（抖音客服消息推送）。验签通过回 HTTP 200 即保存成功
- 旧「消息推送客服」体系为 GET 验证：query 参数 signature/timestamp/nonce/msg/echostr，signature = sha1(字典序排序(token,timestamp,nonce,msg) 直接拼接)，原样回显 echostr（不带引号）。该体系 2025-06-30 关闭，迁移至「抖音客服平台」

## 4. 验签与加密算法

### 4.1 dop / 生活服务：X-Douyin-Signature（sha1）

来源：webhooks/summarize（dop，AppSecret 即 client_secret）+ local-life webhooks 页

- 算法（dop 逐字）：「抖音服务端会将应用的(client secret + 消息体)使用 sha1 哈希作为 X-Douyin-Signature header 的 value。您可以自行使用 client secret 和收到的消息体进行 sha1 哈希，与该请求头进行比对」
- Go 官方示例（summarize 页，逐字）

```go
func sign(clientSecret string, body []byte) string {
   h := sha1.New()
   h.Write([]byte(clientSecret))
   h.Write(body)
   bs := h.Sum(nil)
   return fmt.Sprintf("%x", bs)
}
```

- 生活服务版差异（Java style）：body 需**按行拼接去掉换行符**后再 sha1（`wholeStr` 逐行 readLine 拼接；Node demo 用 `bodyStr.split(/\r?\n/).join('')`），key 用 AppSecret。模拟器生成签名时应基于无换行的 body 字符串
- token 来源：应用凭证 client_secret / AppSecret（控制台 - 应用信息 - 应用基础信息）

### 4.2 小游戏：x-signature（md5+base64）

来源：msg-push-config-guide。算法（逐字）
1. 将 Header 里的 x-appid、x-msg-type、x-nonce-str、x-timestamp 四个参数**按字典序排序**，用 `&` 拼接成 `key1=value1&key2=value2...`（key 带前缀，如 `x-appid=tt12321&x-msg-type=verify_request&...`）
2. 再直接拼接 body 和 token（无任何连接符）
3. md5（16 bytes）后 base64 编码即 signature

文档示例拼接串（逐字）：`x-appid=tt12321&x-msg-type=verify_request&x-nonce-str=123456&x-timestamp=456789verify_bodyverify_token` → `AoOtx/dFR5MFrCTqUmtmDg==`。（注：官方两处示例取值本就不一致——Header 示例用真实时间戳/nonce，拼接串用 123456/456789 占位，逐字保留，2026-09-10 复核注）

### 4.3 服务商（第三方小程序）：MsgSignature + AES Encrypt

来源：thirdparty encryption 页
- 推送信封（逐字）

```json
{
  "Nonce": "4464221",
  "TimeStamp": "1535551395",
  "Encrypt": "Encrypt xxxx",
  "MsgSignature": "ba394c04acece6c2c0edee058c5dddf82474b8ee"
}
```

- 验签（逐字）：「根据【消息验证 TOKEN】、Nonce、TimeStamp、Encrypt 获取签名，和 MsgSignature 比较」。具体拼接序（是否字典序）官方示例代码包未随文档给出 → 待核验(09-27)。参照同族小游戏旧客服算法，大概率是 sha1(字典序排序四参拼接)
- 解密：Encrypt 用【消息加密解密 KEY】（第三方小程序开发配置中配置）调 MsgDecrypt 解密；AES 具体参数在示例代码包中 → 待核验(09-27)
- TOKEN / KEY 配置位置：「授权事件接收 URL」「消息与事件接收 URL」「消息验证 TOKEN」「消息加密解密 KEY」均在第三方小程序应用的开发配置中

### 4.4 生活服务字段级加密：AES-256-CBC

来源：local-life decrypt 页
- 新版：密文以 `Enc.` 前缀标识 → 走在线解密接口（`POST /goodlife/v1/open/common_biz/crypto/decrypt/batch`、脱敏版 `decrypt_mask/batch`、加密 `encrypt/batch`，50 条/次，按 client_key 每日配额）
- 旧版本地解密（逐字要点）：「将 ClientSecret 向左右使用字符 `#` 补齐 32 位 / 裁剪至 32 位（先左后右交替）；将 ClientSecret 作为 Key，右侧 16 位为向量 IV；密文 base64 解码；AES-256-CBC + PKCS5Padding」
- 即：`key = pad32(client_secret)`，`iv = key[16:32]`，密文 = base64(AES-256-CBC-PKCS5(明文))。三语 SDK（Go/Java/PHP）逐字保留在来源页

## 5. 示例载荷原文（逐字）

### 5.1 dop 统一信封（event-list 页逐字）

```json
{
  "event": "",
  "from_user_id": "",
  "to_user_id": "",
  "client_key": "",
  "content": {}
}
```

「from_user_id 即为 open_id。」

### 5.2 create_video（逐字，含注释）

```json
{
    "event": "",       //事件名为create_video
    "from_user_id": "",//事件发起用户user_id
    "client_key": "",  //使用应用的client_key
    "content": {
        "item_id": "", //创建的视频id
        "share_id": "" //标识分享的share_id
    }
}
```

### 5.3 authorize / unauthorize（逐字）

```json
{
    "event": "",       //事件名为authorize
    "from_user_id": "",//事件发起用户user_id
    "client_key": "",  //使用应用的client_key
    "content": {
        "scopes": []   //授权scope列表
    }
}
```

### 5.4 im_receive_msg 骨架（dop event-list 逐字）

```json
{
    "event":"",          //事件名为im_receive_msg
    "client_key":"",     //使用应用的client_key
    "from_user_id":"",   //事件发起用户user_id
    "to_user_id":"",     //事件接收用户user_id
    "content":{}
}
```

### 5.5 IM 文本消息（mini-app private-msg-webhook 页逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "ac6479a5-d7a6-4018-84be-c29bfc00000",
  "to_user_id": "aaa-7ae0-4399-914a-5eb1df5861ba",
  "log_id":"2023429834752345783",
    "content": {
    "conversation_short_id": "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    "server_message_id": "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    "conversation_type": 2,
    "create_time": 1656571939562,
    "message_type": "text",
    "text": "你好，抖音",
    "index": "1672502407220000",
  }
}
```

注意：该示例 JSON 带尾逗号（原文如此）；conversation_type 此例为 2（文档字段表注明 1=私聊，示例与表不一致，原文如此）

### 5.6 IM 表情消息（逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "eeb0ea9b-bed4-4b70-913d-c29bfc00000",
  "to_user_id": "aaa-7ae0-4399-914a-5eb1df5861ba",
  "content": {
    "conversation_short_id": "@c29bfc000+MNggFhRkwGuX1ntucyQ/A1Wn+VfTX3Vk9xDdDQrU9MpJSYEVV6/2hK6gbUC8gjaV/y3CS18WtfMw==",
    "server_message_id": "@c29bfc000+MNggFhRkwGuX1ntuc1RPw2VXmSfjn/VE9zCtHSrU9MpJSYEVV6/2hKk8cLQDaYzbQpImhvw1Y4FQ==",
    "conversation_type": 1,
    "create_time": 1656671771668,
    "message_type": "emoji",
    "resource_type": "gif",
    "resource_width": 450,
    "resource_height": 450,
    "resource_url": "",
    "index": "1672502407220000"
  }
}
```

### 5.7 IM 图片 / 本地图片（逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "ac6479a5-d7a6-4018-84be-c29bfc00000",
  "to_user_id": "8067f050-f8cf-4fa3-9357-c29bfc00000",
  "content": {
    "conversation_short_id": "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    "server_message_id": "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    "conversation_type": 1,
    "create_time": 1656571939562,
    "message_type": "image",
    "index": "1672502407220000"
  }
}
```

（user_local_image 同构，message_type 换为 `user_local_image`。）

### 5.8 IM 视频分享（逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "eeb0ea9b-bed4-4b70-913d-c29bfc00000",
  "to_user_id": "8067f050-f8cf-4fa3-9357-c29bfc00000",
  "content": {
    "conversation_short_id": "@c29bfc000+MNggFhRkwGuX1ntucyQ/A1Wn+VfTX3Vk9xDdDQrU9MpJSYEVV6/2hK6gbUC8gjaV/y3CS18WtfMw==",
    "server_message_id": "@c29bfc000+MNggFhRkwGuX1ntuc1RPw2VXmSfjn/VE9zCtHSrU9MpJSYEVV6/2hKk8cLQDaYzbQpImhvw1Y4FQ==",
    "conversation_type": 1,
    "create_time": 1656671771668,
    "message_type": "video",
    "item_id": "@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0CtjUrU9MpJSYEVV6/2hKy3NMVbBhh6BW27IsDFieLg==",
    "index": "1672502407220000"
  }
}
```

### 5.9 IM 留资卡片-完成态（逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "ac6479a5-d7a6-4018-84be-c29bfc00000",
  "to_user_id": "8067f050-f8cf-4fa3-9357-c29bfc00000",
  "content": {
    "conversation_short_id": "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    "server_message_id": "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    "conversation_type": 1,
    "create_time": 1656571939562,
    "message_type": "retain_consult_card",
    "index": "1672502407220000"
    "card_id": "@72MqAjfymKYS1xNrB0sG4X1iidgOeMsMbUSpQwLJb3kYzJh7eXsSr5+aH2GTsvEv",
    "card_status": 2, //1:空白态；2:完成态
    "card_data": [
      {
        "label": "姓名",
        "value": "Tonality"
      },
      {
        "label": "手机号",
        "value": "12345678901"
      },
      {
        "label": "城市",
        "value": "北京市北京市海淀区"
      }
    ]
  }
}
```

（原文即缺 `index` 行尾逗号，逐字保留。）

### 5.10 IM 完整示例（含 user_infos，逐字）

```json
{
  "event": "im_receive_msg",
  "client_key": "asdfavetgbvasf",
  "from_user_id": "aaa-ae9b-4dbf-add1-bf67e4093fab",
  "to_user_id": "aaa-7ae0-4399-914a-5eb1df5861ba",
  "content": {
    "conversation_short_id": "@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
    "server_message_id": "@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
    "conversation_type": 1,
    "create_time": 1681303285997,
    "message_type": "text",
    "source": "",
    "text": "捷途70",
    "index": "1672502407220000"
    "user_infos": [
      {
        "open_id": "aaa-ae9b-4dbf-add1-bf67e4093fab",
        "nick_name": "刘东",
        "avatar": "https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143"
      },
      {
        "open_id": "aaa-7ae0-4399-914a-5eb1df5861ba",
        "nick_name": "毕节--捷途万丰店",
        "avatar": "https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143"
      }
    ]
  }
}
```

（原文即缺 `index` 行尾逗号，逐字保留。）

### 5.11 im_enter_direct_msg（content 为 json 字符串，逐字）

```json
{
  "event": "im_enter_direct_msg",
  "client_key": "aaaoqobz68a71u1",
  "from_user_id": "aaa-8a0b-4c0f-b04f-feba0e909113",
  "to_user_id": "aaa-81ec-424c-b738-8693eeaf53ea",
  "content": "{\"conversation_short_id\":\"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==\",\"server_message_id\":\"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==\",\"conversation_type\":1,\"create_time\":1681303286088,\"scene_type\":4,\"user_infos\":[{\"open_id\":\"xxxx8a0b-4c0f-b04f-feba0e909113\",\"nick_name\":\"Hs姝羽\",\"avatar\":\"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143\"},{\"open_id\":\"xxxx-81ec-424c-b738-8693eeaf53ea\",\"nick_name\":\"广汽传祺张掖华逸店\",\"avatar\":\"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b609448a.jpeg?from=3782654143\"}],\"data-im-extra\":\"123456789\",\"query\":\"cptName=button\",\"path\":\"page/componentTpl/componentTpl\"}"
}
```

### 5.12 im_recall_msg（逐字）

```json
{
        "event": "im_recall_msg",
        "client_key": "tt5daf***",
        "from_user_id": "236ed9d9-2cb3-4d2f-a834-***",
        "to_user_id": "971d8bed-40b6-417e-a88a-***",
        "content": "{\"server_message_id\":\"@9VwNxuKKBZ03MXG7M8ooWM791mzu***\"}",
        "log_id": "02172241112209700000000000000000000ffff0a94***",
        "msg_id": "3292f6c3e9fba93e0255fdf12558b0224ca64cbf8d489070857c99***"
}
```

### 5.13 im_message_read（逐字）

```json
{
    "event": "im_message_read",
    "client_key": "ttddf8ab4542c7d76601",
    "from_user_id": "_000f9pF8lTroNtA9pfLjPohf1qIUzLdiWRs",
    "to_user_id": "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
    "content": {
                    "conversation_short_id": "@4F8A0vXKXctkaiPzY485F6f81WSGOvmFOJB3rwivKFMQaPT00HDnemIujgn96zUFraoX3c4RU8SOd4uRCKWmdg==",
                    "index": "1672502407220000",
                     "conversation_type": 1,
                     "read_open_id": "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl"
                 }
}
```

### 5.14 new_video_digg / new_follow_action（逐字）

```json
{
  "event": "new_video_digg",
  "client_key": "awr8bfr64vxgk036",
  "from_user_id": "5adb9d61-b91a-4382-8252-b0cea8793e35",
  "to_user_id": "e3af6e1d-d83a-4116-8f9f-5cb8ac2413c7",
  "content": "{\"action_type\":1,\"action_time\":1686817996,\"item_id\":\"@9VwWjvGUTp9kKW+ma4huFs791WPtO/mAPpx3rg6nL1kRbfn/60zdRmYqig357zEBDoyWkKJYf4Ae9sL0fd9gYw==\"}",
  "log_id": "20230615163316517143EDD4CEF10721B6"
}
```

```json
{
  "event": "new_follow_action",
  "client_key": "awr8bfr64vxgk036",
  "from_user_id": "5bfa0218-477c-4d51-865c-64f0588794a6",
  "to_user_id": "e3af6e1d-d83a-4116-8f9f-5cb8ac2413c7",
  "content": "{\"action_type\":1,\"action_time\":1686811643}",
  "log_id": "202306151447300000000000005369C6D"
}
```

### 5.15 contract_authorize / contract_unauthorize（逐字）

```json
{
    "event": "",       // 事件名为contract_authorize
    "from_user_id": "",// 事件发起用户的open_id
    "client_key": "",  // 事件应用的client_key
    "content": "{\"scopes\":[\"经营Scope\"],\"timestamp\":123456789}" // 用户授权的经营Scope和事件时间戳
}
```

### 5.16 service_market_order（逐字，含 unstringify 后）

```json
{
   "event": "service_market_order",
   "client_key": "awa3utacdjjpxxxx",
   "from_user_id": "c97cdcb3-76a1-433b-92c9-7abc6241xxxx",
   "content": "{\"order_id\":\"701913106392234xxxx\",\"order_event\":1,\"order_snapshot\":{\"order_id\":\"701913106392234xxxx\",\"service_id\":\"7021602203591******\",\"service_name\":\"服务名称\",\"service_mode_id\":\"standard_1\",\"specification_type\":3,\"specification_title\":\"标准版\",\"create_time\":1631850028000,\"order_event_time\":1631850028000},\"purchase_info\":{\"order_id\":\"701913106392234xxxx\",\"service_id\":\"7021602203591******\",\"service_mode_id\":\"standard_1\",\"specification_type\":3,\"effective_time\":1651409686000,\"expire_time\":1651841686602}}",
   "log_id": "2022090211081801013502322010023F26"
 }
 // content unstringfy后
{
    "order_id": "701913106392234xxxx",
    "order_event": 1,
    "order_snapshot": {
        "order_id": "701913106392234xxxx",
        "service_id": "7021602203591******",
        "service_name": "服务名称",
        "service_mode_id": "standard_1",
        "specification_type": 3,
        "specification_title": "标准版",
        "create_time": 1631850028000,
        "order_event_time": 1631850028000
    },
    "purchase_info": {
        "order_id": "701913106392234xxxx",
        "service_id": "7021602203591******",
        "service_mode_id": "standard_1",
        "specification_type": 3,
        "effective_time": 1651409686000,
        "expire_time": 1651841686602
    }
}
```

### 5.17 生活服务订单通知（local-life webhooks 页逐字）

```json
{
  "event": "life_trade_order_notify",
  "client_key": "axxxxxxxxxxxxx",
  "content": "{\"action\": \"pay_success\",\"msg_time\": 1665991178,\"order\": {\"order_id\": \"123\",\"pay_amount\": 1,  \"original_amount\": 1,  \"account_id\": \"123\",\"create_time\": 1665991178,\"pay_time\": 1665991178}}",
  "log_id": "202210101930530102281180650970B5AF"
}
```

### 5.18 企业号线索组件消息（clue 页「Webhook 新增字段」逐字，leads_phone_card 示例节选）

```json
{
        "conversation_short_id": "@9VwDhOCRTcMhM22uc8ptWc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBh7/PnNH674GEk3Xg4tuf3e==",
        "server_message_id": "@9VwDhOCRTcMhM22uc8ptWc790GDoPvCBPpB5oA6lKFEXaPD960zdRmYqig357zEBaz9O5wCBmBjy0YTazvfVqg==",
        "conversation_type": 1,
        "create_time": 1758193500753,
        "message_type": "leads_phone_card",
        "source": "",
        "im_mode": "Unset",
        "leads_phone_card": "{\"title\":\"我\",\"button_text\":\"立即预约\",\"bottom_text\":\"提交即发送抖音绑定手机号\"}",
        "user_infos": [{
                "open_id": "3af6e6e5-6dca-5812-86c4-413fa2440ea2",
                "nick_name": "蓝v婚庆113",
                "avatar": "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143"
        }, {
                "open_id": "2d3201d1-4cf2-4f01-8368-b6f2fb04ac7d",
                "nick_name": "at2201",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_86e8d1ef074079d967ae2833c0d8772e.jpeg?from=3782654143"
        }],
        "group_info": {},
        "index": 1672502400690000
}
```

（外层应再包 `event`/`client_key`/`from_user_id`/`to_user_id` 信封，源页表格仅展示 content 部分。）

### 5.19 小游戏客服消息（msg-push-customer-service 页逐字）

JSON 格式

```json
{
  "ToUserName": "appid",
  "FromUserName": "openid",
  "CreateTime": 1577364225,
  "MsgType": "text",
  "Content": "text content"
}
```

XML 格式

```xml
<xml>
   <ToUserName><![CDATA[appid]]></ToUserName>
   <FromUserName><![CDATA[openid]]></FromUserName>
   <CreateTime>1577364225</CreateTime>
   <MsgType><![CDATA[text]]></MsgType>
   <Content><![CDATA[text content]]></Content>
</xml>
```

（image 类型：`"MsgType": "image", "PicUrl": "this is image url link"`。）

## 6. token / 凭证模型

来源：common-params、get-access-token、refresh-access-token、client-token 页

| 凭证 | 换取方式 | 寿命 | 用途 |
|---|---|---|---|
| client_token | `POST /oauth/client_token/`（JSON：client_key, client_secret, grant_type=`client_credential`） | 7200s（2 小时）；重取旧 token 失效但有 5 分钟缓冲，连续获取只保留最新两个；5 分钟内超 500 次报 10020 | 不需用户授权的接口 |
| access_token | `POST /oauth/access_token/`（**form-urlencoded**：client_key, client_secret, code, grant_type=`authorization_code`） | 15 天（expires_in=1296000）；code 10 分钟有效且只能用一次 | 需用户授权的接口；同时返回 open_id、scope |
| refresh_token | 随 access_token 下发 | 30 天（refresh_expires_in=2592000）；刷新后 access_token 续 15 天但 refresh_token 有效期**不变**；过期报 10010 需重新授权 | 续期 access_token（`POST /oauth/refresh_token/`，form，grant_type=`refresh_token`） |
| open_id | 随 access_token 下发 | — | 授权用户唯一标识；webhook 的 from_user_id/to_user_id 即 open_id |
| client_key / client_secret | 控制台-应用信息-应用基础信息 | — | 应用标识与密钥；client_secret 同时是 webhook 验签 key 与生活服务 AES 密钥原料 |

- API 域：`https://open.douyin.com/`
- 调用侧凭证传递（来自 clue 页发送组件消息接口，待复核页内锚点 2026-09-10 注）：Header `access-token: <token>` + Query `open_id=<...>`；client_token 类接口同理（各 API 文档单列）
- 用户可在抖音 App「我-设置-账号与安全-授权管理」取消授权，取消后 access_token 立即失效；平台会定期清理不合规授权
- 关键错误码：10002 参数错误、10003/10013 key/secret 错误、10007 code 过期、10010 refresh_token 过期、10014 client_key 不匹配、10020 client_token 频控
- 注意：dop webhook 事件推送本身**不携带/不需要 token**，验签只用 client_secret + body

### 6.1 发送私信消息接口专章（2026-10-14 补证，send-message 页逐字）

来源：mini-app 树 `reach-marketing/instant-message/private-message/send-message` 页（新版主动私信接口）。curl 直抓 SSR，Quill delta 抽取逐字；该页 JSON 样例含尾逗号（官方一贯坑，见 §5.5）

- HTTP URL：`https://open.douyin.com/im/send/msg/`（**path 末尾带 `/`**，FAQ 明确末尾斜杠影响路由命中）；Method：POST；Query：`open_id=<发送方 open_id>`（curl 示例 `?open_id=aa-aa-aa`）；Header：`Content-Type: application/json` + `access-token: act.<...>`
- Scope：`im.direct_message`（需用户授权）；若发送用户公开视频还需 `ma.item.data`（需申请权限 + 用户授权）。发送方需认证企业号及其员工号、小程序品牌号或员工号身份，且小程序通过试运营期、已在后台申请发送私信能力
- 请求体（场景一/二单条形态）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| scene | string | 场景一可选，场景二~四必传 | 场景一 `im_reply_msg`（回复私信，默认）；场景二 `im_enter_direct_msg`（用户进私）；场景三 `im_b2b_direct_message`（B2B 触达）；场景四 `im_authorize_message`（主动私信持续触达） |
| content | struct | 场景一/二必传 | 消息体，见下方 content 构造 |
| content_list | []struct | 场景三/四必传 | 最多 3 条，场景三必须含 1 条小程序卡片 |
| msg_id | string | 场景一/二必传 | 来源：接收私信消息事件 webhook 的 `content.server_message_id`（**有效期 24 小时**）；进私事件同字段同时效 |
| conversation_id | string | 场景一/二必传 | 来源：webhook 的 `content.conversation_short_id`（**长期有效**） |
| to_user_id | string | 是 | 消息接收方 open_id（即私信对端的访客 open_id） |

- content 构造（msgType 对照，补全 §2.2 发送侧表）：文本 `{"msg_type":1,"text":{"text":"你好"}}`（text ≤1000 字、不可含外部 http 超链接）；图片 `{"msg_type":2,"image":{"media_id":"@..."}}`（media_id 来自图片上传接口的 image_id）；视频 `{"msg_type":3,"video":{"item_id":"@..."}}`（只能发用户自己的公开视频，发布者 uid 要与 OpenID 相同）；群邀请 `msg_type:9` group_invitation；小程序引导卡片 `msg_type:10` applet_card；小程序券 `msg_type:11` applet_coupon；主动私信授权卡片 `msg_type:12` auth_private_message_card；问题引导卡（发消息）`msg_type:204`、（发链接）`msg_type:205`
- 场景一规则（逐字要点）：需订阅「接收私信消息事件」并从 webhook 解析 msg_id（24 小时时效）；「仅支持消息回复，在用户未发送下一条消息前，24 小时内可向用户发送 6 条消息」；最新规则以抖音 app 内发送消息为准。场景二：收到进私 webhook 后 30 秒内调用，每条 webhook 最多调用 3 次，两次回复间隔需 >1 小时
- 成功响应（场景一，逐字）

```json
{
        "extra": {
                "description": "",
                "sub_error_code": 0,
                "sub_description": "",
                "now": 1648797449,
                "logid": "021648797449846fd1b1111000700600000000000000086dfb920",
                "error_code": 0
        },
        "data": {
                "error_code": 0,
                "description": ""
        },
        "msg_id": "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjU=="
}
```

  成功判据 `data.error_code = 0`；渠道消息标识取响应顶层 `msg_id`（「消息ID，传入content时返回」；传 content_list 时改返回 `msg_list` 数组，新版还放量 `all_send_success`/`send_msg_status_list`，官方注明逐步放量中、不应依赖）
- 主要错误（HTTP 状态码恒 200，错误在 body；逐字摘录）：2100005 参数不合法；2190001 quota 已用完（免费额度每日 8 点刷新）；2190002 access_token 无效；2190008 access_token 过期；**2190015 请求参数 access_token openid 不匹配**（token 与 query open_id 必须同一授权用户）；28001005 系统内部错误；28001038 content/msg_id/conversation_id 参数不合法（含「msg_id 为空/无效」「conversation_id 为空/无效」「主动私信场景最多发送三条消息」）；28003080 消息已过期（「传入正确的 msg_id 或在收到进私事件后 30s 内调用」）；28003081 上条消息已超 24 小时无法回复；28003082 消息对象不匹配（发送/接收方与 open_id、to_user_id 不匹配）；28029006 用户未授权应用发送主动私信；28003070 超出频控；28029030/28029031 全部/部分消息发送失败（看 send_msg_status_list）
- **凭证类别结论**：本接口是用户授权类接口——query `open_id` 必须与 `access-token` 的授权用户匹配（2190015/28001003 语义，FAQ「在需要授权的接口中传入 client_token 或反之都会出现此报错」）；client_token（应用身份）**不可**用于发送私信。页面另有「通过 BusinessToken 进行调用（示例 `bus_act.<...>`）」的调用形态（B 端经营 Token，`biz_refresh_token` 30 天，经 `/oauth/refresh_biz_token/` 续期，FAQ 页逐字），为 B 端经营者场景的替代凭证；本票按 §6 用户授权链路实施（refresh_token 续期 access_token），BusinessToken 留作后续票评估
- 实施侧结论（#118）：channel_info 仅靠 clientKey/clientSecret **无法**换取发送凭证（access_token 需用户授权 code，10 分钟一次性），票面「access_token/refresh_token 由 clientKey/clientSecret 换取」的前提经本专章证伪；实施以 channel_info 可选 `refreshToken`（§6 用户授权 refresh_token，运营侧完成用户授权后录入，30 天有效期且刷新不续自身）承载数据面授权。回复三要素（msg_id/conversation_id/发送方 open_id）均来自入站 webhook：server_message_id 与 conversation_short_id 只存在于消息载荷，发送方 open_id 即信封 `to_user_id`，由渠道适配器在入站落库时随消息留存、发送时取访客最近一封来信组装

### 6.2 入站媒体与下载能力核查（2026-10-14 补证）

- 图片/本地图片（image/user_local_image）：官方黄金样本（§5.7）content 仅含 conversation_short_id / server_message_id / conversation_type / create_time / message_type / index，**不含任何素材标识或 URL**；站内（含 BFF 搜索）未检出到「私信图片下载」类接口 → 入站私信图片无官方读取通道
- 表情（emoji）：带 `resource_url`（可空串）+ resource_width/height（§5.6）；非空时为抖音 CDN 直链，可直接 GET 取字节（无需凭证）；空串则无素材可读
- 视频分享（video）：带 `item_id`（@-加密串，§5.8）；开放平台视频接口族（/video/list/、/video/data/ 等）面向**授权账号本人的视频**（发送文档明确「视频发布者 uid 要与 OpenID 相同」「只能发送用户自己的公开视频」），访客分享的他人视频 item_id 无公开下载接口 → 不可读
- 实施侧结论（#118）：入站媒体可读范围 = emoji 的非空 resource_url 直链下载；图片类无标识（统一消息体按既有先例以「消息 ID:媒体下标」派生稳定标识落库，读取时如实返回「无素材标识/无下载接口」）、视频类如实返回「无公开下载接口」。媒体下载接口专章核查完毕：**官方不存在 dop IM 私信入站媒体的通用下载接口**，票面「媒体下载接口专章未收录，实施时补证」到此收口

## 7. 待核验清单（均标：待核验(09-27)）

1. **服务商 MsgSignature 精确算法**：文档只说「根据 TOKEN、Nonce、TimeStamp、Encrypt 获取签名」，sha1 的拼接顺序（是否字典序）在官方示例代码包（java/php/go）里，本次未能下载 → 待核验(09-27)。来源页：thirdparty encryption
2. **服务商 Encrypt 的 AES 参数**（模式/填充/key 长度/编码，MsgDecrypt 实现）：同样在示例代码包内 → 待核验(09-27)
3. **dop 群聊事件 content 明细**（im_group_receive_msg / im_group_send_msg / enter_group_audit_change / group_fans_event）：事件列表只给空 `{}`，站内未搜到字段表 → 待核验(09-27)
4. **抖音客服平台（新）推送协议**：小游戏「消息推送客服」体系 2025-06-30 关闭迁移至「抖音客服平台」，新平台文档已定位（`https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push/douyin-microgame-im-guide`，2026-09-10 复核在 msg-push-config-guide 左侧导航发现），待抓全文核验 → 待核验(09-27)
5. **event/status/update 的 HTTP method**：已确认官方矛盾（2026-09-10 双页复核：event-list 内联表为 GET，专页为 POST）→ 做模拟器时按 POST 实现并注明
6. **IM 文本示例中 conversation_type=2 与字段表「1：私聊」的矛盾**：原文如此，群聊是否=2 无官方字段表佐证 → 待核验(09-27)
7. **dop 树「私信能力」正式文档页**：企业号线索私信正式页即 clue-component-open（PR 2024112059215，已定位）；mobile-web-app「私信/群管理能力」目录页仍未定位 → 待核验(09-27)
8. **抖音云专线推送**（interaction 树 danmu-callback 等）：本次未盘 → 待核验(09-27)
9. **webhook 响应体要求（dop）**：summarize 页只说 5s 断开+重试 3 次，未明确响应体格式（生活服务明确「响应内容可以为空」）；dop 是否要求返回特定 body → 待核验(09-27)
10. **小程序树订阅消息推送事件**（subscribe-feedcard-webhook、subscription-status-push-event）：本次未抓全文 → 待核验(09-27)

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟「抖音推 IM 私信给回调」：POST JSON 信封 `{event, from_user_id, to_user_id, client_key, content, log_id}`，头 `X-Douyin-Signature: sha1hex(client_secret + body)`、`Msg-Id: <uuid>`、`Content-Type: application/json`
- 模拟首次配置校验：POST `{"event":"verify_webhook","client_key":"","content":{"challenge":<数字>}}`，期望响应 text 格式 `{"challenge":<同值>}`
- ID 形态：open_id 为 uuid 风格（`5adb9d61-b91a-...`）或 `_000` 前缀风格；会话/消息/视频 ID 均为 `@` 开头的加密 base64 串（`@9Vw...==`）；log_id 为 `202306151447300000000000005369C6D` 风格十六进制串；create_time 13 位毫秒
- 重试语义：连接 5s 断开（dop）/响应超 2.5s 判失败（生活服务），共重试 3 次；同一 Msg-Id 可重复推送，消费方需幂等
