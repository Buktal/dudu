# 快手开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 open.kuaishou.com 官方文档 SSR 正文（13 页全文成功）+ WebSearch 官方站内摘录（标注 `[摘录]`）+ 平台文档前端 bundle `app.0028ffe6.js` 路由枚举（标注 `[路由]`，为官方文档站自身 JS 中的路由表实锤）。
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`[路由]` = 官方文档站 bundle 内路由字符串枚举；`待核验(09-27)` = 未能取得官方原文，需复核。
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文；原文缺逗号等笔误逐字保留并注明）。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.kuaishou.com/（首页同时写 `http://open.kuaishou.com/`）
- 开放平台文档（移动/网站应用，**JS 空壳 SPA**，WebFetch 只回 `We're sorry but open-platform doesn't work properly without JavaScript enabled`，正文抓不到）：https://open.kuaishou.com/platform/openApi（`?menu=22` 内容管理/`?menu=24` 直播·WebHook/`?menu=55` 服务端 SDK 等均为同一 SPA 视图参数）
- 小程序文档（`platformDocs/` SSR，可直抓）：https://open.kuaishou.com/platformDocs/openAbility/webHook/accessGuide
- 小程序服务端文档（`docs/` SSR，可直抓）：https://open.kuaishou.com/docs/develop/server/code2Session
- 开发者社区（帖子/公告，登录墙后）：https://developers.kuaishou.com/?bizType=web
- 开发者控制台（app_secret 查看路径，code2Session 页原文链接）：https://open.kuaishou.com/project/dev
- 小程序开发者平台（支付回调地址配置入口，各支付页原文统称）：`小程序开发者平台 -> 交易管理 -> 支付管理 -> 支付设置 -> 默认回调地址`

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| WebHook 接入指南（信封/应答/幂等/重试/验签入口） | https://open.kuaishou.com/platformDocs/openAbility/webHook/accessGuide | WebFetch 全文（更新 2024-09-06） |
| 测试事件 TEST（配地址校验握手） | https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/testEvent.html | WebFetch 全文（更新 2024-07-23） |
| 授权事件 AUTHORIZE | https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/authorizationEvent.html | WebFetch 全文（更新 2024-07-23） |
| 解除授权事件 UN_AUTHORIZE | https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/revocationOfAuth.html | WebFetch 全文（更新 2024-07-23） |
| 附录：请求签名算法 + 回调方式/重试策略（16 次时间表） | https://open.kuaishou.com/docs/develop/server/epay/appendix.html | WebFetch 全文（更新 2025-06-09） |
| 快手登录（含 code2AccessToken/refresh 全文） | https://open.kuaishou.com/platformDocs/openAbility/kwaiLogin | WebFetch 全文（更新 2024-07-23） |
| 开发者入驻（基本信息/邮箱/资质认证） | https://open.kuaishou.com/platformDocs/newGuide/entry.html | WebFetch 全文（更新 2026-03-06） |
| 应用注册（移动/网站/游戏应用，分配 app id/secret） | https://open.kuaishou.com/platformDocs/newGuide/login.html | WebFetch 全文（更新 2026-03-06） |
| 平台介绍（入驻+应用注册 → 开放能力） | https://open.kuaishou.com/platformDocs/newGuide/introduce | WebFetch 全文（更新 2024-09-06） |
| 小程序 code2Session | https://open.kuaishou.com/docs/develop/server/code2Session | WebFetch 全文（更新 2024-09-06） |
| 小程序 getAccessToken（client_credentials，48h） | https://open.kuaishou.com/docs/develop/server/getAccessToken.html | WebFetch 全文（更新 2024-09-10） |
| 发送订阅消息（含 QPS/错误码/curl） | https://open.kuaishou.com/docs/develop/server/sendMessage.html | WebFetch 全文（更新 2025-12-19） |
| 预下单 + 支付结果回调 PAYMENT | https://open.kuaishou.com/docs/develop/server/epay/open-api-new/prePay-new.html | WebFetch 全文（更新 2025-08-04） |
| 签解约能力 + CONTRACT 回调 | https://open.kuaishou.com/docs/develop/server/epayAuto/contract-new.html | WebFetch 全文（更新 2024-11-08） |
| 代扣能力 + WITHDRAW（WITHHOLD）回调 | https://open.kuaishou.com/docs/develop/server/epayAuto/withhold-new.html | WebFetch 全文（更新 2024-07-04） |
| 退款能力 + REFUND 回调字段 | https://open.kuaishou.com/docs/develop/server/epay/open-api-new/refund-new.html | `[摘录]`（回调字段表+状态枚举） |
| 结算能力 + SETTLE 回调 | https://open.kuaishou.com/docs/develop/server/epay/open-api-new/settle-new.html | `[摘录]`（回调存在性+地址优先级+自动结算） |
| 开发者入驻（SPA 版，同文） | https://open.kuaishou.com/platform/openApi?group=GROUP_OPEN_PLATFORM&menu=6 | `[摘录]`（与 entry.html 同文） |
| 内容/视频查询 API（scope.user_video_info，SPA） | https://open.kuaishou.com/platform/openApi?menu=22 | `[摘录]`（仅 API 表，JS 壳） |
| 直播 openApi（含 WebHook 目录项，SPA） | https://open.kuaishou.com/platform/openApi?menu=24 | `[摘录]`（仅目录，JS 壳，全文待核验(09-27)） |

