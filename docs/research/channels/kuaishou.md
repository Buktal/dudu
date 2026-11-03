# 快手开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 open.kuaishou.com 官方文档 SSR 正文（13 页全文成功）+ WebSearch 官方站内摘录（标注 `[摘录]`）+ 平台文档前端 bundle `app.0028ffe6.js` 路由枚举（标注 `[路由]`，为官方文档站自身 JS 中的路由表实锤）
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`[路由]` = 官方文档站 bundle 内路由字符串枚举；`待核验(09-27)` = 未能取得官方原文，需复核
> 2026-11-03 第二轮：§6 全域消息通道深挖（电商开放平台客服消息通道实锤，另新增 `[网关]` = 电商文档网关官方数据接口直读、`[SDK]` = 官方 jar 反编译核验）
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文；原文缺逗号等笔误逐字保留并注明）

## 1. 官方文档入口与关键页面地址

- 门户：https://open.kuaishou.com/（首页同时写 `http://open.kuaishou.com/`）
- 开放平台文档（移动/网站应用，**JS 空壳 SPA**，WebFetch 只回 `We're sorry but open-platform doesn't work properly without JavaScript enabled`，正文抓不到）：https://open.kuaishou.com/platform/openApi（`?menu=22` 内容管理/`?menu=24` 直播·WebHook/`?menu=55` 服务端 SDK 等均为同一 SPA 视图参数）
- 小程序文档（`platformDocs/` SSR，可直抓）：https://open.kuaishou.com/platformDocs/openAbility/webHook/accessGuide
- 小程序服务端文档（`docs/` SSR，可直抓）：https://open.kuaishou.com/docs/develop/server/code2Session
- 开发者社区（帖子/公告，登录墙后）：https://developers.kuaishou.com/?bizType=web
- 开发者控制台（app_secret 查看路径，code2Session 页原文链接）：https://open.kuaishou.com/project/dev
- 小程序开发者平台（支付回调地址配置入口，各支付页原文统称）：`小程序开发者平台 -> 交易管理 -> 支付管理 -> 支付设置 -> 默认回调地址`

本次实际抓到并核实的页面清单

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

快手是**两域并行**：A. 开放平台 WebHook（移动/网站应用，`event` 信封）；B. 小程序支付回调族（`biz_type` 信封）。两套信封字段、签名算法相同（MD5 + app_secret），但判型字段不同（`event` vs `biz_type`），模拟时必须区分

**公开私信（IM）推送：无。**（证据见 §2.3。）

### 2.1 域 A：开放平台 WebHook 事件（`event` 判型）——全量仅 3 个

来源：三页 WebFetch 全文 + `[路由]` bundle 枚举。`app.0028ffe6.js`（官方文档站自身 bundle，150 万字符）中 `eventList/` 路由仅命中 3 组（`testEvent` / `authorizationEvent` / `revocationOfAuth`，各 `.html`/`.md`/无后缀三形态），**无第 4 个事件路由**——即开放平台 WebHook 公开事件目录穷尽为下表

| 事件名（`event`） | 触发语义（页内"场景"逐字） | 签名 | 出处 |
|---|---|---|---|
| `TEST` | "开发者填写推送地址时，会发送此消息进行测试" | 需要验证签名 | testEvent 页全文 |
| `AUTHORIZE` | "用户给开发者授权时，会推送此事件" | 需要验证签名 | authorizationEvent 页全文 |
| `UN_AUTHORIZE`（官方即如此下划线命名） | "用户解除授权时，会推送此事件" | 需要验证签名 | revocationOfAuth 页全文 |

- `AUTHORIZE` data：`open_id`（用户的 openId）、`scope`（授权的 scope 列表，如 `["user_info","user_video_info"]`）、`is_new`（是否是新授权用户）
- `UN_AUTHORIZE` data：`open_id`、`scope`（撤销的 scope 列表）
- `TEST` data：仅 `{"timestamp":1622518497536}`（"测试消息发送了一个测试的时间戳"）
- 通用信封（accessGuide 页逐字）："Webhooks 会给第三方发送四个固定字段：data（业务数据）……",实际为**五个**：`data` / `message_id` / `event` / `app_id` / `timestamp`（页内自称"四个"但列出五个，原文如此）。另三事件页信封作 `{"app_id","event","timestamp","message_id","data"}`（无 `biz_type`）
- 示例级事件 `UNBIND_PLC`（accessGuide 页 demo，**无独立事件页**）："视频解绑"场景示例，data 含 `photo_id` / `author_open_id` / `reason`（"视频解绑原因"），`message_id` 注为"每次随机生成的 ID" → 全文待核验(09-27)，仅作示例引用（见 §5.4）
- 使用场景举例（accessGuide 页逐字，非事件目录）："弹幕小玩法，开发者需要实时感知直播间内的点赞、评论、送礼行为"、"通知开发者用户授权结果"、"小程序支付异步完成通知"——其中点赞/评论/送礼**无公开事件页** → 待核验(09-27)

### 2.2 域 B：小程序支付回调族（`biz_type` 判型）

来源：附录页 `biz_type` 枚举全文 + prePay/contract/withhold 三页全文 + refund/settle `[摘录]`

| `biz_type` | 触发语义 | 回调地址来源 | 出处 |
|---|---|---|---|
| `PAYMENT` | 订单支付成功（status PROCESSING/SUCCESS/FAILED） | 预下单 `notify_url` 优先，否则平台"支付回调"默认地址 | prePay-new 页全文 |
| `REFUND` | 退款完成（status PROCESSING/SUCCESS/FAILED；含 refund_type 结算前/后/保证金） | 退款接口 `notify_url` 优先，否则默认地址 | `[摘录]` refund-new 页 |
| `SETTLE` | 结算成功（分账到可提现账户） | 结算接口 `notify_url` 优先，否则默认地址；另支持自动结算 | `[摘录]` settle-new 页 |
| `WITHHOLD` | 周期代扣成功/失败（withhold_state PAY_SUCCESS/PAY_FAILD——官方拼写 `PAY_FAILD`，原文如此） | 签约接口 `withhold_notify_url` | withhold-new 页全文 |
| `CONTRACT` | 签约/解约成功（contract_status CONTRACT_SUCCESS/UNCONTRACT_SUCCESS） | 签约接口 `contract_notify_url`；平台另有统一解约入口要求配置解约回调地址 | contract-new 页全文 |

