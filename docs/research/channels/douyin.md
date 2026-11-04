# 抖音开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch（内置）+ curl 直抓 SSR HTML（正文内嵌于服务端渲染 DOM，用脚本抽取逐字文本）
> 站内搜索引擎为 JS 空壳，改走其文档 BFF 搜索接口发现页面：`POST https://developer.open-douyin.com/bff_api_v2/platform/helpCenter/OpenPlatformSearchService/searchDoc`，body `{"Keyword": "...", "PageNo": 1, "PageSize": 15}`
> mcp webReader 配额耗尽（2026-09-27 恢复），本次未使用。所有事实标注来源 URL；示例载荷逐字保留

## 1. 官方文档入口与关键页面

- 门户首页：https://developer.open-douyin.com/
- 文档根：https://developer.open-douyin.com/docs/resource/zh-CN/（多棵文档树共存：`dop` 移动/网站应用、`mini-app` 小程序、`mini-game` 小游戏、`local-life` 生活服务、`thirdparty` 服务商；`interaction` 直播玩法树与 `developer` 树下的抖音云文档已于 2026-11-03 补摄，见 §8.1、§8.8；另有 `live-interactive-tools` 互动工具树、`ai-avatar` 数字人树未深入采样）
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
| investment_franchise_card | 23 | 招商加盟卡 |
| post_sale_order_card | 24 | 售后订单卡 |
| phone_collection_card | 25 | 电话收集卡 |
| enterprise_wechat_card | -（发送侧 msg_type=40） | 企业微信卡 |
| product | - | 团购商品 |
| notice | - | 系统提示（如智能客服介入接待） |
| question_list | - | 问题列表（快捷引导提问） |
| applet_card | 10 | 小程序引导卡片（发送侧） |
| text / image | 1 / 2 | 文本 / 图片（发送侧；content 构造 §6.1 已复核，2026-09-10 待补抓项就此关闭） |

v1.0.5（页面 updateTime 2026-06-16）新增上表 investment_franchise_card 至 question_list 七类推送，组件 id 位于 content 顶层 `component_id`（字符串）与 `component_status`（int，1-生效）；带组件 id 的有 premium_online_appointment_card / lead_commodity_card / poi_card / investment_franchise_card / phone_collection_card，无组件 id 的有 leads_phone_card / post_sale_order_card / product / notice / question_list（enterprise_wechat_card 样本未见，见 §5.18）。各组件配置串为 content 内同名子字段的 JSON 字符串：`marketing_tool`（高级在线预约）、`life_leads_tool`（线索商品）、`life_poi`（门店/POI）、`common_content`（企业微信卡），逐字样本见 §5.18；发送侧组件 content 构造与 component_type 对照见 §6.1。数值 23/24/25/40 经 2026-11-04 webReader 全文确认；2026-11-05 curl 直抓 SSR 复核（页面已更新至 v1.0.6，解码接口章节编号 2.31→2.40，推送对照未变）。同日晚间复查：`dop/develop/cloud/clue-component` 镜像 URL 已改回约 942KB SPA 壳页（SSR 正文不下发），SSR 锚点迁至正式页 `dop/ability/enterprise-account-open-ability/leads-b2c-im-ability/clue-component-open`（5489562 字节，v1.0.1–v1.0.6 无 v1.0.7，2.40 与 scope 均在页）；BFF 以 `get_decode_msg_content` 检索可达该页（updateTime 2026-06-16，对应 v1.0.5 时刻，BFF 索引滞后于页内 v1.0.6 实况，复查以直抓正式页为准）

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
- 复核 2026-11-05：event-list 页两接口仅 Method/HTTP request 表格，无请求参数、响应结构、鉴权方式与错误码任何细节；「无参数不需授权」与定位应用身份矛盾（无法解释服务端据何 client_key 返回）。契约不足，订阅状态检查不实施——漏订阅的兜底维持 Console 渠道说明提示人工在平台后台订阅
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

### 5.18.1 高级在线预约（v1.0.5 页逐字，2026-11-05 curl 直抓 SSR；注意顶层 `component_id`/`component_status`）

```json
{
        "conversation_short_id": "@9VwP3OXCWZloOCf2aN0yVc790GDoPvGAOJdxqQulLFQQavj960zdRmYqig357zEBnE3oJ9maDzmhMGf0vZL3/A==",
        "server_message_id": "@9VwP3OXCWZloOCf2aN0yVc790GDoPvJ12qgyjJ1IRbPX160zdRmYqig357zEBuujSkOT1XIsJ0i68fSZWfg==",
        "conversation_type": 1,
        "create_time": 1758195553589,
        "message_type": "premium_online_appointment_card",
        "source": "",
        "im_mode": "Unset",
        //type MarketingTool struct {
        //  //组件类型，45-高级在线预约
        //  LinkType int32 `json:"link_type"`
        //  //头图
        //  TitleImage string `json:"title_image"`
        //  //创建时间，单位：秒
        //  CreateTime int64 `json:"create_time"`
        //  //组件id
        //  ComponentId int64 `json:"component_id"`
        //  //标题
        //  Title string `json:"title"`
        //  //副标题
        //  SubTitle string `json:"sub_title"`
        //}
        "marketing_tool": "{\"link_type\":45,\"title_image\":\"https://p3-saiyan-sign.byteimg.com/aweme-saiyan-private/cv6349bc77u8vqee6ni0~tplv-k9qcquo31z-2000.image?lk3s=e44e97a5\\u0026x-expires=1758799992\\u0026x-signature=WSwv2ejiu7ONtuvleKy1DYFeRMI%3D\",\"create_time\":1662599423,\"component_id\":7140809997826394892,\"title\":\"点击一键领取价格表⬇️⬇️⬇️\",\"sub_title\":\"\"}",
        "user_infos": [{
                "open_id": "_000eVUpyINiqc4u9CMfAce9GgR3Aj6yI9Cn",
                "nick_name": "深圳广深驾校总部",
                "avatar": "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-hf2m9xxmck_c9102a1f1b3a4f259e87182d921f4a76.jpeg?from=3782654143"
        }, {
                "open_id": "_000DpaOwJdpwJNe-cCMmZGHiTrOZtXjgwyE",
                "nick_name": "毛士祥",
                "avatar": "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_88318e131bcc41efb41713fd4a29fa20.jpeg?from=3782654143"
        }],
        "group_info": {},
        "component_id": "7140809997826394892",
        "component_status": 1,
        "index": 1672502400010000
}
```

注意两点：组件 id 在 content 顶层是 `component_id`（字符串形态），而 marketing_tool 配置串内同名 `component_id` 是数字形态；title_image 为带签名的临时直链（x-expires 2026-09-25 已过期形态），不可作为长期素材 URL

### 5.18.2 企业微信卡（v1.0.5 新增，逐字）

```json
{
        "conversation_short_id": "@9VwIwfmRWdMjN3X3ZYsqVc790WbtOf2KP5B1qAqhJlAXafb160zdRmYqig357zEBKEl8QmyYXAVwecSjKkRWPQ==",
        "server_message_id": "@9VwIwfmRWdMjN3X3ZYsqVc7902frNfCKMpR4qQqmLVIUaPH560zdRmYqig357zEBKTWcn+lDsk6by5mv/nS+SQ==",
        "conversation_type": 1,
        "create_time": 1774842138939,
        "message_type": "enterprise_wechat_card",
        "source": "",
        "im_mode": "Unset",
        //type WechatCACardCommonContent struct {
        //  Type           string `json:"type"`
        //  EnterpriseName string `json:"enterprise_name"`
        //  CompanyName    string `json:"company_name"`
        //  Tag            string `json:"tag"`
        //  ButtonText     string `json:"button_text"`
        //}
        "common_content": "{\"type\":\"wechat_ca_card\",\"enterprise_name\":\"蓝v婚庆113\",\"company_name\":\"企业号经营\",\"tag\":\"提供专属优质服务\",\"button_text\":\"添加企业微信\"}",
        "user_infos": [{
                "open_id": "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
                "nick_name": "蓝v婚庆113",
                "avatar": "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143"
        }, {
                "open_id": "b9b71865-7fea-44cc-8636-727e89f72be9",
                "nick_name": "at2201",
                "avatar": "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143"
        }],
        "group_info": {},
        "index": 1672502433310000
}
```

配置串字段名不是同名子字段而是 `common_content`；样本无顶层 component_id（企业微信卡组件 id 有无以真实推送为准）；user_infos 两条为企业号与访客

### 5.18.3 团购商品（v1.0.5 新增，逐字）

```json
{
        "conversation_short_id": "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
        "server_message_id": "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCFMp1zrwuhLVcWaPj960zdRmYqig357zEBsmKVz6Ai3uFZVYq0Ku15yQ==",
        "conversation_type": 1,
        "create_time": 1758194529895,
        "message_type": "product",
        "source": "",
        "im_mode": "Unset",
        //type Product struct {
        //  // 商品ID
        //  ProductId *int64 `json:"product_id,omitempty"`
        //  // 商品名称
        //  ProductName *string `json:"product_name,omitempty"`
        //  // 商品图片链接
        //  ImageUrl *string `json:"image_url,omitempty"`
        //  // 应付价
        //  ActualAmount *int64 `json:"actual_amount,omitempty"`
        //  // 已售量
        //  SoldQty *int64 `json:"sold_qty,omitempty"`
        //  // 商品详情页链接
        //  ProductUrl *string `json:"product_url,omitempty"`
        //  // 商品图片uri
        //  ImageUri *string `json:"image_uri,omitempty"`
        //  // 来客pc商品详情页链接
        //  PcProductUrl *string `json:"pc_product_url,omitempty"`
        //  //  原价
        //  OriginAmount *int64 `json:"origin_amount,omitempty"`
        //  //  折扣
        //  DiscountDesc *string `json:"discount_desc,omitempty"`
        //  // 实际价格后缀 "起"
        //  ActualAmountSuffix *string `json:"actual_amount_suffix,omitempty"`
        //  // 商品类型描述 日历房
        //  ProductTypeDesc *string `json:"product_type_desc,omitempty"`
        //  // 商品品类
        //  ProductCategory *string `json:"product_category,omitempty"`
        //  // 出行人数 （xx 成人 xx 个儿童）
        //  TravelerNum *string `json:"traveler_num,omitempty"`
        //}
        "product": "{\"product_id\":1792588596209674,\"product_name\":\"欢聚|清汤1份2人餐\",\"image_url\":\"https://p9-sign.douyinpic.com/tos-cn-i-hf2m9xxmck/c72a14d204bc4a47b91bc5c62304aff6~noop.jpeg?lk3s=4a7c4021\\u0026x-expires=1758214800\\u0026x-signature=qxVIgkngwMn%2BSa0IsIv4JaUCOLw%3D\\u0026from=1249656865\",\"actual_amount\":100,\"sold_qty\":6,\"product_url\":\"aweme://poi/goodsdetail/?hide_own_nav_bar=1&activity_id=1792588596209674&enter_from=local_life_im&detail_enter_page=local_life_im&is_life_poi=1&detail_enter_method=card\",\"image_uri\":\"tos-cn-i-hf2m9xxmck/c72a14d204bc4a47b91bc5c62304aff6\",\"pc_product_url\":\"\",\"origin_amount\":1500}",
        "user_infos": [{
                "open_id": "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
                "nick_name": "蓝v婚庆113",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143"
        }, {
                "open_id": "b9b71865-7fea-44cc-8636-727e89f72be9",
                "nick_name": "at2201",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143"
        }],
        "group_info": {},
        "index": 1672502400810000
}
```