---

## 2. 消息/事件推送全清单

快手是**两域并行**：A. 开放平台 WebHook（移动/网站应用，`event` 信封）；B. 小程序支付回调族（`biz_type` 信封）。两套信封字段、签名算法相同（MD5 + app_secret），但判型字段不同（`event` vs `biz_type`），模拟时必须区分。

**公开私信（IM）推送：无。**（证据见 §2.3。）

### 2.1 域 A：开放平台 WebHook 事件（`event` 判型）——全量仅 3 个

来源：三页 WebFetch 全文 + `[路由]` bundle 枚举。`app.0028ffe6.js`（官方文档站自身 bundle，150 万字符）中 `eventList/` 路由仅命中 3 组（`testEvent` / `authorizationEvent` / `revocationOfAuth`，各 `.html`/`.md`/无后缀三形态），**无第 4 个事件路由**——即开放平台 WebHook 公开事件目录穷尽为下表。

| 事件名（`event`） | 触发语义（页内"场景"逐字） | 签名 | 出处 |
|---|---|---|---|
| `TEST` | "开发者填写推送地址时，会发送此消息进行测试" | 需要验证签名 | testEvent 页全文 |
| `AUTHORIZE` | "用户给开发者授权时，会推送此事件" | 需要验证签名 | authorizationEvent 页全文 |
| `UN_AUTHORIZE`（官方即如此下划线命名） | "用户解除授权时，会推送此事件" | 需要验证签名 | revocationOfAuth 页全文 |

- `AUTHORIZE` data：`open_id`（用户的 openId）、`scope`（授权的 scope 列表，如 `["user_info","user_video_info"]`）、`is_new`（是否是新授权用户）。
- `UN_AUTHORIZE` data：`open_id`、`scope`（撤销的 scope 列表）。
- `TEST` data：仅 `{"timestamp":1622518497536}`（"测试消息发送了一个测试的时间戳"）。
- 通用信封（accessGuide 页逐字）："Webhooks 会给第三方发送四个固定字段：data（业务数据）……",实际为**五个**：`data` / `message_id` / `event` / `app_id` / `timestamp`（页内自称"四个"但列出五个，原文如此）。另三事件页信封作 `{"app_id","event","timestamp","message_id","data"}`（无 `biz_type`）。
- 示例级事件 `UNBIND_PLC`（accessGuide 页 demo，**无独立事件页**）："视频解绑"场景示例，data 含 `photo_id` / `author_open_id` / `reason`（"视频解绑原因"），`message_id` 注为"每次随机生成的 ID" → 全文待核验(09-27)，仅作示例引用（见 §5.4）。
- 使用场景举例（accessGuide 页逐字，非事件目录）："弹幕小玩法，开发者需要实时感知直播间内的点赞、评论、送礼行为"、"通知开发者用户授权结果"、"小程序支付异步完成通知"——其中点赞/评论/送礼**无公开事件页** → 待核验(09-27)。

### 2.2 域 B：小程序支付回调族（`biz_type` 判型）

来源：附录页 `biz_type` 枚举全文 + prePay/contract/withhold 三页全文 + refund/settle `[摘录]`。

| `biz_type` | 触发语义 | 回调地址来源 | 出处 |
|---|---|---|---|
| `PAYMENT` | 订单支付成功（status PROCESSING/SUCCESS/FAILED） | 预下单 `notify_url` 优先，否则平台"支付回调"默认地址 | prePay-new 页全文 |
| `REFUND` | 退款完成（status PROCESSING/SUCCESS/FAILED；含 refund_type 结算前/后/保证金） | 退款接口 `notify_url` 优先，否则默认地址 | `[摘录]` refund-new 页 |
| `SETTLE` | 结算成功（分账到可提现账户） | 结算接口 `notify_url` 优先，否则默认地址；另支持自动结算 | `[摘录]` settle-new 页 |
| `WITHHOLD` | 周期代扣成功/失败（withhold_state PAY_SUCCESS/PAY_FAILD——官方拼写 `PAY_FAILD`，原文如此） | 签约接口 `withhold_notify_url` | withhold-new 页全文 |
| `CONTRACT` | 签约/解约成功（contract_status CONTRACT_SUCCESS/UNCONTRACT_SUCCESS） | 签约接口 `contract_notify_url`；平台另有统一解约入口要求配置解约回调地址 | contract-new 页全文 |