- 支付回调信封（附录2逐字）：`{data, message_id, biz_type, app_id, timestamp}`——**无 `event` 字段**，与域 A 信封不同
- 支付并签约产生**两个回调**：支付成功回调（与普通单次支付一致）+ 签约成功回调（contract-new 页全文）
- 周期代扣节拍（withhold-new 页全文，前置说明）："会在代扣日期当天的 12 点，23 点执行三次代扣，若三次均代扣失败，则当前周期扣款行为结束（下个周期仍会正常发起代扣）"
- 结算规则（`[摘录]` settle-new 页）："订单到达核销状态（订单状态为 11 或 15）满 3 天后可发起结算"；"订单在支付后 360 天后如果仍然未进行分账，则当笔交易无法进行资金结算"
- 退款约束（`[摘录]` refund-new 页）："在途资金中的所有货款均是与订单关联的，只有当该订单在途资金中剩余金额超过退款金额时，才可以进行在途资金的退款"；退款接口频次 30QPS（小程序 app_id 维度）
- 回调地址硬约束（prePay-new / contract-new 页全文）："通知 URL 必须为直接可访问的 URL，不允许携带查询串。"
- 配置路径（各支付页统一逐字）："【小程序开发者平台 -> 交易管理 -> 支付管理 -> 支付设置 -> 默认回调地址】"

### 2.3 公开私信（IM/私信）推送：无 + 证据

1. **目录穷尽证据**：`[路由]` bundle 枚举显示开放平台 WebHook 事件目录仅 3 事件（§2.1），无任何私信/IM/消息事件
2. **站内搜索证据**：`site:open.kuaishou.com 私信` 仅命中两类非推送内容——(a) 客户端 SDK"分享私信"（端上主动分享：`mKwaiOpenAPI.sendReq` / "通过 TargetOpenId 分享私信给个人，openId 是必须参数"，属端内分享能力，非服务端推送）；(b) 发送订阅消息接口（服务端单向模板下发，见 §6）
3. **小程序消息能力证据**：小程序服务端"消息"仅有发送侧"发送订阅消息"（需用户先在客户端订阅；错误码含 `10001030 用户拒绝接收消息，例如用户设置了只接受关注者私信等`——证明"关注者私信"只是用户端开关，不对应开放推送事件）
4. 结论：快手开放平台**无公开的"用户发私信 → 推给开发者回调"的服务端事件**；IM 相关仅抖音式企业号私信 webhook 在快手侧不存在。→ 该"无"结论本身若需复核，标待核验(09-27)（电商/服务号等分域文档未穷尽）

---

## 3. 回调机制

来源：除单独标注外均为 accessGuide 页全文（域 A）与附录2全文（域 B 支付回调）

### 3.1 URL 配置与首次校验握手（域 A）

- 配置路径（accessGuide 页逐字）："在**管理中心** Webhooks 页填写你要配置的回调地址"；"在应用配置里，在用户事件推送里配置消息回调地址"（配两张控制台截图）
- 保存即验证（accessGuide 页逐字）："完成请求网址编辑后，点击保存按钮时，开放平台会向你配置的网址推送一个 POST 请求，该请求用于验证你配置的网址的合法性。需要用户按照协议返回对应的信息，来通过验证，协议见测试事件"
- 验证协议 = `TEST` 事件（testEvent 页逐字）："开发者填写推送地址时，会发送此消息进行测试"；推送 `{"event":"TEST","timestamp":…,"message_id":"…","data":{"timestamp":…}}`，期望应答 `{"result":1,"message_id":"<收到的消息 ID>"}`（见 §5.1）
- 传输（accessGuide 页逐字）："当事件(Event)发生时，开放平台会通过 https post 的方式将事件推送到开发者配置好的回调地址。"

### 3.2 成功判定与应答格式（双域统一）

- 规则（accessGuide 页逐字）："必须满足规则：返回**http 状态码是 200，并且返回字段 result=1 代表成功**，其他都是代表失败，失败平台会重试调用，调用次数根据事件名称配置化。"
- 开发者返回体（testEvent / authorizationEvent / revocationOfAuth / 附录2 / prePay / contract / withhold 七页逐字一致）
```json
{
  "result": 1,
  "message_id": "ChFvYXV0aC5hY2Nlc3NUb2tlbhJQvpR51x8In46B1sDB"
}
```
"必填。1-成功，其他-失败。失败……会尝试重推此消息" + "当前消息的 message_id"
- 支付回调追加要求（withhold-new / contract-new 页逐字）："在开发者服务端收到回调且处理成功后，需要按以下正常返回示例返回并且 HTTP 响应状态码设为 200，否则会认为通知失败并进行重试。"
- accessGuide 另给一份第三方成功返回 demo（含 SDK 侧日志形态，逐字，见 §5.7）

### 3.3 重试与幂等、有序

- 支付回调重试表（附录2逐字，全文）："对于未收到成功返回的通知，消息最大重试次数为 16 次"，延迟：1→10s、2→30s、3→1m、4→2m、5→3m、6→4m、7→5m、8→6m、9→7m、10→8m、11→9m、12→10m、13→11m、14→12m、15→1h、16→2h
- 通用 webhook 重试（accessGuide 页逐字）："webhook 调用第三方支持重试，重试次数可配置，webhook 保证业务方如果调用 webhook 成功，最终一定能通知到第三方"；"如果开发者没有返回或者返回的 result 不等于 1，则平台会尝试重复推送此消息，开发者务必做好消息的幂等处理！"
- **幂等口径矛盾（已核验，照录）**：accessGuide"消息发送说明"第 1 条称 "(2) message_id 由快手内部业务方调用 webhook，每调用一次都会随机生成的 ID，**不可用于业务幂等控制**……需要自己生产幂等参数放到 eventData"；同页第 2 条又称"第三方开发者需要根据 message_id 做好幂等控制"、"需要根据 eventData 里的业务方幂等参数（如果有的话）或 messageId 两个参数分别去重"。而附录2（支付回调）与三事件页 uniform 口径为："当前回调消息的唯一 ID，在同一个消息多次通知时，**保持一致**" / "唯一的消息 ID，开发者需要幂等，webhook 服务保证全局唯一，重试的消息保证 ID 一致"。→ **模拟器按 `message_id` 幂等实现**（全网七页一致口径），accessGuide 第 1 条作历史/通用通道口径备注 → 待核验(09-27)
- 重复通知声明（withhold-new / contract-new 页逐字）："由于网络波动等原因，可能会产生重复的通知消息，开发者需要做好幂等处理。"
- 有序（accessGuide 页逐字）："webhook 不保证消息发到开发者的顺序和业务方调用 webhook 的顺序一致，如果需要保证消息的顺序，需要业务方自己设计处理。"
- 异步备注（accessGuide 页逐字，照录）："webhook 是异步调用第三方的，如果业务方想拿到第三方响应结果，需要接 webhook 的消息日志 MQ（包括调用第三方成功事件），但是调用第三方和记录日志 MQ 不是原子的，webhook 不保证调用第三方成功后一定有日志 MQ，解决办法：如果业务方没有收到日志 MQ 则重试调用 webhook"

---

## 4. 验签与加密算法

来源：附录页全文。快手回调安全层 = **明文 JSON + header `kwaisign`（MD5）**，无 AES 加密（与微信/飞书不同）

### 4.1 回调验签（平台 → 开发者）：`kwaisign = MD5(原始 body 字符串 + app_secret)`