价格字段为分（actual_amount 100 = 1 元，origin_amount 1500 = 15 元）；product_url 是 aweme:// scheme 的 App 内跳转链接（非 http，不可当外链素材用）；image_url 为签名临时直链；无顶层 component_id

### 5.18.4 系统提示（v1.0.5 新增，逐字）

```json
{
        "conversation_short_id": "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
        "server_message_id": "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCEPpdyoAmiLFUXafP/60zdRmYqig357zEBRa5mCKbBH8coTKGmZKJ++A==",
        "conversation_type": 1,
        "create_time": 1758194191506,
        "message_type": "notice",
        "source": "",
        "im_mode": "Unset",
        //type Notice struct {
        //  // 内容
        //  Tips *string `json:"tips,omitempty"`
        //  // 通知详情
        //  PushDetail *string `json:"push_detail,omitempty"`
        //}
        "notice": "{\"tips\":\"回复超时，智能客服介入接待（您可以在“人工客服设置-接待不及时设置”中调整配置） {{1}}\",\"push_detail\":\"\"}",
        "user_infos": [{
                "open_id": "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
                "nick_name": "蓝v婚庆113",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143"
        }, {
                "open_id": "b9b71865-7fea-44cc-8636-727e89f72be9",
                "nick_name": "at2201",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143"
        }],
        "group_info": {},
        "index": 1672502400750000
}
```

tips 示例是「回复超时，智能客服介入接待」的系统提示，`{{1}}` 为占位符；notice 是平台系统消息而非访客输入，样本未含信封（from_user_id 归属无法确证），实现按 unknown + 渠道原因说明处理（见 DouyinProtocol）

### 5.18.5 问题列表（v1.0.5 新增，逐字）

```json
{
        "conversation_short_id": "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
        "server_message_id": "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCEPpZ2qwmvKlARaPL160zdRmYqig357zEBTLO2+Id3h22GEtDgzAsOtQ==",
        "conversation_type": 1,
        "create_time": 1758194195199,
        "message_type": "question_list",
        "source": "",
        "im_mode": "Unset",
        //type QuestionList struct {
        //  // 标题
        //  Title *string `json:"title,omitempty"`
        //  // 问题
        //  Questions []string `json:"questions,omitempty"`
        //}
        "question_list": "{\"title\":\"好的亲，请问您家房子是在【哪个城市】呢？给您安排附近门店。\",\"questions\":[\"北京\",\"上海\",\"深圳\",\"广州\",\"杭州\",\"南京\",\"成都\",\"其他城市\"]}",
        "user_infos": [{
                "open_id": "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
                "nick_name": "蓝v婚庆113",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143"
        }, {
                "open_id": "b9b71865-7fea-44cc-8636-727e89f72be9",
                "nick_name": "at2201",
                "avatar": "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143"
        }],
        "group_info": {},
        "index": 1672502400770000
}
```

对应「快捷引导」能力（2.20-2.23 接口族配置），企业号向访客发出的选项列表；无顶层 component_id

其余三类新推送无官方样本：investment_franchise_card（招商加盟卡）、post_sale_order_card（售后订单卡，无组件 id）、phone_collection_card（电话收集卡，有组件 id）——字段结构以字段表为准（同页组件消息参数表），2026-11-05 抓取时表格矩阵在 SSR 数据中交错无法逐行重组，实现按 card(kind) 保守映射

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
| channel | int | 否 | v1.0.5 新增（clue 页发送示例出现）：1-人工发送 2-智能（机器人）发送 3-自动消息 |

- 组件消息 content 构造（clue 页 v1.0.5 逐字）：`{"msg_type": {$msg_type}, "general_msg_content": {"component_type": {$component_type}, "component_id": {$component_id}}}`；component_type 对照（同页注释逐字，component_id 语义随类型不同）

| component_type | 组件 | component_id 取值 |
|---|---|---|
| 1 | 高级在线预约 | 高级在线预约组件 id |
| 2 | 线索商品卡 | 线索商品 id |
| 3 | 招商加盟卡 | 招商加盟商品 id |
| 4 | 售后订单卡 | 固定 0 |
| 5 | 门店 / POI 卡 | 生服 poiId |
| 6 | 电话收集卡 | 创编卡片 id |
| 8 | 一键收集电话 | 0；自定义文案时传入「自定义一键收集电话」接口的 reply_id（附加参数 `leads_card_text` 值 `true`），不传即系统默认文案 |
| 12 | 企业微信卡 | 企业微信卡 id |

- 发送「一键收集电话」curl 逐字要点（clue 页 3.2 示例）：`content` 为 `{"msg_type": 20, "general_msg_content": {"component_type": 8, "component_id": 0}}`（另一变体 component_id 为查询到的配置 id），`scene` 官方示例原文拼写为 `im_replay_msg`（与字段表 `im_reply_msg` 拼写不一致，照录；以字段表为准实现），`channel` 1；响应形态同上文成功响应（顶层返回 msg_id）。自动回复/快捷回复配置类接口另有组件形态 `{"type": 7, "component": {"component_type": "industry_advanced_online_reserve", "component_id": "7441118309736614707"}}`（字符串枚举体系，与私信发送数字枚举不同，勿混用）

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
- **2026-11-03 复核注**：上文「官方不存在通用下载接口」结论被推翻——`GetIMMessageResource`（GET `/api/im/message/resources/`，scope `im.multimedia_message`）即为本地图片/视频消息的官方读取通道，user_local_image/user_local_video 专用，详见 §8.4；emoji 直链外的 image/video（分享类）仍无读取通道

### 6.3 私信消息解码接口（2026-11-05 补证，clue 页 v1.0.5+）

- HTTP：POST `https://open.douyin.com/api/enterprise/v1/im/get_decode_msg_content/`（页面章节编号 2.31，v1.0.6 期已挪至 2.40）；Scope：`im.leads_message_decode`（2026-11-04 webReader 全文确认，2026-11-05 SSR 复核 scope 与 URL 在页）
- 能力说明（逐字）：「留资相关信息回脱敏推送给开发者，该接口用于查看留资相关信息脱敏后的抖音私信消息」——即 leads_phone_card 类留资消息推送时手机号等内容已脱敏，凭 msg_id + conversation_id 调本接口换回明文
- 入参：`msg_id`（必填，即 webhook content.server_message_id）、`conversation_id`（必填，即 content.conversation_short_id）、`guest_uid`（可选，访客 open_id）；响应 `data.content` 为解码后内容（官方示例 "1234567890" 手机号形态）
- 实施判定：**暂不接入**。理由：其一需另行申请 `im.leads_message_decode` scope 且要真实凭据联调；其二「哪些推送消息属于脱敏消息」官方无识别特征说明，无法对入站消息选择性地安全触发解码调用；当前 leads_phone_card 推送本体不携带脱敏手机号文本，映射 card 无信息损失。留待真实账号联调阶段（§7 第 11 项）评估

## 7. 待核验清单（关闭项就地改写为结论并注明日期）

1. **服务商 MsgSignature 精确算法**：**已核验（2026-11-03 关闭）**——官方示例代码包 demo.zip 已从 encryption 页下载并解析，算法 = sha1(字典序排序【TOKEN, TimeStamp, Nonce, Encrypt】后直接拼接) hex 小写，java/go/php 三语实现一致；包地址与逐字实现见 §8.7
2. **服务商 Encrypt 的 AES 参数**（模式/填充/key 长度/编码，MsgDecrypt 实现）：**已核验（2026-11-03 关闭）**——AES-256-CBC/NoPadding，43 字符 base64 EncodingAesKey 补 `=` 解码为 32 字节 key、IV=key 前 16 字节，明文 = 32 字节随机前缀 + 4 字节大端长度 + 消息体 + appid 尾；官方包内 Go 版实现与 Java/PHP 相矛盾（IV 取密文前 16 字节、前缀按 16 字节），逐字照录见 §8.7，实施按 Java/PHP（2/3 样本一致）
3. **dop 群聊事件 content 明细**（im_group_receive_msg / im_group_send_msg / enter_group_audit_change / group_fans_event）：**已核验（2026-11-03 关闭）**——四个事件专页均已抓全文，字段表与示例见 §8.5
4. **抖音客服平台（新）推送协议**：**已核验（2026-11-03 关闭）**——指引与两个回复 API、凭证接口全文已抓，协议完整记录见 §8.2；遗留小项「是否需额外开通资格」亦已关闭（2026-11-03）：运营页 bytehi-im 全文无任何独立准入条款，开通 = 小游戏内客服组件（`tt.openCustomerServiceConversation({type:3})`）+ 后台「客服」开关 + 添加客服角色，详见 §8.2 资格收口
5. **event/status/update 的 HTTP method**：已确认官方矛盾（2026-09-10 双页复核：event-list 内联表为 GET，专页为 POST）→ 做模拟器时按 POST 实现并注明
6. **IM 文本示例中 conversation_type=2 与字段表「1：私聊」的矛盾**：**已核验（2026-11-03 关闭）**——群消息页字段表明确 `conversation_type`（2：群聊），私信页字段表明确（1：私聊），语义定案 1=私聊、2=群聊；§5.5 示例值 2 系官方示例笔误，现版页面（saved 2025-11-17）仍未改正，模拟器按字段表实现
7. **dop 树「私信能力」正式文档页**：**已核验（2026-11-03 关闭）**——企业号线索私信正式页即 clue-component-open（不变）；「mobile-web-app『私信/群管理能力』目录页」经 BFF 搜索复核：该标题只存在于社区问答帖（DocType 4，无文档路径），正式文档树中不存在同名单独目录页；实际承担目录职能的是 mini-app 树概述页「小程序私信、群聊能力概述」（private-and-group-message，全量能力矩阵表含 scope 与开通前提，见 §8.11）与 dop 树 OpenAPI 目录 `search-management`（group-chat 群管理 API + business-tool 消息资源工具 API）；apiMeta 页内引用的 `dop/develop/openapi/interaction-management/*` 路径现版为死链（照录，2026-11-03 实测 404）
8. **抖音云专线推送**（interaction 树 danmu-callback 等）：**已核验（2026-11-03 关闭）**——interaction 树已盘：即直播玩法（弹幕玩法）文档树，消息型回调存在 = 直播间互动数据推送（评论/点赞/礼物/粉丝团），x-signature（md5+base64，体系 B 同族加 x-roomid）HTTP 回调 + 抖音云内网专线两种送达；danmu-callback 文档实体在 developer 树 `developer/tools/cloud/.../danmu-callback`；推送协议全量记录见 §8.8；属直播互动数据非客服会话消息，与 dop 私信体系不相通
9. **webhook 响应体要求（dop）**：**部分关闭（2026-11-03 扩检）**——已复核 mini-app webhook 教程与「抖音 IM 客服私信」页，全站均仅规定握手响应（challenge 放入 ResponseBody、text 格式 json），业务事件的响应体无任何官方条文，重试判定只看连接/响应时长（dop 5s、生活服务 2.5s）；实施按 HTTP 200、body 任意即可（建议空体或 `{}`）。保留注：不能排除存在未采样页面，但 dop/mini-app/local-life 三树主文档已一致沉默。（2026-11-03 二次复核：三个推送事件页统一引用的 mini-app webhook 概述页 `/mini-app/develop/guide/open-capabilities/webhook/` 实为 301 → `/mini-app/develop/tutorial/basic-ability/webhook` 即本项已复核教程页，无新增条款；mini-game 树体系 B 的业务响应体规范在 §8.2——`{"success":true}`/`{"success":false,err_code,reason}`，仅适用于客服平台推送）
10. **小程序树订阅消息推送事件**（subscribe-feedcard-webhook、subscription-status-push-event）：**已核验（2026-11-03 关闭）**——两页全文已抓（正式目录为 `mini-app/develop/server/reach-marketing/subscribe-notification/`）：`user_subscribe_action`（订阅动作，content 为 json 串，subscribe_action 1-一次性订阅/2-长期订阅/3-长期拒绝/4-一次性拒绝）与 `user_auth_subscribe_card_notification`（订阅异形卡授权成功，仅开放一次性订阅类型）；均为订阅关系状态事件、非消息型回调，字段表与逐字示例见 §8.9
11. **leads_phone_card 留资手机号的送达路径**（访客提交手机号后开发者如何拿到明文）：**已核验（2026-11-05 关闭，v1.0.5）**——推送侧 leads_phone_card 消息本身不含手机号；明文经私信消息解码接口 `get_decode_msg_content`（scope `im.leads_message_decode`，msg_id + conversation_id 换回 data.content）获取，接口事实与暂不接入判定见 §6.3

