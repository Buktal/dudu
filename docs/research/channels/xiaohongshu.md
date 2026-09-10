# 小红书开放平台 / 专业号 事件事实库

> 研究日期：2026-09-10。方法：WebSearch 配额耗尽（09-27 恢复），全程未用搜索；采用 WebFetch 直抓 + Wayback CDX 归档枚举 + `gh` GitHub 代码搜索三条通道。
> **事实分级**：`[官方]` = 官方域名/API 直接返回；`[多源]` = ≥2 个独立第三方实现交叉一致；`[单源]` = 仅一处出现，真实性存疑；`[逆向]` = 非官方协议逆向。
> **勘误（2026-09-10 补摄）**：本文件首轮遗漏了 **miniapp.xiaohongshu.com（小红书小程序开放平台）** 域——小红书**有**官方公开推送通道：小程序「客服消息」体系（微信小程序客服消息同款模式），详见 §10。§2.4「专业号私信无官方 webhook」的结论就专业号 DM 而言仍成立，但「小红书侧无官方消息型推送基准」的整体印象作废。

---

## 1. 官方文档入口与关键页面地址

### 1.1 入口

| 入口 | URL | 状态 |
|---|---|---|
| 小红书开放平台 | https://open.xiaohongshu.com/ | JS SPA 空壳，WebFetch 抓不到正文（robots.txt/sitemap.xml 未知路径统一回退到 SPA 壳） |
| 小红书私信通（专业号客服工作台） | https://sxt.xiaohongshu.com/ | JS SPA 空壳；Wayback 仅有首页 1 次捕获，无文档子路径 |
| 电商开放平台 API 网关 | https://ark.xiaohongshu.com/ark/open_api/v3/common_controller | 所有 API（含 oauth）统一 POST 入口 `[多源]`（zsmhub/xhs-sdk api/api_base.go；qihang-erp-open xhsTokenApiHelper.java） |

### 1.2 文档中心的真实数据通道（绕过 SPA 空壳的抓法）

文档中心是 SPA，正文走 XHR。**GET 型可直抓**（本次全部实际抓通）：

| 接口 | 作用 | 实抓 URL |
|---|---|---|
| `/api/doc/listNew` | API 分类树 | https://open.xiaohongshu.com/api/doc/listNew |
| `/api/doc/second/listNew?apiNavigationId=14` | 分类下接口清单 | https://open.xiaohongshu.com/api/doc/second/listNew?apiNavigationId=14 |
| `/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId={id}` | 单接口 OpenAPI 规格 | https://open.xiaohongshu.com/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId=5747 |
| `/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661` | **公共参数官方定义**（appId/sign/timestamp/version/accessToken） | https://open.xiaohongshu.com/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661 |
| `/api/doc/errorcodeNew?apiNavigationDetailId={id}` | 接口错误码 | https://open.xiaohongshu.com/api/doc/errorcodeNew?apiNavigationDetailId=35 |

**POST 型（GET 直接 405，本次未能取正文）**：`/api/developer/doc/getDocNavigationNew`、`/api/developer/doc/getDocNavigationSecondListNew`、`/api/developer/doc/getDocDetailNew`。Wayback 有 2 批捕获，回放（`id_` 原始模式）得到部分导航：

- 文档中心五大板块（getDocNavigationNew，Wayback 20250925022221）：
  开发文档(docId=9)、API调用场景(10)、**数据加解密(11)**、电子面单(12)、规则中心(13)
- 数据加解密子树（getDocNavigationSecondListNew，Wayback 20250925022223）：docDetailId **50=「数据加密对接方案」、51=「加密算法介绍」**
- 电子面单子树（Wayback 20260112045128）：docDetailId 294/295/296/297/301/318
- 开发文档(docId=9) 子树与正文 **无归档、POST 墙** → 待核验(09-27)

开发者文档正文页路由（SPA）：`https://open.xiaohongshu.com/document/developer/file/{docDetailId}`。

### 1.3 Wayback CDX 枚举结果（open.xiaohongshu.com 域全部 200 捕获）

关键命中：`/api/developer/doc/*`（3 个 POST 接口）、`/api/doc/*`（list/info/second/errorcode/common-param 的新旧版本）、`/document/api?apiNavigationId=...&gatewayId=103&gatewayVersionId=1661&apiId=...`、`/develop/book`、`/authorization?appId=...&redirectUri=...`（OAuth 授权页）、`/service-market/applicationDetail?appid=...`。