- 入口（accessGuide 页逐字）："用户可通过请求 header 中的 kwaisign 字段来判断消息的可靠性。webhook 内部会对数据进行签名，开发者需要对签名的合法性进行验证，签名字段会放到 http header 里，字段名称：kwaisign，具体签名方式和签名参数见……（附录1、请求签名算法）"
- 算法（附录2逐字）："取出 http body 中的原始字符串拼接 app_secret，然后使用 MD5 进行签名：MD5(${http_body_string} + ${app_secret})"
- 官方验证示例（逐字，`appSecret = "Xgm23lSgws235hlgK"`）
```
toSignStr = ${http_body} + ${appSecret}
// 即：toSignStr = {"data":{...},"biz_type":"PAYMENT","message_id":"76a50e0c-a843-492b-9bc6-463c1b178a9c","app_id":"ks696650570360602063","timestamp":1631515320564}Xgm23lSgws235hlgK
sign = MD5(toSignStr)
boolean result = sign.equals(kwaisign); // 验证是否相同
```
请求示例 header（逐字）：`kwaisign: e10adc3949ba59abbe56e057f20f883e`（注：该值 `e10adc…` 为 MD5("123456")，非空串，空串 MD5 为 `d41d8…`；官方示例原文如此，不作回归向量，2026-09-10 复核注）
- body 用**原始字符串**（不得重序列化后再算），与飞书 sha256 口径同理

### 4.2 请求签名（开发者 → 平台）：ASCII 升序 + app_secret 后缀 MD5

- 范围（附录1逐字，2026-09-10 复核补全，原文件截断已修复）：“所有由开发者发起的接口请求，都需要使用 app_secret 签名”；不参签：字段名 sign/access_token、值为空的字段
- 算法：收集 URL 参数 + POST body 字段 → 按 key ASCII 升序 → `k=v&…` 拼接 → 末尾拼 app_secret → MD5。嵌套 JSON（contract_info/provider）先按示例键序转字符串再参签
- 来源：https://open.kuaishou.com/docs/develop/server/epay/appendix.html 附录1

### 4.3 电商域网关签名（开发者 → 平台，智能客服 send 适用）：字典序 + `&signSecret=` 后缀，MD5 小写 hex / HMAC_SHA256 Base64

- 来源（2026-11-03 直抓实锤，官方「API调用说明」页 id 401853，匿名 REST 网关可访问）：
  `GET https://open.kwaixiaodian.com/rest/open/platform/doc/page/detail?pageSign=8cca5d25ba0015e5045a7ebec6383b741614263875756`
  （SPA 壳抓取链：宿主 bundle `app.fb013fd4.js` 内枚举出 `/rest/open/platform/doc/page/detail` 端点，参数 pageSign）
- 与开放域 §4.2 为**两套不同算法**：电商域后缀是 `&signSecret=<signSecret>`（带字面键名），开放域是直接拼 secret；电商域支持双算法且 HMAC_SHA256 输出 Base64
- 请求形态：query 或 form 参数族 `appkey/method/version/param/access_token/timestamp(毫秒)/signMethod/sign`；Content-Type 仅支持 `application/x-www-form-urlencoded`，POST 时 param 放 body 防 URL 过长
- 待签参数（SDK `getSignParam` 逐字）：method/appkey/access_token 必传，signMethod/version/timestamp/param 可选（null 跳过）；**排除 sign 与 byte[] 类型参数**；signSecret 只作加签因子绝不传输
- 拼接（SDK `sortAndJoin` 逐字）：TreeMap 按 key 字典序，`k=v` 保留等号，`&` 连接；末尾追加 `&signSecret=<signSecret>`（原文示例与代码一致：`MD5(access_token=xxx&appkey=ks123&method=…&param={…}&signMethod=MD5&timestamp=1583271919000&version=1&signSecret=xxxxxx)=sign`）
- 摘要：`signMethod=MD5` → commons-codec `DigestUtils.md5Hex`（小写 hex）；`signMethod=HMAC_SHA256`（官方推荐）→ `Mac HmacSHA256(inputStr, key=signSecret)` 后 **Base64 编码**（非 hex）
- 时序：先算签名再对 param 做 URL encode（双引号与冒号也需编码）；签名 2020-10-16 灰度、2020-10-31 生效
- 生产域名（§同页 2.1 逐字）：推荐 `https://openapi.kwaixiaodian.com`，备用 `https://open.kwaixiaodian.com`；测试环境不对外开放
- 智能客服 send（`open.cs.intelligent.message/send`）不在 category/list 目录（display=false），`api/detail?apiName=` 探测 500 —— 入参规格以 §6.5 文档页 401673 为准

---

## 5. 补摄：新文档站与 IM 能力复核（2026-11-03）

> 方法：沿用头注标注约定，本节新增 `[目录]` = 官方文档站自身导航数据（titlePath.json）的目录枚举实锤。抓取链：`/doc/docs-page`（SPA 壳）→ 宿主 bundle `app.d8a919c2.js` → qiankun 微前端 `open-micro`（entry `https://open-micro.kuaishou.com`）→ 文档中心组件 chunk 内读到四棵文档树地址与搜索接口

### 新文档站结构与数据接口（直抓核验）

- 入口：https://open.kuaishou.com/doc/docs-page（导航名「文档中心」）。WebFetch 与 curl 均只回 SPA 壳（title「快手开放平台」，51KB 无正文）
- 宿主 bundle：`//p66-plat.wskwai.com/udata/pkg/cloudcdn/js/app.d8a919c2.js`（4.39MB）+ `runtime.c1019384.js`；`/platform/openApi` 控制台 SPA bundle 已换新为 `app.e6e025e7.js`（头注所记 `app.0028ffe6.js` 已失效）
- 微前端：`/doc/` 路由挂载 qiankun 微应用 `open-micro`，entry = `https://` + `window.IDC_DOMAIN.API_OPEN_MICRO`；宿主 HTML 逐字：`IDC_DOMAIN = { API_MP: 'mp.kuaishou.com', API_OPEN: 'open.kuaishou.com', API_DEVELOPERS: 'developers.kuaishou.com', API_ID: 'id.kuaishou.com', ESHOP_OPEN: 'open.kwaixiaodian.com', API_OPEN_MICRO: 'open-micro.kuaishou.com' }`
- 微应用为 Vite 构建（项目 business-ecosystem，entry `//p2-plat.wskwai.com/kos/nlav111449/business-ecosystem/assets/index-DxBHe8ur.js`，2MB 壳）；`docs-page` 子路由组件 chunk `index-DZ85Ts6R.js` 内含文档搜索与四树导航
- 四棵文档树（bundle 内逐字，URL 省略同为 `https://w2.kskwai.com/kos/nlav11876/` 下）：`[{title:"小程序",url:"docs/assets/titlePath.json",baseURL:"https://open.kuaishou.com/docs"},{title:"小玩法",url:"miniPlayDocs/assets/titlePath.json",baseURL:"https://open.kuaishou.com/miniPlayDocs"},{title:"网站/移动应用",url:"platformDocs/assets/titlePath.json",baseURL:"https://open.kuaishou.com/platformDocs"},{title:"小游戏",url:"miniGameDocs/assets/titlePath.json",baseURL:"https://open.kuaishou.com/miniGameDocs"}]`
- 文档搜索接口（bundle 内逐字）：`https://docs-search.gifshow.com/api/search/all`，GET，参数 `keyword` + `filter:"201,202,501,502"` + `mode:"preview"` + `appId:"mp-docs"`；响应顶层数组 `items[]`（`from:"docs"|"forum"`，含 `cid/cname/menu/path/title/preview`）；测试环境域名 `mp-docs-search.test.gifshow.com`
- 目录穷尽规模 `[目录]`：小程序 880 页、网站/移动应用 24 页、小玩法 40 页、小游戏 360 页（四份 titlePath.json 去重 `isDoc` 链接计数；小玩法树为直播弹幕玩法专域，准入需玩法提案与资质审核）

