# 京东开放平台（宙斯/JOS，含咚咚客服）消息推送 事实库

> 研究日期：2026-09-10。方法：WebSearch `jos.jd.com` / `open.jd.com` 官方页面原文摘录（标注 `[摘录]`）+ WebFetch 抽查（`jos.jd.com`、`open.jd.com` 均为 JS-SPA，只回壳、无正文，已如实标注，未作全文核验）+ 第三方 API 目录 `apis.io` 仅作官方文档 URL 指针（标注 `[指针]`，非 primary）
> 标注约定：`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`[指针]` = 第三方目录指向官方文档地址的线索；`待核验(09-27)` = 未能取得官方原文，需复核（open.jd.com 新文档中心需 JS 渲染 + 登录态）
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文，如 `yourappkey` / `yourtoken`）
> 方法学注记：`jos.jd.com/commondoc?listId=N` 与 `open.jd.com/home/home#/doc/common?listId=N` 为同一文档体系的新老入口（宙斯→零售开放平台迁移中）；`open.jd.com` 门户、`jos.jd.com/apilist` 均为 SPA，WebFetch 仅回 `You need to enable JavaScript to run this app.`

## 1. 官方文档入口与关键页面地址

- 门户（零售开放平台）：https://open.jd.com/ ；API 子站：https://open.jd.com/api ；旧门户：https://jos.jd.com/（宙斯开发者中心，首页自述"一站式零售应用云计算平台…高效的数据推送服务、标准化的网关服务"）`[摘录]` https://jos.jd.com/
- 开发者后台（控制台）：`open.jd.com` 顶导"开发者后台"（登录后应用管理、权限包、消息订阅配置均在此；控制台内页需登录，`[摘录]` https://open.jd.com/api 页顶导含"开发者后台/登录/API文档/消息文档/开发文档"）
- 文档中心：`open.jd.com` 顶导"开发文档/消息文档/API文档"（`[摘录]` 同上）；JOS 常用文档：https://jos.jd.com/commondoc?listId=298（新手接入指南，`[摘录]`）
- API 网关：正式 `https://api.jd.com/routerjson` ／ 预发 `https://api-dev.jd.com/routerjson`（`[摘录]` https://jos.jd.com/commondoc?listId=33 《API调用方法详解》，更新 2020-10-17）
- 消息通道文档（官方地址，第三方指针）：https://open.jd.com/home/home#/doc/common?listId=520（`[指针]` https://apis.io/apis/jd-com/jos-jdmessage ，描述"pushes near-real-time events for orders, products, after-sale, inventory, and finance"，该描述为第三方撰写，仅地址可采信）
- OAuth 文档（官方地址，第三方指针）：https://open.jd.com/home/home#/doc/common?listId=510（`[指针]` https://apis.io/providers/jd-com ，OAuth 条目 humanURL）
- JOS 常用文档 listId（`[摘录]` 各页导航互证，均出自 jos.jd.com 官方页眉/正文）
  - `listId=32` 授权获取 accesstoken；`listId=33` API调用方法详解；`listId=167` SDK使用；`listId=169` API调用示例；`listId=170` 接口权限包申请；`listId=184` 开放平台收费规则；`listId=186` APPKEY流量自助调整；`listId=194` API调用场景
  - `listId=298` 新手接入指南（含 ISV 注册 `open.jd.com…listId=1952/1594`、商家入驻 `zhaoshang.jd.com`、个人注册 `reg.jd.com`）
  - `listId=530` 签名工具使用说明（签名算法支持 md5、hmacmd5、hmacsha256）；签名工具：https://jos.jd.com/commontools?id=2
- 业务场景文档（`[摘录]` API 页正文引用，地址可采信、正文待核验(09-27)）
  - 订单状态列表：https://open.jd.com/home/home#/doc/common?listId=1867（`jingdong.pop.order.enGet` orderStatusItem 参数引用）
  - POP-SOP 对接方案：https://open.jd.com/v2/#/doc/guide?listId=2431 ；SOP 发货方案：https://open.jd.com/home/home/#/doc/common?listId=2266
  - 自主售后：https://open.jd.com/home/home/#/doc/common?listId=2186 ；售后场景：https://open.jd.com/home/home/#/doc/common?listId=2290 ；取消订单退款判责：https://open.jd.com/home/home/#/doc/common?listId=2296
  - 商品场景：https://open.jd.com/home/home/#/doc/common?listId=2197（`jingdong.ware.read.searchWare4Valid` 引用）