---

## 2. 消息/事件推送全清单（电商开放平台 ark 网关）

来源：zsmhub/xhs-sdk `message/` 目录（Go 结构体逐字转录，msgTag 与字段名均为平台原样）；`cxjava/xhs-sdk`（分叉，注释佐证）。

### 2.1 推送信封（外层结构）

```json
{
  "msgTag": "事件类型标识",
  "sellerId": "商家ID",
  "data": "内层业务JSON序列化后的字符串（二级转义）"
}
```

- 平台 POST 到回调地址的 body 是 **该结构的 JSON 数组**（批量推送）。
- `data` 是 **JSON 字符串**，需二次反序列化。
- 应答体：`{"success": true, "error_code": 0, "error_msg": ""}`。

### 2.2 事件类型清单（msgTag → data 字段）

| msgTag | 场景 | data 字段（类型） |
|---|---|---|
| `msg_fulfillment_status_change` | 履约-订单状态变更 | orderId(string), updateTime(int64), orderStatus(int64) |
| `msg_fulfillment_receiver_change` | 履约-买家收货信息变更 | orderId(string), openAddressId(string), updateTime(int64) |
| `msg_fulfillment_seller_remark_change` | 履约-卖家修改备注 | orderId(string), operator(string), sellerMarkNote(string), updateTime(int64) |
| `msg_fulfillment_deliver_time_change` | 履约-订单发货时效变更 | orderId(string), openAddressId(**int64**), updateTime(int64) |
| `msg_after_sale_create` | 售后-发起售后申请 | returnsId(string), orderId(string), returnType(int64), request_from(int64), refundFee(float64), updateTime(int64) |
| `msg_after_sale_transfer` | 售后-售后类型变更 | returnsId, orderId, returnType, request_from, refundFee, updateTime（同上） |
| `msg_sku_create` | 商品-商品新建 | skuId(string), updateTime(int64) |
| `msg_sku_buyable` | 商品-商品上下架 | skuId(string), updateTime(int64) |
| `msg_sku_delete` | 商品-商品删除 | skuId(string), updateTime(int64) |
| `msg_item_audit_reject` | 商品-商品审核驳回 | itemId(string), updateTime(int64) |

注意字段命名不统一（`request_from` 下划线 vs 其余驼峰；`openAddressId` 在两事件中类型不同），mock 时应保留原样。

### 2.3 事件携带的枚举值（constant.go，逐字）

订单状态 orderStatus：1 已下单待付款 / 2 已支付处理中 / 3 清关中 / 4 待发货 / 5 部分发货 / 6 待收货 / 7 已完成 / 8 已关闭 / 9 已取消 / 10 换货申请中。

售后退货类型 returnType：1 退货退款 / 2 换货 / 3 仅退款(old) / 4 仅退款(new) / 5 未发货仅退款。

售后单状态（查询接口用，推送引用）：1 待审核 / 2 待用户寄回 / 3 待收货 / 4 完成 / 5 取消 / 6 关闭 / 9 拒绝 / 11 换货转退款 / 12 待商家发货 / 13 商家已发货 / 14 平台介入中 / 9001 商家收货拒绝。

### 2.4 私信（专业号 DM）事件

**未找到任何官方公开 webhook 规范。** GitHub 全网代码检索 `sxt.xiaohongshu.com` / `私信通` / `sixin_message` / `专业号+token`，官方通道实现为零。存在的只有：

- `[逆向]` 商家工作台 cookie 通道 + WebSocket（见 §8）。
- `[单源·存疑]` `zhilin1719-hue/--` 项目自述接入小红书私信回调（`im.message.receive` 事件、`x-xiaohongshu-signature` 头、`verify_webhook`+challenge 握手），但该 repo 为 AI 脚手架风格，事件命名模仿飞书（`im.message.receive` 是飞书事件名），文档仅引用官网首页 URL，无官方规格佐证。**不得作为事实采用**，详见 §7 待核验。

---

## 3. 回调机制

来源：zsmhub/xhs-sdk README + demo/message.go；cxjava/xhs-sdk examples/paid_order_flow/main.go 注释。