- 支付回调信封（附录2逐字）：`{data, message_id, biz_type, app_id, timestamp}`——**无 `event` 字段**，与域 A 信封不同。
- 支付并签约产生**两个回调**：支付成功回调（与普通单次支付一致）+ 签约成功回调（contract-new 页全文）。
- 周期代扣节拍（withhold-new 页全文，前置说明）："会在代扣日期当天的 12 点，23 点执行三次代扣，若三次均代扣失败，则当前周期扣款行为结束（下个周期仍会正常发起代扣）"。
- 结算规则（`[摘录]` settle-new 页）："订单到达核销状态（订单状态为 11 或 15）满 3 天后可发起结算"；"订单在支付后 360 天后如果仍然未进行分账，则当笔交易无法进行资金结算"。
- 退款约束（`[摘录]` refund-new 页）："在途资金中的所有货款均是与订单关联的，只有当该订单在途资金中剩余金额超过退款金额时，才可以进行在途资金的退款"；退款接口频次 30QPS（小程序 app_id 维度）。
- 回调地址硬约束（prePay-new / contract-new 页全文）："通知 URL 必须为直接可访问的 URL，不允许携带查询串。"
- 配置路径（各支付页统一逐字）："【小程序开发者平台 -> 交易管理 -> 支付管理 -> 支付设置 -> 默认回调地址】"。

### 2.3 公开私信（IM/私信）推送：无 + 证据

1. **目录穷尽证据**：`[路由]` bundle 枚举显示开放平台 WebHook 事件目录仅 3 事件（§2.1），无任何私信/IM/消息事件。
2. **站内搜索证据**：`site:open.kuaishou.com 私信` 仅命中两类非推送内容——(a) 客户端 SDK"分享私信"（端上主动分享：`mKwaiOpenAPI.sendReq` / "通过 TargetOpenId 分享私信给个人，openId 是必须参数"，属端内分享能力，非服务端推送）；(b) 发送订阅消息接口（服务端单向模板下发，见 §6）。
3. **小程序消息能力证据**：小程序服务端"消息"仅有发送侧"发送订阅消息"（需用户先在客户端订阅；错误码含 `10001030 用户拒绝接收消息，例如用户设置了只接受关注者私信等`——证明"关注者私信"只是用户端开关，不对应开放推送事件）。
4. 结论：快手开放平台**无公开的"用户发私信 → 推给开发者回调"的服务端事件**；IM 相关仅抖音式企业号私信 webhook 在快手侧不存在。→ 该"无"结论本身若需复核，标待核验(09-27)（电商/服务号等分域文档未穷尽）。

---

## 3. 回调机制

来源：除单独标注外均为 accessGuide 页全文（域 A）与附录2全文（域 B 支付回调）。

### 3.1 URL 配置与首次校验握手（域 A）

- 配置路径（accessGuide 页逐字）："在**管理中心** Webhooks 页填写你要配置的回调地址"；"在应用配置里，在用户事件推送里配置消息回调地址"（配两张控制台截图）。
- 保存即验证（accessGuide 页逐字）："完成请求网址编辑后，点击保存按钮时，开放平台会向你配置的网址推送一个 POST 请求，该请求用于验证你配置的网址的合法性。需要用户按照协议返回对应的信息，来通过验证，协议见测试事件"。
- 验证协议 = `TEST` 事件（testEvent 页逐字）："开发者填写推送地址时，会发送此消息进行测试"；推送 `{"event":"TEST","timestamp":…,"message_id":"…","data":{"timestamp":…}}`，期望应答 `{"result":1,"message_id":"<收到的消息 ID>"}`（见 §5.1）。
- 传输（accessGuide 页逐字）："当事件(Event)发生时，开放平台会通过 https post 的方式将事件推送到开发者配置好的回调地址。"

### 3.2 成功判定与应答格式（双域统一）

- 规则（accessGuide 页逐字）："必须满足规则：返回**http 状态码是 200，并且返回字段 result=1 代表成功**，其他都是代表失败，失败平台会重试调用，调用次数根据事件名称配置化。"
- 开发者返回体（testEvent / authorizationEvent / revocationOfAuth / 附录2 / prePay / contract / withhold 七页逐字一致）：
```json
{
  "result": 1,
  "message_id": "ChFvYXV0aC5hY2Nlc3NUb2tlbhJQvpR51x8In46B1sDB"
}
```
"必填。1-成功，其他-失败。失败……会尝试重推此消息" + "当前消息的 message_id"。
- 支付回调追加要求（withhold-new / contract-new 页逐字）："在开发者服务端收到回调且处理成功后，需要按以下正常返回示例返回并且 HTTP 响应状态码设为 200，否则会认为通知失败并进行重试。"
- accessGuide 另给一份第三方成功返回 demo（含 SDK 侧日志形态，逐字，见 §5.7）。