- 咚咚相关官方入口：咚咚商家版工作台 https://im.jd.com/seller/download（`[摘录]`，版本号 10.4.6.0，2025-09-22；能力：消息撤回/已读未读/正在输入中/快捷短语/专享客服/用户运营群聊）；在线客服 https://chat.jd.com/jdchat/custom.action（SPA 壳）；咚咚消息协议文档：https://jos.jd.com/platformdetail?itemId=2222&listId=0 《咚咚消息协议chat_message4.2聊天消息格式》（标题实锤 `[摘录]`，正文待核验(09-27)）
- 平台公告（`[摘录]` https://open.jd.com/doc 与 https://opendj.jd.com/ ）
  - 《关于平台加速SP-API切换及1.0接口下线的通知》（重要，POP/自营，2026-08-13）
  - 《开放生态用户标识升级安全改造公告》（重要，POP/自营，2026-08-11）
  - 秒送平台迁移：`opendj.jd.com` 2026年Q4下线，应用创建/API/商家授权迁 `open.jd.com`，存量 ISV 须 2026-07-30 前完成服务商身份注册+保证金（`[摘录]` https://opendj.jd.com/api/notice.htm ；入驻指南 https://open.jd.com/v2/#/doc/begin-guide?listId=1101558）
- 关联平台：京东云鼎 https://yd.jdcloud.com/（应用部署/云鼎内调用/云鼎IP查询）；京东联盟 https://union.jd.com/openplatform（联盟 appkey 可在宙斯调用联盟接口，`[摘录]` https://jos.jd.com/jdunion）；京东物流开放平台；招商站 `zhaoshang.jd.com`
- 易混淆排除（同名"消息推送"，非 JOS 业务消息）：`opendoc.jd.com/base/emop/SPD/push/push-bps.html`《消息推送白皮书》是 EMOP 移动端 APP 触达推送（Android/iOS/厂商通道/百亿级/重发机制），与 JOS 订单/售后/咚咚业务消息无关，模拟器不得混用（WebFetch 全文已核验，属 primary 但不适用本库）

本次实际抓到并核实的页面清单

| 主题 | URL | 核验方式 |
|---|---|---|
| API调用方法详解（网关/系统参数/MD5签名/示例） | https://jos.jd.com/commondoc?listId=33 | `[摘录]`（官方正文大段摘录） |
| API调用示例（Java/.NET/PHP，routerjson+SDK） | https://jos.jd.com/commondoc?listId=169 | `[摘录]`（官方正文大段摘录） |
| 新手接入指南（开发者类型/应用创建/流量） | https://jos.jd.com/commondoc?listId=298 | `[摘录]`（官方正文大段摘录） |
| 签名工具使用说明（md5/hmacmd5/hmacsha256） | https://jos.jd.com/commondoc?listId=530 | `[摘录]` |
| 签名工具 | https://jos.jd.com/commontools?id=2 | `[摘录]`（字段清单） |
| 宙斯定位（API+消息推送服务）/联盟互通 | https://jos.jd.com/jdunion | `[摘录]` |
| 咚咚商家版工作台（能力清单/版本） | https://im.jd.com/seller/download | `[摘录]` |
| 咚咚消息协议 chat_message4.2（标题） | https://jos.jd.com/platformdetail?itemId=2222&listId=0 | `[摘录]`（仅标题，正文待核验(09-27)） |
| 咚咚发送 `dongdong.packet.josChatMessage.push2`（参数） | https://jos.jd.com/apilist?apiGroupId=1706… | `[摘录]`（API 页原文） |
| IM 会话/聊天记录/评价/ DataService（客服质检包） | https://jos.jd.com/apilist?apiGroupId=1696… | `[摘录]`（API 页原文） |
| 售后 `AFS_StepResult_JOS` 优先用消息 + 轮询下线 | https://jos.jd.com/apilist?apiGroupId=1707… | `[摘录]`（API 页原文） |
| 订单 API（search/get/enSearch/enGet/fbp，状态枚举） | https://jos.jd.com/apilist?apiGroupId=55… 等 | `[摘录]`（API 页原文） |
| 退款 API（pop.afs.soa.*） | https://jos.jd.com/apilist?apiGroupId=71… | `[摘录]`（API 页原文） |
| 物流订阅/全程跟踪（SubscribeTrace*） | https://jos.jd.com/apilist?apiGroupId=274… | `[摘录]`（API 页原文） |
| 价格查询公共参数示例（授权/签名/timestamp） | https://jos.jd.com/apilist?apiGroupId=194&apiId=19003 | `[摘录]`（API 页原文） |
| 开放场景地图（商品/订单/售后/财务/营销会员/客服/内容） | https://open.jd.com/api | `[摘录]` |
| 平台公告（SP-API切换/用户标识升级/秒送迁移） | https://open.jd.com/doc ／ https://opendj.jd.com/ | `[摘录]` |
| JOS Message Channel 文档地址指针 | https://open.jd.com/home/home#/doc/common?listId=520 | `[指针]`（第三方目录，描述不可采信） |
| 移动推送白皮书（排除项） | https://opendoc.jd.com/base/emop/SPD/push/push-bps.html | WebFetch 全文（primary，不适用本库） |