### 旧待核验项处理

- `platformDocs` 树 24 页全枚举 `[目录]`：WebHook 仅 `accessGuide` + `testEvent`/`authorizationEvent`/`revocationOfAuth` 三事件页，无第 4 事件页、无直播章节——与 §2.1 旧 bundle 枚举互证
- 旧「直播 openApi WebHook（SPA `?menu=24`）待核验(09-27)」仍未闭环：目录数据为登录态服务端下发（`page-openapi.7a2d8ea1.js` chunk 实为 markdown 渲染组件，匿名不可得）→ 改标待核验(11-03)

### IM/客服能力复核：维持「无」（三路穷尽证据）

1. `[目录]` 四树合计 1304 页标题+链接逐条扫描：`客服` 仅命中客服消息能力页与客服履约规范页；`私信` 仅命中私信分享（端上分享）页；无任何"私信/会话/聊天"推送或发送 API 页
2. 官方文档搜索索引（docs-search.gifshow.com，即文档中心线上检索）：`私信/客服/客服消息/客服会话/消息推送/发消息/webhook/回调/会话/pushMsg` 全量扫描，docs 侧命中全部收敛于已知非 IM 页（客服消息能力、订阅消息 sendMessage、saas pushMsg、epay 附录、小游戏 messagePush、button 组件、支付回调）——无第 5 类
3. 微前端 bundle 关键词扫描：`私信/客服/消息/回调/订阅消息` 0 命中（`webhook` 2 处均为小玩法监控指标名 `happyPlayWebhook*`/`interactionPlayWebhook*`）

### 新发现：小程序「客服消息能力」= 人工工作台，无服务端 API

来源：https://open.kuaishou.com/docs/develop/functionAccessGuide/customerService（更新 2025-12-30，全文核验；此前未见于快手文档，微信/小红书同款模式不成立）

- 会话入口（逐字）："开发者仅需在小程序代码里使用button组件，且支持自定义样式嵌入，即可完成对客服能力的集成"；button 组件页（/docs/develop/components/form/button）`open-type` 枚举含 `'contact'`，释义逐字"`| 'contact' | 打开客服会话 | -`"
- 复访入口（逐字）："复访入口共有两个，分别在「小程序中心页/意见反馈」和「私信页/客服消息」页面，方便用户下次快速访问"（会话体在快手 App 私信基础设施内）
- 收发两端均为平台 UI（逐字要点）："在 能力-互动-客服 页面点击「前往回复」按钮，即可进入客服工作台"；"会话支持发送文本、图片、表情等消息内容"；"会话支持转单、设置为待处理、关单；支持快捷发送配置的常用话术"；分流"就近分流、负载分流、离线分流、不分流"四种；客服成员"仅支持从小程序项目成员里来新增"
- 全页无任何 API/回调/token/密钥；四树穷尽亦无客服消息服务端接口页；客服履约规范（/docs/operate/reviewSpecification/service-performance/performance，更新 2023-08-30，全文核验）通篇为人工 SLA（72 小时解决占比要求、"客诉率需保证在万分之二十五以内"红线），佐证无机器接入面 → DuDu 不可程序化接入该能力

### 新发现：其他推送族（均非 IM，事件仅管理/履约域）

- **第三方平台（服务商）推送族**：/docs/saas/develop/api/encryptedMsg（更新 2023-02-08）+ `auth/pushAuth`、`auth/pushMsg`、`auth/componentTicket` 三页全文核验。服务商创建三方应用时配置【授权事件接收 URL】【消息与事件接收 URL】【消息验证 TOKEN】【消息加密解密 KEY】（encryptedMsg 页逐字）；推送信封（三页逐字一致）：
```json
{
  "encryptedMsg": "ERWLSF239035_=FW3LFLSFL23L4K023JLKLSFSMF2L3-S3HNFA",  //加密后信息
  "msgId": "a63cae97-3ded-4f76-be21-8d45112ee06f",  // 消息ID
  "componentAppId": "ks656399649443988986",  // 三方应用ID
  "timestamp": 1625740912167  // 毫秒
}
```
  验签（encryptedMsg 页逐字）：`sha1Hex(bodyStr + tokenStr)` 与 header `kwaisign` 比对——**SHA1+TOKEN，与 §4 域 A/B 的 MD5+app_secret 不同**；解密：AES/CBC/PKCS5Padding，key =【消息加密解密 KEY】base64 解码（32 字节），iv = key 前 16 字节；应答 `{"result":1,"message_id":"<msgId>"}`（msgId 取自请求）；"否则第三方平台服务器会认为推送失败，从而进行多次重试（重试 3 次）"（逐字）。事件穷尽：`COMPONENT_TICKET`（每 10 分钟推送，有效期 3 小时）、`AUTHORIZED`/`DELETE_AUTHORIZED`/`UPDATE_AUTHORIZED`（授权/取消/更新）、`PACKAGE_AUDIT`（代提审代码审核结果，含 `auditResult.status` 0-拒绝/1-成功）——全部管理域，无用户消息事件