## 8. 补摄：developer 树与客服平台（2026-11-03）

方法补注：正文取自 SSR HTML 内嵌的 `_ROUTER_DATA.loaderData['zh-CN/$'].data.content` zone JSON——根 zone `t/0` 的 ops 定文档顺序；`aceTable` 属性挂表格（值为 `R zone id + C zone id`，R zone 按行、C zone 按列，单元格 zone key 为 `x{rowId}x{colId}`）；`type=codeblock` 的 attributes.zoneId 挂代码块 zone。apiMeta iframe 型 API 页（正文 wc=0、content 只有一个 iframe 属性）的**完整结构化接口定义直接内嵌在 `_ROUTER_DATA.loaderData['zh-CN/$'].data.openApiMeta`**（含 ReqSchema/RespSchema/ErrCodeList/Token/PermissionInfo/三语 SDK 示例），2026-11-03 起优先读此字段，无需走 BFF；`getNodeIdByPath` 对 `docs/resource/zh-CN/...` 前缀路径现返回空 NodeId（复核 2026-11-03）。BFF 搜索中文关键词已恢复命中（`私信`/`弹幕回调`/`客服平台`/`图片上传` 均出结果）——2026-09 与 2026-11-03 上午「中文一律空结果」的结论过期，搜索优先用中文标题词，英文仅协议标识符可搜

### 8.1 developer 树盘点：平台介绍/入驻/规范/工具文档，无任何推送协议

- overview：https://developer.open-douyin.com/docs/resource/zh-CN/developer/introduction/overview （标题「开发者平台概述」，saved 2026-02-02）。正文：平台简介（「两种开放模式：能力开放和行业开放」——能力开放=抖音号/头条号运营能力+小程序的担保支付、客服管理、订阅消息等；行业开放=到店餐饮、机酒旅、泛知识等行业解决方案）、开发者类型（自营开发者/综合类平台开发者）、平台优势、社群入口。纯介绍页
- 子页面清单（本次全部抓到标题；除 overview 外未逐字展开）：

| 标题 | saved | URL（`.../docs/resource/zh-CN/` 后路径） |
|---|---|---|
| 平台简介（开发者平台概述） | 2026-02-02 | developer/introduction/overview |
| 应用概述 | 2025-08-12 | developer/introduction/apps |
| 角色概述 | 2025-10-11 | developer/introduction/type-and-permission |
| 开发者积分介绍 | 2024-11-05 | developer/introduction/points-intro |
| 抖音开放平台升级（迁移）指引 | 2025-11-25 | developer/introduction/transfer |
| 能力实验室概述 | 2024-07-24 | developer/introduction/Capability-Lab-Overview |
| 开发者工具 IDE | 2025-03-13 | developer/tools/dev-tools-ide/ide |
| 开发者平台入驻操作概览 | 2025-03-17 | developer/join/overview |
| 抖音开放平台运营规范 | 2025-06-06 | developer/operation-norm/operation-standard |
| 联系我们 | 2026-02-02 | developer/faq/contact |

- 结论：developer 树不含新的 IM/私信/客服推送体系。抖音系推送体系仍是 §2 四套，加上本次确认的两支：**抖音客服平台**（§8.2，物理位置在 mini-game 树）与小程序「抖音 IM 客服私信」内测变体（§8.3，mini-app 树 open-capacity 目录）

### 8.2 抖音客服平台：小游戏客服消息推送（§7.4 迁移落点全貌）

来源（均 curl SSR 全文/meta）
- 接入指引：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push/douyin-microgame-im-guide （标题「抖音客服平台-客服能力消息推送接入指引」，saved 2025-06-16）
- 回复文本 API：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/douyin-microgame-im/reply-user-text （apiMeta iframe 型；meta CnName「【抖音客服平台】开发者回复文字格式的客服消息」，doc saved 2025-04-16）
- 回复图片 API：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/douyin-microgame-im/reply-user-image （saved 2025-05-29）
- 凭证：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/interface-request-credential/get-access-token （apiMeta CnName「【小游戏】- 获取 AccessToken」）

机制（逐字要点）
- 推送完全复用体系 B（§3.4 握手/§4.2 x-signature 验签），同一配置 URL 靠 `x-msg-type` 区分：`verify_request` / `gift_delivery` / `douyin_microgame_im`。「注意：务必判断 x-msg-type 为 douyin_microgame_im 才处理后续的消息推送」「后续抖音还会扩展更多的 x-msg-type，需开发者做好不同事件的隔离」
- 推送响应：正常 HTTP 200 + `{"success": true}`；异常 HTTP 仍 200 + `{"success": false, "err_code": 100002, "reason": "失败原因"}`；err_code 枚举表仅一行：100002=触发频控，允许稍后重试
- 幂等（逐字）：「由于平台无法保障一次推送逻辑只触发一次消息推送，在执行推送时，开发者需通过 msg_id 保障幂等，避免同一个 msg_id 被多次使用」
- 本页未给独立重试条款（沿用体系 B 配置指引），接入第一步即「参考：消息推送配置接入指引 进行接入」（§3.4）

推送载荷字段表（指引页表格逐字）

| 字段 | 必须 | 说明 |
|---|---|---|
| app_id | 是 | 小游戏ID |
| conversation_id | 是 | 会话ID，当前用户所处的会话 |
| msg_id | 是 | 消息ID（可用作幂等保证） |
| create_time | 是 | 用户消息的创建时间，秒级时间戳 |
| msg_type | 是 | 当前消息的类型：text、image、video、score |
| open_id | 是 | 用户的 open_id |
| content | 否 | 文本消息内容（msg_type = "text" 时返回） |
| pic_url | 否 | 图片 url（msg_type = "image" 时返回） |
| video_url | 否 | 视频 url（msg_type = "video" 时返回） |
| score_content | 否 | 评分消息内容（msg_type = "score" 时返回） |

官方自相矛盾：字段表称 create_time「秒级时间戳」，四个示例全部是 13 位毫秒（1744940173524 等）——照录；实施按毫秒解析、兼容 10 位秒

载荷示例要点（指引页代码块逐字段照录，注释符号剔除）
- text：`content` 为 JSON 串 `"{\"text\":\"1\",\"action\":{}}"`（官方注「只需要关注 text 字段」）
- image：`pic_url` 为带签名 bytemastatic CDN 直链（`...lk3s=86e038d0&x-expires=2062745687&x-signature=...`），可直接 GET
- video：`video_url` 为 douyinvod 直链（同源直链形态）
- score：`score_content` JSON 串 `"{\"payload\":{\"score\":5,\"labels\":[{\"id\":1,\"text\":\"处理流畅及时\"},{\"id\":2,\"text\":\"服务态度良好\"},{\"id\":3,\"text\":\"准确理解问题\"}],\"comment\":\"非常\",\"state\":1}}"`，官方注释逐字「score：评分；label：评分标签；coment：评论（原文拼写如此）；state：1-已解决；2-未解决」
- ID 形态：`conversation_id`/`msg_id` 为裸数值雪花 ID（7494205308479291111），非 dop 的 `@` 加密串；`open_id` 为 `_000` 前缀风格（与 dop 同族）

回复窗口（逐字）：「用户发送信息后，可在48小时内，至多回复5条信息」——对比 dop 私信 24h/6 条（§6.1）、进私 30s/3 次

发送 API（回复文本）
- `POST https://minigame.zijieapi.com/mgplatform/api/apps/reply/reply_user_text`（meta：Method POST、Domain minigame.zijieapi.com、Path `/mgplatform/api/apps/reply/reply_user_text`）；Header `Content-Type: application/json` + `access-token`
- Body（meta 逐字）：`micro_game_id`（小游戏ID）、`conversation_id`（会话ID）、`msg_id`（消息ID，用作幂等处理）、`create_time`（消息创建时间）、`content`（文字消息）、`msg_type`（消息类型，text-文字类型）、`sender_name`（选填，「绑定的客服人员用户名，对应开平网站的用户名，非必填（不填会导致B端客服平台的发送人为 Error）」）
- 回复图片：`POST https://minigame.zijieapi.com/mgplatform/api/apps/reply/reply_user_image`，multipart/form-data，Body 多 `FileContent`（图片二进制流）、`msg_type=image`；meta 页 Scope：`open.ttgame.mgplatform`。参数位置官方两形态并存：meta Body 表列全部字段（含 sender_name），而指引与专页 curl 示例把 micro_game_id/conversation_id/msg_id/create_time/sender_name 放 query、仅图片走 `--data-binary`——照录，实施按 curl 形态
- 指引页 curl 示例（逐字）：`--data '{"micro_game_id": "tt411d37a0de37d565", "conversation_id": "7483846274349842751", "msg_id": "5123031140113221826", "create_time": 2872345199, "msg_type": "link", "content": "测试demo\n<a rel=\"noopener noreferrer\" target=\"_blank\" href=\"https://www.baidu.com/\">https://www.baidu.com/</a>"}'`——msg_type 竟为 `"link"`（非 text）、create_time=2872345199（2061 年，非真实时间）、URL 用 `http://`；官方示例自身不一致，照录
- 响应（meta 逐字结构）：`{"BaseResp":{"StatusCode":0,"StatusMessage":""},"data":{"im_msg_id":"...","filter_reason":N},"err_msg":"","err_no":0,"log_id":"..."}`；`im_msg_id`=「IM 返回的消息ID，唯一标识这条消息」；`filter_reason` 枚举：1-命中敏感词；2-非小游戏；3-msg_id 触发幂等；4-已超过最晚回复时间，距离用户上一次发送消息已超过 48 h；5-回复次数过多，用户发送消息后至多只能回复 5 条；6-sender_name 不存在。注意 filter_reason≠0 时 `err_no` 仍可为 0（异常示例即如此，成功判定需看 data.filter_reason）
- 错误码（两 API 相同，HTTP 恒 200）：28001005 系统内部错误；28001003 access_token无效；28001008 access_token过期