---

## 2. 消息/事件推送全清单

推送模型总述：JOS 自述能力含"API、消息推送服务"（`[摘录]` jdunion 页："宙斯（JOS）是京东各类零售业务提供外部合作伙伴工具和服务的开放平台，例如API、消息推送服务"）。另有"数据同步服务"独立文档（与消息并列，`[摘录]` listId=33 页导航）。**推送通道的投递形态（HTTP 回调 / JMQ 长连接 / API 拉取）、订阅配置入口、重试与幂等口径 → 全部待核验(09-27)**（listId=520 正文未取得）

### 2.1 订单类

订单状态枚举（`[摘录]` `jingdong.pop.order.enGet` orderStatusItem，`apiGroupId=55` 页；枚举值即订单消息可能携带的状态语义，消息类型名本身待核验）

| 状态码 | 含义（官方描述） | 出处 |
|---|---|---|
| `WAIT_SELLER_STOCK_OUT` | 等待出库 | enGet 页 `[摘录]` |
| `WAIT_GOODS_RECEIVE_CONFIRM` | 等待确认收货 | 同上 |
| `WAIT_SELLER_DELIVERY` | 等待发货（仅海外购商家，境内发货标签） | 同上 |
| `PAUSE` | 暂停（loc订单可通过此状态获取） | 同上 |
| `FINISHED_L` | 完成 | 同上 |
| `TRADE_CANCELED` | 取消 | 同上 |
| `LOCKED` | 已锁定 | 同上 |
| `POP_ORDER_PAUSE` | pop业务暂停（3c号卡/履约/黄金） | 同上 |
| `NOT_PAY` | 未付款 | 同上 |

兜底查询 API（`[摘录]` `apiGroupId=55` 页）：`jingdong.pop.order.search`（现行主推；`enSearch/enGet/updateEntityStore` 均注"将于2024年12月31日下线…请使用 jingdong.pop.order.search"）、`jingdong.pop.order.get`、`jingdong.pop.order.fbp.search`（FBP）、`jingdong.pop.order.fbp.get`、`jingdong.pop.order.print.data.get`（面单打印）、`jingdong.pop.oto.locorderinfos.get`（SOP出库发货）、`jingdong.order.venderRemark.queryByOrderId`。分页约束（`[摘录]` enSearch 页）："时间段内最多拉取300页，每页最多100条…建议通过时间滚动的方式拉取订单"。订单消息类型精确名 → 待核验(09-27)

### 2.2 售后/退款类