- **行业方案回调（本地生活）**：/docs/develop/IndustrySolutions/introduce/saas/access/mpEventCallback（更新 2023-03-01）与 `.../saas/access/eventCallback`（更新 2024-08-21，服务商版）全文核验。事件仅 `POI_MERGE`、`PRODUCT_OPERATION`（`operation_type` LOCK/UNLOCK）；单体小程序版用明文信封 `{app_id,event,timestamp,message_id,data}`（message_id 注"唯一的消息 ID, 开发者需要幂等, 重试的消息保证 ID 一致"），服务商版走上述加密信封。解密后 POI_MERGE 示例（eventCallback 页逐字）：
```json
{
    "componentAppId": "ks343546567687879",
    "appId": "ks435657687054657",
    "event":"POI_MERGE",
    "eventTime": 1625740912167,
    "oldPoiId": "2850",
    "newPoiId": "2851",
    "attach" : "type:MT"
}
```
- **小游戏消息推送**：https://open.kuaishou.com/miniGameDocs/gameDev/open-function/messagePush（更新 2026-09-07，全文核验）。配置：小游戏详情页→开发设置→消息推送（服务器地址 + token；"消息加密方式 - 暂时仅支持明文"；"修改消息推送配置会导致该游戏下所有礼包下架"）。推送 body（逐字）：
```json
{
    "appId": "ks12345678",
    "bizType":"GIFT",
    "nonce":"abcdefg",
    "timestamp": 1764669159615,
    "sign": "XXXXXXXXXXXXXX",
    "message": "{\"giftId\":12345678910,\"giftType\":1,\"giftName\":\"每日签到礼包\",\"giftUniqueId\":\"abcdefghijk\",\"openId\":\"120XXXXXXXXXXXXXabcd\",\"productList\":    [{\"productId\":\"abcdef1\",\"productName\":\"第一个道具\",\"productAmount\":100},{\"productId\":\"abcdef\",\"productName\":\"第二个道具\",\"productAmount\":100}],\"env_type\":\"PROD\",\"sendTime\":1764669159615}"
}
```
  "当前消息推送仅支持礼包发放场景，枚举如下: GIFT：礼包发放"（逐字）；验签（逐字）："将 appId, bizTypeName, nonce, timestamp, token, message 按照排列顺序用 & 符号拼接成一个字符串……进行 md5 计算，并对 md5 计算结果进行 base64 编码"。→ 履约推送，非 IM
- **站外方向仅记录入口**：电商开放平台 https://open.kwaixiaodian.com（即 IDC_DOMAIN.ESHOP_OPEN；Vue SPA 壳，正文匿名不可抓）`[摘录]` 消息服务说明（2024-10 更新）：应用中心→消息管理→消息通道配置→打开推送服务开关→订阅事件消息；消息族为 `kwaishop_order_*` 订单/履约域（结构含 `eventId/msgId/bizId`），未见客服会话消息类型 → 已于 §6 闭环（SPA 匿名壳之下另有文档网关与两条准入制消息通道，见 §6.1/§6.5/§6.6）。磁力引擎开放平台 https://developers.e.kuaishou.com = Marketing API（广告投放 DSP），未见 IM 接口 → 已于 §6.7 闭环。「企业号私信发送消息接口」开放文档属抖音/巨量引擎商业开放平台（open.oceanengine.com）`[摘录]`，快手无对应物（WebSearch 旁证）

### 结论

- 维持 §2.3：截至 2026-11-03，快手**无「用户消息 → 开发者回调」推送，无服务端发送用户会话消息 API**（新文档站 1304 页目录 + 官方搜索索引 + 微前端 bundle 三路穷尽）。新增「客服消息能力」收发两端均为平台 UI（用户端 button `open-type="contact"`/私信页，开发者端人工工作台），机器不可接入
- 对 DuDu：快手渠道不可作为消息渠道（接收/发送均无开放接口）的结论不变；服务端单向能力仍仅"发送订阅消息"（§1 表 sendMessage 行，需用户先订阅）。重新评估的触发条件：快手未来开放客服消息服务端 API（微信小程序客服消息同款）或私信机器人接口——**该触发条件已于电商域命中，见 §6 终判修订**

## 6. 补摄：全域消息通道深挖——电商开放平台客服消息通道实锤（2026-11-03 第二轮）

> 背景：两轮研究（2026-09-10、2026-11-03 §5）结论「快手无消息通道」后，按指示对快手全部可能承载消息收发的域做穷尽式深挖（电商开放平台/磁力引擎/直播 WebHook/企业号/第三方客服厂商/小程序复查）。**电商域突破：找到两条真实的买家↔商家消息通道（智能客服、物流会话），协议已实施级落库；但均为准入制，非自助开放**
> 方法与抓取链：open.kwaixiaodian.com 门户（SPA 壳，正文匿名不可抓）→ 商家控制台 SPA bundle（`eshop-app.js`）→ qiankun 式微前端加载器 DLProvider/kconf 配置服务（POST `https://s.kwaixiaodian.com/rest/wd/kconf/mget`，key `micro_JEpYAfqpq5` → 微前端 entry URL）→ 微前端 `kwaishop-open-micro` chunks → 文档模块（webpack chunk 81095）内 fetch 助手还原出**匿名 REST 文档网关**（无需登录，均官方数据接口）：
> - `POST https://open.kwaixiaodian.com/rest/open/platform/doc/search`（body `{"title":X,"pageNum":N,"pageSize":N}`；实测 `title` 参数不过滤、返回全库分页（810 条文档），`keyword` 参数恒 0 命中——借此取全语料后本地关键词过滤）
> - `GET /rest/open/platform/doc/page/detail?pageSign=<页签>`（页面正文，如「消息服务说明」）
> - `GET /rest/open/platform/doc/event/category/list`；`GET /rest/open/platform/doc/event/name/detail?name=<事件名>&version=1`
> - `GET /rest/open/platform/doc/api/category/list`；`GET /rest/open/platform/doc/api/name/detail?name=<接口名>&version=1`
> - `GET /rest/open/platform/doc/structure/detail?id=<结构id>`（入参/出参引用的结构体全文）
> - `GET /rest/open/platform/sdk/api/download`（官方 Java SDK jar 下载）
> 经上述网关取回的正文按「官方正文已核验」处理；官方 jar 反编译结论标注 `[SDK]`。本节新增第二处独立标注约定：`[网关]` = 上述电商文档网关的官方数据接口直读

### 6.1 电商开放平台通用接入形态（网关 + 凭证 + 签名）

- 网关域名（各 API 详情 `domains` 元数据逐字）：线上环境（推荐）`https://openapi.kwaixiaodian.com`；线上环境（备用）`https://open.kwaixiaodian.com`
- 调用形态（官方 CURL 示例逐字，全站统一）：`POST` `Content-Type: application/x-www-form-urlencoded`，表单参数 `method=<API名>` `version=1` `access_token` `appkey` `signMethod=MD5` `sign` `timestamp=<毫秒>` `param=<URL编码的 JSON 业务参数>`
- 凭证（官方 SDK 使用文档，docId 页「SDK使用」全文）：OAuth2 code 授权（`OauthAccessTokenKsClient(appKey, appSecret[, serverRestUrl]).getAccessToken(grantCode)`，`refreshAccessToken(refreshToken)` 刷新）与 client_credentials（`OauthCredentialKsClient(appKey, appSecret).getAccessToken()`）两种；接口客户端 `AccessTokenKsMerchantClient(serverRestUrl, appKey, signSecret)`（签名密钥 signSecret 参与网关 sign 计算）
- SDK：`GET /rest/open/platform/sdk/api/download` 取官方 jar（2.1 MB，"目前官方仅支持JAVA版本SDK"，JAVA SE/EE 1.6+）`[SDK]`

### 6.2 标准消息推送基座（「消息服务说明」，docId 401854，更新 2024-10-11）——全文核验