token 模型（与 dop §6 相互独立，纯应用身份）
- `POST https://minigame.zijieapi.com/mgplatform/api/apps/v2/token`，JSON body：`appid`（小游戏 ID）、`secret`（「小游戏的 APP Secret，可以在开发者后台获取」）、`grant_type=client_credential`
- 响应：`data{access_token, expires_in(秒，示例 7200), expires_at(过期时间戳)}`、`err_no`、`err_tips`
- Note 逐字：「access_token 是小游戏的全局唯一调用凭据……access_token 的有效期为 2 个小时，需要定时刷新 access_token，重复获取会导致之前一次获取的 access_token 的有效期缩短为 5 分钟」
- 错误码：-1 系统错误；40015 appid 错误；40017 secret 错误；40020 grant_type 不是 client_credential
- 准入结论：仅需小游戏 appid+secret，无用户授权环节；文档未见客服能力单独准入条款 → **资格已收口（2026-11-03）**：运营页 bytehi-im 全文确认无独立准入/资格/类目限制，开通三步 = 小游戏内绘制客服组件并调 `tt.openCustomerServiceConversation({type:3})`（必须；基础库需支持枚举 3，官方建议先 `tt.canIUse('openCustomerServiceConversation.type.3')` 判断）→（可选）按体系 B 配置消息推送 → 开发者后台「客服」打开抖音客服平台开关（必须）并添加客服角色（客服组长=工作台全权限；普通客服=在线工作台+会话记录，加入方式=填开放平台用户名）。工作台功能：路由分配、常用语、自动回复、会话标签、会话记录、数据看板；「会话结束48小时内，支持再次触达用户」；满意度评价框会话结束自动弹出。FAQ 逐字：「抖音客服平台支持第三方的客服系统消息推送吗？支持」。回复 API meta 的 sender_name「对应开平网站的用户名」即此工作台账号。来源：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/user-ops/user-service/bytehi-im

同族客服平台辨析（2026-11-03 补摄，防混淆）——另两支为**纯工作台型，无开发者推送/回复 API**，对 DuDu 无接入面：
- 抖音 IM 客服（mini-game 运营页 `/zh-CN/mini-game/operation1/user-ops/user-service/douyinIM`）：页首逐字「无需接入客服消息推送能力」；配置 = 开发者平台-「消息及客服」-「抖音IM客服」-开启功能 + 绑定客服主管抖音号扫码；接待端为网页工作台 https://life-im.douyin.com/cs/login ；「6小时内无人发言则自动关闭会话」；用户侧入口在抖音-消息-第三方客服消息
- 抖音来客 IM 客服（mini-app 运营页 `/zh-CN/mini-app/open-capacity/operation/private-account/customer-service/douyin-laike-im-service`）：准入三条件（本地生活类目小程序 + 抖音来客商家 + 来客开通在线咨询能力）；小程序侧组件 `button-lifeim`；接待端为来客后台在线咨询（life.douyin.com），与抖音生活服务原生客服系统打通，含分流/数据看板；无公开 API

对 DuDu 的含义：这是与 dop 私信**并行的另一条可用客服消息体系**，但生态位不同——它面向抖音小游戏（tt 开头 appid、minigame.zijieapi.com 域、48h/5条窗口），凭证只要 appid+secret（比 dop 的用户授权 access_token 容易得多），入口是用户在小游戏内咨询客服会话，非企业号私信。是否为 DuDu 新开渠道取决于产品是否接小游戏生态；协议上自洽可模拟（复用体系 B 验签 + 本节载荷）

### 8.3 内测变体：小程序「抖音 IM 客服私信」（信封家族第五形态，窄场景）

来源：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/operation/private-account/customer-service/private-message （saved 2023-09-19）；发送 API：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/service-message （HTML 直嵌格式；旧路径 `/develop/server/other/service-message` 服务端 301 到此）

- 能力定位（逐字）：「在用户进入抖音 IM 客服页面后，可主动向用户发送一条消息」；配置入口「小程序开发者平台-消息及客服-抖音 IM 客服-URL 地址」（内测，开发者运营平台有「私信 URL 地址」配置项）
- 推送信封（逐字，第五形态，含体内签名字段）

```json
{
  "event": "trade_event",
  "client_key": "tt5daf2b12c1117910",
  "event_id": "0",
  "signature": "26ba9e689a6111d589ba644fc571de818d78ad53",
  "content": {
    "order_id": "7132729262960263972",
    "conversation_short_id": "@4F9R0vKUDsthbXTzOI1qGaD6umLoPv1115R5rwygKlMWZ/n73njbQGAsjAv/6TcHHiGVs3/DCjtHNt3ax3IzRw==",
    "customer_uid": "9eMmlavczcr-i96V",
    "sp_uid": "m6ZWawSN.flXvpQ0",
    "challenge": 0
  }
}
```

- 事件枚举（逐字）：「用户咨询私信：trade_event 平台校验：verify_webhook」；握手同 dop（challenge 回显 ResponseBody）
- 验签算法（逐字要点，**与 X-Douyin-Signature 不同**）：`sha1(appId + url + data)`，其中 appId=client_key、url=Webhook 回调地址、data=content 反序列化后再序列化的 `[]byte`，hex 小写输出
- 发送 API（逐字）：`POST https://open.douyin.com/im/send/customer/service/msg/`；Scope `im.customer.message`；权限要求「**不需要用户授权**」；Header access-token=「调用 生成 client_token 生成的 token，此 token 不需要用户授权。示例: clt.…」——**client_token 即可调用**；Query `open_id`=客服号 openid（webhook `sp_uid`）；Body：`conversion_id`（官方字段拼写如此，取 webhook `conversation_short_id`）、`send_url`（支付链接，msg_type=1 必传）、`to_user_id`（webhook `customer_uid`）、`msg_type`（1-发送支付链接 2-发送支付成功）；「目前支持发送气泡」
- 错误码：2100004 内部服务错误；2100005 参数错误；2121000 IM 服务错误；2121001 入参错误校验失败；2121003 消息接收方或发送方填写错误；2121004 消息接收方或发送方没有权限；2121005 链接不合法；2121006 客服号未授权
- 评估：仅支付咨询气泡的内测能力，非通用客服通道，对 DuDu 无渠道价值；记录价值在信封/验签变体（sha1(client_key+url+content)）与「client_token 可发客服类消息」的先例

### 8.4 入站媒体下载接口补证：推翻 §6.2「无通用下载接口」结论

来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/search-management/business-tool/get-message-resources （apiMeta CnName `GetIMMessageResource`，doc saved 2024-07-12，apiPath `/api/im/message/resources/`）

- `GET https://open.douyin.com/api/im/message/resources/`；Note 逐字：「应用需获取 im.multimedia_message 权限」（新 scope，§2 事件表外）
- Query：`conversation_id`（=webhook `content.conversation_short_id`，「长期有效」；「由于 conversation_id 包含 + = 等特殊字符，传参时需要进行编码」）、`message_id`（=`content.server_message_id`；「仅支持 webhook content 中 msg_type 为 user_local_image 和 user_local_video 的 message_id」；同样需 URL 编码）、`open_id`（必填）
- Header：`access-token`=oauth access_token（`act.*`，用户授权类——与 §6.1 发送私信同一凭证链路，client_token 不行）
- 响应 `data`：`media_type`（image/video）、`url`（逐字要点：「资源访问链接，有效期 30 天」「访问 URL 时，需额外在请求 Header 中携带 Access-Token, OpenID 字段，字段的值与调用本接口的AccessToken, OpenID 相同，否则无法访问相关资源」「URL 中可能包含转义字符 \u0026，需要将其替换为 & 才能正常访问资源」（`&` 为页面渲染后字面原文；源码写作反斜杠 u0026 与 HTML 实体，仅记于此不复原）
- UseRestriction 逐字：「仅支持在接收消息 webhook 返回的消息类型为 user_local_image 和 user_local_video 时返回相关 url 资源」「只能获取发送时间为半年内消息多媒体资源」
- ReqExample 逐字（节选）

```bash
curl --location --request GET 'https://open.douyin.com/api/im/message/resources/?open_id=2d3201d1-4cf2-4f01-8368-b6f2fb047d&message_id=%409VwDhOCRTcMhM22uc8ptWc791m3uPvyEPZV5rgOlKFAVbPT860zdRmYqig357zEB4Kil85ESSP%2B5XoOMbKfd5w%3D%3D&conversation_id=%409VwDhOCRTcMhM22uc8ptWc791WbvOP%2BHMpxwrAOiL1MWa%2FH460zdRmYqig357zEBdsmeO0WyFq81ZGOrbYMEaw%3D%3D' \
--header 'access-token: act.b5efd5ad64f0cfea3df3ff57e4efd2KnC0VisBaEXFnQRo'
## 后续访问图片，Header 中需要填充 Access-Token, OpenID 参数
curl --location 'https://api-normal.amemv.com/im_open/media?type=image&secret=skv2Z1fhiKw1gGBsGa4%3D' \
--header 'OpenID: 2d3201d1-4cf2-4f01-8368-b6f2fb047d' \
--header 'Access-Token: act.b5efd5ad64f0cfea3df3ff57e4efd2KnC0VisBaEXFnQRo'
```

- 错误码（节选，HTTP 恒 200）：28001003/28001008 token 无效/过期；28001018 应用未获得该能力；28003017 quota 已用完；28029006 权限校验失败（检查用户是否有消息访问权限）；28029015 未知资源类型；28029016 不支持的消息类型；28029017 非会话内用户；28029018 消息状态异常；28029020 未获取到资源链接
- 佐证与漏采说明：private-msg-webhook 页现版（saved 2025-11-17）「使用限制」节已逐字载明「针对用户在会话中发送的本地图片、视频（msg_type 对应 user_local_image, user_local_video），支持通过获取消息中的多媒体资源接口，获取具体的 URL」，该页在 2026-09-10 抓取范围内，§6.2 属漏采；group 群消息页对 user_local_image/user_local_video 也指向本接口
- 改写后结论：入站媒体可读范围 = emoji 非空 `resource_url` 直链 + **user_local_image/user_local_video 经本接口换 30 天有效 URL**（限半年内消息，需用户授权 token 与 `im.multimedia_message` scope，媒体访问还要带 Access-Token/OpenID 头）；image/video（分享类）仍无读取通道
- **meta 结构化复核（2026-11-03，SSR 内嵌 openApiMeta）**：响应信封为 `err_no`/`err_msg`/`log_id` + `data{media_type,url}`（**非** dop 常见的 `extra`/`data` 信封，实施解析按此）；Method=GET；错误码增补：28029019 多媒体资源为空、28029014 资源签发失败请重试、28029021 资源加密失败、28029022 无法获取相应消息、28029023 没有权限访问消息、28001016 应用已被封禁或下线、28001019 应用该能力已被封禁、28001014 应用未授权任何能力、28001007 参数不合法；PermissionInfo：能力 `ma.openapi.im.multimedia_message`（获取多媒体消息内容）门禁 = 小程序上线状态「已上线」（`app_online_multi`），页面另挂「发送私信」能力条件（主营类目黑名单）；ReqSchema 中 conversation_id/message_id 标 Optional=true、open_id 必填（与 Note/UseRestriction 联动按必填实施）；mini-app 树镜像页 `/zh-CN/mini-app/develop/server/reach-marketing/instant-message/business-tool/get-message-resources`（apiPath 相同）

### 8.5 群聊事件 content 明细（§7.3 关闭）

- 群消息 Webhook（`im_group_receive_msg` / `im_group_send_msg`）：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/group-chat/group-message/group-fans-webhook （saved 2025-11-28）
  - 权限：「小程序上线后自动开通权限」+ 开发者后台-设置-关联设置-抖音号管理为小程序经营者申请「粉丝群管理能力」
  - 使用限制（逐字）：「图片消息和视频分享消息不返回具体 URL，需到抖音端内 APP 内查看」「目前只开放给粉丝群」
  - content 字段表：`conversation_short_id`（群 ID，群唯一标识）、`server_message_id`、`conversation_type`（2：群聊）、`message_type`（text/image/emoji/video/retain_consult_card/other）、`source`（同私信语义）、`scene_type`（1：关键词自动回复 2：欢迎语 100：其他——私信侧无此字段）、`create_time`（13位毫秒）、`user_infos`（open_id/nick_name/avatar）、`owner_id`（群主ID，表标 int）
  - 各 message_type 附加字段：text→`text`；emoji→`resource_type/width/height/url`（示例仍空串）；image→仅 message_type（「通过抖开发送群消息 OpenAPI 或其他平台发送的图片消息」）；video→`item_id`；`user_local_image`/`user_local_video`→明细注明「可以通过获取消息中的多媒体资源接口获取…URL」（两个示例 `conversation_type` 又写作 1，官方矛盾照录）；`retain_consult_card`→`card_id/card_status/card_data`，并注明「通过抖音开放平台创建/更新留资卡片接口创建的留资卡片才能收到事件回调」；`other`→`text`=「你收到一条新消息，请打开抖音app查看」