| 消息/接口 | 触发语义（官方描述） | 出处 |
|---|---|---|
| `AFS_StepResult_JOS`（售后服务单全流程消息通知） | 官方原话："请优先使用消息（售后服务单全流程消息通知：AFS_StepResult_JOS）"——轮询接口 `jingdong.asc.sync.list` "计划于2026年9月下线" | `[摘录]` `apiGroupId=1707` 页（客服工单-售后场景）+ `[摘录]` `apiGroupId=20` 页（同文复证） |
| `jingdong.pop.afs.soa.refundapply.*`（取消订单/售前退款：queryPageList/replyRefund/getWaitRefundNum/afsRefundApply） | 用户下单付款后、订单完成前取消订单的退款审核 | `[摘录]` `apiGroupId=71` 页 |
| `jingdong.asc.query.view` / `jingdong.b2c.shop.aftersales.get` | 订单完成后售后服务单明细 | `[摘录]` `apiGroupId=71` / afsservice 页 |
| `jingdong.afsservice.{receivetask,alltask,serviceinfo}.get` | 待收货/全部服务单列表、POP退款明细（最大可退/成功退款） | `[摘录]` afsservice 页 |
| 秒送"新建售后单申请消息""售后单状态消息" | 待审核时返查售后单详情（totalMoney=cashMealBox+运费+包装+积分+自提服务费口径） | `[摘录]` opendj `getApiDetail/170/…` 页 |

`AFS_StepResult_JOS` 的载荷字段、订阅方式 → 待核验(09-27)（仅消息名实锤）

### 2.3 商品类

兜底查询 API（`[摘录]`）：`jingdong.ware.read.searchWare4Valid`（POP有效商品检索，"最多查询10万条"，商品场景 https://open.jd.com/home/home#/doc/common?listId=2197）、`jingdong.sku.read.searchSkuList`、`jingdong.pop.getCommentSummarys`（SPU/SKU好评率，每次100个sku）、`jingdong.retail.ware.text.material.query`（商品卖点）。商品消息类型精确名 → 待核验(09-27)

### 2.4 咚咚客服/IM 类

协议与发送（`[摘录]` API 页原文）

| 接口/协议 | 功能（官方描述） | 出处 |
|---|---|---|
| 咚咚消息协议 `chat_message4.2` | 聊天消息格式（含 voice：`"type": " voice"`、`"url": " 上传京东云文件地址url（字符型，必须。声音文件京东CDN下载地址）"`，为目前唯一抓到的协议体片段） | `[摘录]` platformdetail itemId=2222（标题+单片段，正文待核验(09-27)） |
| `jingdong.dongdong.packet.josChatMessage.push2` | "发送咚咚消息。开放场景：咚咚客服消息。开放接入方：外部isv接入咚咚发消息。注：xid open_id字段非必填字段" | `[摘录]` `apiGroupId=1696/1706` 页 |
| 消息发送结果查询 | "当前只支持查询咚咚消息发送的结果查询" | `[摘录]` `apiGroupId=88&apiId=19706` 页 |
| `jingdong.com.jd.dd.open.gw.api.DataService` | "第三方系统调用数据服务，获取咚咚业务数据，咚咚对外开放了数十项数据服务，如获取历史聊天记录/用户状态等等" | `[摘录]` `apiGroupId=1696` 页 |

会话/聊天记录查询（`[摘录]` `apiGroupId=1696` 页；注意评价类"不是实时的"，聊天记录经 jmq 异步）

- `jingdong.im.out.merchant.chatsession.openapi.get`（指定App指定时间段会话列表，仅pop商家）→ `jingdong.im.out.merchant.chatmessage.openapi.get`（指定会话聊天记录，凭咨询记录中的 sid）
- `jingdong.im.pop.sessionlist.get`（在线咨询记录含留言；起止≤7天、距今≤3个月）、`jingdong.im.pop.unreplystat.get`（未回复会话量）、`jingdong.im.pop.chatlog.fuzzy.query`（关键字查会话，范围≤7天、开始≤3个月内）、`jingdong.im.pop.chatlog.get`
- `queryCustomerLastChatLogTime`（顾客最后一条消息时间，判会话可否关闭；官方原话："由于会话的聊天记录是通过jmq异步的方式处理，当消息出现积压时，最后一条消息可能并未处理到，返回的时间就存在误差，但是99%的情况误差在秒级"）
- `jingdong.im.pop.evaluationstat.get` / `evaluationlist.get`（客服评价；官方原话："评价目前没有消息推送支持，评价接口获取到的评价数据不是实时的"）；机器人满意度 `IsvImChatLogService.queryEvaluationsStat/queryEvaluationsDetailList`
- `jingdong.im.pop.groupinfo.get`（客服列表，限 im.waiter 即 pop/品牌客服）、`jingdong.im.pop.waiterpresence.openapi.get`（客服登录/暂离/忙碌/离开/登出）、`jingdong.user.getUserInfoByXId`（按XId取昵称等）