1. **URL 配置**：在开放平台控制台为应用配置「消息推送」回调 URL（HTTPS）。`[多源]` cxjava 注释原话：「生产环境更推荐：在开放平台配置『消息推送』，支付完成后平台 POST 到你的 HTTPS，在回调里解析订单号再调 order.getOrderDetail」。
2. **推送方式**：平台 POST，Content-Type JSON，body 为 `[{msgTag, sellerId, data}, ...]` 数组。
3. **应答**：HTTP 200 + `{"success": true, "error_code": 0, "error_msg": ""}`。
4. **首次校验握手**：**未发现** echo/challenge 类握手机制（电商推送侧）。SDK demo 直接上线收 POST。→ 官方「开发文档-消息推送」章节未取得，待核验(09-27)。
5. **OAuth 授权回调**（与推送回调是两个不同 URL 配置项）：平台 GET 回调地址，带 `code`、`state` 参数；用 code 调 `oauth.getAccessToken` 换 token。
6. **重试策略**：官方文档未取得 → 待核验(09-27)。
7. **推送验签**：cxjava 注释称「验签方式与 API 调用一致（文档『消息推送』章节）。本仓库未内置验签」；zsmhub demo 完全不验签。两 SDK 均未展示推送侧签名头 → 待核验(09-27)。

---

## 4. 验签与加密算法

### 4.1 调用方签名（请求平台 API 时）`[官方+多源]`

官方公共参数文档（paramNew 直抓，见 §5.3）定义请求体必填 `["appId","method","sign","timestamp","version"]`，并注明：**「accessToken：通过code获取的accessToken(授权接口等部分接口不需要此参数，该字段不参与sign签名运算)」**。

签名算法（zsmhub Go 与 qihang Java 两源逐字一致）：

```
signString = method + "?appId=" + appId + "&timestamp=" + timestamp + "&version=" + version + appSecret
sign = md5_hex_lowercase(signString)
```

- qihang-erp-open `xhsTokenApiHelper.java` 原文：
  `String signString = method+"?appId="+appId+"&timestamp="+time.toString()+"&version="+"2.0"+appSecret;`
  `String sign = MD5Utils.MD5Encode(signString);`
- `method` 形如 `oauth.getAccessToken`、`common.getCategories`；`version` 固定 `2.0`；`timestamp` 为 **秒级** UNIX 时间戳（官方 paramNew example: `1612518379`）。

### 4.2 推送方验签（平台 → 回调）

无公开证据存在独立签名头（见 §3.7）。注意：`[单源·存疑]` 的 `x-xiaohongshu-signature`（HMAC-SHA256(body, appSecret) hex）未被任何其他源证实。

### 4.3 数据加解密 `[官方·目录级]`

- 文档中心有独立板块「数据加解密」：docDetailId 50「数据加密对接方案」、51「加密算法介绍」——正文 POST 墙，**算法细节待核验(09-27)**。
- 业务事实：订单收件人等敏感信息以 `encryptedData` 密文返回，需调接口解密 `[多源]`：
  - 方法：`data.batchDecrypt`
  - 请求：`{baseInfos: [{dataTag: "订单场景为orderId", encryptedData}], actionType, appUserId}`
  - `actionType`：`1` 单个查看订单明文 / `2` 批量解密打单 / `3` 批量解密后面向三方的数据下发 / `4` 其他场景
  - 响应：`data.dataInfoList[]: {dataTag, encryptedData, decryptedData, errorCode, errorMsg}`

---

## 5. 示例载荷原文（逐字）

### 5.1 `GET /api/doc/listNew`（API 分类树）`[官方]`

```json
{"data":"[{\"id\":14,\"navigationName\":\"公共API\",\"seq\":0},{\"id\":15,\"navigationName\":\"订单API\",\"seq\":1},{\"id\":16,\"navigationName\":\"售后API\",\"seq\":2},{\"id\":17,\"navigationName\":\"商品API\",\"seq\":3},{\"id\":18,\"navigationName\":\"库存API\",\"seq\":4},{\"id\":19,\"navigationName\":\"素材中心API\",\"seq\":5},{\"id\":20,\"navigationName\":\"物流API\",\"seq\":6},{\"id\":21,\"navigationName\":\"财务API\",\"seq\":7},{\"id\":304,\"navigationName\":\"即时零售API\",\"seq\":9},{\"id\":332,\"navigationName\":\"会员通API\",\"seq\":9},{\"id\":343,\"navigationName\":\"供货商API\",\"seq\":11}]","error_code":0,"setData":true,"setError_code":true,"setError_msg":false,"setSuccess":true,"success":true}
```

