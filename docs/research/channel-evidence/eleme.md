# 饿了么补证：商户线 IM 开放接口细节（channel-evidence）

> 研究日期：2026-10-14。任务：GitHub issue [#105](https://github.com/Buktal/dudu/issues/105)（parent #96，前序 #97 结论「饿了么商户线 IM 细节未公开」）
> 事实基准：`docs/research/channels/eleme.md`（下称「事实库」），本文对其 §7 待核验清单逐项补证
> 方法与采信口径：官方一手来源两类——(a) 商户线门户 `open.shop.ele.me` 文档页正文（直抓为 SPA 壳，经 r.jina.ai 渲染代理取 JS 渲染后正文，`URL Source` 字段与官方页一致，属官方页面内容；标注 `[渲染正文]`）；(b) 官方 SDK `me.ele.openapi:eleme-openapi-sdk` 1.30.65 的 `-sources.jar` 源码逐字（Maven Central 官方构件，POM 开发者 `open.shop@ele.me`，scm 指向官方仓 `napos_openapi/eleme-openapi-java-sdk`；标注 `[SDK源码]`）。所有 URL 访问日期均为 2026-10-14。搜索摘录标注 `[摘录]`，不作为唯一依据

## 结论（三选一）

**开实施票（有前提）**——饿了么商户线 IM 为官方文档化、双向（收来访 + 回复 + 已读）的开放能力，报文、凭据、媒体形态已全部核验；但**入站不是 HTTP 回调，而是应用级 WSS 长链**，且无断线补偿、无发送回执。实施票必须携带以下三项前提，传输形态建议随 #106 渠道地基（ChannelAdapter seam）裁决，可对照淘宝 TMC 长连接先例（#99/#102）

1. **传输**：入站靠 `wss://app-api.shop.ele.me/openapi/websocket` 长链（应用维度，一应用一链收全部授权店铺消息），非 HTTP POST 回调
2. **可靠性缺口**：1 分钟无心跳即断开；**断线期间漏掉的消息无补偿接口**；**发送后无成功/失败回执**——需在适配器层自建重连、去重与对账口径
3. **会话发起约束**：只能用户/骑手先发消息商家才能回（`groupId` 仅随来访消息下发，无接口主动建会话），IM 侧为纯被动接待场景

用户线（`openapi-doc.faas.ele.me`）无 IM 的结论维持不变（事实库 §2.4 目录级核验，本次未发现反证）

---

## 1. IM 存在性与定位（核验 #97 缺口「商户线 IM 待核验」）

- 官方文档《IM(即时消息)接入场景方案》：https://open.shop.ele.me/openapi/documents/shopim ，页首「最近更新时间：2026-03-19 19:57:56」`[渲染正文]`
- 定位逐字：「本文档面向对象为期望接入 IM(即时消息、在线联系) 的第三方开发者或者自研商家，方便商家、骑手与用户之间的在线实时沟通」；「IM 是商家、顾客、骑手之间的线上沟通通道」——即**订单场景的商家↔顾客↔骑手群聊**，与四件套「收来访 + 回复」的接待语义匹配
- 文档列出 IM 相关接口共 3 个（均在「店铺服务」下）：`eleme.shop.im.getIMStatus`（查询店铺 IM 开关）、`eleme.shop.im.updateIMStatus`（设置开关）、`eleme.shop.im.getWssAddress`（查询长链地址）`[渲染正文]`
- SDK 侧交叉核验：`eleme.openapi.sdk.api.entity.shop.im` 包（4 个 DTO）+ `enumeration.shop.im` 包（3 个枚举）+ `ShopService` 3 个方法 `[SDK源码]`。SDK 全部 530 个 action 名中 `im.` 仅此 3 个，无其他 IM 接口（语音/视频等 mediaId 类消息明确「暂不支持」，见 §4）

## 2. 传输与回调形态（核验事实库 §2.4/§3.2/§7.1/§7.8）

- **IM 收发不走 HTTP 回调**。官方 FAQ 逐字：「收发消息都是拿上面生成的长链地址，建立 WebSocket 链接」；长链地址格式 `wss://app-api.shop.ele.me/openapi/websocket?appId=napos_openapi&token=…` `[渲染正文]`
- 长链为**应用维度**：FAQ 逐字「长链 Token 是应用维度的……其他店铺授权给了这个应用，用户发送的消息都能收到。开发者收到消息后，需要根据 `groupId` 发送到对应的会话中」`[渲染正文]`
- 心跳：`bizType=HEARTBEAT` 保活，「长链连接不发送心跳后 1 分钟自动断开，后续无法收到消息」`[渲染正文]`
- **无断线补偿**：FAQ 逐字「长链断开连接后，是否有方法去补偿这期间漏掉的消息呢？——目前暂时还没有」`[渲染正文]`
- **无发送回执**：FAQ 逐字「发送消息后，是否有方法去判断消息是否发送成功？——目前暂时还没有」；且「商户通过长链发送的消息，平台不会通过长链再推送一次给商户」（无自发消息回显）`[渲染正文]`
- **沙箱不可测**：FAQ 逐字「沙箱环境测试 IM 会无法收到消息。目前只能在正式环境测试」`[渲染正文]`
- 对照边界——**HTTP 推送（数字 type 体系）不承载 IM**：推送消息示例页 https://open.shop.ele.me/base/documents/callback `[渲染正文]` 列出 type 实例 10 新订单 / 30 退单 / 39 售中部分退 / 71 配送状态 / 80 投诉 / 91 店铺运营状态(内层 type 300) / 96·97 店铺名审核 / 100 解除授权 / 105 服务市场订购 / 110 订单改地址 / 201 图片违规 / 95·210–213 负向管控 / 214 备注变更 / 215 淘宝订单支付 / 217 订单生效(推拉结合) / 218 小票打印 / 221·222 审核结果 / 223 催起炊 / 224 SPU 同步任务——**全部为订单/店铺域，无 IM 类型**。事实库 §7.3（镜像站声称的数字 type 信封）就此转正为官方一手：信封 `{requestId, type, appId, message(JSON 字符串), shopId, timestamp(毫秒), signature(32 位大写十六进制), userId}`。该线为订单消息专线，与 IM 无关
- 订单线传输现状：官方公告列表含「【重要通知】全双工推送下线通知」（https://open.shop.ele.me/openapi/publicnotice/0 ，标题 `[摘录]`；全文页渲染未取得）——订单线 WebSocket 全双工已下线，IM 的 WSS 长链是**独立的 IM 专线**，不受该下线影响（shopim 文档 2026-03-19 仍在维护）

## 3. 报文形态（收 / 发 / 已读，全部官方原文）

信封四字段 `{bizType, subBizType, payload}`，`payload` 为 JSON 字符串 `[渲染正文]` + `[SDK源码]`（`WebsocketMessageDTO`）

| 场景 | bizType | subBizType | payload 关键字段 |
|---|---|---|---|
| 用户/骑手→商家（来访） | `IM` | `SEND_MESSAGE` | `content, contentType, createTime, extensions, msgId(平台消息ID), orderId, receiverIds, senderId, groupId(会话ID), openSenderUserId, openReceiverUserIds` |
| 商家→用户/骑手（回复） | `IM` | `SEND_MESSAGE` | `groupId, msgId(接入方自拟), senderId, receiverIds, content, contentType, msgExt, openSenderUserId, openReceiverUserIds` |
| 用户已读商家消息 | `IM` | `READ_MESSAGE` | `cid(会话ID), msgIds[], uid` |
| 商家已读用户消息 | `IM` | `READ_MESSAGE` | `uid, msgId` |
| 心跳 | `HEARTBEAT` | `HEARTBEAT_MESSAGE` | 无 payload |

- 官方文本消息示例（逐字，仅脱敏尾号）：`{"subBizType":"SEND_MESSAGE","bizType":"IM","payload":"{\"senderId\":\"302…\",\"receiverIds\":[\"302…\",\"1030…\"],\"groupId\":\"$2$5938…$PNM@eleme\",\"msgId\":\"1129…PNM\",\"contentType\":1,\"content\":\"商家发送消息，成功！！！！\"}"}` `[渲染正文]`
- `groupId` 生成规则：2023-03 起**订单维度**（同店铺同用户每笔新订单新 groupId；官方建议每次从来访消息读取，不与店铺用户绑定）；V1.1（2023-03-24）消息体新增 `orderId`，无需再从订单卡片解析；V1.2（2024-06-06）配合用户 ID 字段变更新增 `openSenderUserId/openReceiverUserIds`（公告 1817923）`[渲染正文]`
- 参与方 ID 前缀：10 用户 / 20 骑手 / 30 商家 / 40 BD / 95 会话机器人（群冻结 + 智能卡片推送）`[渲染正文]`
- `extensions` 含义（FAQ）：`imsdk_self_show_name`、`imsdk_role_name`、`imsdk_other_show_name`、`current_msg_source` `[渲染正文]`
- 自定义消息（contentType 101）含卡片形态：订单卡片（`bizType:"order"`, `type:8`, `kvs[]`, `schemaUrl:"eleme://order_rating?order_id=…"`）与模版卡片（`msgType:"模版消息"`, `mistTemplate.layoutId` 等）`[渲染正文]`
- 官方参考代码为 Java WebSocket 客户端（`org.java_websocket.client.WebSocketClient`，`onMessage` 收来访、`send` 发回复）`[渲染正文]`——平台侧无额外帧协议，即标准 WebSocket 文本帧 + 应用层 JSON

## 4. 媒体形态

`contentType` 枚举（文档与 SDK `ContentType` 逐字一致）`[渲染正文]` + `[SDK源码]`

| 值 | 类型 | 备注 |
|---|---|---|
| 1 | TEXT 普通文本 | 支持 |
| 2 | IMAGE 图片 | 支持；`content` 为 JSON `{url, fileType(1-webp/2-png/3-jpg/4-gif), orientation}` |
| 3 | AUDIO 语音 | **第三方接入暂不支持**（涉及 mediaId） |
| 4 | VIDEO 视频 | **第三方接入暂不支持**（涉及 mediaId） |
| 5 | GEO 位置 | 文档枚举在列（SDK 同）；官方 FAQ 「目前支持文本，图片，@类型消息，自定义类型」未列出，按未开放对待 |
| 8 | AT @消息 | 支持 |
| 101 | CUSTOM 自定义 | 支持（订单卡片等） |

- 图片链接时效：官方图片链接（`paas-file-eleme.oss-cn-zhangjiakou.aliyuncs.com`）**有效期一天**，过期失效，需自行转存 `[渲染正文]`
- 图片/语音/视频素材上传未在 IM 文档给出接口；商家侧示例图片为自备外链 URL（`eleme.oss-cn-zhangjiakou.aliyuncs.com/ddmedia.jpeg`）`[渲染正文]`。媒体「四件套」中的媒体上/下载在饿了么线对应 SDK 的 `eleme.file.uploadImage` 等通用接口与 EFS 媒体组件 `[SDK源码]`，IM 文档未绑定专用媒体接口——实施票需另行核验 `eleme.file.*` 计费与权限

## 5. 凭据与签名

### 5.1 IM 长链 Token（与 OAuth token 是两套，官方明示「不要混淆」）

- 生成规则（官方文档 + SDK `IMTokenUtil.genToken` 逐字一致）：`Base64( Key # md5(Secret) # LocalMac(本机MAC) # ProcessID(进程ID) )` `[渲染正文]` + `[SDK源码]`
- 有效期：FAQ 逐字「长期效期，可以一直使用」`[渲染正文]`
- 用途：`eleme.shop.im.getWssAddress` 入参 `queryLongLineAddressDTO{appId, token, routingKey}`，`routingKey` 服务端接入固定传 `"local"` `[渲染正文]` + `[SDK源码]`（`QueryLongLineAddressDTO` 注释）；返回长链地址字符串
- 长链 Token 为应用维度（§2），泄露面等于 app_secret 派生，宜按机密管理

### 5.2 OAuth access_token（API 调用凭据，核验事实库 §7.5）

官方 token 文档 https://open.shop.ele.me/base/documents/token 「最近更新时间：2025-12-05」`[渲染正文]`

- OAuth 2.0 授权；`access_token` / `refresh_token` 均有时效：**沙箱各 1 天，正式各 30 天**
- 过期前用 `refresh_token` 刷新出新 `access_token` + 新 `refresh_token`（建议延迟队列）；两者都过期只能重新授权
- 有效期内重复授权不立即使旧 token 失效（缓存 48 小时后失效）
- 存储建议以 `userId` 为索引保存双 token 与生效/失效日期
- SDK 侧一致：`Token{access_token, token_type, expires, refresh_token}`，四种端点（授权 `authorize`、API `api/v1/`）：正式 `https://open-api.shop.ele.me/`、沙箱 `https://open-api-sandbox.shop.ele.me/`、PPE `ppe-open-api(.sandbox)?.shop.ele.me`、C 业务 `https://open-api.ele.me/` `[SDK源码]`（`BasicURL`）

### 5.3 API 包络与签名（核验事实库 §2.2/§4.3/§7.4——镜像传述就此转正为官方一手）

- 包络（`getWssAddress` apilist 页 https://open.shop.ele.me/openapi/apilist/eleme-shop/eleme-shop-im-getWssAddress `[渲染正文]` + SDK `WebUtils` `[SDK源码]` 逐字一致）：`{nop:"1.0.0", id:UUID4(响应回同值), metas:{app_key, timestamp(秒，服务端允许±5分钟)}, action:"eleme.shop.im.getWssAddress", token:access_token, params:{…}, signature}`；`Content-Type: application/json;charset=utf-8`；响应 `{id, result, error}`
- 签名算法（SDK `SignatureUtil.generateSignature` 逐字）`[SDK源码]`：参数与 `app_key`、`timestamp` 一并放入 `TreeMap` 排序 → 跳过 null 值 → 拼接 `key=Jackson序列化JSON(value)` → `splice = action + token + 拼接串 + secret` → `signature = MD5(splice)` 十六进制**大写**。与事实库 §4.3 的非 primary 转述完全吻合
- IM 3 个管理接口走同一包络与签名（ShopService 均 `call(...)` 经 `BaseNopService/WebUtils`）`[SDK源码]`

## 6. 管理接口与 IM 开关语义

- `eleme.shop.im.getIMStatus(shopId:Long)` → 店铺 IM 开关（文档 FAQ 层面：店铺 IM 开关控制 C 端入口；C 端「IM 入口会一直展示，订单完结后骑士自动退出群聊，商户和用户可持续保持沟通」）`[渲染正文]`
- `eleme.shop.im.updateIMStatus(shopId, status:0关/1开)` `[渲染正文]` + `[SDK源码]`
- 无会话列表/历史消息/未读接口：来访只从长链实时获得，FAQ 明确无断线补偿、无自动回复开关查询、无回复率查询接口 `[渲染正文]`——**对话持久化必须由接入方在收流时自行落库**

## 7. 与既有事实库（docs/research/channels/eleme.md）的核对

| 事实库待核验项 | 本文结果 |
|---|---|
| §7.1 商户线推送协议全文 | 部分核验：推送消息示例页全文已取（§2）；`httppushmethod` 页与订阅说明正文渲染未取得（直抓与渲染代理均超时/空壳），订阅/退订与重试间隔仍未见官方数字 |
| §7.3 数字 type 消息体系 | **转正为官方一手**（信封与 type 实例见 §2），镜像站口径与官方一致；官方未发布完整 type 总表 |
| §7.4 商户线签名算法 | **转正为官方一手**（§5.3，SDK 源码逐字） |
| §7.5 商户线 token 寿命与刷新 | **已核验**（§5.2，2025-12-05 官方文档：正式 30 天/沙箱 1 天，刷新与重授权规则） |
| §7.8 商户线 IM 推送存在性 | **已核验**：存在，双向，WSS 长链（§1–§3） |
| §2.4 用户线无 IM | 维持不变（本次无反证） |
| §7.2 callback/token 文档全文 | token 页已取（§5.2）；callback 页取到消息示例正文（§2），概述/订阅步骤文字渲染未取得（仅 `[摘录]`：HTTP 推送承载订单状态/运单状态/店铺运营状态通知） |
| §7.12 官方 SDK 本体 | 已核验（本文多处 `[SDK源码]`，版本 1.30.65；最新 1.31.76，2026-10-13 更新，持续维护） |
| §7.14 文档时效 | 商户线门户已更名「淘宝闪购服务商平台」（页面标题与版权 `©2016-2026 上海拉扎斯`），文档仍持续更新（shopim 2026-03-19、token 2025-12-05） |

仍未公开核验（不阻塞本票结论）：商户线推送订阅/退订流程与重试参数全文、`khd001` 商家应用授权说明全文（两次渲染均「加载中」）、`open.ele.me` 蜂鸟线。**不可公开核验项如实标注，未采用任何镜像转述。**

## 8. 实施含义速查（若开实施票）

- 适配器入站：常驻 `wss://app-api.shop.ele.me/openapi/websocket?appId=…&token=…` 连接（应用级单链即可收全部店铺），30s 级心跳（1 分钟超时），断线重连 + 自建补偿口径（重连后无历史补拉，需明示「断线窗口消息丢失」风险或配合店铺侧对账）
- 出站：同链 `send` 文本帧 `{bizType:"IM", subBizType:"SEND_MESSAGE", payload}`；发送无回执 → 发送状态只能记「已发出」；来访 `msgId` 做幂等键（平台消息 ID 唯一）
- 渠道身份：会话键 `groupId`（订单维度），绑定 `orderId`；参与者用 `openSenderUserId/openReceiverUserIds`（加密 ID，V1.2 起）展示层配合 `extensions` 别名
- 媒体：首轮仅文本 + 图片（`content` JSON url/fileType/orientation）；官方 OSS 图链 1 天过期，入库须转存
- 凭据：app_key/app_secret → 长链 Token（Base64 拼 MD5）+ OAuth token（30 天/刷新）；两套并行
- 测试：沙箱不可测 IM，须正式环境真实店铺（约束测试方案与灰度）

## 9. 证据清单（均为 2026-10-14 访问）

| 证据 | URL / 出处 | 获取方式与标注 |
|---|---|---|
| IM 接入场景方案（最近更新 2026-03-19） | https://open.shop.ele.me/openapi/documents/shopim | r.jina.ai 渲染代理取官方页正文 `[渲染正文]` |
| 推送消息 type 实例（callback 页） | https://open.shop.ele.me/base/documents/callback | 同上 `[渲染正文]` |
| Token 时效与刷新（最近更新 2025-12-05） | https://open.shop.ele.me/base/documents/token | 同上 `[渲染正文]` |
| getWssAddress 接口详情（包络/参数/响应） | https://open.shop.ele.me/openapi/apilist/eleme-shop/eleme-shop-im-getWssAddress | 同上 `[渲染正文]` |
| getIMStatus 接口详情 | https://open.shop.ele.me/openapi/apilist/eleme-shop/eleme-shop-im-getIMStatus | 同上 `[渲染正文]` |
| 官方 SDK 源码（1.30.65，Apache-2.0，open.shop@ele.me） | https://repo1.maven.org/maven2/me/ele/openapi/eleme-openapi-sdk/1.30.65/eleme-openapi-sdk-1.30.65-sources.jar （及 `.jar`/`.pom`） | 本地解包逐字 `[SDK源码]`；POM scm `napos_openapi/eleme-openapi-java-sdk` |
| SDK 版本线（最新 1.31.76，2026-10-13） | https://repo1.maven.org/maven2/me/ele/openapi/eleme-openapi-sdk/maven-metadata.xml | HTTP 直取 |
| 全双工推送下线公告（标题） | https://open.shop.ele.me/openapi/publicnotice/0 | 搜索摘录 `[摘录]`，全文未取得 |
| 用户 ID 字段变更公告（V1.2 依据） | https://open.shop.ele.me/common/publicnotice/1817923 | shopim 文档内链，未单独核验全文 |
| 商户线推送协议 httppushmethod | https://open.shop.ele.me/base/documents/httppushmethod | 直抓 SPA 壳、渲染代理超时——**不可公开核验（本次）** |
| 商家应用授权说明 khd001 | https://open.shop.ele.me/openapi/documents/khd001 | 渲染停「加载中」——**不可公开核验（本次）** |