咚咚 inbound 消息（顾客→客服）是否有推送通道 → 待核验(09-27)（只实锤了外发 push2 与轮询查询系）

### 2.5 物流/履约/其他域（`[摘录]` API 页原文）

- 运单订阅制：`jingdong.eclp.trace.service.jos.SubscribeTraceByWaybillService`（订阅单号）→ `SubscribeWaybillTraceService`（查已订阅运单物流信息，"新平台接入按需求流程与产品对接"）；`OrderTraceByOrderService`（按订单号全程跟踪，**新商家需京东内部邮件申请调用配置**）；`jingdong.eclp.order.queryOrderStatus`（客户订单状态流水）；`queryJdAreaIdList`（四级地址，"需配合地址变更消息来使用"——地址变更消息存在性实锤一名，载荷待核验(09-27)）
- 秒送通知消息（`[摘录]` opendj `resources.html?id=3001`）："订单转自送消息"（达达配送待抢单超时10分钟商家转自送后推送）；"通知消息"为独立文档类目
- 开普勒/评价/财务/营销消息 → 待核验(09-27)

---

## 3. 回调机制

### 3.1 推送通道（均待核验(09-27)，现状只列线索）

- 官方确认存在"消息推送服务"（JOS 能力之一）与"数据同步服务"（独立文档），但投递形态未取得：HTTP 回调 URL 配置、JMQ 长连接、API 拉取三种可能性均不能排除。`[指针]` 第三方目录称 Webhook 推送至 partner-registered endpoints 并要求 ack+验签——为第三方撰写，不可采信，仅作复核线索（listId=520）
- 已实锤的相邻机制（`[摘录]`，可作类比参考，不可当推送口径）
  - 物流全程跟踪为"订阅+查询"制（先 Subscribe 后查，非推送）
  - 咚咚聊天记录经 **jmq 异步**处理（秒级误差，99%口径）
  - 售后明确引导"优先使用消息"，轮询接口 2026-09 下线——说明消息通道是售后推荐链路
  - 秒送"通知消息"按商家推送（opendj 文档类目实锤存在推送语义）

### 3.2 首次验证握手

→ 待核验(09-27)（未取得任何官方 challenge/verify 口径）

### 3.3 重试、幂等、有序

→ 待核验(09-27)（未取得官方重试间隔/次数、幂等键、保序口径）。唯一相邻实锤：EMOP 移动推送"对发送失败的用户配置重发机制"（`opendoc.jd.com` 白皮书，全文已核验但属 APP 触达域，不可套用）

---

## 4. 验签与加密算法

来源：`[摘录]` https://jos.jd.com/commondoc?listId=33 §5签名算法 ＋ `[摘录]` listId=530/签名工具页。注意：以下均为 **API 请求签名**（ISV→京东），**推送回调验签口径 → 待核验(09-27)**

### 4.1 MD5 签名（主算法，逐字摘录）

官方步骤原文（listId=33）："将所有请求参数按照字母先后顺序排列…把所有参数名和参数值进行拼接…把appSecret夹在字符串（上一步拼接串）的两端…使用MD5进行加密，再转化成大写"

即：`sign = UPPER(MD5(appSecret + k1+v1+k2+v2+… + appSecret))`，key 按字母序（如 `360buy_param_json,access_token,app_key,method,timestamp,v`）