### 5.2 `getDocNavigationNew`（文档中心板块，Wayback 20250925022221 回放，unicode 已解码）`[官方]`

```json
{"error_code":0,"data":{"docNavigationList":[
 {"docId":9,"seq":0,"docNavigationName":"开发文档"},
 {"docId":10,"seq":1,"docNavigationName":"API调用场景"},
 {"docId":11,"seq":2,"docNavigationName":"数据加解密"},
 {"docId":12,"seq":3,"docNavigationName":"电子面单"},
 {"docId":13,"seq":4,"docNavigationName":"规则中心"}],"success":true}
```

（原文为 `\uXXXX` 转义，标题解码如上；「数据加解密」子树：docDetailId 50=数据加密对接方案、51=加密算法介绍；「电子面单」子树：294=新版小红书电子面单ISV对接改造、295=电子面单对接说明（新）、296=电子面单打印组件协议（新）、297=小红书云打印系统物料使用说明书、301=电子面单常见问题（新）、318=小红书打印组件使用问题。）

### 5.3 `GET /api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661`（公共参数官方规格）`[官方]`

```json
{"code":0,"success":true,"data":{"id":5576,"path":"/ark/open_api/v3/common_controller","summary":"","method":"post","specJson":{"summary":"公共参数","servers":[],"requestBody":{"content":{"application/json":{"schema":{"required":["appId","method","sign","timestamp","version"],"type":"object","properties":{"method":{"type":"string","description":"API接口名称","example":"package.getPackageList"},"appId":{"type":"string","description":"创建应用的appId","example":"21d***de0"},"sign":{"type":"string","description":"API输入参数签名结果，签名算法参考开发者文档","example":"532***089"},"timestamp":{"type":"string","description":"UNIX时间戳，单位秒","example":"1612518379"},"version":{"type":"string","description":"API协议版本号，目前使用2.0","example":"2.0"},"accessToken":{"type":"string","description":"通过code获取的accessToken(授权接口等部分接口不需要此参数，该字段不参与sign签名运算)","example":"token-67***aa-43***c4"}}}}}},"responses":{"200":{"description":"success","content":{"application/json":{"schema":{"type":"object"}}}}}},"gatewayVersionName":"feature/logan","updateTime":"2025-12-08T13:35:51.000Z"}}
```

要点：`timestamp` 官方 example 为字符串型秒级时间戳；`path` 官方登记为 `/ark/open_api/v3/common_controller`；schema 内部还带 `x-schema` 元数据（已省略，含网关 schemaId 等，与 mock 无关）。

### 5.4 消息推送回调 body（按 `[多源]` SDK 结构体构造的最小示例，非官方原文快照）

```json
[
  {
    "msgTag": "msg_fulfillment_status_change",
    "sellerId": "5e8e****",
    "data": "{\"orderId\":\"P01****\",\"updateTime\":1693500000,\"orderStatus\":4}"
  },
  {
    "msgTag": "msg_after_sale_create",
    "sellerId": "5e8e****",
    "data": "{\"returnsId\":\"R01****\",\"orderId\":\"P01****\",\"returnType\":1,\"request_from\":1,\"refundFee\":9900,\"updateTime\":1693500001}"
  }
]
```

应答（HTTP 200）：

```json
{"success":true,"error_code":0,"error_msg":""}
```

> 说明：信封字段名（msgTag/sellerId/data、success/error_code/error_msg）逐字来自 SDK 结构体 tag；数值占位由本研究的示例值填充（SDK 中官方样例值未含完整推送报文，官方「消息推送」文档正文未取得）。

### 5.5 oauth.getAccessToken 响应结构（token 字段名逐字，值为占位）`[多源]`

```json
{
  "error_code": 0,
  "success": true,
  "data": {
    "accessToken": "token-****",
    "accessTokenExpiresAt": 1693586400,
    "refreshToken": "rt-****",
    "refreshTokenExpiresAt": 1696178400,
    "sellerId": "5e8e****",
    "sellerName": "某旗舰店"
  }
}
```

---

## 6. token / 凭证模型（电商 ark 侧）`[多源]`