- 开通路径（逐字要点）：应用中心→选择应用→左侧「消息管理」→消息通道配置→打开推送服务开关→填写推送网址→应用订阅消息→订阅事件保存后立即生效
- 接收 url 硬条件（逐字）：支持 POST；HTTP 返回码 200；返回 `{"result": 1}`。"保存的时候平台会向该推送网址发一条测试消息\"{\"test\":true}\""；"消息至少会推送一次，请开发者自行做幂等，平台会对应用的url进行心跳检测，url不可达时会暂停对其发送消息"；"发送消息后会等待消息回执，超时时间为3000ms……消息将进行重试"
- 官方告诫（逐字）："消息推送可能存在消息丢失和重复(平台漏推、app接收不及时、重复推送等异常情况)，建议开通消息推送的同时，也通过api定时拉取来兜底（要保证幂等），保证数据完整性"
- 信封字段表（逐字，单条消息 JSON）：

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| eventId | String | 消息唯一id | 267_2345_147402 |
| bizId | Long | 业务id如订单id、退款单id、商品id | 201560025620985 |
| userId | Long | 商家id | 12342323 |
| openId | String | 商家openId | dafagkncislgga |
| appKey | String | 应用Id | ks669064233797003102 |
| event | String | 消息标示 | kwaishop_order_addOrder |
| info | String | 消息内容，业务内容Json串，详见消息文档参数 | "{"oid":201560025620985,"sellerId":12342323}" |
| createTime | Long | 创建时间 | 1591274070333 |
| test | Boolean | 是否心跳测试事件 | true |

- 加密（逐字）："消息体采用AES加密, 每个应用在开通消息订阅功能时会生成唯一AES私钥"，获取路径 应用中心→详情→查看；官方 `PlatformEventSecurityUtil.decode` 源码逐字：`CIPHER_ALGORITHM = "AES/CBC/PKCS5Padding"`，key = `Base64.decodeBase64(privateKey)`，IV = `new IvParameterSpec(new byte[16])`（**全零 16 字节**——与 §5 服务商推送族 iv=key 前 16 字节、与 §4 域 A/B 明文 MD5 验签均不同，快手三套回调加密体系互相独立）；回执 Header `text/plain;charset=utf-8`、Body 加密内容、返回 `result:int`（1=成功）
- 重推（逐字）：自动重试 5 次，间隔 5/10/20/30/60 分钟；手动重推走「消息管理-消息查询」；消息测试工具：文档中心-消息文档→在线测试工具

### 6.3 推送事件目录穷尽：12 类 62 事件，零聊天/私信事件 `[网关]`

`GET /rest/open/platform/doc/event/category/list` 全量（官方目录数据，62 事件逐一核验）：

| categoryId | 类目 | 数量 | 事件（全部事件名逐字） |
| --- | --- | --- | --- |
| 44 | 商品消息 | 13 | kwaishop_item_addItem / auditStatusChange / cidChange / limitStrategyChange / offlineStatusChange / priceChange / skuChange / sku_stockChange / sku_stockZero / statusChange / stockModelChange / stockZero / titleChange（均 `kwaishop_item_` 前缀） |
| 43 | 订单消息 | 22 | kwaishop_order_addOrder / addNote / addressChange / addressUpdateAudit / delivering / deliveryEffect / deliverySuccess / enableDelivery / finishDelivery / holdDelivery / orderFail / orderRiskEventInfoBizChange / orderSuccess / paySuccess / productSkuChange / riskStatusChange / supplyChainInfoChange / totalFeeChange / tradeInNotify + kwaishop_crossborder_consign + kwaishop_test_open_transform_alpha_event / beta_event |
| 42 | 售后退款消息 | 2 | kwaishop_aftersales_addRefund / updateRefund |
| 46 | 快分销消息 | 4 | kwaishop_distribute_activity_item_change / order_change_notify / kwaishop_distribution_promoterOrder / regimentalOrder |
| 47 | 物流消息 | 2 | kwaishop_logistics_packageCodeReceipt / kwaishop_scm_user_userCoordinate |
| 55 | 评价消息 | 1 | kwaishop_comment_addComment（商品评价，非会话） |
| 56 | 服务市场消息 | 2 | kwaishop_service_market_addPaidOrder / authCancel |
| 100 | 账单消息 | 2 | kwaishop_funds_financial_settlement / postsales_change |
| 105 | 供应链消息 | 4 | kwaishop_scm_wareCreate / wareDelete / kwaishop_wms_outbound_remind / service_subscribed |
| 118 | 短信消息 | 1 | kwaishop_sms_send_callback_receipt（短信发送回执） |
| 131 | 电商直播消息 | 3 | kwaishop_live_like / live_share / live_stream_comment |
| 149 | 代发消息 | 6 | kwaishop_dropshipping_dsOrderChangeInfo / factoryOrderRefundStatusChange / factoryOrderStatusChange / orderRefundStatusChange / orderStatusChange / relationStatusChange |

- 判定：官方推送目录**无任何买家↔商家会话/私信事件**——§2.3「无私信推送」在电商标准推送族同样成立。唯一含用户生成内容的是直播评论：`kwaishop_live_stream_comment`（权限 scope `merchant_shoplive`「电商直播间权限」，oauthRole 商家）输出参数 buyerOpenId（用户openId）/timestamp/commentType（1 普通评论 2 新春评论 3 语音评论）/content；官方示例信封（逐字，注意 info 在此示例为内嵌对象而非 JSON 串，且多出 msgId/status/updateTime 字段，基座信封以 §6.2 表为准）：
```json
{"eventId":"237_6341_60079475","msgId":"470_60079469","bizId":23666666666666,"userId":2066666666,"openId":"f19666666666666666666666666666666","appKey":"ks66666666666666666","event":"kwaishop_live_stream_comment","info":{"buyerOpenId":"abcdef","timestamp":1659079893622,"commentType":1,"content":"评论内容"},"status":2,"createTime":1691563032872,"updateTime":1691567756044}
```

### 6.4 API 目录穷尽：26 类 347 接口，客服类目仅 4 个物流会话接口 `[网关]`

`GET /rest/open/platform/doc/api/category/list` 全量（官方目录数据）：商品API 58 / 订单API 21 / 用户API 3 / 店铺API 6 / 售后退款API 11 / 快分销API 92 / 物流API 14 / 营销API 14 / **客服API 4** / 虚拟API 4 / 评价API 3 / 服务市场API 3 / 安全API 6 / 行业API 4 / 快递API 9 / 账单API 24 / 供应链API 16 / 短信API 12 / 短视频API 6 / 电商直播API 4 / 电商商家运营赋能-商家服务API 3 / 代发API 16 / 工具API 1 / 发票API 6 / 保险API 3 / 商家会员API 4——合计 **347 接口 / 26 类目**