- `timestamp` 格式 `yyyy-MM-dd HH:mm:ss`（如 `2019-05-01 00:00:00`），"京东API服务端允许客户端请求时间误差为10分钟"；另有实践注"时间戳最好填写当前时间的前几分钟（必须在6分钟之内）"（同页 `[摘录]`）
- `360buy_param_json`：应用级参数整体 JSON 字符串参与签名
- 签名工具另支持 `hmacmd5`、`hmacsha256`（`[摘录]` listId=530 + commontools?id=2 工具页三签页签 `md5 hmacmd5 hmacsha256`；按 URL 输入示例含 `sign_method=hmacsha256`）。各 hmac 算法的拼接规则 → 待核验(09-27)

### 4.2 系统参数表（`[摘录]` listId=33 + apilist 公共参数互证）

| 参数 | 必传 | 说明 |
|---|---|---|
| `method` | 是 | API 接口名称（如 `jingdong.pop.order.search`） |
| `access_token` | OAuth 授权接口是 | 商家授权凭证（获取见 §6） |
| `app_key` | 是 | 应用 app_key |
| `sign` | 是 | §4.1 签名 |
| `timestamp` | 是 | `yyyy-MM-dd HH:mm:ss` |
| `360buy_param_json` | 否（按接口） | 应用级参数整体 JSON |
| `v` | 是 | 协议版本（默认 2.0） |
| `format` | 否 | 暂只支持 json（jdprices 页 `[摘录]`） |

### 4.3 推送回调验签/加密

→ 待核验(09-27)（未取得官方口径；不得套用 §4.1 请求签名）

---

## 5. 示例载荷原文（逐字，均为 API 调用侧；回调示例无）

### 5.1 API 调用拼装示例（`[摘录]` listId=33，以 `jingdong.pop.order.search` 为例，`app_key=yourappkey/appSecret=yourappSecret/access_token=yourtoken`）

```
access_token="yourtoken"
app_key="yourappkey"
method="jingdong.pop.order.search"
timestamp="2021-05-07 09:20:39"
v="2.0"
360buy_param_json=
{
"end_date": "2012-05-16 17:03:56",
"optional_fields":"vender_id,order_id,pay_type,order_total_price,freight_price,seller_discount,
order_payment,delivery_type,order_state,order_state_remark,invoice_info,order_remark,order_start_time,
order_end_time,consignee_info,item_info_list",
"order_state": "WAIT_SELLER_STOCK_OUT",
"page": "1",
"page_size": "20",
"start_date": "2012-05-14 17:03:56"
}
```

排序后拼接→两端加 appSecret→MD5 大写，官方给出结果："D70825340F4084360B9362B60DFD7930（授权接口），30902CFAF98AC0A3C4D0F5178F26F671（非授权接口）"。授权 URL 拼装"将所有的参数转化为UTF-8编码…通过浏览器访问该地址即可"（同页 `[摘录]`）

### 5.2 Java SDK 调用示例（`[摘录]` listId=169，`PopOrderSearchRequest`）

```java
import com.jd.open.api.sdk.DefaultJdClient;
import com.jd.open.api.sdk.JdClient;
import com.jd.open.api.sdk.JdException;
import com.jd.open.api.sdk.request.order.PopOrderSearchRequest;
import com.jd.open.api.sdk.response.order.PopOrderSearchResponse;
public class ApiTest {
public static void main(String[] args) throws JdException {
String serverUrl = "https://api.jd.com/routerjson";
String appKey = "youAppKey";
String appSecret = "youAppSecret";
String accessToken = "youAccessToken";
JdClient client=new DefaultJdClient(serverUrl,accessToken,appKey,appSecret);
PopOrderSearchRequest request=new PopOrderSearchRequest();
request.setStartDate("2018-11-14 10:00:00");
request.setEndDate("2018-11-22 12:00:00");
request.setOrderState("TRADE_CANCELED");
request.setOptionalFields("itemInfoList,orderId,isShipmenttype,scDT,idSopShipmenttype,orderStartTime");
request.setPage("1");
request.setPageSize("20");
request.setSortType(1);
request.setDateType(0);
PopOrderSearchResponse response=client.execute(request);
System.out.println(response.getSearchorderinfoResult());
}
}
```