| 项 | 事实 |
|---|---|
| 凭证 | appId + appSecret（开放平台创建应用发放） |
| 授权页 | `https://ark.xiaohongshu.com/ark/authorization?appId={appId}&redirectUri={redirectUri}&state={state}` |
| 换 token | method=`oauth.getAccessToken`，业务参数 `{code}`（授权回调带回的 code） |
| 刷新 | method=`oauth.refreshToken`，业务参数 `{refreshToken}` |
| 响应字段 | accessToken / accessTokenExpiresAt / refreshToken / refreshTokenExpiresAt / sellerId / sellerName（**绝对时间戳**，非 expiresIn 秒数） |
| 寿命 | 返回绝对过期时间戳；**具体寿命时长官方数值未取得** → 待核验(09-27) |
| 参与签名 | accessToken 不参与 sign（官方 paramNew 明示）；code/refreshToken 在 body 中随公共参数一起 POST |
| 网关 | 全部走 `POST https://ark.xiaohongshu.com/ark/open_api/v3/common_controller`，JSON body = 公共参数 + 业务参数平铺 |

---

## 7. 待核验清单（统一 09-27 恢复后重试）

1. **[官方·开发文档正文]** docId=9「开发文档」子树：接入流程、消息推送章节、签名算法官方原文、token 寿命数值、推送重试策略、推送是否带签名头。通道：webReader 恢复后浏览器渲染抓 `https://open.xiaohongshu.com/document/developer/file/{docDetailId}`；或找到 POST `/api/developer/doc/getDocDetailNew` 的带参调用办法。→ **待核验(09-27)**
2. **[官方·数据加解密]** docDetailId 50/51 正文（encryptedData 的具体算法，大概率 AES，密钥派生方式）。→ **待核验(09-27)**
3. **[专业号私信官方通道]** 是否存在面向 ISV 的官方私信 webhook/拉取 API。GitHub 无实现痕迹、开放平台文档中心五大板块均为电商域；不排除藏在登录墙后（服务市场 ISV 专属文档）。**部分解决**：miniapp 域已有官方消息型推送（§10），但那是小程序客服会话，不是专业号私信本身——专业号 DM 是否有 ISV 通道仍未知。→ **待核验(09-27)**
4. **[单源存疑]** `x-xiaohongshu-signature` HMAC-SHA256 + `im.message.receive` + `verify_webhook` challenge 模式（zhilin1719-hue/--）。需官方对质后才能采用；当前判定为模仿飞书的拼装。**注意**：miniapp 域官方握手的参数名叫 `signature`/`echostr`（§10），与该单源声称的头名/事件名仍不相符，维持不可信判定。→ **待核验(09-27)**
5. **推送 URL 首次配置时是否有连通性校验**（类似微信 echostr）。**已解决**：miniapp 客服消息体系有 echostr 握手（§10.4）；电商 ark 侧仍未知。→ 电商侧待核验(09-27)
6. 电子面单/规则中心子树（docDetailId 294-318 等，与 mock-pulse 关系弱，低优先级）。→ 待核验(09-27)
7. `https://open.xiaohongshu.com/develop/book`（2026-06 有归档，SPA 壳，可能有 SSR 版）。→ 待核验(09-27)

---

## 8. 附录：私信通非官方通道事实（`[逆向]`，仅供了解，勿作 mock 基准）

来源：jtrhb/sxt（pysxt「小红书私信通机器人开发框架」）、vikiboss/redote。

- sxt.xiaohongshu.com 是**商家客服工作台**（多客服 `im/multiCustomerService` 页面），认证靠商家登录 cookie：关键 cookie `x-user-id-sxt.xiaohongshu.com`、`access-token-sxt.xiaohongshu.com`（形如 `customer.sxt.AT-...`）；请求头 `x-subsystem: sxt`。
- 私信实时通道为 **WebSocket** `wss://zelda.xiaohongshu.com/websocketV2`，客户端标识 appId=`647e8f23d15d890d5cc02700`、token=`7f54749ef19aaf9966ed7a616982c016bda5dfba`、appName=`walle-ad`（工作台前端内置常量）。
- WS 协议帧：`{type:1, token, appId}` 鉴权 → 服务端 `{type:129, secureKey}` → 客户端 `{type:10, topic: AES-ECB(secureKey, userId), encrypt:true}`（topic 用 secureKey 作 AES-ECB 密钥加密 userId，base64-urlsafe）→ 服务端 `{type:2, data:{type:"PUSH_SIXINTONG_MSG", payload:{sixin_message:{message_type,...}}}}` 推私信 → 客户端回 `{type:130, ack:seq}`；心跳 type 4/132，附加信息应答 type 138→12。
- 私信 message_type 枚举：`TEXT / EMOTICON / IMAGE / VIDEO / VOICE / CARD`。
- 明确结论：**这是「商家客户端 ↔ 平台」的内部协议，不是「平台 → 第三方回调」的开放通道**；mock-pulse 若要模拟官方回调，不应以此为蓝本；若要模拟「商家侧收私信」，可参考其 WS 帧结构（标注非官方）。