- 用户加群 `group_fans_event`：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/search-management/group-chat/join-group/group-fans-webhook/group-fans-join （saved 2023-12-21）
  - Scope `im.group_fans.create_list`，需申请权限+用户授权；「仅限粉丝群」；事件介绍「用户加入授权万粉群或主播粉丝群成功后推送给开发者」
  - 信封 `from_user_id`=申请入群用户、`to_user_id`=群主；content 为 JSON 串（示例逐字）：`"{\"open_id\":\"500a9e2f-ca96-4225-865d-a341914502ae\",\"im_group_id\":\"@9VxQh6rGTNAjPS/4do48Es7912frNf2APZB0rQqgKFMUafD160zdRmYqig357zEBN69eGVtkZMdXc4EKtu****==\",\"group_type\":1,\"create_time\":1681720393151,\"create_group_type\":\"5\"}"`；字段表：`group_type` 1-加群；`create_group_type` 2-主播粉丝群，5万粉群（表标 int，示例为字符串 "5"，照录矛盾）
- 加群申请 `enter_group_audit_change`：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/search-management/group-chat/join-group/group-fans-webhook/add-group-audit-webhook （saved 2024-06-24）
  - 信封 `from_user_id`=**群主**、`to_user_id`=**加群用户**（与 group_fans_event 相反，两页各自如此，照录）
  - content：`group_id`（群ID）、`apply_id`（审批单id）、`user_avatar`（表标 int，示例为头像 URL）、`user_nicker`（表标 int，示例为字符串昵称——两处类型标注均错，照录）、`apply_status`（1-申请中，2-同意，3-拒绝）、`create_time`（表表示例 1690896291 秒级、载荷示例 1679638889110 毫秒级，矛盾照录）
  - 该页示例 JSON 本身畸形（双左花括号、中文逗号、引号错配），逐字保留于来源页，不作为载荷范本
- mini-app 树另有同名镜像页（join-group-event / enter-group-audit-change-webhook，BFF 检出路径，本次未逐字抓取）

### 8.6 官方沙盒 mock 推送 API（联调参考）

来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/tools-ability/sandbox-management/mock-webhook-event/ （saved 2025-06-20）

- `POST https://open.douyin.com/sandbox/webhook/event/send/`（基本信息表 Method=POST；页内 curl 示例写 `--request GET`——官方矛盾照录）
- Header `access-token`=client_token（`clt.*`）；Scope `aweme.webhook`；需申请「Webhook OpenAPI 管理能力」（控制台->能力管理->抖音业务能力->开放平台）；「不需要用户授权」
- Body 仅 `event_type`，支持枚举（逐字）：create_video、authorize、receive_msg、enter_im、dial_phone、dial_phone（原文重复两次）、website_contact、personal_tab_contact、verify_webhook——与真实事件名不一致（`receive_msg`≠`im_receive_msg`，且无 im_enter_direct_msg/im_send_msg），官方 mock 通道仅覆盖传统三事件
- 响应 `extra{error_code, sub_error_code, description, logid, now}`；错误码：2100004 系统繁忙；2190004 无权访问；2190005 ticket已过期（ticket 有效时间 7200s）；16388 签名不正确

### 8.7 服务商加解密示例代码包解析（§7.1/§7.2 关闭，2026-11-03）

来源：thirdparty encryption 页「点击下载」超链接逐字提取——官方示例代码包 https://sf1-cdn-tos.douyinstatic.com/obj/microapp/frontend/thirdparty/demo.zip （douyinstatic CDN；zip 时间戳 2020-07-06，源码注释 2019-2021；包名 `com.bytedance`/Go `package main`；readme：验证签名入口 java `ServerVerification.verify` / php `serverVerification.verify` / go `server_verification.VerifyByteDanceServer`，解密入口 java `MsgDecrypt.decrypt`（需配 pom.xml）/ php `msgDecrypt.decrypt` / go `msg_decrypt.DecryptMsg`）

MsgSignature 算法（三语实现一致，逐字）
1. 取 `[tpToken, TimeStamp, Nonce, Encrypt]` 四串**按字典序排序**（java `Arrays.sort`；go `sort.Strings`；php `sort($values, SORT_STRING)`）
2. **直接拼接**（无分隔符；java StringBuilder 追加；go `strings.Join(values, "")`；php `join("", $values)`）
3. SHA-1 后 hex **小写**输出，与 `MsgSignature` 比对

AES 解密（Java/PHP 一致，此为 canonical 形态）
- EncodingAesKey 为 **43 字符** base64 串（官方校验长度必须 43），末尾补 `=` 后 base64 解码得 **32 字节 AES-256 key**
- IV = **key 前 16 字节**（java `new IvParameterSpec(aesKey, 0, 16)`；php `substr($this->aesKey, 0, 16)`）
- 模式/填充：java `AES/CBC/NoPadding`；php `openssl_decrypt(... 'aes-256-cbc', OPENSSL_RAW_DATA | OPENSSL_NO_PADDING ...)`
- 去 pad：取明文末字节为 pad 长度，**1..32 之外按 0 处理**（php blockSize=32，同一规则），截掉 pad 字节
- 明文布局：`32 字节随机前缀 + 4 字节大端(int32)消息长度 + 消息体(UTF-8 json) + 尾部为第三方小程序 AppID`
  - java `RANDOM_BYTES_POS = 32`，长度在 bytes[32:36]，消息体自 36 起，appid 在消息体之后
  - php 先剥 16 字节、再在偏移 16 处读 4 字节长度（即绝对偏移 32），消息体自绝对偏移 36 起——与 java 布局一致；php 注释「去除16位随机字符串」与代码实际偏移不符，照录

官方示例包内部矛盾（照录）：**Go 版实现与 Java/PHP 不一致**——IV 取**密文**前 16 字节（`iv := encryptData[:blockSize]`）而非 key 前 16 字节；随机前缀按 **16 字节**处理（长度在 `plainText[16:20]`、消息体自 20 起、appid 其后）。三语两派，实施按 Java/PHP（2/3 样本一致且 php/java 相互印证）；若模拟器复刻 Go 形态将无法解开按 canonical 形态加密的密文。哪种与线上服务端实际一致，文档无仲裁，需真实服务商账号实测（本票不阻塞：模拟器自拟密文自收自发时两种自洽即可，但**跨系统与真实抖音互操作时以 Java/PHP 为准**）

页面其他复核补记：推送分两类——向【授权事件接收 URL】推 component_ticket、授权成功/解除/第三方小程序找回授权码通知；向【消息与事件接收 URL】推授权小程序代码提审、改名/图标/简介/类目、短视频挂载/直播组件/获取手机号等审核结果。响应必须直接返回字符串 `success`（不带引号），否则重试 3 次（§4.3 已录，复核一致）；页尾 tip：「其他编程语言还需要根据代码示例转换成你所用的语言」

### 8.8 interaction 树盘点：直播玩法互动数据推送（§7.8 关闭，2026-11-03）

树定位：`/docs/resource/zh-CN/interaction/` = 直播玩法（弹幕玩法）文档树（introduction/develop/jierushuoming 等）；danmu-callback 文档实体在 developer 树：https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/develop-guide/local-develop/douyincloud-basedon-app/danmu-callback （标题「直播间玩法指令走内网专线推送到抖音云」——§8.1「developer 树无推送协议」的结论就此修正：developer/tools/cloud 子树承载抖音云文档，含回调配置页，无 webhook 事件协议）

消息型回调确实存在：直播间互动数据推送（评论/点赞/礼物/粉丝团），能力申请页（控制台-直播小玩法-能力-互动数据-申请开通）`/zh-CN/interaction/jierushuoming/hudongshuju/` 下 pinglunshuju（评论）/dianzanshuju（点赞）/liwushuju（礼物）/fensituan（粉丝团）；推送协议页全文：https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/server/live-room-scope/data-open/data-open-desc （saved 2024.07.24，变更 2024.09.22 礼物 payload 新增被送礼嘉宾 open_id）

机制（协议页逐字/表格要点）
- 任务模型：「数据推送任务由（直播间id, 小玩法id, 直播间消息类型）三者唯一确定」；OpenAPI：启动任务 start-task / 停止任务 stop-task / 查询任务状态 query-task-status / 分页查询推送失败数据 page-query-failure（仅礼物、粉丝团；缓存 10w 条、一天）/ 获取粉丝团信息 get-fan-info；主播取消挂载或关播自动停推
- 送达方式：「推送方式：http回调」，「暂不支持长连接接入」；抖音云内网专线为可选变体（见下）
- Header：`x-nonce-str`（随机串）、`x-timestamp`（毫秒）、`x-signature`、`x-roomid`（房间 id）、`x-msg-type`（`live_comment`/`live_gift`/`live_like`——表格仅列三枚举，payload 却有粉丝团第四种，照录矛盾）；`Content-Type: application/json`；body 为 payload json 序列化字符串
- 验签（体系 B 同族变体，多 x-roomid）：header（x-signature、content-type 除外）按 key 字典序拼 `k1=v1&k2=v2...`，直接拼接 body 字符串与 secret（推送配置字段）后 md5 → base64。官方示例拼接串（逐字）：`x-msg-type=live_gift&x-nonce-str=123456&x-roomid=268&x-timestamp=456789abc123你好123abc` → `PDcKhdlsrKEJif6uMKD2dw==`（Go/Java 实现逐字在来源页）
- 限流与熔断：默认 QPS 100 次/秒；「推送请求响应超过 2秒（礼物数据是3s）或者返回非 2XX 状态码，平台认为推送失败，连续10次推送失败会触发推送的熔断，平台会直接丢弃数据若干秒再尝试推送」；「响应不符合规范或超时未收到，开放平台会认为推送失败且不会继续推送」（与熔断语义并列，照录）
- ack：HTTP 2XX 即成功
- 可靠性表（逐字要点）：评论/点赞「不保证可靠性，会有数据丢失」；礼物/粉丝团「尽力而为」+ 有限回查接口；四类均「可能会重复，需要开发者根据消息id做重复判断」、秒级时效、非绝对时序
- payload（js 对象字面量形态，逐字要点）：评论 `{msg_id, sec_openid（注释原文「当前其实没有加密」）, content, avatar_url, nickname, timestamp(毫秒)}`；礼物 `{msg_id, sec_openid, sec_gift_id, gift_num（不能据此判断单刷/组刷）, gift_value（单位分）, avatar_url, nickname, timestamp, test（true=平台测试数据，统计须过滤；测试工具下发的数据无此字段）, audience_sec_open_id（被送礼嘉宾）, sec_magic_gift_id（幸运魔方抽到的礼物 id）}`；点赞 `{..., like_num（上游 2s 合并一次）}`；粉丝团 `{..., fansclub_reason_type（1-升级 2-加团）, fansclub_level}`
- 礼物 id 为加密串，页内附常规礼物 17 种（仙女棒 1 抖至稀有宝箱 3000 抖）+ 幸运魔方 id 表（逐字在来源页）