SDK 语言：官方 SDK 支持"JAVA/PHP/.NET/Python"（`[摘录]` jdunion 页；.NET/PHP 示例见 listId=169 `[摘录]`；"官方SDK包含了API的请求封装、参数签名、响应解析"，`JdClient` 构造均为 `(serverUrl, accessToken, appKey, appSecret)`）

### 5.3 咚咚发送参数（`[摘录]` push2 页应用级参数表头）

`buId`（商家ID，POP-京东商家id/厂直-供应商简码）/ `operatePin`（操作人账号，如 `testPin`）/ `operateNick`（操作人姓名）/ `serviceId`（服务单号，售后业务主单据号）/ `orderId`（京东订单号）。完整请求/响应体 → 待核验(09-27)

### 5.4 价格查询公共参数（`[摘录]` `jingdong.jdprices.get` 页，v2.0 免费/必须用户授权）

请求参数：`area`（如 `1-1-1-1` 四级地址串）/ `skuId`（String[]，最多30个）/ `channel`=1 / `priceFieldSet`=102 / `source`=jingdong / `priceInfoSet`=1。响应 envelope：`{"jingdong_jdprices_get_responce": {"returnType": {…}}}`（注意官方拼写 `responce`，逐字保留）

### 5.5 回调/推送载荷示例

→ 待核验(09-27)（无官方原文；`chat_message4.2` 仅一片段 voice 字段，见 §2.4）

---

## 6. token / 凭证模型