---

## 9. 本次实际抓取/使用的 URL 与代码源清单

**直抓（WebFetch）**
- https://open.xiaohongshu.com/ 、/document 、/robots.txt 、/sitemap.xml 、/develop/book（均 SPA 壳）
- https://sxt.xiaohongshu.com/ 、/robots.txt（SPA 壳）
- https://open.xiaohongshu.com/api/doc/listNew ✔
- https://open.xiaohongshu.com/api/doc/list ✔（旧版分类）
- https://open.xiaohongshu.com/api/doc/second/listNew?apiNavigationId=14 ✔
- https://open.xiaohongshu.com/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId=5747 ✔
- https://open.xiaohongshu.com/api/doc/info?gatewayId=103&gatewayVersionId=1661&apiId=5719 ✔
- https://open.xiaohongshu.com/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661 ✔
- https://open.xiaohongshu.com/api/doc/errorcodeNew?apiNavigationDetailId=35 ✔
- https://open.xiaohongshu.com/api/developer/doc/getDocNavigationNew（405）
- https://web.archive.org/cdx/search/cdx?url=open.xiaohongshu.com&matchType=domain&...（CDX 枚举）
- https://web.archive.org/web/20250925022221id_/.../getDocNavigationNew ✔
- https://web.archive.org/web/20250925022223id_/.../getDocNavigationSecondListNew ✔
- https://web.archive.org/web/20260112045127id_/.../getDocDetailNew ✔（docDetailId=1 空内容）
- https://web.archive.org/web/20260112045128id_/.../getDocNavigationSecondListNew ✔（电子面单子树）