### 3.3 重试与幂等、有序

- 支付回调重试表（附录2逐字，全文）："对于未收到成功返回的通知，消息最大重试次数为 16 次"，延迟：1→10s、2→30s、3→1m、4→2m、5→3m、6→4m、7→5m、8→6m、9→7m、10→8m、11→9m、12→10m、13→11m、14→12m、15→1h、16→2h。
- 通用 webhook 重试（accessGuide 页逐字）："webhook 调用第三方支持重试，重试次数可配置，webhook 保证业务方如果调用 webhook 成功，最终一定能通知到第三方"；"如果开发者没有返回或者返回的 result 不等于 1，则平台会尝试重复推送此消息，开发者务必做好消息的幂等处理！"
- **幂等口径矛盾（已核验，照录）**：accessGuide"消息发送说明"第 1 条称 "(2) message_id 由快手内部业务方调用 webhook，每调用一次都会随机生成的 ID，**不可用于业务幂等控制**……需要自己生产幂等参数放到 eventData"；同页第 2 条又称"第三方开发者需要根据 message_id 做好幂等控制"、"需要根据 eventData 里的业务方幂等参数（如果有的话）或 messageId 两个参数分别去重"。而附录2（支付回调）与三事件页 uniform 口径为："当前回调消息的唯一 ID，在同一个消息多次通知时，**保持一致**" / "唯一的消息 ID，开发者需要幂等，webhook 服务保证全局唯一，重试的消息保证 ID 一致"。→ **模拟器按 `message_id` 幂等实现**（全网七页一致口径），accessGuide 第 1 条作历史/通用通道口径备注 → 待核验(09-27)。
- 重复通知声明（withhold-new / contract-new 页逐字）："由于网络波动等原因，可能会产生重复的通知消息，开发者需要做好幂等处理。"
- 有序（accessGuide 页逐字）："webhook 不保证消息发到开发者的顺序和业务方调用 webhook 的顺序一致，如果需要保证消息的顺序，需要业务方自己设计处理。"
- 异步备注（accessGuide 页逐字，照录）："webhook 是异步调用第三方的，如果业务方想拿到第三方响应结果，需要接 webhook 的消息日志 MQ（包括调用第三方成功事件），但是调用第三方和记录日志 MQ 不是原子的，webhook 不保证调用第三方成功后一定有日志 MQ，解决办法：如果业务方没有收到日志 MQ 则重试调用 webhook"。

---

## 4. 验签与加密算法

来源：附录页全文。快手回调安全层 = **明文 JSON + header `kwaisign`（MD5）**，无 AES 加密（与微信/飞书不同）。

### 4.1 回调验签（平台 → 开发者）：`kwaisign = MD5(原始 body 字符串 + app_secret)`

- 入口（accessGuide 页逐字）："用户可通过请求 header 中的 kwaisign 字段来判断消息的可靠性。webhook 内部会对数据进行签名，开发者需要对签名的合法性进行验证，签名字段会放到 http header 里，字段名称：kwaisign，具体签名方式和签名参数见……（附录1、请求签名算法）"。
- 算法（附录2逐字）："取出 http body 中的原始字符串拼接 app_secret，然后使用 MD5 进行签名：MD5(${http_body_string} + ${app_secret})"。
- 官方验证示例（逐字，`appSecret = "Xgm23lSgws235hlgK"`）：
```
toSignStr = ${http_body} + ${appSecret}
// 即：toSignStr = {"data":{...},"biz_type":"PAYMENT","message_id":"76a50e0c-a843-492b-9bc6-463c1b178a9c","app_id":"ks696650570360602063","timestamp":1631515320564}Xgm23lSgws235hlgK
sign = MD5(toSignStr)
boolean result = sign.equals(kwaisign); // 验证是否相同
```
请求示例 header（逐字）：`kwaisign: e10adc3949ba59abbe56e057f20f883e`（注：该值为 MD5 空串 `123456` 的经典示例值，官方示例原文如此，不作回归向量）。
- body 用**原始字符串**（不得重序列化后再算），与飞书 sha256 口径同理。

### 4.2 请求签名（开发者 → 平台）：ASCII 升序 + app_secret 后缀 MD5

- 范围（附录1逐字）："所有由开发者发起
...[truncated 14068 chars]