| 凭证 | 换取/规则 | 出处 |
|---|---|---|
| `access_token`（商家授权） | OAuth 2.0 授权，"京东授权流程是基于OAuth2.0…第三方可以获取到用户的接口调用凭证 (access_token)，通过access_token可以进行京东开放平台授权关系接口调用"；授权接口请求必须带 `access_token` 系统参数 | `[摘录]` listId=32（首段）+ `[摘录]` listId=33 |
| token↔商家绑定 | `10500001` "access_token对应授权商家ID和订单所属商家ID不一致，请使用正确token获取订单"（`enSearch` 页错误码表 `[摘录]`）；`30005` "没有服务单权限…检查服务单是否属于该商家" | `[摘录]` apiGroupId=55 / afsservice 页 |
| `app_key` / `appSecret` | 应用中心创建应用获取；控制台应用管理可查；签名两端夹 secret；签名工具按字段输入含 `access_token/app_key/app_secret/method/timestamp/360buy_param_json/V` | `[摘录]` listId=33/530、commontools?id=2 |
| Token 运维 | "Token有效期查询"工具、"Token过期处置"文档存在（导航标题实锤，规则正文待核验(09-27)）；网关错误按 `code/errorMessage/errorSolution` 三元组返回（如 `500 Internal Server Error…请稍后重试`、`-110000 访问太频繁…限流`） | `[摘录]` 导航 + `[摘录]` enSearch/afsservice 错误码表 |
| 权限包（接口授权单元） | 按权限包申请（listId=170）：`客服工单-基础接口包`（push2、chatsession 等）、`客服插件接口包`、`B2C-客服-机器人2.0`（智能机器人）、`B2C-客服-商家1.0`、`客服质检-基础接口包`、`基础能力包`、`通用-服务市场1.0`；"拥有此API的权限包 \| 可获得/可申请该API权限包的应用类型"为每页标配段 | `[摘录]` 各 apilist 页"如何获取该API"段 |
| 应用类型与准入 | ISV/京东商家/个人三类账号可登录；应用创建后运营 3 个工作日内审核；测试态每日 500 次，发布上线后 30 万次/日（并列原文 listId=160《应用创建流程》2021-06-08 同句）；自研/服务商/物流/联盟有独立接入流程；"发布应用"前可删除 | `[摘录]` listId=298（并列原文 listId=160） |
| 流量自助调整 | APPKEY 流量自助调整规则（listId=186，标题实锤，正文待核验(09-27)）；收费规则（listId=184，标题实锤，正文待核验(09-27)） | `[摘录]` 导航 |
| code→token 端点/refresh/有效期 | 官方端点 `open-oauth.jd.com/oauth2/to_login` + `open-oauth.jd.com/oauth2/access_token?app_key&app_secret&grant_type=authorization_code&code`（`[摘录]` listId=32）；有效期/刷新正文 → 待核验(09-27)（`oauth.jd.com/oauth/token` 仍仅见第三方，不可采信） | 部分实锤+待核验(09-27) |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **消息推送服务全文**：https://open.jd.com/home/home#/doc/common?listId=520（投递形态 HTTP/JMQ/拉取、订阅配置、重试、幂等键、保序）。→ 待核验(09-27)
1b. **JOS 关闭迁移（2026-09-10 复核新发现）**：JOS 2026-07-01 融合至 `https://open.jd.com`、2026-08-30 前关闭；新增仅企业账号、需软著/保证金、敏感接口须部署云鼎（`[摘录]` https://jos.jd.com/ 首页公告《关于JOS系统关闭及迁移至JDO平台的公告》）。影响 09-27 复核入口
2. **订单/商品/库存/财务消息精确类型名与载荷**（仅状态枚举与查询 API 实锤，类型名无）。→ 待核验(09-27)
3. **`AFS_StepResult_JOS` 载荷字段与订阅方式**（仅消息名实锤；`asc.sync.list` 2026-09 下线为旁证）。→ 待核验(09-27)
4. **咚咚 `chat_message4.2` 协议全文**（platformdetail itemId=2222；目前仅标题+voice 一片段；text/image/order 等类型未知）。→ 待核验(09-27)
5. **咚咚 inbound（顾客→客服）实时通道**（只实锤外发 push2 + 轮询查询系；评价明确无推送）。→ 待核验(09-27)
6. **推送回调验签/加密口径**（§4 仅 API 请求签名，不可套用）。→ 待核验(09-27)
7. **OAuth 全文**：code→token 端点、refresh、有效期（listId=32/listId=510 正文；Token 过期处置正文）。→ 待核验(09-27)
8. **hmac 签名拼接规则**（md5 外另两种算法；签名工具页正文）。→ 待核验(09-27)
9. **重试幂等口径**（官方重试间隔/次数/去重键；物流"订阅+查询"与 jmq 异步不可当推送口径）。→ 待核验(09-27)
10. **准入链路全文**：权限包申请（listId=170）、收费（184）、流量自助调整（186）、SP-API 切换与 1.0 下线影响面（2026-08-13 公告正文）、用户标识升级改造（2026-08-11 公告正文）。→ 待核验(09-27)
11. **数据同步服务 vs 消息推送服务边界**（两文档并列，关系未知）。→ 待核验(09-27)
12. **地址变更消息、秒送通知消息全表与载荷**（各实锤一名/一例）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 网关模拟：`POST/GET https://api.jd.com/routerjson`，系统参数 `{method, access_token(授权接口), app_key, sign, timestamp(yyyy-MM-dd HH:mm:ss), 360buy_param_json, v=2.0}`，验签 `UPPER(MD5(appSecret+按字母序k+v拼接+appSecret))`；回归向量：§5.1 参数→`D70825340F4084360B9362B60DFD7930`（授权）/`30902CFAF98AC0A3C4D0F5178F26F671`（非授权）
- 响应 envelope 注意官方拼写 `jingdong_<method>_responce`（§5.4 实锤）；错误三元组 `{code, errorMessage, errorSolution}`；token 错配 `10500001`
- 咚咚外发模拟：`jingdong.dongdong.packet.josChatMessage.push2` 参数 `{buId, operatePin, operateNick, serviceId, orderId}`；chat_message 含 voice `{type:" voice", url:"京东CDN地址"}` 一例
- 售后推荐链路：`AFS_StepResult_JOS` 消息名可用作 topic 占位，载荷不得编造（待核验）
- 推送回调（HTTP URL/challenge/重试/幂等键）**不得编造**，模拟器中以"未建模/透传"处理，直至 09-27 复核 listId=520
- 勘误（相对起点线索）：EMOP《消息推送白皮书》是 APP 触达推送，与 JOS 业务消息无关；`apis.io` 的 JOS Message Channel 描述为第三方撰写，仅文档地址指针可用