- 客服类目（categoryId 49）全部 4 接口：`open.cs.logistics.session.message.pull` / `open.cs.logistics.session.message.send` / `open.cs.logistics.session.create.callback` / `open.cs.logistics.session.close`（§6.6）——**目录内不存在任何自助开放的「发消息给买家」接口**；短信 API（open.sms.*）与商品评价 API（open.comment.*）均非会话
- 全语料（810 文档）关键词过滤补证：`私信` 命中全部为订单隐私加密/脱敏公告与安全规范（"订单隐私信息全量加密公告""手机号脱敏格式升级"等）；`智能客服` 命中 = 服务市场方案族 + 类目对接流程 + 两道准入公告（§6.5.4）；`客服消息` 命中 = 智能客服方案「对接实践」唯一一处

### 6.5 通道 A（实锤）：智能客服消息通道——买家↔商家双向（ISV/商家自研）

#### 6.5.1 官方方案族（服务市场方案：方案介绍 docId 401669 / 对接实践 401672 / 接口文档 401673）

- 定位（逐字）："本方案为快手智能客服场景的对接方案，提供了客服消息的发送和接受等相关的功能，ISV可以基于客服消息对话功能进行开发，帮助商家更高效地进行客服消息功能功能。开发完成后可用于商家自研或上架到服务市场给所有商家订购使用"（原文笔误逐字保留）
- 目标用户（逐字）："和快手小店做商品对接的第三方ISV或商家ISV。第三方ISV可入驻成为第三方开发者，创建商品管理类型的应用，在应用开发完成后发布到服务市场提供给快手的商家使用。商家ISV请使用注册了快手小店的快手id入驻成为商家开发者，在应用开发完成后提供给自有店铺使用"

#### 6.5.2 发送：`open.cs.intelligent.message.send`（API 详情全文；display=false，不对外目录展示，经方案接口文档页可达）

- 元数据：method POST（method=2）version 1；permissionScope `merchant_cs`；oauthRole `商家`
- 地址（对接实践逐字）：测试环境 `https://open-kwaixiaodian.test.gifshow.com/open/cs/intelligent/message/send`；正式环境 `https://open.kwaixiaodian.com/open/cs/intelligent/message/send`
- 入参表（逐字）：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| toUser | User | 是 | 消息的接受者：买家，role选择1 |
| messageList | List&lt;MessageContent&gt; | 是 | 消息内容 |
| transferList | List&lt;User&gt; | 否 | 消息转接用户 |
| generator | Integer | 是 | 消息的发起者 1: 代表是快手侧发起的会话，服务商只是异步回复 2: 代表是服务商侧主动发起的会话 |
| type | Integer | 是 | 事件类型 1：消息 2：转接 4: 辅助模式下无法应答 |
| requestId | String | 是 | 唯一请求ID（示例 fadbsadfg1323） |
| fromUser | User | 是 | 消息的发送者：商家，role选择2 |

- 出参（官方示例逐字）：`{"result": 1,"error_msg": "SUCCESS"}`
- 官方 CURL 示例（逐字，占位符原文保留）：
```
curl --request POST 'https://openapi.kwaixiaodian.com/open/cs/intelligent/message/send' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Accept: application/json;charset=UTF-8' \
-d 'method=open.cs.intelligent.message.send' \
-d 'version=1' \
-d 'access_token=your accessToken' \
-d 'appkey=your appKey' \
-d 'signMethod=MD5' \
-d 'sign=your sign' \
-d 'timestamp=1623135246890' \
-d 'param=<URL编码JSON：requestId/type/transferList/generator/fromUser/toUser/messageList>'
```
- `User` 结构（structureId 296）：`nickName` String 必填（示例 快手用户1234）；`role` Integer 必填（1买家 2商家 3客服）——**结构体无 openId 字段**；而推送侧 User JSON 带 openId（§6.5.3）、评价接口入参直接用 openId（下条）→ 回复时的买家定位大概率由 requestId 关联推送上下文实现，实施时须实测 → 待核验(11-03)
- `MessageContent` 结构（structureId 297）：`contentType`（1文本 2图片 1011商品卡片 1012订单卡片）/ `content` String / `hints` List&lt;Hint&gt;（辅助建议，Hint{hintItemList[HintItem{contentType,content}]}）。content 各型官方释义（逐字要点）：文本 `{"text": "xxxxxxxx", "hintTag": {...}}`，hintTag 为脱敏标签（phone/address/idCard/bankId/email）；图片 `{"uri": "", "width", "height", "contentLength"}`（"uri: 原uri换为空字符串，其他信息保留"——平台抹除原图链）；商品卡片 `{"text": "$itemId"}`；订单卡片 `{"orderId": "12345"}`
- 配套接口 `open.cs.intelligent.evaluation.message`（智能客服发送评价邀请卡片）：入参仅 `toUserId` String 必填 = "接收者openId"；地址 `/open/cs/intelligent/evaluation/message`——旁证该接口族用户以 openId 寻址
- `[SDK]` 官方 jar 内实锤类：`OpenCsIntelligentMessageSendRequest/Response`、`OpenCsIntelligentEvaluationMessageRequest/Response`（包 `com.kuaishou.merchant.open.api.request/response.cs`），`javap` 核对字段与上表一致

#### 6.5.3 接收：买家→商家消息异步推送（ISV 提供接口，对接实践 docId 401672 全文）

- 形态（逐字）："ISV侧需要提供接口"；POST `Content-Type: application/json`；"接口地址（需要线下提供给快手侧）"——推送地址不在控制台配置，走线下报备
- 验签（逐字）：Header `Ks-Sign` = `MD5(appKey + entity)`（entity=原始请求体）；Header `Ks-Event-Type` = 事件类型
- 推送 body 结构（逐字表）：`requestId` string 必填（唯一请求ID）/ `createTime` number 必填 / `generator` number 必填（1 快手侧发起的服务商异步回复，2 服务商侧主动发起）/ `type` number（1 消息，2 转接）/ `fromUser` User（消息的发送者：买家）/ `toUser` User（消息的接受者：商家）/ `transferList` User[]（消息转接用户）/ `message` MessageContent 必填 / `context` Context 必填
- 推送侧 `User`（逐字）：nickName / role（1买家 2商家 3客服）/ `openId`（"开放平台用户唯一标示"）——推送方向带 openId，与发送结构体（§6.5.2）不对称
- `Context`（逐字）：sellerId（商家ID）/ openId（用户唯一标志）/ itemId（快手商品ID）/ orderId（快手订单ID）/ orderStatus（10 待付款，30 已付款，40 已发货，50 已签收，70 订单成功，80 订单失败）/ assistantOnlineStatus（1 商家有客服在线，2 无）
- 应答（逐字）："返回协议由快手侧定义，需按此格式返回" `{"result": 1}`

#### 6.5.4 准入现状：三道官方关卡（类目对接流程 + 两道公告）