**GitHub（gh api）**
- zsmhub/xhs-sdk：api_base.go / api_client.go / api_tool.go / api_http.go / api_oauth.go / oauth-获取访问令牌.go / oauth-刷新访问令牌.go / constant.go / message/*（10 事件）/ README.md / demo/message.go / 订单API-批量解密.go
- zeasin/qihang-erp-open：open-sdk/.../xhsTokenApiHelper.java、TokenVo.java（签名交叉验证）
- cxjava/xhs-sdk：examples/paid_order_flow/main.go（推送用法注释）
- jtrhb/sxt：engine/pysxt/core.py、message.py、message_type.py（私信通逆向）
- vikiboss/redote：README.md（zelda WS 协议）
- zhilin1719-hue/--：src/app/api/xiaohongshu/callback/route.ts、src/lib/xiaohongshu-openapi.ts（**判为不可信单源**）

**miniapp 域（2026-09-10 补摄，全部 WebFetch 直抓成功）**
- https://miniapp.xiaohongshu.com/doc/DC026595 ✔（小程序简介；左侧导航含「服务端能力→消息推送」「事件回调」全目录）
- https://miniapp.xiaohongshu.com/doc/DC897608 ✔（客服消息：接收消息与发送消息）
- https://miniapp.xiaohongshu.com/doc/DC577113 ✔（消息推送：配置/握手/验签/重试/应答，更新于 2026-01-09）
- https://miniapp.xiaohongshu.com/doc/DC591932 ✔（**官方错链**：DC577113 引用的「消息加解密」指到此页，实际内容为「开放数据校验与解密」，见 §10.6）

---

## 10. 补摄：小程序客服消息体系（miniapp.xiaohongshu.com）`[官方]`

> 背景：用户提供 miniapp 域两页文档后补摄。这是小红书**官方公开的消息型推送通道**——用户在小程序客服会话向商家发消息/触发事件，小红书服务器推送到开发者配置的 URL。整体为**微信小程序客服消息的同款模式**（Token＋EncodingAESKey＋echostr 握手＋sha1 验签＋success 应答＋5s×3 重试），载荷为 JSON（微信系为 XML）。

### 10.1 域的定位与「平台通讯两形态」

各大平台的通讯开放能力走两条路：**直连私信**（平台 IM 能力直接开放，如抖音 IM、企微）或**小程序客服消息**（平台给小程序生态，用客服会话实现通讯，如微信小程序、小红书小程序）。小红书走的是第二条——专业号私信没有官方 ISV 推送（§2.4），但小程序客服消息有完整官方规范。对 mock-pulse：小红书侧的官方模拟基准＝本体系。

### 10.2 服务器配置（开放平台控制台填写）

| 配置项 | 说明 |
|---|---|
| URL | 接收消息与事件的接口地址；必须 `http://`（80）或 `https://`（443）开头 |
| Token | 开发者自定义，用于生成签名做安全校验 |
| EncodingAESKey | 手动填写或随机生成，作为消息体加解密密钥 |

### 10.3 消息格式（客服消息）

POST 到配置 URL，**JSON**。通用字段＋按 MsgType 追加专属字段：

| MsgType | 专属字段 | 说明 |
|---|---|---|
| `text` | `Content` | 文本内容 |
| `image` | `PicUrl` | 图片链接 |
| `video` | `VideoUrl` | 视频链接 |
| `item` | `OutProductId` | 外部商品 id |
| `order` | `OutOrderId` | 外部订单 id |

通用字段：`MsgId`（字符串）、`FromOpenId`（发送者 openid）、`ToAppId`（小程序 appid）、`MsgType`、`CreateTime`（秒级）。

文本消息载荷形如：

```json
{"MsgId": "MSG_ID", "FromOpenId": "USER_OPEN_ID", "ToAppId": "SELLER_APP_ID", "MsgType": "text", "CreateTime": 1648714429, "Content": "..."}
```

收到消息后 **48h 内**可用「发送客服消息」接口（DC234367）回复。

### 10.4 首次握手（URL 校验）与验签

- 提交配置后，小红书服务器向所填 URL 发 **GET**，携 4 个 **query 参数**（非请求头）：`signature`、`timestamp`、`nonce`、`echostr`。
- 校验通过后**原样返回 echostr 参数内容**，接入生效。
- 验签算法：`signature = sha1( sort(token, timestamp, nonce) 三值字典序排序后拼接 )`——与微信/企微同族（企微版多第四个参数 msg_encrypt）。

### 10.5 应答与重试

- 收到推送必须应答：**直接回复 `success`（官方推荐）**，或按对应接口文档返回指定内容，否则报错。
- 5 秒内收不到响应断开连接并重发，**总共重试 3 次**。

### 10.6 消息体加解密（细节未取得，官方错链）

- DC577113 明示消息体走加密、密钥即配置的 EncodingAESKey，但引用的「消息加解密」文档（DC591932）实际返回的是「开放数据校验与解密」（session_key/AES-128-CBC/PKCS#7，属用户开放数据体系，非消息推送体系）——**官方文档挂错链**。
- **强假设（推断非事实）**：算法为微信系 WXBizMsgCrypt 同款——AES-CBC、密钥=Base64_decode(EncodingAESKey+"=") 32 字节、IV=密钥前 16 字节、PKCS#7 补位、明文结构 random(16B)+msg_len(4B 大端)+msg+receiveid。依据：配置项同名、握手/验签/应答/重试全同款（企微侧同款算法已完整入库，见 `wecom.md` §4）。→ **待核验(09-27)**（或下载官方 Java 示例包核验）。

### 10.7 事件回调族（目录级，正文未抓）

侧栏「事件回调」栏目独立成篇：商品审核、代码审核结果、小程序服务状态、支付结果、退款结果、交易能力切换、群聊人数已满、用户加群通知、笔记发布、服务组件自动下架、服务组件门店审核结果。→ 正文待核验(09-27)

### 10.8 对 mock-pulse 的意义

1. 小红书侧模拟基准成立：按「小程序客服消息」体系造模板（5 种 MsgType＋事件回调族），协议家族与企微同源——验签/加密伪造代码可大部分复用企微那套（差 JSON vs XML 与 receiveid 规则）。
2. 「渠道」的领域模型应容纳两种形态：直连私信（抖音 IM/企微）与小程序客服消息（小红书/微信系）。
3. 网传 `x-xiaohongshu-signature`/`im.message.receive`（§2.4）维持不可信判定——官方真名是 query 参数 `signature`＋`echostr`。

---

## 11. 二次补摄：支付结果回调正文 + 消息加解密官方源码（2026-09-10 晚，用户指路 DC753163）

> 本节关闭两个缺口：§10.6 的「AES 算法强假设」升级为官方实锤；§10.7 的「支付结果回调正文未抓」关闭。

### 11.1 支付结果回调（DC753163，`[官方]`）

来源：https://miniapp.xiaohongshu.com/doc/DC753163?path=/third/api-3rd-doc/msgCrypt （更新 2024-11-25）

- 担保支付场景下支付结果主动推送（原文面向服务商推送，主单与预约单共用同一 Event，`OrderType` 区分）；「推送请求需解密，解密后参数为……」——业务字段在 Encrypt 密文内，解密细节链接 → DC519884。
- **OrderType=1（预售券/团购券主订单通知）字段表**：`Event`（固定 `PAY_RESULT`）、`OrderId`、`OutOrderId`、`Status`（2=支付成功，998=支付取消）、`PayChannel`（1=微信，2=支付宝，99=其它，仅成功时返回）、`TotalAmount`（单位：分）、`VoucherInfos` 列表（含 `VoucherCode` 券码）、`ProductType`（1=团购券，2=酒旅预售券）、`PayTime`（秒级时间戳）。
- **OrderType=2（预约单通知）差异**：`OutBookOrderId` 替代 `OutOrderId`；`ProductType` 取 2（酒旅预售券补差价）或 3（日历商品）。

### 11.2 消息加解密文档（DC519884，`[官方]`）——DC577113 错链的真正目标

来源：https://miniapp.xiaohongshu.com/doc/DC519884 （「第三方平台 → 操作指南 → 消息加解密」，更新 2024-11-28）

- POST 推送 body（JSON）字段表：`Nonce`（string）、`Timestamp`（i32，秒级）、`Encrypt`（string）、`MsgSignature`（string）——**签名与随机数在 body 内**（企微自建应用是 query 参数，此处不同）。
- 创建服务商时的 URL 验证消息为 GET（参数在 query）；服务器须返回字符串 `success`，否则重试，重试过多触发熔断。
- 验签 = 用「消息验证 TOKEN」+ Nonce + Timestamp + Encrypt 计算签名与 MsgSignature 比对（指引示例代码 `MsgSignature.getSignature`）；解密 = `MsgDecrypt.decrypt`（指引示例代码）。
- 官方 Java 示例包（本次已下载并解析）：https://fe-video-qc.xhscdn.com/fe-platform/87989404f48299d3ab814cef6ce4013d85fb827b.zip?attname=MsgDecrypt.zip （包名 `com.xiaohongshu.mp.security.util`，含 MsgDecrypt.java / MsgSignature.java / PKCS7Decoder.java）

### 11.3 官方源码实锤（三个类逐字要点，`[官方]`）

- `MsgDecrypt.decrypt`：`aesKey = Base64Decode(encodingAesKey + "=")`；`AES/CBC/NoPadding`（补位手工处理）；`IV = aesKey[0:16]`；解密后去 PKCS#7 补位 → 明文结构 = `random(16B) + msg_len(4B 网络字节序大端) + msg + appId`（截去真实消息后末尾即 appId）。
- `PKCS7Decoder.decode`：pad 取值 1..32 —— **PKCS#7 以 32 字节为块单位补位**（与企微相同，非常见 AES 的 16）。
- `MsgSignature.getSignature`：`sha1( [token, timestamp, nonce, encrypt] 四值字典序排序后直接拼接 )`，输出小写 hex——与企微四值签名同族。

### 11.4 对 §7/§10 的修订与对 MockPulse 的意义

- §10.6「强假设微信同款 WXBizMsgCrypt」→ **官方实锤**（密钥派生/模式/IV/补位/明文结构/签名算法全部与微信系一致）；差异点：信封是 JSON（`{Nonce, Timestamp, Encrypt, MsgSignature}` 在 body 内）、明文尾部 receiveid = **appId**、载荷 JSON。
- §10.7「支付结果回调正文未抓」→ 关闭（§11.1 字段表）。
- §7.1/7.5 部分缓解：miniapp 域消息推送的加解密与签名算法已实锤；开发文档正文其余章节与电商 ark 侧仍待核验(09-27)。
- MockPulse 伪造实现：企微那套 AES-256-CBC 伪造代码可直接复用于小红书，仅三处不同——JSON 信封、receiveid 用 appId、签名值放 body 字段而非 query。