抖音云内网专线变体（danmu-callback 页全文要点）：「弹幕/点赞/礼物通知都会回调到这个地址上来，开发者可以根据回调消息体中的msg_type来区分」；仅支持配置一个回调地址；在抖音云控制台「服务详情-访问控制-抖音回调」添加，且前置需在小玩法控制台完成直播间数据推送能力配置；收益为免域名备案、免公网加解密、低延迟

结论：interaction 树的消息型回调是直播互动数据（弹幕指令），非客服会话消息；与 dop 私信体系（§2 A）完全并行不相通。对 DuDu 渠道无接入价值；模拟器如需第五套验签家族样本可参照本节（体系 B 同族 + x-roomid）

### 8.9 订阅消息推送事件（§7.10 关闭，2026-11-03）

来源（均 curl SSR 全文，信封同 dop A 形态，content 为 json 字符串）
- 用户订阅动作推送事件：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/subscribe-notification/subscription-status-push-event
- 用户授权订阅卡事件：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/subscribe-notification/subscribe-feedcard-webhook
- 两页头部均引用 mini-app webhook 概述 `/zh-CN/mini-app/develop/guide/open-capabilities/webhook/`，实测 301 → `/zh-CN/mini-app/develop/tutorial/basic-ability/webhook`（即 §7.9 已复核教程页）

`user_subscribe_action`（用户订阅动作）
- content 字段表：`msg_id`（消息模板 id，来自添加模板接口，含一次性/长期模板）、`subscribe_action`（int32：0-没有订阅关系（预期不会出现）、1-一次性订阅、2-长期订阅、3-长期拒绝、4-一次性拒绝）、`time`（int64 订阅时间）
- 版本注（逐字）：「抖音客户端29.8.0版本前，缺少部分场景的一次性订阅、一次性拒绝webhook。29.8.0及后续版本已全量。长期订阅、长期拒绝同步是全量的。」
- 示例（逐字）

```json
{
        "event": "user_subscribe_action",
        "client_key": "tt5daf2b12c2857***",
        "from_user_id": "1293498361587***",
        "content": "{\"msg_id\":\"MSG35128753817358733677838256***\",\"time\":1714029835,\"subscribe_action\":1}"
}
```

`user_auth_subscribe_card_notification`（用户订阅异形卡授权成功通知）
- 使用限制（逐字）：「当前仅开放一次性订阅消息类型」；触发条件：用户授权一次性订阅消息成功且异形卡开关打开
- content 字段表：`msg_id`（消息模版ID，表标 int，示例为 "MSG..." 字符串，矛盾照录）、`msg_type`（1-一次性消息 2-长期订阅消息）、`auth_time`（用户订阅时间，表标 int，示例为字符串 "1710397343"，矛盾照录）、`app_type`（1-小程序 2-小游戏）；信封带 `log_id`
- 示例（逐字）

```json
{
    "event":"user_auth_subscribe_card_notification",
    "client_key":"ttb79cc12128a3db2c01",
    "from_user_id":"_000ZqJqe3CiVSTai4-lwkg_hk6PtebTt6YC",
    "content":"{\"msg_id\":\"MSG3512882310a91b74b6474cb09027a3ed8b96ee16290\",\"msg_type\":1,\"auth_time\":\"1710397343\",\"app_type\":1}",
    "log_id":"02171039734323900000000000000000000ffff0a7ab0fc7d9499"
}
```

结论：两事件均为订阅关系状态事件，非消息型回调，对 DuDu 无渠道价值。发送侧指针（同目录，不展开）：给用户发送订阅消息 notify-user-v2、模板管理 create-tpl-v2/query-tpl-list-v2 等

### 8.10 发送侧图片上传 ClientImageUpload 全量规格（发送图片 media_id 链路收口，2026-11-03）

来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/search-management/business-tool/image-upload （apiMeta 型；SSR 内嵌 openApiMeta 全量提取）；mini-app 树镜像页 `/zh-CN/mini-app/develop/server/reach-marketing/instant-message/business-tool/image-upload`（apiPath 相同）；能力矩阵出处「小程序私信、群聊能力概述」表内「图片上传」scope `tool.image.upload`

- `POST https://open.douyin.com/tool/imagex/client_upload/`（Name/CnName `ClientImageUpload`，PSM `open.ability.uploader`，meta Method=POST）
- Header：`access-token` = **client_token**（`clt.*`，「调用 https://open.douyin.com/oauth/client_token/ 生成的token」——**应用身份即可，不需要用户授权**，与发送私信接口的用户 access_token 不同链路）；`Content-Type: multipart/form-data`
- Body：`image`（文件，必填）
- UseRestriction（逐字）：「图片不超过 10 MB」「仅支持 jpeg, png, bmp, webp 图片格式」
- 响应：顶层 `image_id` / `width` / `height` / `md5` + `extra{...}` 与 `data{error_code, description}` 信封；成功示例（逐字）：`{"extra":{...},"data":{"error_code":0,"description":""},"image_id":"@baihq==","width":111,"height":111,"md5":""}`；异常示例 error_code=2100005 参数不合法（HTTP 恒 200）
- 错误码：28001005 系统内部错误；28001003/28001008 token 无效/过期；28001016 应用已被封禁或下线；28001006 网络调用错误；28001014 应用未授权任何能力；28001018 应用未获得该能力；28003017 quota 已用完；28001019 应用该能力已被封禁；28001007 参数不合法
- Description（逐字）：「返回的 image_id，可用于 创建/更新留资卡片, 创建更新小程序引导卡片模板 等接口的图片参数」——结合 §6.1 发送私信 `{"msg_type":2,"image":{"media_id":"@..."}}`（「media_id 来自图片上传接口的 image_id」），**发送侧图片链路至此闭合：client_token 上传得 image_id → 作为 media_id 填入发送私信图片消息**；该能力不要求发送方用户授权（上传本身），发送时仍按 §6.1 凭证规则
- PermissionInfo（meta 结构化能力门禁）：接口挂三个能力条件——`ma.openapi.im.direct_message`（发送私信）、`ma.openapi.im.group_fan.create_list`（粉丝群管理，注意 CapacityKey 拼写为 group_fan 单数，照录）、`ma.openapi.im.group_message`（发送群消息）；条件 = 小程序主营类目黑名单（`main_category_black`，类目码串逐字在 meta：`1,1,500,135,140;1,1,500,135,148;1,1,500,135,700;1,1,504,607,778;1,1,504,607,781;1,1,504,608,777;1,1,504,608,780;1,1,510,602,284`）+ 群消息能力要求小程序上线状态「已上线」（`app_online_multi`）
- 三语 SDK 示例逐字在 meta（go `github.com/bytedance/douyin-openapi-sdk-go` + `douyin-openapi-util-go` FileField；node `@open-dy/open_api_sdk` ImagexClientUploadRequest；java `com.douyin.openapi.client` ImagexClientUploadRequest）
- 群聊发送侧指针（同目录新发现，未展开）：发送群消息 `/zh-CN/mini-app/develop/server/reach-marketing/instant-message/group-chat/group-message/im-group-message-send`（scope `im.group_message`，需小程序已上线）、撤回群消息 `.../group-msg-recall`、私信撤回 `.../private-message/recall-msg`（scope `im.recall_message`，apiPath `/im/recall/msg/`；2026-11-05 晚间复核：页 updateTime ≈ 2025-09-04 未变，BFF 索引时间 2026-10-23 与页内时间戳不一致系索引侧重，scope 仍在页）

### 8.11 杂项补摄：im_authorize 事件、IM 教程页增量、能力矩阵表、调试台（2026-11-03）

- **`im_authorize` 事件**（IM主动授权webhook）：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/im-authorize-wenhook ——C 端用户点击同意 button 组件「获取用户私信授权」拉起的授权弹窗后推送；订阅路径「开发者平台-控制台-小程序-开发-开发配置-webhooks 订阅 im_authorize 事件」。content（json 串）：`create_time`/`expire_time`/`update_time`（秒级 int）、`operation_type`（1-新增 2-更新）、`auth_status`（1-授权中 2-未授权）、`source` = **`im.direct_message.bind`**（「授权场景，发送私信时，scene字段传该值」——即 §6.1 场景四 `im_authorize_message` 持续触达的授权来源，与 event-list 页 contract_authorize 描述「scope 名为 xxx.bind」对应）、`extra`（扩展字段）、`log_id`。信封：`from_user_id`=授权 C 端用户、`to_user_id`=被授权的小程序经营者（与普通 IM 事件相反方向）
- **教程页「接入 IM 消息收发能力」增量**（https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/open-capabilities/management/im-messaging-access ）：现版 `im_enter_direct_msg` 示例信封在 §5.11 之外**新增顶层 `msg_id`（32 位 hex）与 `CreateTime`（毫秒）**字段（示例逐字含 `"msg_id": "553ef98e48e2eb804af43c2fb76b31fc5d600ffb5547***"`、`"CreateTime": 1721982974340`）；场景一/二发送请求中 `msg_id` 取值即 webhook 顶层该 `msg_id` 或 content 内 `server_message_id` 两形态并存（示例用 content 内加密串）；场景四 content_list 示例：`{"msg_type":10,"applet_card":{"card_template_id":"@...","path":"index/index","query":"{...}","app_id":"tt..."}}`，不带 msg_id/conversation_id；官方示例代码仓 go 结构（webhook.go/send_msg.go/im_enter_direct_msg_test.go 等）逐字在页；页内引用的小程序引导卡片模板创建接口现版真实路径为 `/zh-CN/dop/develop/openapi/search-management/business-tool/micro-app-card/create-template`（页内写作 `interaction-management/...` 系死链，照录）
- **能力矩阵表**（「小程序私信、群聊能力概述」https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/open-capabilities/management/private-domain/private-and-group-message ，26 行全表逐字在来源页）：私信能力 scope `im.direct_message`（发送/查询授权主动私信用户）、`im.recall_message`（私信撤回）；群聊 scope `im.group_fans.create_list`（查询群信息/创建粉丝群/问候语公告/建群额度/入群审批等 7 API + 2 webhook）、`im.group_message`（发送群消息 OpenAPI + 群消息 Webhook）、撤回群消息同 `im.recall_message`；经营工具 scope `im.microapp_card`（小程序引导卡片模板三 API）与 `tool.image.upload`（图片上传）；开通前提统一为「开发者后台-设置-关联设置-抖音号管理」为小程序经营者申请对应能力，webhook 需另行订阅。`im.direct_message`/`im.group_fans.create_list`/`im.group_message`/`im.multimedia_message`/`tool.image.upload` 等能力的经营类目黑名单与上线状态门禁见 §8.4/§8.10 PermissionInfo。2026-11-05 晚间复查：概述页 updateTime 1764313177 = 2025-11-28，六 scope 全在页无新增；页内 22 个链接已全量改指新文档树 `server/instant-message/...`（页 slug 形如 `im.group.message.send`，是 URL 路径非 scope 名），新树页面 200 但为未填充空壳（SSR 无正文，webReader 渲染正文区仅 `#`）；旧树 `server/reach-marketing/instant-message/...` 仍并行存活且为唯一权威内容源（发送群消息页 updateTime ≈ 2025-10-09，scope `im.group_message` 未变；group-msg-recall/recall-msg/get-message-resources 等已录路径实测全 200）——待新树填充后需重核一遍正文是否随之改写。**2026-10-28 增量（「主动私信」运营页 2026-11-05 扫掠发现）**：绑定抖音企业机构账号开通主动私信，现需经营者**同时授权组件权限 `im.direct_message.bind`**（初次绑定时未授权的，可在小程序控制台-关联设置-抖音号管理-抖音企业机构账号-绑定后授权能力；页 updateTime 1793176302 = 2026-10-28）——属平台侧开通步骤前置，非 API/凭据变更，im_receive_msg/im_send_msg 事件订阅 scope `im.direct_message` 不受影响；同日更新的「私域经营解决方案2.0」页无 scope 增量（`im.group.message.send` 仅新树 URL slug，`im.direct_message`/`im.multimedia_message` 均已知）
- **消息推送调试台**（msg-push-config-guide 页增量）：URL 验证 `https://developer.open-douyin.com/docs/openapi-explorer?id=webhook-url`、消息请求构造 `https://developer.open-douyin.com/docs/openapi-explorer?id=webhook-debug`（「支持开发者自定义填写 URL 和 Token，抖音小游戏会发送一条调试验证事件供开发者调试」）
- 抖音云接入指南（interaction 树 `/zh-CN/interaction/develop/douyincloud/guide`）：弹幕玩法 = 主播客户端 + 开发者后端（收平台指令推送、经 websocket 推给玩法客户端）；抖音云方案提供内网专线推送 + Unity SDK + 免鉴权 OpenAPI；面向「弹幕玩法」类目开放

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟「抖音推 IM 私信给回调」：POST JSON 信封 `{event, from_user_id, to_user_id, client_key, content, log_id}`，头 `X-Douyin-Signature: sha1hex(client_secret + body)`、`Msg-Id: <uuid>`、`Content-Type: application/json`
- 模拟首次配置校验：POST `{"event":"verify_webhook","client_key":"","content":{"challenge":<数字>}}`，期望响应 text 格式 `{"challenge":<同值>}`
- ID 形态：open_id 为 uuid 风格（`5adb9d61-b91a-...`）或 `_000` 前缀风格；会话/消息/视频 ID 均为 `@` 开头的加密 base64 串（`@9Vw...==`）；log_id 为 `202306151447300000000000005369C6D` 风格十六进制串；create_time 13 位毫秒
- 重试语义：连接 5s 断开（dop）/响应超 2.5s 判失败（生活服务），共重试 3 次；同一 Msg-Id 可重复推送，消费方需幂等