- 智能客服类目对接流程（docId 401724，更新 2024-08-27，全文）："因业务需要，现智能客服类目服务商入驻暂停开放"；对接需拉负责人进群由技术支持引导，材料含产品介绍文档/名称简介icon/回调地址/教学视频/定价收费；上线门槛：识别率 85%（语意识别准确率）、回复覆盖率 65%（35% 转人工）、问题响应 5 秒、客服在线 7*10 小时 24 小时内回复、灰度白名单测试 1-2 天
- 「暂停部分类目服务商入驻公告」（updateTime 2021-08-19，全文）："暂停对如下类目的新增服务商入驻：智能客服……已上架应用不受影响，后续不再接受新增服务。再次开放时间将根据业务进展另行通知"
- 「【服务市场】智能客服类目下线部分应用通知」（2022-11-18，全文）："将于12月1日下午15：00起，下架智能客服下部分应用，仅保留：晓多、追一、壁虎，此三家和平台深入合作服务商"；"后续平台不再支持智能客服相关应用入驻"；下架理由（逐字）："为避免消费者信息和交易被引流至站外，集中三方和官方能力"（商家侧公告同文，另指路官方智能客服与 fuwu.kwaixiaodian.com 订购）
- `[SDK]` 官方 jar 内该通道类目随主 SDK 全量分发（接口类公开可编译调用）；`[多源]` 第三方佐证：保留服务商晓多公开文档自述接入方式为"把机器人挂到快手开放平台的消息链路上"并具备实时消息与转人工能力（https://www.xiaoduoai.com/product-agent/cnbxh56g）——与官方方案族/接口族互证

#### 6.5.5 判定

通道真实存在且协议完整：收侧=买家消息异步推送（Ks-Sign 验签，线下报备地址），发侧=`open.cs.intelligent.message.send`（access_token + MD5 网关签名），消息类型含文本/图片/商品卡片/订单卡片/评价邀请。但入口双闸：ISV 线自 2021-08 暂停入驻、2022-12 收敛为晓多/追一/壁虎三家深度合作；**商家自研线为官方方案明示路径**（"商家ISV……在应用开发完成后提供给自有店铺使用"），是快手唯一可能的自建消息通道 → 待核验(11-03)：商家开发者应用能否实际开通 `merchant_cs` 推送与 send 权限（需快手小店商家开发者账号在控制台实测）

### 6.6 通道 B：物流会话消息通道（pull + send，角色限定「厂家」）

- 4 接口元数据一致（API 详情）：permissionScope `merchant_logistics`（电商物流信息权限）；oauthRole `厂家`；method POST version 1；域名 openapi.kwaixiaodian.com（推荐）/open.kwaixiaodian.com（备用）。场景为物流厂商代发/WMS 对接，会话双 ID 关联：`ksSessionId`（快手会话ID）+ `sessionId`（物流公司会话ID）
- `open.cs.logistics.session.message.pull` 物流会话消息拉取：入参 ksSessionId/sessionId；出参 `messageList[]`（官方示例逐字）：`{"messageTime":124,"contentType":1,"fromUserType":1,"seqId":1,"content":"测试"}`——**拉取即收侧**（平台建议 api 定时拉取兜底，§6.2）
- `open.cs.logistics.session.message.send` 物流会话消息发送：入参 img（图片）/contentType（消息类型）/ksSessionId/sessionId/text（文本）；出参 `{"result":1,"errorMsg":"\"\""}`
- `open.cs.logistics.session.create.callback` 物流会话创建回调：入参 assistantId（客服工号）/ksSessionId/sessionId/sessionType（会话分配结果类型）
- `open.cs.logistics.session.close` 物流会话关闭：入参 ksSessionId/sessionId/closeType（关闭类型）
- 判定：真实双向消息接口（pull+send+生命周期），但 oauthRole 限定「厂家」（物流公司侧），非通用商家/ISV 通道；DuDu 场景不适用，协议记录备查。`[SDK]` 四个 `OpenCsLogisticsSession*Request` 类与路径 `/open/cs/logistics/session/*` 实锤

### 6.7 磁力引擎/磁力聚星：维持无

- developers.e.kuaishou.com（MAPI）= 广告投放 DSP 平台；线索方向仅归因上报/JS 上报/Xpath 上报类；文档菜单接口 `POST /rest/open_api/platform/document/menu/list` 匿名一律 500（登录墙），前端 bundle 关键词扫描无 IM/客服/会话词
- 判定：营销广告域无消息通道，维持 §5 待核验项关闭

### 6.8 直播开放平台 WebHook（旧站 menu=24）：仍未闭环，价值降级

- 直播 openApi 旧站（menu=24）持续登录墙，存档未获 → 维持待核验；但电商推送目录已含直播事件 3 个（§6.3），直播间评论/点赞/分享已可经电商标准推送接收，旧站 WebHook 的边际价值降级为「非电商直播场景」

### 6.9 第三方客服厂商交叉：全部走官方通道，无自建旁路 `[多源]`

- 晓多：快手开放平台消息链路实锤（§6.5.4，官方三家保留服务商之一）
- Udesk：FAQ 明示抖音/快手等第三方平台接入客服需先获得平台授权（udesk 官方帮助中心）→ 旁证无独立旁路
- 智齿、网易七鱼：官方渠道/平台支持列表均无快手 → 全行业仅平台把关内接入
- 判定：第三方侧无一绕开电商开放平台自建快手消息通道——「通道存在但准入平台制」的结论双向印证

### 6.10 小程序域复查：无变化

- 小程序「客服消息能力」页（18 434 字节全文再取）与 §5 无差异：button `open-type="contact"` + 人工工作台，无服务端 API/回调/token——§5 结论维持

### 6.11 结论（终判，修订 §5 结论）

- 「快手渠道不可作为消息渠道」的 §5 结论**修订为**：主站开放平台（open.kuaishou.com，小程序/小游戏/第三方服务商）无任何消息通道（维持 §2.3/§5）；**快手电商开放平台（open.kwaixiaodian.com）存在两条真实买家↔商家消息通道**——智能客服（§6.5，双向 push+send）与物流会话（§6.6，pull+send），协议已实施级落库（信封/AES/验签/重试/网关签名/凭证/消息结构全链）
- 用户「不可能不支持」的判断在电商域成立：买家↔商家聊天通道存在且为晓多等在用，但平台 2021-08 起暂停新增入驻、2022-12 收敛为三家深度合作服务商——**通道真实、非自助开放**；唯一自建路径为商家自研（绑定自有快手小店），准入实测为实施前置
- DuDu 行动建议：快手渠道从「不可用」改列「有条件可行（电商域智能客服，商家自研线）」；实施前置清单：快手小店商家开发者账号→创建应用→实测 `merchant_cs` scope 开通与消息推送开关→推送地址线下报备→以 requestId 关联推送/回复的买家寻址实测
- 遗留待核验：a) 商家自研开通 `merchant_cs` 实测（11-03 新增）；b) `open.cs.intelligent.message.send` 的 toUser 买家寻址字段（结构体无 openId，疑走 requestId 关联）；c) 物流会话「厂家」角色实际开通流程；d) 直播旧站 WebHook menu=24 存档