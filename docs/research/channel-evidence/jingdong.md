# 京东收侧补证：顾客→商家 IM 推送通道与报文（wayfinder #104）

> 研究日期：2026-10-14。任务来源：Buktal/dudu#104（父票 #97 渠道 IM 能力核验，结论「发侧实锤、收侧缺证」）
> 事实基准：[docs/research/channels/jingdong.md](../channels/jingdong.md)（2026-09-10）。本文件只补证其 §7 待核验清单中收侧相关项（1 消息推送服务全文、4 chat_message4.2 全文、5 咚咚 inbound 实时通道、6 推送回调验签），不重复已实锤内容
> 标注约定：`[官方·直抓]` = 直接抓取取得正文；`[官方·摘录]` = 官方页面原文经搜索引擎摘要呈现（京东零售开放平台 jos.jd.com / open.jd.com 为 JS-SPA，直抓仅回壳，此形态弱于直抓，如实降级标注）；`[对照]` = 京东系其他业务线（京东健康 / 京东秒送），仅作形态参考、不可外推到京东零售；`[线索]` = 第三方内容，仅用于发现官方 URL 与关键词，不作证据正文
> 所有引号内文字为来源页原文逐字摘录，未作改写

## 1. 结论

**三选一判定：仍不可判定。**

- 公开一手证据中不存在「顾客→商家 IM 实时推送」的实锤；公开可见的全部事实指向「无推送、仅轮询」
- 京东官方确有「消息推送服务」产品，但公开可见的推送主题全部为订单/商品/退款类（`pop_order_*`、`order_order_*` 等命名体系），消费形态是 JMQ/JCQ 主题订阅（云鼎内网 SDK 或公有云 HTTP 拉取），**不是 HTTP 回调**
- 咚咚/客服域公开可见的接口只有发送侧（`jingdong.dongdong.packet.josChatMessage.push2`）与轮询侧（`jingdong.im.pop.chatlog` 等）；官方对客服域评价数据明文写「目前没有消息推送支持，评价接口获取到的评价数据不是实时的」
- 含「Push/PushService」字样的咚咚接口经核对语境均为发送方向或客户端通知（见 §3.4），不是外部系统收消息的通道
- **不可判定的直接原因**：权威的「消息主题总目录」（是否含 IM/聊天主题）在开放平台登录态后台（open.jd.com/v2 消息文档页 / 消费方接入文档 listId=1903），公开网页无法闭合此问题

对建票决策的含义：若京东渠道立项，公开可核验的收侧唯一路径是**轮询**（`jingdong.im.out.merchant.chatmessage.openapi.get` / `jingdong.im.pop.chatlog`，后者单次时间范围 ≤7 天）；「是否存在推送通道」需注册开发者后登录后台核验主题列表（见 §6），或接受轮询形态后再开实施票

## 2. 证据

### 2.1 京东零售（咚咚所在业务线）