## 补充调研（2026-11-04）

> 研究问题：① 分享类 image/video 消息素材是否有新的下载接口或参数形态、语音/audio 消息是否有读取通道；② GetIMMessageResource 的 media_type 全集、错误码表、rate limit 官方口径；③ 回调事件全集（im_send_msg、进私、已读之外），各事件字段结构
> 方法补注：本次新发现第二文档平台 **`open.douyin.com/platform/resource/docs/`**（Gatsby 4.19.2 纯前端站，正文在 `https://open.douyin.com/platform/resource/page-data/docs/<路径>/page-data.json` 的 `result.pageContext.htmlAst`，页面无 saved_time 元数据）；老站低代码重构页（docType 0）正文改为 `local.component.Text` 组件，`props.value.t` 即 zone 映射（根 zone 键 `0`，每项含 ops），`aceTable`/`codeblock` 挂在 op 的 attributes 上（aceTable 值为空格分隔的 R zone/C zone，行列 id 在 `insert.id`，单元格键 `x{rowId}x{colId}`）；apiMeta 型页的 `openApiMeta` 结构化字段仍是最完整的接口事实源（含 ErrCodeList 全表 + Suggestion 列）。另核官方 Go SDK 仓库全量 API 路径与商业开放平台（oceanengine）同族接口做交叉验证

### 9.1 问题一结论：分享类 image/video 仍无读取通道，语音消息类型不存在（判断维持）

- 现版接收私信消息事件页（https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook ，页面 updateTime 1764315099 ≈ 2025-11-28，官方逐字）message_type 全集：`text` / `image` / `user_local_image` / `emoji` / `video` / `user_local_video` / `retain_consult_card` / `other` —— **无 audio/voice 类型**，dop 私信不存在语音消息，语音素材读取通道无从谈起
- image 消息现版字段表（官方逐字）仅两列一行：`message_type | 消息类型，image：图片消息` —— 无素材标识、无 URL，与 §6.2 黄金样本一致
- video 分享消息现版字段表（官方逐字）：`message_type | 消息类型，video：视频分享消息`、`item_id | 加密后的视频ID`
- user_local_image / user_local_video 现版注（官方逐字）：「可以通过获取消息中的多媒体资源接口，获取图片/视频具体 URL」——唯一有读取通道的仍是这两类
- 官方 Go SDK 全量路径核查（https://github.com/bytedance/douyin-openapi-sdk-go ，releases 最新 v1.0.3 2025-07-29；main 分支 `client/client.go` 7.6 MB 全部 API path 提取）：IM 域端点仅 `/api/im/message/resources/`（媒体读取）、`/api/douyin/v1/im/{set,get,del}_applet_template/`（引导卡模板）、`/im/authorize/{status,user_list}/`、`/im/{get,del}/retain_consult_card/`、`/im/group/*`（群管理 9 个）、`/im/recall/msg/`——**不存在任何分享类媒体下载或语音素材端点**
- BFF 全文检索「语音 / 语音消息 / audio 消息」：命中仅 RTC 实时语音（tt.getRtcEngine、上报附近语音用户音量）与小程序 audio 组件类文档，无一涉及 IM 私信语音
- 结论：§6.2/§8.4 的「分享类 image/video 无公开下载接口」在 2026-11-04 复核后**仍然成立**；emoji 非空 resource_url 直链 + user_local 两类经 GetIMMessageResource 仍是全部可读范围

### 9.2 问题二结论：media_type 全集 = image/video（官方逐字），错误码 21 条全表，无量化 rate limit

来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/search-management/business-tool/get-message-resources （openApiMeta 全量重抓，ModifyTime 1792737635128 ≈ 2026-10-23，与 2026-11-03 补证版本一致未变；meta 字段：EndpointId 2321512、Psm `open.ability.im`、Domain `https://open.douyin.com`、Version 1.0.299、SupportSandBox false）

- **media_type 取值全集（官方逐字）**：RespSchema `data.media_type` Desc = 「资源类型，image/video」——响应侧仅 `image`/`video` 两个值；请求侧无 media_type 参数（媒体类型由 message_id 对应消息决定）
- **错误码全表（官方 ErrCodeList 逐字，HTTP 状态码全部 200）**：

| ErrCode | Desc | Suggestion |
|---|---|---|
| 28001005 | 系统内部错误，请重试 | 请求重试，若依然无解请向平台提交反馈 |
| 28001003 | access_token无效 | 重新请求生成access_token |
| 28001008 | access_token过期,请刷新或重新授权 | 重新请求生成access_token |
| 28001016 | 当前应用已被封禁或下线 | clientKey被封禁或者下线 |
| 28001006 | 网络调用错误，请重试 | 重试即可 |
| 28001014 | 应用未授权任何能力 | 确认应用是否授权能力 |
| 28001018 | 应用未获得该能力 | 开通相关能力 |
| 28003017 | quota已用完 | 联系平台处理 |
| 28001019 | 应用该能力已被封禁 | 该能力被封禁，联系平台处理 |
| 28001007 | 参数不合法 | 根据错误信息检查请求参数是否填写正常 |
| 28029006 | 权限校验失败 | 请检查用户是否有消息访问权限 |
| 28029020 | 未获取到资源链接 | — |
| 28029015 | 未知资源类型 | — |
| 28029016 | 不支持的消息类型 | — |
| 28029017 | 非会话内用户 | — |
| 28029018 | 消息状态异常 | 请确认消息处于正常可见状态 |
| 28029019 | 多媒体资源为空 | — |
| 28029014 | 资源签发失败，请重试 | — |
| 28029021 | 资源加密失败 | — |
| 28029022 | 无法获取相应消息 | — |
| 28029023 | 没有权限访问消息 | — |

  较 §8.4 记录增补 `28001005`/`28001006` 两条（其余 19 条与既有记录一致）；分享类 image/video 的 message_id 传入即落 `28029016`（不支持的消息类型，Desc 与 UseRestriction 互证）
- **rate limit 官方口径：无数值**——openApiMeta 无任何 QPS/频控/quota 数值字段；UseRestriction 仅两条（仅 user_local_image/user_local_video + 只能获取发送时间为半年内消息多媒体资源）；唯一的量级线索是错误码 `28003017 quota已用完`（Suggestion「联系平台处理」）与私有消息 FAQ 同款；FAQ 页无私信多媒体频控条款。结论：官方未公布量化 rate limit，实施按「无公开配额、出错 28003017 时退避」处理
- conversation_id 官方逐字（增补双源确认）：「会话 ID，来源于接收私信消息事件或群消息 Webhook 事件，对应 webhook 的 content 里的 conversation_short_id 字段（长期有效）」；message_id 同构且「仅支持 webhook content 中 msg_type 为user_local_image 和 user_local_video 的 message_id」
- Token InfoV2 逐字：Name `access-token`、Position `header`、Scene「所有场景」、Access `https://open.douyin.com/oauth/access_token/`——用户授权 token 链路再确认
- 异常响应逐字：`{"err_no": 28001008, "err_msg": "access_token过期,请刷新或重新授权", "log_id": "20240711044452AF709254C5F1B364A8D0"}`
- 三语 SDK 示例（meta 逐字）：go `douyin-openapi-sdk-go` `MessageResources`/`MessageResourcesRequest`；node `@open-dy/open_api_sdk` `messageResources`；java `com.douyin.openapi.client` `MessageResources`——三语方法名均 MessageResources，与 sdk-overview 页一致

### 9.3 问题三：事件全集复核与三项增量

dop 现行事件目录复核：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/event-list/ （updateTime 1760338827 = 2025-10-13，与 §2.1 所录一致，12 事件无增减；2026-11-05 晚间复查无增量：页面 updateTime 逐字节未变，SSR 正文在页可直接核）——im_send_msg、进私、已读之外的完整事件面为：用户撤回 `im_recall_msg`、主动私信授权 `im_authorize`、关注 `new_follow_action`、视频点赞 `new_video_digg`、分享视频 `create_video`、授权/解除 `authorize`/`unauthorize`、经营授权 `contract_authorize`/`contract_unauthorize`、联合授权 `union_auth_info_for_c`/`union_auth_info_for_b`、群族四事件、服务市场订单 `service_market_order`、订阅族两事件（§8.9）——BFF 全量检索交叉核对后**不存在「结束会话」「取消关注」「转人工」类事件**（相关检索仅命中工作台条款：抖音IM客服「6小时内无人发言则自动关闭会话」、客服平台「会话结束48小时内支持再次触达」）

增量一：union_auth_info_for_c/b 的 content 结构官方逐字（§2.1 只列表名未录结构，现版事件结构节补全）

```json
{
    "event": "union_auth_info_for_c",            //事件名为union_auth_info_for_c
    "from_user_id": "",                          //授权方user_id，加密
    "to_user_id": "",                            //被授权方user_id，加密
    "client_key": "",                            // 小程序id
    "content":"{
        \"c_client_key\":\"xxxxxx\",             // c端应用id
        \"c_open_id\":\"xxxxxxx\",               // c端openid
        \"b_client_key\": \"xxxxxxxx\",          // b端应用id
        \"b_open_id\": \"xxxxx\"                 // b端openid
    }"
}
```

（for_b 版本信封相同、content 四字段相同，事件名注释官方笔误写作 union_auth_info_for_c，照录；contract_unauthorize 注释逐字「用户解除授权的经营Scope和事件时间戳」；im_group_receive_msg / im_group_send_msg / group_fans_event / enter_group_audit_change 四个骨架示例 content 仍为空 `{}`，明细仍以 §8.5 群聊专页为准）

增量二：**遗留企业号事件表**（第二文档平台页 https://open.douyin.com/platform/resource/docs/develop/webhooks/event-list ，官方逐字全录）——事件名与现行 im_* 族完全不同，scope 统一 `enterprise.im`，create_video scope 记法为 `aweme.share（默认都有）`（现行页为 aweme.forward（默认开通），历史演进照录）：

| 事件名 | 描述（逐字） |
|---|---|
| receive_msg | 当前抖音用户收到的私信消息具体类型 |
| enter_im | 抖音用户进入当前抖音用户的私信对话框 |
| dial_phone | 抖音用户拨打当前抖音用户的个人主页智能电话 |
| website_contact | 抖音用户在当前抖音用户的转化页留资 |
| personaltabcontact | 抖音用户在当前抖音用户的主页留资 |

页注（逐字）：「当前抖音用户是指: 授权给开发者应用的抖音用户。其中 im 事件，需要当前抖音用户是企业号」「留资是指: 用户留下的咨询信息」「主页留资是指: 用户在账户主页进入商业化组件留下的联系信息」（原文无换行断句，照录）。schemas（逐字要点）：
- `receive_msg` content 仅 `description`（注释「具体见私信事件列表」；示例注释笔误「事件名为unauthorize」照录）
- `enter_im` content：`scene`（注释「进入对话来源场景["video", "homepage"]」）、`object`（注释「来源场景对应id（video对应视频id）」）
- `dial_phone` / `website_contact` / `personal_tab_contact` 无 content 字段（信封仅 event/from_user_id/to_user_id/client_key；目录表写作 personaltabcontact、schema 写作 personal_tab_contact，官方不一致照录）

**该遗留集与 §8.6 mock-webhook-event 的枚举（create_video、authorize、receive_msg、enter_im、dial_phone、website_contact、personal_tab_contact、verify_webhook）完全对应**——§8.6「mock 枚举与真实事件名不一致」就此收口：沙盒 mock 推送覆盖的是遗留企业号事件集，现行 im_* 族事件无 mock 通道

增量三：FAQ 页（https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/FAQ ，updateTime 1751286820 ≈ 2025-06-30，官方逐字）
- webhook 重试新口径：「抖音开放平台 Webhook 能力存在重试机制，会在 12 小时内进行退避重试」「重试机制目前仍在调优中，调用后相关重试规则会在 Webhook 文档上公布」——对 §3.3「5s 断开重试 3 次」的补充：官方现状为 12 小时窗口退避重试，细则待公布
- token 寿命表逐字：business_token 30d / biz_refresh_token 长期有效 / access_token 15d / refresh_token 30d / client_token 2h；refresh_token 有效性（逐字）：「可以通过renew_refresh_token接口续期5次；特殊需求下，可以配置每次调用 refresh_token 接口都会延长 refresh_token 本身的有效期到30d」——对 §6「刷新不续自身」的修正：**存在 `renew_refresh_token` 续期接口（至多 5 次），且可按应用配置刷新即续自身 30d**，§6.1 实施注中「refreshToken 刷新不续自身」的前提可据此放宽
- 引导卡防重复提交（逐字）：「应用多次调用接口传入相同的 content, media_id,title,app_id 参数创建小程序引导卡片，接口会返回相同的 card_template_id」
- 收不到 webhook 自查链：scope 权限 → 控制台订阅 →（需授权事件）用户授权勾选状态

### 9.4 相邻体系辨析（防检索误命中，均非 dop IM 私信）

- **ai-avatar 会话消息接口**：BFF 检索「会话消息查询/获取会话中的消息」命中的 https://developer.open-douyin.com/docs/resource/zh-CN/ai-avatar/develop/openapi/atomic-service/message-query-interface 与 .../get-session-messages 为**抖音 AI 分身**产品接口（apiPath `/dy_open_api/avatar/atomic/api/query_message/`、Domain `http://open-ai-byted-org.dyc.ivolces.com`、Psm `bytedance.avatar_arch.atomic_service_proxy`、无需用户授权的独立 token 体系），与 dop 私信 IM 不相通，勿混入本渠道
- **企业号素材上传（发送侧）**：第二平台页 https://open.douyin.com/platform/resource/docs/develop/common-tools/material-repo （官方逐字）：`POST /enterprise/media/upload/` 上传素材得 media_id，配 `enterprise/im/message/send/` 使用；「临时素材media_id 3天过期，已使用图片90天过期，私信场景推荐使用」「永久素材（单个抖音用户限500）」，图片 5MB（bmp/gif/png/jpeg/jpg，长宽<1500）、PDF 10MB；申请能力名逐字「im 代用素材上传」（入口 open.douyin.com/platform/business）——企业号命名空间的**发送侧**素材链路，不提供入站消息素材读取
- **商业开放平台（oceanengine）企业号私信**：https://open.oceanengine.com/labels/14/docs/1708600831239183 （第三方转述+页面摘要）：企业号私信发送消息接口支持文本、图片、消息卡片、群聊邀请、经营工具，「视频消息暂不支持」；窗口 48h/6 条、非互关需用户主动咨询行为——广告线索向的另一套私信发送 API（飞鱼线索回传闭环），未检出入站素材读取接口；与 dop 渠道凭证体系（client_key/oauth）不同源，DuDu 不接入

### 9.5 补充调研收口

- 问题一：无突破——分享类 image/video 判断维持（官方 SDK 全量路径 + 现版 webhook 页 + GetIMMessageResource UseRestriction 三方互证）；语音消息类型不存在于 dop 私信，无读取通道
- 问题二：有突破——media_type 全集官方逐字（image/video）、21 条错误码全表（较 §8.4 增 28001005/28001006）、rate limit 确认官方无量化口径（仅 28003017 quota 错误码）
- 问题三：有突破——遗留企业号事件表逐字全录（receive_msg/enter_im/dial_phone/website_contact/personal_tab_contact + schemas），收口 §8.6 mock 枚举之谜；union_auth_info_for/b content 结构、webhook 12h 退避重试、renew_refresh_token 续期机制为官方新条文；确认不存在「结束会话/取消关注」事件

### 9.6 renew_refresh_token 契约（补抓）

来源（apiMeta 型页，openApiMeta 全量提取；两页同体镜像，meta 完全一致）：dop 树 https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/refresh-token/ （标题「刷新 refresh_token」，页面 updateTime 1753969324 ≈ 2025-07-31）；mini-app 树 https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/basic-abilities/interface-request-credential/user-authorization/refresh-user-token （标题「刷新授权调用凭证」）。BFF 检索「renew_refresh_token」无独立命名页（仅社区帖），接口实体在上述两页

- **端点**：`POST https://open.douyin.com/oauth/renew_refresh_token/`（meta 逐字：Name `RenewRefreshToken`、CnName「刷新授权调用凭证」、Method=POST、Domain `https://open.douyin.com`、Psm `ma.open.passport_api`、EndpointId 1728196、Version 1.0.30、SupportSandBox true、ModifyTime 1780284490582 ≈ 2026-06-01）
- **凭证**：无 access-token 头（meta Token.Hidden=true）；页注（官方逐字）：「client_key 必须拥有 renew_refresh_token 权限」——`renew_refresh_token` 是「抖音授权」能力下的 scope（能力概览页逐字归组：「抖音授权……*授权动态续期：renew_refresh_token」，同组另有 incremental_authorization、auth.comment、unionauth.identification），能力申请入口为「管理中心 > 应用详情」（角色概述页逐字「权限开通及管理请前往『管理中心』>『应用详情』」）；社区帖（DocType 4，2023-03）证实该权限需提交审核（「renew_refresh_token授权审核好几天了，还是审核中」）
- **入参（form-urlencoded，官方 curl 逐字）**：

```bash
curl --location --request POST 'https://open.douyin.com/oauth/renew_refresh_token/' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'client_key=tt10abc******' \
--data-urlencode 'refresh_token=rft.a736b70544519999a6******'
```

  字段表（ReqSchema 逐字）：`refresh_token`（「填写通过 /oauth/access_token/ 获取到的 refresh_token 参数」；示例值带 `rft.` 前缀）、`client_key`（「应用唯一标识」）；HeaderParam 写 `Content-Type` 固定值 application/json，与 ReqExample 的 x-www-form-urlencoded **官方自相矛盾，照录**，实施按 curl 形态（同 §6 access_token 换取接口惯例）
- **响应结构（官方逐字）**：

```json
{
  "data": {
    "description": "",
    "error_code": 0,
    "expires_in": "86400",
    "refresh_token": "refresh_token"
  },
  "message": "success"
}
```

  信封为顶层 `data` + `message`（success/error，非 extra/data 族）；`data.refresh_token` 即响应携带的新 refresh_token 值；`expires_in` Desc 逐字「过期时间，单位（秒）」（meta Type=5 整型，成功示例却为字符串 "86400"=1 天，与 30 天条款矛盾，照录；实施按数值解析并兼容字符串）
- **轮换语义（Description 注意事项官方逐字）**：「刷新操作需要在 refresh_token 过期前进行」「通过旧的 refresh_token 获取新的 refresh_token，调用后旧 refresh_token 会失效，新 refresh_token 有 30 天有效期。最多只能获取 5 次新的 refresh_token，**5 次过后需要用户重新授权**」——**确认是轮换（返回新值、旧值立即失效），非仅延长原值**；官方 FAQ（DocType 3「token 有效期与续期」逐字）给出上限算式：「access_token 最长续期15天 refresh_token 30天 最多只能再获取5次新的refresh_token 最长续期：15 + 30 + 30 * 5 = 195 天」（与社区实测帖「网站应用 AccessToken 保持 195 天」互证）
- **错误码表（官方 ErrCodeList 逐字，HTTP 状态码全部 200）**：

| ErrCode | Desc | Suggestion |
|---|---|---|
| 10005 | 缺少参数 | 检查是否填写 client_key 和 refresh_token 参数，请求格式是否正确。 |
| 10004 | 权限不足 | 请申请 renew_refresh_token 权限。 |
| 10010 | refresh_token 过期 | token 已过期，请让用户重新授权。 |
| 10020 | 超过刷新次数限制 | 无法再刷新，请让用户重新授权。 |

  异常示例（官方逐字）：`{"data":{"captcha":"","desc_url":"","description":"scope权限非法","error_code":10004},"message":"error"}`——异常响应额外含 `captcha`/`desc_url` 字段
- **三语 SDK 方法名（meta 逐字）**：go `OauthRenewRefreshToken`/`OauthRenewRefreshTokenRequest`（douyin-openapi-sdk-go）；node `oauthRenewRefreshToken`（@open-dy/open_api_sdk）；java `OauthRenewRefreshToken`（com.douyin.openapi.client）
- **FAQ「可配置每次调用 refresh_token 接口都会延长 refresh_token 本身的有效期到30d」的配置项**：未找到公开文档命名该配置开关——renew 接口页与 UseRestriction 均无此条款，能力概览/角色概述仅给 scope 申请入口（管理中心 > 应用详情），社区帖证实权限走审核制；该「配置」为平台侧按特殊需求受理的能力配置，无公开开关名与控制台路径，实施按「默认轮换语义」处理，不依赖该配置
- **对 §6/§6.1 实施注的修正**：channel_info.refreshToken 语义改为「30 天轮换凭证——每次续期换新值，旧值作废，独立 token 至多续 5 次（此后需用户重新授权）；不续期时链路寿命 = 授权时 refresh_token 30 天 + access_token 15 天，续满 5 次约 195 天」；轮换实现要求落库时原子更新 refresh_token 值并防并发双刷（旧值一经使用即失效，双刷会互相踢）