| # | 来源 | 访问日期 | 逐字摘录 | 性质 |
|---|---|---|---|---|
| 1 | [jos.jd.com/jdunion](https://jos.jd.com/jdunion) | 2026-10-14 | 「宙斯（JOS）是京东各类零售业务提供外部合作伙伴工具和服务的开放平台，例如API、消息推送服务」 | `[官方·摘录]`（正文 SPA） |
| 2 | [jos.jd.com/apilist?apiGroupId=1696](https://jos.jd.com/apilist?apiGroupId=1696)（客服质检-基础接口包） | 2026-10-14 | 「由于会话的聊天记录是通过jmq异步方式处理…当消息出现积压时，最后一条消息的返回时间可能存在误差」 | `[官方·摘录]`（正文 SPA） |
| 3 | [jos.jd.com/apilist?apiGroupId=667](https://jos.jd.com/apilist?apiGroupId=667)（客服绩效售前功能权限包） | 2026-10-14 | 「接口功能：发送咚咚消息 开放场景：咚咚客服消息 开放接入方：外部isv接入咚咚发消息 注：xid open_id字段非必填字段」；「评价目前没有消息推送支持，评价接口获取到的评价数据不是实时的」 | `[官方·摘录]`（正文 SPA） |
| 4 | [jos.jd.com/apilist?apiGroupId=952](https://jos.jd.com/apilist?apiGroupId=952)（客服机器人-基础包） | 2026-10-14 | `jingdong.dongdong.packet.josChatMessage.push2`（发送咚咚消息）；`jingdong.im.pop.chatlog`（聊天记录查询，时间范围不超过 7 天） | `[官方·摘录]`（正文 SPA） |
| 5 | [jos.jd.com/apilist?apiGroupId=21](https://jos.jd.com/apilist?apiGroupId=21)（商家应用） | 2026-10-14 | 「用于商家向所属客服咚咚客户端发送通知. jingdong.com.jd.dd.open.gw.api.MessagePushService. 对外提供咚咚发送协议消息的服务」 | `[官方·摘录]`（正文 SPA） |
| 6 | [jos.jd.com/platformdetail?itemId=2222&listId=0](https://jos.jd.com/platformdetail?itemId=2222&listId=0)（chat_message4.2 协议） | 2026-10-14 | 搜索摘要：「聊天消息 jsonMsg体定义(ver=4.2). { "from": { "app":"im.waiter" // 消息发送者appid,必填. "pin":"jdkcs29" // 消息发送者pin,必填.」；另见「template2 模版消息体定义…同时需要联系产品…确认使用的模版是否正确」；直接抓取仅回「宙斯开发者中心 \| 公告列表」壳 | `[官方·摘录]`（正文 JS-SPA 壳） |
| 7 | 第三方技术博客（2025-02-26）[blog.csdn.net/weixin_44976692/article/details/145869608](https://blog.csdn.net/weixin_44976692/article/details/145869608) | 2026-10-14 | 「消息推送是京东商家开放平台为提高应用API调用效率而推出的一种主动推送服务，推送内容包括（京东订单、商品、退款等信息）…仅需在接收到京东推送的消息时调用API获取即可」；主题清单：`pop_order_create`、`order_order_cancel`、`order_order_pay`、`pop_order_change`、`pop_order_out`、`pop_order_remk_chg`、`pop_order_promise`、`ORDER_ADDR_MODIFY`；引官方文档 URL：`open.jd.com/v2/#/doc/guide?listId=1903`（消费方接入文档）、`listId=1881`（消费接入FAQ）、`listId=1908`（授权） | `[线索]`（URL 与主题名可复核，内容不作证据正文） |

### 2.2 京东系其他业务线（形态对照，不可外推）

| # | 来源 | 访问日期 | 逐字摘录 | 性质 |
|---|---|---|---|---|
| 8 | [open.healthjd.com/docs/common](https://open.healthjd.com/docs/common)（京东健康开放平台·消息同步规范） | 2026-10-14 | 「消息同步一般都会做重试处理，保证在网络不佳，接收消息服务器出现问题等情况多次通知，此时合作方需要进行幂等处理。返回方式有2种方案，一种是合作方按照接口要求的正确的消息体进行返回，第二种是给出固定的错误码1021，当京东接收到1021错误码以后也会认为合作方消息已经处理成功，不再重试。」 | `[对照]` `[官方·直抓]`（属京东健康，非京东零售） |
| 9 | [opendj.jd.com/staticnew/widgets/resources.html?id=2016](https://opendj.jd.com/staticnew/widgets/resources.html?id=2016)（京东秒送·消息类接口开发规范） | 2026-10-14 | 「到家通过HTTP协议POST方式调用商家消息接收接口，实时为商家推送通知消息。推荐商家在接收到消息且进行基础校验后，后续逻辑采用异步方式处理…」 | `[对照]` `[官方·摘录]`（页面框架直抓，语句经搜索摘要） |
| 10 | [opendj.jd.com/staticnew/widgets/selfEmpower/appmsg.html](https://opendj.jd.com/staticnew/widgets/selfEmpower/appmsg.html)（京东秒送·授权信息） | 2026-10-14 | 「授权码（token）会以POST表单（name/value）请求方式发送参数到商家回调公网地址上…接收token的应用回调地址返回值要求：需按照格式返回：{"code":"0","msg":"成功"}」 | `[对照]` `[官方·摘录]` |
| 11 | [docs.jdcloud.com/cn/message-queue](https://docs.jdcloud.com/cn/message-queue/product-overview)（京东云 JCQ） | 2026-10-14 | 消费端点形如 `{接入点}/v2/messages` 的 HTTP 拉取消费；Consumer Group 与 Topic 为 N:M 关系（详见 §3.1） | `[官方·直抓]` |

### 2.3 仅回壳/不可核验记录

直接抓取仅返回导航框架、无正文（2026-10-14，多形式多次尝试）：[jos.jd.com/commondoc?listId=520](https://jos.jd.com/commondoc?listId=520)、[open.jd.com/home/home#/doc/common?listId=520](https://open.jd.com/home/home#/doc/common?listId=520)、[open.jd.com/v2/#/doc/msgApi](https://open.jd.com/v2/#/doc/msgApi?apiCateId=81&apiId=276)、[open.jd.com/v2/doc/detail?listId=1903](https://open.jd.com/v2/doc/detail?listId=1903)、[jos.jd.com/platformdetail?itemId=2222&listId=0](https://jos.jd.com/platformdetail?itemId=2222&listId=0)、各客服 apilist 正文（apiGroupId=21/667/952/1696 等）

### 2.4 反向佐证

2026-10-14 共 10+ 轮定向检索（`im_push` / `chat_message` / `咚咚` / `客服消息` / `买家咨询` × `topic` / `订阅` / `推送` 等组合，中英文）：**未发现任何公开页面出现 IM/聊天类推送主题名或咚咚消息回调配置文档**；公开可见的推送主题命名体系全部为订单/商品/退款域

## 3. 通道形态与鉴权/报文

### 3.1 京东零售公开可见的推送形态：JMQ/JCQ 主题订阅，非 HTTP 回调

- 订阅消费两条路径（`[线索]` #7 转述官方「消费方接入文档」，官方正文需登录）：① 云鼎（京东云 ISV/商家专属环境）内网用 SDK 消费；② 公有云集群走 HTTP 拉取（非 Java 语言只能 HTTP 拉取）。HTTP 拉取端点形态与京东云 JCQ 一致：`{接入点}/v2/messages`（#11 直抓互证）
- 鉴权（`[线索]` #7 转述，未获官方正文核验）：京东云 AccessKey ID/Secret，加商家 Pin 对应用 appkey 授权，平台为该商家生成专属 topic；订阅配置后约 30 分钟生效
- 公开可见的主题均为订单/商品/退款类（#7 清单），**无任何 IM/聊天/客服主题**
- 未发现任何官方文档描述京东零售侧「回调 URL 配置、首次握手/挑战、回调验签算法」——公开形态下零售域的推送不是 webhook，无回调可配置

### 3.2 IM 消息体协议（chat_message4.2）——仅得发送侧片段

```json
{
  "from": {
    "app": "im.waiter",
    "pin": "jdkcs29"
  }
}
```

`app` 为消息发送者 appid（必填）、`pin` 为消息发送者 pin（必填）（#6 搜索摘要）。注意：该协议文档出现在「发送咚咚消息」（`josChatMessage.push2`）语境下，是 ISV→咚咚的发消息报文，**不是收侧推送报文**；完整正文仍未取得（JS-SPA）

### 3.3 京东系其他业务线的回调形态（仅对照）

- 京东健康（#8）：HTTP 回调 + 同步多次重试 + 合作方幂等 + 固定错误码 `1021` 表示「已处理成功、停止重试」
- 京东秒送/到家（#9、#10）：HTTP POST 实时推送至商家公网接收接口；token 授权码以 POST 表单回调，接收方返回 `{"code":"0","msg":"成功"}`
- 说明 HTTP webhook 形态在京东体系部分业务线存在，但**不能外推**到京东零售咚咚

### 3.4 易误读接口澄清（官方 API 名含 Push 但非收侧）

| 接口 | 官方描述 | 方向 |
|---|---|---|
| `jingdong.com.jd.dd.open.gw.api.MessagePushService` | 「对外提供咚咚发送协议消息的服务」（#5） | 发送 |
| `jingdong.dd.notice.NoticeDispatcher` | 「商家向所属客服咚咚客户端发送通知」（#5） | 发送/客户端通知 |
| `jingdong.miniapp.dd.push` | 京东小程序侧接入咚咚消息推送 | 客户端通知 |

以上均不能作为商家收消息的通道

## 4. 四件套（ChannelAdapter，ADR 0014）HTTP 回调形态判断

按 `channel()` / `verifyUrl` / `receive` / `send` 口径

- `send`（发侧）：实锤，`jingdong.dongdong.packet.josChatMessage.push2`（2026-09-10 基准已核，本次 #3/#4 复证）
- `verifyUrl`（GET 验证握手）：**无公开证据**。京东零售推送不是 HTTP 回调，不存在回调 URL 验证环节
- `receive`（验签 + 解析事件推送）：**无公开证据**。公开形态为 JMQ/JCQ 主题订阅（拉取/云鼎 SDK），非 HTTP POST 事件推送；回调验签口径无从取得（基准 §4.1 的 MD5 签名是 API 请求签名，不可套用）
- 若强行做四件套 HTTP 回调形态：公开证据不支持；需先取得登录态确认是否存在 IM 推送主题及其投递形态，否则该形态不成立

## 5. 未取得项清单（不可公开核验）

| 项 | 位置 | 状态与原因 |
|---|---|---|
| 消息主题总目录（权威清单，是否含 IM 主题） | open.jd.com/v2 消息文档页 / 消费方接入文档 listId=1903、FAQ listId=1881、授权 listId=1908 | 需登录，不可公开核验——**本结论「不可判定」的直接原因** |
| JOS 消息推送服务正文（旧入口） | jos.jd.com/commondoc?listId=520 | JS-SPA 仅回壳 |
| 新门户同主题正文 | open.jd.com/v2/#/doc/guide?listId=1903 等 | JS-SPA + 需登录；其存在性与主题仅经 `[线索]` #7 转述 |
| 咚咚 chat_message4.2 协议完整正文 | jos.jd.com/platformdetail?itemId=2222&listId=0 | JS-SPA 仅回壳（多次多形式尝试） |
| 各客服 API 包正文 | jos.jd.com/apilist（apiGroupId=21/667/952/1696 等） | JS-SPA 仅回壳，仅得搜索摘要片段 |
| 云鼎实时推送文档 | yd-doc.jdcloud.com | 本环境网络不可达（多次尝试失败） |
| Web Archive 历史快照 | web.archive.org | 本环境网络不可达（多次尝试失败） |
| 京东秒送·咚咚消息推送文档正文 | opendj.jd.com/staticnew/widgets/resources.html?groupid=227 | 仅导航框架；搜索摘要显示含 `jsonMsg.body.from.pin/app` 必填、咚咚全局唯一消息 ID、`sendTimestamp`（毫秒）等字段，归属秒送业务线，正文未核验 |

## 6. 后续核验路径（若需闭合「不可判定」）

1. 注册京东开放平台开发者（企业账号，2026-07-01 后 JOS 迁移至 open.jd.com/JDO，新增强约束见基准 §7-1b）
2. 登录 [open.jd.com/v2](https://open.jd.com/v2/) 查看「消费方接入文档」（listId=1903）与消息主题列表，确认咚咚/客服域是否存在推送主题
3. 或经开放平台对接渠道（云鼎文档提及的 JOS 对接群）直接向京东确认咚咚/客服域推送主题存在性与投递形态
4. 若确认无推送主题：京东渠道收侧按轮询建模（`jingdong.im.out.merchant.chatmessage.openapi.get` 凭 sid 拉会话记录 / `jingdong.im.pop.chatlog`，单次窗口 ≤7 天），实施票以轮询形态立项并注明轮询与授权约束
