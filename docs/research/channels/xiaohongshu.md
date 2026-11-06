# 小红书开放平台 / 专业号 事件事实库

> 研究日期：2026-09-10。方法：WebSearch 配额耗尽（09-27 恢复），全程未用搜索；采用 WebFetch 直抓 + Wayback CDX 归档枚举 + `gh` GitHub 代码搜索三条通道
> **事实分级**：`[官方]` = 官方域名/API 直接返回；`[多源]` = ≥2 个独立第三方实现交叉一致；`[单源]` = 仅一处出现，真实性存疑；`[逆向]` = 非官方协议逆向
> **勘误（2026-09-10 补摄）**：本文件首轮遗漏了 **miniapp.xiaohongshu.com（小红书小程序开放平台）** 域——小红书**有**官方公开推送通道：小程序「客服消息」体系（微信小程序客服消息同款模式），详见 §10。§2.4「专业号私信无官方 webhook」的结论就专业号 DM 而言仍成立，但「小红书侧无官方消息型推送基准」的整体印象作废
> **勘误（2026-11-03 补摄）**：商业开放平台（ad-market.xiaohongshu.com）存在官方私信三方（third_im）体系——专业号私信**有**面向 ISV 的「接收消息推送 + 发送消息 API」官方通道（接口文档在登录墙内，字段表待核验），详见 §13。**§2.4、§7.3、§10.1 的「专业号私信无官方 ISV 推送」结论全部作废**

---

## 1. 官方文档入口与关键页面地址

### 1.1 入口

| 入口 | URL | 状态 |
|---|---|---|
| 小红书开放平台 | https://open.xiaohongshu.com/ | JS SPA 空壳，WebFetch 抓不到正文（robots.txt/sitemap.xml 未知路径统一回退到 SPA 壳） |
| 小红书私信通（专业号客服工作台） | https://sxt.xiaohongshu.com/ | JS SPA 空壳；Wayback 仅有首页 1 次捕获，无文档子路径 |
| 电商开放平台 API 网关 | https://ark.xiaohongshu.com/ark/open_api/v3/common_controller | 所有 API（含 oauth）统一 POST 入口 `[多源]`（zsmhub/xhs-sdk api/api_base.go；qihang-erp-open xhsTokenApiHelper.java） |

### 1.2 文档中心的真实数据通道（绕过 SPA 空壳的抓法）

文档中心是 SPA，正文走 XHR。**GET 型可直抓**（本次全部实际抓通）

| 接口 | 作用 | 实抓 URL |
|---|---|---|
| `/api/doc/listNew` | API 分类树 | https://open.xiaohongshu.com/api/doc/listNew |
| `/api/doc/second/listNew?apiNavigationId=14` | 分类下接口清单 | https://open.xiaohongshu.com/api/doc/second/listNew?apiNavigationId=14 |
| `/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId={id}` | 单接口 OpenAPI 规格 | https://open.xiaohongshu.com/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId=5747 |
| `/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661` | **公共参数官方定义**（appId/sign/timestamp/version/accessToken） | https://open.xiaohongshu.com/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661 |
| `/api/doc/errorcodeNew?apiNavigationDetailId={id}` | 接口错误码 | https://open.xiaohongshu.com/api/doc/errorcodeNew?apiNavigationDetailId=35 |

**POST 型（GET 直接 405，本次未能取正文）**：`/api/developer/doc/getDocNavigationNew`、`/api/developer/doc/getDocNavigationSecondListNew`、`/api/developer/doc/getDocDetailNew`。Wayback 有 2 批捕获，回放（`id_` 原始模式）得到部分导航

- 文档中心五大板块（getDocNavigationNew，Wayback 20250925022221）
  开发文档(docId=9)、API调用场景(10)、**数据加解密(11)**、电子面单(12)、规则中心(13)
- 数据加解密子树（getDocNavigationSecondListNew，Wayback 20250925022223）：docDetailId **50=「数据加密对接方案」、51=「加密算法介绍」**
- 电子面单子树（Wayback 20260112045128）：docDetailId 294/295/296/297/301/318
- 开发文档(docId=9) 子树与正文 **无归档、POST 墙** → 待核验(09-27)

开发者文档正文页路由（SPA）：`https://open.xiaohongshu.com/document/developer/file/{docDetailId}`

### 1.3 Wayback CDX 枚举结果（open.xiaohongshu.com 域全部 200 捕获）

关键命中：`/api/developer/doc/*`（3 个 POST 接口）、`/api/doc/*`（list/info/second/errorcode/common-param 的新旧版本）、`/document/api?apiNavigationId=...&gatewayId=103&gatewayVersionId=1661&apiId=...`、`/develop/book`、`/authorization?appId=...&redirectUri=...`（OAuth 授权页）、`/service-market/applicationDetail?appid=...`

---

## 2. 消息/事件推送全清单（电商开放平台 ark 网关）

来源：zsmhub/xhs-sdk `message/` 目录（Go 结构体逐字转录，msgTag 与字段名均为平台原样）；`cxjava/xhs-sdk`（分叉，注释佐证）

> **2026-11-05 官方原文升级**：开发者文档 POST 接口实测匿名可用（历史「POST 墙」结论作废）——`POST /api/developer/doc/getDocNavigationSecondListNew` body `{"docId":9}` 枚举子树（10 章）；`POST /api/developer/doc/getDocDetailNew` body `{"docDetailId":N}` 取正文。关键正文已核：**39 签名算法**（API 调用侧：参与签名仅系统参数 appId/timestamp/version/method + appSecret 拼尾，`method?appId=..&timestamp=..&version=2.0` + appSecret，MD5 hex，accessToken 不参与验签；三语官方样例逐字，2026-01-08）；**40 系统参数说明**（公共参数表与 §5.1 公共参数 schema 互证，2026-01-08）；**41 应用消息推送**（2026-01-27）——推送侧加签与 API 侧不同：**除 sign 外系统参数 + 全部 url 请求参数按字母排序 & 连接（body 不参与），拼 `url?params` + app-secret 后 MD5**，签名三元组（timestamp/app-key: `xhs`/sign）现置于 **body 内 `headers` 结构**（官方注明「后续会调整」）；推送应答 `{success,error_code,error_msg}` 与 §2.1 SDK 信封互证；**重试：首推失败后重试 3 次，间隔 30s/5m/30m；响应超时 2 秒，超时即失败触发重试，应先回 200 再异步处理**；推送地址连通性为控制台手动检测（POST `{"test":true}` 须回 httpcode=200，一应用一地址）；消息丢失主因店铺 AT 过期（官方原句）。**文档-SDK 命名漂移照录**：doc 41 消息目录（2022-05-25 版）作 `msg_fulfillment_delivery_time_change`（多个 y）且商品族为 `msg_item_create`/`msg_item_buyable`；SDK 结构体（§2.2 十事件、mock 实现）为 `msg_fulfillment_deliver_time_change` 与 `msg_sku_*` 族——SDK 为实现基准，官方目录系旧版命名，联调时若平台实推 `delivery` 拼写需按实际放行。**第二批（同日）**：docId=9 子树其余章节全量闭合（32 新手指南/33 应用开发/34 应用测试/341/342 授权流程·新/42 SDK使用说明/292 接口限流/43 上架服务市场，共 11 章无缺）——**341/342**（2026-01-07 新建、01-08 更新）：AT 7 天/RT 14 天官方数值、刷新 30 分钟窗口与旧 AT 5 分钟宽限、code 10 分钟、授权页与移动端二维码 URL 全文（落库 §6）；**292**：限流默认值 100/200 QPS（落库 §6.1）；**42**：SDK 仅 Java，Client 族 Oauth/Common/Product/Package(订单旧)/Order(订单新)/Inventory/AfterSale/Finance/MemberPass，更新日志含渠道相关两条（2025-07-16 解密接口新增隐私号字段→§4.3；2025-12-22 订单详情/列表/售后详情(新)/售后列表(新) 四接口 resp 新增 `xhsOpenId` 字段）——**页内 updateTime 2026-01-08 明显滞后于内容（日志含 2026-10-10 条目），XHS 文档 updateTime 不可靠，复查以内容级时间戳（更新日志行）为权威**；33/34/43 为控制台流程（类目权限矩阵、共用测试店铺与测试 code 按钮、服务市场保证金与 6 工作日审核），渠道相关性低仅存目

### 2.1 推送信封（外层结构）

```json
{
  "msgTag": "事件类型标识",
  "sellerId": "商家ID",
  "data": "内层业务JSON序列化后的字符串（二级转义）"
}
```

- 平台 POST 到回调地址的 body 是 **该结构的 JSON 数组**（批量推送）
- `data` 是 **JSON 字符串**，需二次反序列化
- 应答体：`{"success": true, "error_code": 0, "error_msg": ""}`

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

注意字段命名不统一（`request_from` 下划线 vs 其余驼峰；`openAddressId` 在两事件中类型不同），mock 时应保留原样

### 2.3 事件携带的枚举值（constant.go，逐字）

订单状态 orderStatus：1 已下单待付款 / 2 已支付处理中 / 3 清关中 / 4 待发货 / 5 部分发货 / 6 待收货 / 7 已完成 / 8 已关闭 / 9 已取消 / 10 换货申请中

售后退货类型 returnType：1 退货退款 / 2 换货 / 3 仅退款(old) / 4 仅退款(new) / 5 未发货仅退款

售后单状态（查询接口用，推送引用）：1 待审核 / 2 待用户寄回 / 3 待收货 / 4 完成 / 5 取消 / 6 关闭 / 9 拒绝 / 11 换货转退款 / 12 待商家发货 / 13 商家已发货 / 14 平台介入中 / 9001 商家收货拒绝

### 2.4 私信（专业号 DM）事件

> **勘误（2026-11-03）**：本节结论已被推翻——商业开放平台私信三方（third_im）体系提供官方「三方客服接收消息」推送与「三方客服发送消息」API，接口文档在企业微信文档登录墙内，详见 §13。下文仅保留历史排查过程

**未找到任何官方公开 webhook 规范。** GitHub 全网代码检索 `sxt.xiaohongshu.com` / `私信通` / `sixin_message` / `专业号+token`，官方通道实现为零。存在的只有

- `[逆向]` 商家工作台 cookie 通道 + WebSocket（见 §8）
- `[单源·存疑]` `zhilin1719-hue/--` 项目自述接入小红书私信回调（`im.message.receive` 事件、`x-xiaohongshu-signature` 头、`verify_webhook`+challenge 握手），但该 repo 为 AI 脚手架风格，事件命名模仿飞书（`im.message.receive` 是飞书事件名），文档仅引用官网首页 URL，无官方规格佐证。**不得作为事实采用**，详见 §7 待核验

---

## 3. 回调机制

来源：zsmhub/xhs-sdk README + demo/message.go；cxjava/xhs-sdk examples/paid_order_flow/main.go 注释

1. **URL 配置**：在开放平台控制台为应用配置「消息推送」回调 URL（HTTPS）。`[多源]` cxjava 注释原话：「生产环境更推荐：在开放平台配置『消息推送』，支付完成后平台 POST 到你的 HTTPS，在回调里解析订单号再调 order.getOrderDetail」
2. **推送方式**：平台 POST，Content-Type JSON，body 为 `[{msgTag, sellerId, data}, ...]` 数组
3. **应答**：HTTP 200 + `{"success": true, "error_code": 0, "error_msg": ""}`
4. **首次校验握手**：**未发现** echo/challenge 类握手机制（电商推送侧）。SDK demo 直接上线收 POST。→ **已解决（2026-11-05，doc 41）**：官方正文通篇未载握手机制，连通性由控制台手动检测承担（POST `{"test":true}` 须回 200）——「无握手」升级为官方正文级结论
5. **OAuth 授权回调**（与推送回调是两个不同 URL 配置项）：平台 GET 回调地址，带 `code`、`state` 参数；用 code 调 `oauth.getAccessToken` 换 token
6. **重试策略**：**已解决（2026-11-05，doc 41）**：首推失败后重试 3 次，间隔 30s/5m/30m；响应超时 2 秒，超时即失败触发重试，官方建议先回 200 再异步处理
7. **推送验签**：**已解决（2026-11-05，doc 41）**：推送侧确有加签（cxjava「与 API 调用一致」的方向判断成立，机制实则不同）——除 sign 外系统参数 + 全部 url 请求参数按字母排序 & 连接（body 不参与），拼 `url?params` + app-secret 后 MD5；签名三元组（timestamp/app-key:`xhs`/sign）置于 body 内 `headers` 结构（官方注明后续会调整）

---

## 4. 验签与加密算法

### 4.1 调用方签名（请求平台 API 时）`[官方公共参数定义 + 多源组装公式]`

官方公共参数文档（paramNew 直抓，见 §5.3）定义请求体必填 `["appId","method","sign","timestamp","version"]`，并注明：**「accessToken：通过code获取的accessToken(授权接口等部分接口不需要此参数，该字段不参与sign签名运算)」**。官方 paramNew 仅写“签名算法参考开发者文档”，md5 组装公式来自 zsmhub Go 与 qihang Java 两 SDK 交叉（2026-09-10 复核注），未见官方原文

签名算法（zsmhub Go 与 qihang Java 两源逐字一致）

```
signString = method + "?appId=" + appId + "&timestamp=" + timestamp + "&version=" + version + appSecret
sign = md5_hex_lowercase(signString)
```

- qihang-erp-open `xhsTokenApiHelper.java` 原文
  `String signString = method+"?appId="+appId+"&timestamp="+time.toString()+"&version="+"2.0"+appSecret;`
  `String sign = MD5Utils.MD5Encode(signString);`
- `method` 形如 `oauth.getAccessToken`、`common.getCategories`；`version` 固定 `2.0`；`timestamp` 为 **秒级** UNIX 时间戳（官方 paramNew example: `1612518379`）

### 4.2 推送方验签（平台 → 回调）

无公开证据存在独立签名头（见 §3.7）。注意：`[单源·存疑]` 的 `x-xiaohongshu-signature`（HMAC-SHA256(body, appSecret) hex）未被任何其他源证实

### 4.3 数据加解密 `[官方·目录级]`

- 文档中心有独立板块「数据加解密」：docDetailId 50「数据加密对接方案」、51「加密算法介绍」——正文 POST 墙，**算法细节待核验(09-27)**
- 业务事实：订单收件人等敏感信息以 `encryptedData` 密文返回，需调接口解密 `[多源]`
  - 方法：`data.batchDecrypt`
  - 请求：`{baseInfos: [{dataTag: "订单场景为orderId", encryptedData}], actionType, appUserId}`
  - `actionType`：`1` 单个查看订单明文 / `2` 批量解密打单 / `3` 批量解密后面向三方的数据下发 / `4` 其他场景
  - 响应：`data.dataInfoList[]: {dataTag, encryptedData, decryptedData, errorCode, errorMsg}`
  - SDK 更新日志 2025-07-16：解密接口新增隐私号字段（doc 42，字段名未载）

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

（原文为 `\uXXXX` 转义，标题解码如上；「数据加解密」子树：docDetailId 50=数据加密对接方案、51=加密算法介绍；「电子面单」子树：294=新版小红书电子面单ISV对接改造、295=电子面单对接说明（新）、296=电子面单打印组件协议（新）、297=小红书云打印系统物料使用说明书、301=电子面单常见问题（新）、318=小红书打印组件使用问题。「API调用场景」子树（docId=10）：44-49 商品/订单/跨境订单/订单接入方案/售后/财务接入说明 + 331 会员通接入说明；「规则中心」子树（docId=13）：54 开发者协议、55 数据安全承诺函、102 服务市场上架审核标准、103 开发者角色说明、104/105 服务市场协议与管理规范、106-109 各类目管理规则、110 保证金要求——两子树均为电商域接入/合规文档，与消息渠道面相关性低，2026-11-05 目录存目划界，正文不拉取）

### 5.3 `GET /api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661`（公共参数官方规格）`[官方]`

```json
{"code":0,"success":true,"data":{"id":5576,"path":"/ark/open_api/v3/common_controller","summary":"","method":"post","specJson":{"summary":"公共参数","servers":[],"requestBody":{"content":{"application/json":{"schema":{"required":["appId","method","sign","timestamp","version"],"type":"object","properties":{"method":{"type":"string","description":"API接口名称","example":"package.getPackageList"},"appId":{"type":"string","description":"创建应用的appId","example":"21d***de0"},"sign":{"type":"string","description":"API输入参数签名结果，签名算法参考开发者文档","example":"532***089"},"timestamp":{"type":"string","description":"UNIX时间戳，单位秒","example":"1612518379"},"version":{"type":"string","description":"API协议版本号，目前使用2.0","example":"2.0"},"accessToken":{"type":"string","description":"通过code获取的accessToken(授权接口等部分接口不需要此参数，该字段不参与sign签名运算)","example":"token-67***aa-43***c4"}}}}}},"responses":{"200":{"description":"success","content":{"application/json":{"schema":{"type":"object"}}}}}},"gatewayVersionName":"feature/logan","updateTime":"2025-12-08T13:35:51.000Z"}}
```

要点：`timestamp` 官方 example 为字符串型秒级时间戳；`path` 官方登记为 `/ark/open_api/v3/common_controller`；schema 内部还带 `x-schema` 元数据（已省略，含网关 schemaId 等，与 mock 无关）

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

应答（HTTP 200）

```json
{"success":true,"error_code":0,"error_msg":""}
```

> 说明：信封字段名（msgTag/sellerId/data、success/error_code/error_msg）逐字来自 SDK 结构体 tag；数值占位由本研究的示例值填充（SDK 中官方样例值未含完整推送报文，官方「消息推送」文档正文未取得）

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
| 寿命 | 返回绝对过期时间戳；**官方数值已取得（doc 341/342，2026-01-08）**：accessToken 7 天、refreshToken 14 天；授权到期时间与 RT 对齐，RT 刷新成功即重置（doc 341 原句） |
| 刷新语义 | AT 剩余 >30 分钟时刷新：**原 AT/RT 原样返回不重置**（频繁调用会被限流）；剩余 <30 分钟时刷新：发新 AT+新 RT 且**旧 AT 缩至 5 分钟失效**；AT 过期后刷新：发新 AT+新 RT；RT 过期只能重新授权（doc 342 注意事项逐条） |
| code | 有效期 10 分钟（doc 34/341/342 三处一致）；短时间内多次用同一 code 换 AT 返回相同结果；获取与刷新参数均经 body 传输 |
| 授权规范（自研） | APPKEY 不得转让；同一/关联主体最多 10 个企业店铺（超限工单申请白名单）；一商家一同类目自研应用仅一个；必须店铺主账号授权、店铺不得为个人/个体（doc 341） |
| 移动端授权 | 二维码 URL `https://ark.xiaohongshu.com/thor/open/authorization?fullscreen=true&appId={appId}&sellerId={sellerId}&redirectUri={redirectUri}`，千帆 APP 扫码进入授权页，规则同 web 端（doc 342） |
| 参与签名 | accessToken 不参与 sign（官方 paramNew 明示）；code/refreshToken 在 body 中随公共参数一起 POST |
| 网关 | 全部走 `POST https://ark.xiaohongshu.com/ark/open_api/v3/common_controller`，JSON body = 公共参数 + 业务参数平铺 |

### 6.1 接口限流（doc 292，v1.0 2024-09-14，updateTime 2026-01-08 无版本升级）`[官方]`

- SLA：可用性 99.9%
- **应用维度**：新对接服务商默认 **100 次/秒**；已对接者按历史调用峰值给 1.5 × MaxQPS 额度（例：峰值 200 QPS → 限流值 300 次/秒）
- **方法维度**：默认 **200 次/秒**；已对接者 2.5 × APIQPS 额度
- **应用+方法维度**：按服务商业务单独配置；日常调用频繁限流可工单反馈调整
- 运营要求：尖刺流量自查（超限影响成功率平台不负责）；提额需对接群/工单提前说明；大促提前报备酌情提升阈值

---

## 7. 待核验清单（统一 09-27 恢复后重试）

1. **[官方·开发文档正文]** docId=9「开发文档」子树：接入流程、消息推送章节、签名算法官方原文、token 寿命数值、推送重试策略、推送是否带签名头。→ **已解决（2026-11-05）**：getDocDetailNew 匿名可用（通道注记见 §2 头部升级块），签名算法官方原文（doc 39）、消息推送章节（doc 41）、重试策略（30s/5m/30m ×3、超时 2s）、推送签名位置（body 内 `headers` 结构）全部落库 §2；token 寿命数值后补取得（doc 341/342 授权流程·新：AT 7 天/RT 14 天 + 刷新 30 分钟窗口语义），落库 §6；子树其余章节（32/33/34/42/43/292）同日第二批全量闭合，见 §2 头部块
2. **[官方·数据加解密]** docDetailId 50/51 正文（encryptedData 的具体算法，大概率 AES，密钥派生方式）。→ **已解决（2026-11-05）**：**AES/CBC/PKCS5Padding**（doc 51，2023-09-21）；密文格式 `#索引串#密文#类型##`，检索串同数据同应用恒定（跨订单密文不同、应用维度隔离、密文可反算订单/店铺溯源），类型码 1 地址/2 姓名/3 电话/4 身份证号，四类逐字样例在页；doc 50（2023-09-25）为订单敏感字段加密改造方案（收件人/海关申报密文化 + 脱敏规则 + 字段级受监控解密接口），均属电商订单域与消息推送无关
3. **[专业号私信官方通道]** 是否存在面向 ISV 的官方私信 webhook/拉取 API。GitHub 无实现痕迹、开放平台文档中心五大板块均为电商域；不排除藏在登录墙后（服务市场 ISV 专属文档）。**部分解决**：miniapp 域已有官方消息型推送（§10），但那是小程序客服会话，不是专业号私信本身——专业号 DM 是否有 ISV 通道仍未知。→ **已解决（2026-11-03）**：专业号私信 ISV 通道存在——商业开放平台私信三方（third_im）体系的「三方客服接收消息」推送 + 「三方客服发送消息」API，完整接口规格在企业微信文档登录墙内（字段表待核验），详见 §13
4. **[单源存疑]** `x-xiaohongshu-signature` HMAC-SHA256 + `im.message.receive` + `verify_webhook` challenge 模式（zhilin1719-hue/--）。需官方对质后才能采用；当前判定为模仿飞书的拼装。**注意**：miniapp 域官方握手的参数名叫 `signature`/`echostr`（§10），与该单源声称的头名/事件名仍不相符，维持不可信判定。→ **待核验(09-27)**
5. **推送 URL 首次配置时是否有连通性校验**（类似微信 echostr）。**已解决**：miniapp 客服消息体系有 echostr 握手（§10.4）；电商 ark 侧**已解决（2026-11-05）**：无自动 challenge，为控制台手动检测（POST `{"test":true}` 须回 httpcode=200 方显示正常，doc 41）
6. 电子面单/规则中心子树（docDetailId 294-318 等，与 mock-pulse 关系弱，低优先级）。→ 待核验(09-27)
7. `https://open.xiaohongshu.com/develop/book`（2026-06 有归档，SPA 壳，可能有 SSR 版）。→ **已解决（2026-11-06）**：直抓实测 23KB 纯 SPA 壳、零 SSR 数据标记（无 __NUXT__/__NEXT_DATA__/window.__ 注入），无匿名数据通道；同日验证 getDocDetailNew 仅覆盖开放平台文档中心 docDetailId 空间（聚光/商业开放平台文章 ID 3754/4945/3115/3197/2607 全部 500 拒绝），跨域取文通道不存在——维持 Wayback 归档为唯一来源

---

## 8. 附录：私信通非官方通道事实（`[逆向]`，仅供了解，勿作 mock 基准）

来源：jtrhb/sxt（pysxt「小红书私信通机器人开发框架」）、vikiboss/redote

- sxt.xiaohongshu.com 是**商家客服工作台**（多客服 `im/multiCustomerService` 页面），认证靠商家登录 cookie：关键 cookie `x-user-id-sxt.xiaohongshu.com`、`access-token-sxt.xiaohongshu.com`（形如 `customer.sxt.AT-...`）；请求头 `x-subsystem: sxt`
- 私信实时通道为 **WebSocket** `wss://zelda.xiaohongshu.com/websocketV2`，客户端标识 appId=`647e8f23d15d890d5cc02700`、token=`7f54749ef19aaf9966ed7a616982c016bda5dfba`、appName=`walle-ad`（工作台前端内置常量）
- WS 协议帧：`{type:1, token, appId}` 鉴权 → 服务端 `{type:129, secureKey}` → 客户端 `{type:10, topic: AES-ECB(secureKey, userId), encrypt:true}`（topic 用 secureKey 作 AES-ECB 密钥加密 userId，base64-urlsafe）→ 服务端 `{type:2, data:{type:"PUSH_SIXINTONG_MSG", payload:{sixin_message:{message_type,...}}}}` 推私信 → 客户端回 `{type:130, ack:seq}`；心跳 type 4/132，附加信息应答 type 138→12
- 私信 message_type 枚举：`TEXT / EMOTICON / IMAGE / VIDEO / VOICE / CARD`
- 明确结论：**这是「商家客户端 ↔ 平台」的内部协议，不是「平台 → 第三方回调」的开放通道**；mock-pulse 若要模拟官方回调，不应以此为蓝本；若要模拟「商家侧收私信」，可参考其 WS 帧结构（标注非官方）

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

**发送侧补证（2026-10-14，issue #117 动工前置，curl 直抓 SSR 正文）**
- https://miniapp.xiaohongshu.com/doc/DC234367 ✔（发送客服消息全文，见 §12.1）
- https://miniapp.xiaohongshu.com/doc/DC010382 ✔（获取应用调用凭证全文，见 §12.2）
- https://miniapp.xiaohongshu.com/doc/DC853803 ✔（服务端 API 简介全文，见 §12.3）
- https://miniapp.xiaohongshu.com/doc/DC897608 ✔（接收消息与发送消息，48h 原句复核，见 §12.4）

**GitHub（gh api）**
- zsmhub/xhs-sdk：api_base.go / api_client.go / api_tool.go / api_http.go / api_oauth.go / oauth-获取访问令牌.go / oauth-刷新访问令牌.go / constant.go / message/*（10 事件）/ README.md / demo/message.go / 订单API-批量解密.go
- fireworkor/demo-work：xhs-meiz/xhs-meiz/api-case/request-payment/request-payment.js（`/api/rmp/token` 实调佐证，§12.2）
- zeasin/qihang-erp-open：open-sdk/.../xhsTokenApiHelper.java、TokenVo.java（签名交叉验证）
- cxjava/xhs-sdk：examples/paid_order_flow/main.go（推送用法注释）
- jtrhb/sxt：engine/pysxt/core.py、message.py、message_type.py（私信通逆向）
- vikiboss/redote：README.md（zelda WS 协议）
- zhilin1719-hue/--：src/app/api/xiaohongshu/callback/route.ts、src/lib/xiaohongshu-openapi.ts（**判为不可信单源**）

**miniapp 域（2026-09-10 补摄，全部 WebFetch 直抓成功）**
- https://miniapp.xiaohongshu.com/doc/DC026595 ✔（小程序简介；左侧导航含「服务端能力→消息推送」「事件回调」全目录）
- https://miniapp.xiaohongshu.com/doc/DC897608 ✔（客服消息：接收消息与发送消息）
- https://miniapp.xiaohongshu.com/doc/DC577113 ✔（消息推送：配置/握手/验签/重试/应答，更新于 2026-01-09）
- https://miniapp.xiaohongshu.com/doc/DC234367 ✔（[客服]-发送客服消息：POST /api/rmp/message/custom，48h 回复通道；2026-09-10 复核补入）
- https://miniapp.xiaohongshu.com/doc/DC591932 ✔（**官方错链**：DC577113 引用的「消息加解密」指到此页，实际内容为「开放数据校验与解密」，见 §10.6；另含 DataDecrypt.zip，与消息推送的 MsgDecrypt.zip 是两个不同包，勿混）

**2026-11-05 复查（无增量）**
- ark 网关分类树 `/api/doc/listNew`（返回 JSON 字符串需二次 parse）11 个分类（公共/订单/售后/商品/库存/素材中心/物流/财务/即时零售/会员通/供货商）全为电商交易域，零 IM/客服/私信类目，与 §2.2 结论一致
- miniapp 域 DC897608 现版正文 MsgType 全集仍为 text/image/video/item/order 五种（专属字段 Content/PicUrl/VideoUrl/OutProductId/OutOrderId 逐字核对），无新增消息类型
- 2026-11-05 晚间复查（无增量）：`listNew` 11 分类 id/名称逐项一致；DC897608 MsgType 表格与样本载荷各恰五种类型，无新增。同日新增**全站导航树扫掠法**：任一 `miniapp.xiaohongshu.com/doc/DCxxxxxx` 页 SSR 内嵌完整导航 JSON（`directory_id`/`directory_name` 节点树，实测 1569 id/1190 具名），按名称关键词筛消息相关条目即得全目录——新页发现用此法；另确认存在**服务商树**完整镜像（服务端消息推送 DC469488、消息加解密 DC519884、授权/事件系统等，DC469488 导航含「创建服务商」，更新 2025-08-04），本渠道为直连小程序模式不涉该树

---

## 10. 补摄：小程序客服消息体系（miniapp.xiaohongshu.com）`[官方]`

> 背景：用户提供 miniapp 域两页文档后补摄。这是小红书**官方公开的消息型推送通道**——用户在小程序客服会话向商家发消息/触发事件，小红书服务器推送到开发者配置的 URL。整体为**微信小程序客服消息的同款模式**（Token＋EncodingAESKey＋echostr 握手＋sha1 验签＋success 应答＋5s×3 重试），载荷为 JSON（微信系为 XML）

### 10.1 域的定位与「平台通讯两形态」

各大平台的通讯开放能力走两条路：**直连私信**（平台 IM 能力直接开放，如抖音 IM、企微）或**小程序客服消息**（平台给小程序生态，用客服会话实现通讯，如微信小程序、小红书小程序）。小红书走的是第二条——专业号私信没有官方 ISV 推送（§2.4），但小程序客服消息有完整官方规范。对 mock-pulse：小红书侧的官方模拟基准＝本体系

> **勘误（2026-11-03）**：专业号私信的官方 ISV 推送通道已确认存在（商业开放平台私信三方体系，§13）；其完整接口规格未公开可抓（企业微信文档登录墙），就「公开文档可抓取的模拟基准」而言本节结论仍成立

### 10.2 服务器配置（开放平台控制台填写）

| 配置项 | 说明 |
|---|---|
| URL | 接收消息与事件的接口地址；必须 `http://`（80）或 `https://`（443）开头 |
| Token | 开发者自定义，用于生成签名做安全校验 |
| EncodingAESKey | 手动填写或随机生成，作为消息体加解密密钥 |

### 10.3 消息格式（客服消息）

POST 到配置 URL，**JSON**。通用字段＋按 MsgType 追加专属字段

| MsgType | 专属字段 | 说明 |
|---|---|---|
| `text` | `Content` | 文本内容 |
| `image` | `PicUrl` | 图片链接 |
| `video` | `VideoUrl` | 视频链接 |
| `item` | `OutProductId` | 外部商品 id |
| `order` | `OutOrderId` | 外部订单 id |

通用字段：`MsgId`（字符串）、`FromOpenId`（发送者 openid）、`ToAppId`（小程序 appid）、`MsgType`、`CreateTime`（秒级）

文本消息载荷形如

```json
{"MsgId": "MSG_ID", "FromOpenId": "USER_OPEN_ID", "ToAppId": "SELLER_APP_ID", "MsgType": "text", "CreateTime": 1648714429, "Content": "..."}
```

收到消息后 **48h 内**可用「发送客服消息」接口（DC234367）回复

### 10.4 首次握手（URL 校验）与验签

- 提交配置后，小红书服务器向所填 URL 发 **GET**，携 4 个 **query 参数**（非请求头）：`signature`、`timestamp`、`nonce`、`echostr`
- 校验通过后**原样返回 echostr 参数内容**，接入生效
- 验签算法：`signature = sha1( sort(token, timestamp, nonce) 三值字典序排序后拼接 )`——与微信/企微同族（企微版多第四个参数 msg_encrypt）

### 10.5 应答与重试

- 收到推送必须应答：**直接回复 `success`（官方推荐）**，或按对应接口文档返回指定内容，否则报错
- 5 秒内收不到响应断开连接并重发，**总共重试 3 次**

### 10.6 消息体加解密（细节未取得，官方错链）

- DC577113 明示消息体走加密、密钥即配置的 EncodingAESKey，但引用的「消息加解密」文档（DC591932）实际返回的是「开放数据校验与解密」（session_key/AES-128-CBC/PKCS#7，属用户开放数据体系，非消息推送体系）——**官方文档挂错链**
- **强假设（推断非事实）**：算法为微信系 WXBizMsgCrypt 同款——AES-CBC、密钥=Base64_decode(EncodingAESKey+"=") 32 字节、IV=密钥前 16 字节、PKCS#7 补位、明文结构 random(16B)+msg_len(4B 大端)+msg+receiveid。依据：配置项同名、握手/验签/应答/重试全同款（企微侧同款算法已完整入库，见 `wecom.md` §4）。→ **待核验(09-27)**（或下载官方 Java 示例包核验）

### 10.7 事件回调族（目录级，正文未抓）

侧栏「事件回调」栏目独立成篇：商品审核、代码审核结果、小程序服务状态、支付结果、退款结果、交易能力切换、群聊人数已满、用户加群通知、笔记发布、服务组件自动下架、服务组件门店审核结果。~~正文待核验(09-27)~~ **已划界关闭（2026-11-05）**：支付结果回调正文已由 §11.1 关闭；同日全站导航树扫掠（DC026595 内嵌 JSON，1190 节点）确认 11 类目录无增减；代表性核验「用户加群通知回调」DC914066（更新 2024-11-25）解密后字段全集仅 Event（固定 GROUP_USER_JOIN_IN）/AppId/GroupId/OpenId 四个——纯群生命周期通知零消息内容，证实本族为应用生命周期 webhook，均在渠道客服消息/PAY_RESULT/ark 面之外，不再逐页核验；若渠道日后订阅生命周期事件再启用

### 10.8 对 mock-pulse 的意义

1. 小红书侧模拟基准成立：按「小程序客服消息」体系造模板（5 种 MsgType＋事件回调族），协议家族与企微同源——验签/加密伪造代码可大部分复用企微那套（差 JSON vs XML 与 receiveid 规则）
2. 「渠道」的领域模型应容纳两种形态：直连私信（抖音 IM/企微）与小程序客服消息（小红书/微信系）
3. 网传 `x-xiaohongshu-signature`/`im.message.receive`（§2.4）维持不可信判定——官方真名是 query 参数 `signature`＋`echostr`

---

## 11. 二次补摄：支付结果回调正文 + 消息加解密官方源码（2026-09-10 晚，用户指路 DC753163）

> 本节关闭两个缺口：§10.6 的「AES 算法强假设」升级为官方实锤；§10.7 的「支付结果回调正文未抓」关闭

### 11.1 支付结果回调（DC753163，`[官方]`）

来源：https://miniapp.xiaohongshu.com/doc/DC753163?path=/third/api-3rd-doc/msgCrypt （裸 DC753163 亦回全文，path 参数非必需，2026-09-10 注；更新 2024-11-25）

- 担保支付场景下支付结果主动推送（原文面向服务商推送，主单与预约单共用同一 Event，`OrderType` 区分）；「推送请求需解密，解密后参数为……」——业务字段在 Encrypt 密文内，解密细节链接 → DC519884
- **OrderType=1（预售券/团购券主订单通知）字段表**：`Event`（固定 `PAY_RESULT`）、`OrderId`、`OutOrderId`、`Status`（2=支付成功，998=支付取消）、`PayChannel`（1=微信，2=支付宝，99=其它，仅成功时返回）、`TotalAmount`（单位：分）、`VoucherInfos` 列表（含 `VoucherCode` 券码）、`ProductType`（1=团购券，2=酒旅预售券）、`PayTime`（秒级时间戳）
- **OrderType=2（预约单通知）差异**：`OutBookOrderId` 替代 `OutOrderId`；`ProductType` 取 2（酒旅预售券补差价）或 3（日历商品）

### 11.2 消息加解密文档（DC519884，`[官方]`）——DC577113 错链的真正目标

来源：https://miniapp.xiaohongshu.com/doc/DC519884?path=/third/api-3rd-doc/msgCrypt （「第三方平台 → 操作指南 → 消息加解密」，更新 2024-11-28；裸 DC519884 只回骨架无正文，必须带此 path 参数，2026-09-10 实抓注）

- POST 推送 body（JSON）字段表：`Nonce`（string）、`Timestamp`（i32，时间戳；原文未注单位，秒级为推断——支付页 PayTime 明确秒级）、`Encrypt`（string）、`MsgSignature`（string）——**签名与随机数在 body 内**（企微自建应用是 query 参数，此处不同）
- 创建服务商时的 URL 验证消息为 GET（参数在 query，第三方平台语境；小程序语境见 DC577113，机制相同）；服务器须返回字符串 `success`，否则重试，重试过多触发熔断
- 验签 = 用「消息验证 TOKEN」+ Nonce + Timestamp + Encrypt 计算签名与 MsgSignature 比对（指引示例代码 `MsgSignature.getSignature`）；解密 = `MsgDecrypt.decrypt`（指引示例代码）
- 官方 Java 示例包（本次已下载并解析）：https://fe-video-qc.xhscdn.com/fe-platform/87989404f48299d3ab814cef6ce4013d85fb827b.zip?attname=MsgDecrypt.zip （包名 `com.xiaohongshu.mp.security.util`，含 MsgDecrypt.java / MsgSignature.java / PKCS7Decoder.java）

### 11.3 官方源码实锤（三个类逐字要点，`[官方]`）

- `MsgDecrypt.decrypt`：`aesKey = Base64Decode(encodingAesKey + "=")`；`AES/CBC/NoPadding`（补位手工处理）；`IV = aesKey[0:16]`；解密后去 PKCS#7 补位 → 明文结构 = `random(16B) + msg_len(4B 网络字节序大端) + msg + appId`（截去真实消息后末尾即 appId）
- `PKCS7Decoder.decode`：pad 取值 1..32 —— **PKCS#7 以 32 字节为块单位补位**（与企微相同，非常见 AES 的 16）
- `MsgSignature.getSignature`：`sha1( [token, timestamp, nonce, encrypt] 四值字典序排序后直接拼接 )`，输出小写 hex——与企微四值签名同族

### 11.4 对 §7/§10 的修订与对 MockPulse 的意义

- §10.6「强假设微信同款 WXBizMsgCrypt」→ **官方实锤**（密钥派生/模式/IV/补位/明文结构/签名算法全部与微信系一致）；差异点：信封是 JSON（`{Nonce, Timestamp, Encrypt, MsgSignature}` 在 body 内）、明文尾部 receiveid = **appId**、载荷 JSON
- §10.7「支付结果回调正文未抓」→ 关闭（§11.1 字段表）
- §7.1/7.5 部分缓解：miniapp 域消息推送的加解密与签名算法已实锤；开发文档正文其余章节与电商 ark 侧仍待核验(09-27)
- MockPulse 伪造实现：企微那套 AES-256-CBC 伪造代码可直接复用于小红书，仅三处不同——JSON 信封、receiveid 用 appId、签名值放 body 字段而非 query

---

## 12. 三次补摄：发送侧官方规格（2026-10-14，issue #117 动工前置）

> 背景：#117 票面注明「发送报文字段细节事实库未入库」为已知缺口，动工前先官方补证。三页文档页均为 SSR 正文，curl 直抓成功（DC591932 那种裸 doc id 只回骨架的坑在 DC234367/DC010382 不存在）

### 12.1 发送客服消息（DC234367，`[官方]`）

来源：https://miniapp.xiaohongshu.com/doc/DC234367 （页脚更新时间 2025-02-28 14:12:09；页面标签「支持第三方调用」「支持沙箱环境调用」；左侧目录「客服能力」下仅此一个接口）

- 请求地址：`POST https://miniapp.xiaohongshu.com/api/rmp/message/custom`
- 公共请求参数

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| app_id | string | 是 | 小程序appid |
| access_token | string | 是 | 小程序调用凭证 |

- 业务请求参数

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| openid | string | 是 | 回复用户的Open ID |
| msg_type | string | 是 | 消息类型 |
| content | string | 否 | 文本内容，msg_type 为 text 时必填 |
| pic_url | string | 否 | 图片链接，msg_type 为 image 时必填 |
| out_product_id | string | 否 | 外部商品 ID，msg_type 为 item 时必填 |
| out_order_id | string | 否 | 外部订单 ID，msg_type 为 order 时必填 |

- 请求示例（body 逐字，仅业务参数）

```json
{
    "openid":"string",
    "msg_type":"string",
    "content":"string",
    "pic_url":"string",
    "out_product_id":"string",
    "out_order_id":"string"
}
```

- 响应参数：`success`（bool，是否成功）、`msg`（string，说明，正确响应时为 success，错误响应时为错误描述）、`code`（int32，错误码，正确响应时为 0，错误响应时非0）。响应示例逐字

```json
{
    "success":true,
    "msg":"string",
    "code":0
}
```

- **不返回消息标识**——发送成功无处取 `external_message_id`，与微信客服消息同病
- 业务错误码：页面仅写「参见错误码」未内联枚举
- **公共参数携带位置未明示**（待核验·真实凭据联调）：请求示例 body 只含业务参数，`app_id`/`access_token` 走 query 还是 body 官方未写；服务端按微信族惯例走 query（`?app_id=&access_token=`），若有出入只需调整调用处一处拼接

### 12.2 获取应用调用凭证（DC010382，`[官方]`）

来源：https://miniapp.xiaohongshu.com/doc/DC010382 （页脚更新时间 2025-03-18 19:40:03；标签同 §12.1）

- 请求地址：`POST https://miniapp.xiaohongshu.com/api/rmp/token`
- 请求参数：`appid`（string，必填，小程序 appid）、`secret`（string，必填，小程序 appsecret）。请求示例逐字

```json
{
  "appid": "APPID",
  "secret": "SECRET"
}
```

- 返回参数：`data`（object，错误响应时为空，但正确响应时不保证非空）内 `access_token`（string，调用凭证）与 `expire_in`（integer，有效期秒），外层 `success`（boolean）、`msg`（string，正确响应时为 success，错误响应时为错误描述）、`code`（integer，0 成功）。返回示例逐字

```json
{
  "data": {
    "access_token": "ACCESS_TOKEN",
    "expire_in": 7200
  },
  "success": true,
  "msg": "success",
  "code": 0
}
```

- 凭证规则（原文要点）：有效期目前 2 小时；存储至少保留 128 字符空间；新生成 token 时上一个剩余有效期 >5 分钟的缩至 5 分钟；同一时间最多最近两个 token 生效
- 多源佐证 `[多源]`：fireworkor/demo-work（xhs-meiz 官方示例工程）`request-payment.js` 以 `POST {appid, secret}` JSON body 实调 `/api/rmp/token`，与文档一致

### 12.3 服务端 API 通用约定（DC853803，`[官方]`）

- access_token 是调用服务端 API 的唯一凭证：有效期 2 小时，重复获取使上次 token 失效（5 分钟平滑期后过期）
- POST 接口 body 参数以 JSON 写入并设 `content-type: application/json`；GET/POST 严格按各接口文档定义调用
- 客服接口能力需开通交易能力后授权调用（基础/地点/群聊/小说等接口创建小程序应用后默认开放）

### 12.4 48h 窗口复核与媒体结论维持

- DC897608（接收消息与发送消息）正文原句「48h内可以使用发送客服消息接口进行回复。各消息类型的推送…」——§10.3 的 48h 回复通道复核成立（2026-10-14 实抓）。当前版 DC234367 页面无频次/限额章节
- 发送侧补证后，事实库仍无「按 media_id 拉取临时素材」的接口记录（「客服能力」目录仅 DC234367 一项）——媒体读取走链接下载的结论维持（§10.3 image PicUrl / video VideoUrl 链接直出）

### 12.5 对 #117 服务端实现的口径

- 发送：先 `POST /api/rmp/token`（appid/secret，JSON body）换 `access_token`，再 `POST /api/rmp/message/custom` 下发 `msg_type=text` 的 `content`；成功以 `success=true` 且 `code=0` 为准，`external_message_id` 为空
- `appSecret` 为服务端按公众号先例补入 channel_info 的键（mock-pulse config 无此键——其不模拟 token 换取，同 wechat-mini §6.1 口径）
- 接口地址配置键 `dudu.channel.xiaohongshu.api-base`（缺省 `https://miniapp.xiaohongshu.com`，可覆盖为受控替身）

---

## 13. 四次补摄：商业开放平台（ad-market）私信三方体系（2026-11-03，用户指路 docs-center）

> 背景：用户指路 https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=4437 。该域是小红书**商业开放平台**——营销侧 API 开放体系，独立于 §1 电商开放平台（open + ark 网关）与 §10 小程序开放平台（miniapp 域）。docs-center 为 SPA 壳 + POST-only JSON API，WebFetch 抓不到正文，本次全程 curl 逆向直抓全库

### 13.1 docs-center 结构与数据通道 `[官方]`

- bizType 枚举（POST /api/open/article/biz/type 响应逐字）：`聚光=943、蒲公英=944、私信三方=945、乘风=1084`

```json
{"requestId":"","code":0,"success":true,"msg":"成功","data":{"articleBizList":[{"bizId":0,"bizName":"聚光","categoryId":943,"order":0},{"bizId":0,"bizName":"蒲公英","categoryId":944,"order":0},{"order":0,"bizId":0,"bizName":"私信三方","categoryId":945},{"bizId":0,"bizName":"乘风","categoryId":1084,"order":0}]}}
```

- 入口 URL 的 `articleId=4437` = 「MAPI 新手指南（品牌方/代理商/服务商）」（MAPI=营销 API 总称；同族 4438=MAPI 技术服务商注册指南、4447=MAPI 特殊开白申请流程）
- 数据接口（全部 POST + JSON；GET 一律回 Go `404 page not found`）

| 接口 | body | 作用与坑 |
|---|---|---|
| POST https://ad-market.xiaohongshu.com/api/open/article/biz/type | `{}` | bizType 枚举 |
| POST /api/open/category/list | `{"categoryId":945}` | 域内目录树；参数名是 categoryId，传 bizType 报 `code:10002 查询目录id不可为空` |
| POST /api/open/article/list | `{"categoryId":945,"page":{"pageIndex":1,"pageSize":100}}` | 文章列表含全文；pageSize 上限 100（超限报 `code:20000 调用rpc服务异常: contentService`）；只传 bizType 返回全局前 100 篇，须按 categoryId 圈定或 page 遍历 |

- 全库 656 篇（7 页）。正文为 Slate 富文本：`content` 顶层 `{outline, html, type:"richText", value, version}`，可读文本在 `value` 树叶子 `{text}`，`html` 字段直接是渲染后 HTML（解析取 html 最稳）
- 私信三方域（945）目录树：新手指南(958)＞账户服务(1421)、Oauth2.0授权(959)＞token管理(969)、账户服务(1422)、私信三方服务介绍(960)、附录-QA(961)

### 13.2 勘误核心：官方私信通道存在（推翻 §2.4）`[官方]`

docs-center 私信三方域 + 官方 FAQ（4439）明确三个官方接口：

| 接口 | 形态 | 证据（FAQ 原文引用） |
|---|---|---|
| 三方客服接收消息 | 平台推送到三方配置的 URL | 「用户主动发的手机号会通过消息的方式推到三方的接收消息接口」（二.10）；推送重试规则（二.4）；账号绑定/解绑有通知事件（二.3） |
| 三方客服发送消息 | 三方调平台 API 下发 | 「『三方客服发送消息』和『三方客服接收消息』接口均没有『语音』这种类型」（二.1）；「调用小红书私信发送视频、图片消息接口」（二.7） |
| 获取意向评论 | GET/POST `https://adapi.xiaohongshu.com/api/open/im/comment/list` | FAQ 二.15 原文直书完整 URL |

- **完整接口文档（接收/发送的 URL、信封、字段表）不在 docs-center，而在企业微信文档「小红书-三方客服接口文档」，需登录查看**。本次 webReader 两次网络错误；匿名调 `GET /dop-api/opendoc?normal=1&noEscape=1&outformat=1&id={docId}` 返回 `retcode:200060`（权限拒绝）→ 字段级规格 **待核验(11-03)**
- 官方引用的企业微信文档清单（scode 为原文所带）：
  - 小红书-三方客服接口文档：`doc.weixin.qq.com/doc/w3_Aa4AnwYNAGYOfLNcOh4Sj6Xg1O35v?scode=ANAAyQcbAAgxhTuZTGAa4AnwYNAGY`
  - 三方IM 接入流程示意及消息样例：`doc.weixin.qq.com/doc/w3_AfgAWgafAFYdb8y7XM0TAa5IMmCnN?scode=ANAAyQcbAAgg475hPCAfgAWgafAFY`
  - 完整入驻流程：`doc.weixin.qq.com/doc/w3_ACwAJQbSACQKkvCc2xCT3au2Fq2t2?scode=ANAAyQcbAAgaw2lndsACwAJQbSACQ`
  - 产品使用说明（对客）：`doc.weixin.qq.com/doc/w3_ACwAJQbSACQDxUzbcgEQOajYhBmeN?scode=ANAAyQcbAAg1JpbLqVACwAJQbSACQ`
- 接入需加解密：FAQ 一.4 「接入需要加解密，需要secretkey该怎么获取？……待完成加权开白后，会群里同步大家」——secretKey 由小红书在人工开白后于对接群下发（非自助获取）

### 13.3 准入门槛与退出机制（3754 全文，`[官方]`）

| 项 | 要求 |
|---|---|
| 三方服务商 | IM 能力服务客户总数 ≥50 家；小红书渠道在服客户（含意向）≥10 家；须官网 |
| 品牌自研自用 | 「目前仅开放给年框客户对接」（小红书年框广告主） |
| 必备资质（无资质无法入驻） | 隐私政策；公安部近一年《信息系统安全等级保护备案证明》；近一年《网络安全等级保护等级测评报告》；有效期《增值电信业务经营许可证》（ICP）——FAQ 补充等保「暂无等级要求」 |
| AI 客服 | 接入须提供 ≥200 个对话样本评估，不通过不允许接入 AI 能力；不接入也会定期抽检回复，不符将关 API 权限 |
| 应用上线 | 正式应用上线后全部客户可见；beta 测试应用仅填写的 uid 可见 |
| 人工流程 | 测试账号/域名+应用ID 表单周度汇总开白；测试加白、验收均经对接群产运人工处理（三方服务商须验收，自研客户自测正常可免） |

退出机制（3754 四）：绕过平台风控即刻回收；接入 3 个月内日均调用接口数 <100 提醒、30 天未达标回收；连续两月因服务商问题私信收发异常 >2 起或客诉 >10 个即刻回收；AI 抽检不合格整改 30 天仍不佳则不得再接入 AI 客服

### 13.4 授权与 token（945/Oauth2.0 域，`[官方]`）

- 授权 URL（2603/3754）：`https://ad-market.xiaohongshu.com/auth?appId={appId}&scope={权限范围}&redirectUri={回调}&state={state}`；scope 原始格式为 JSON 数组，使用时 UrlEncode 一次（如 `%5B%22third_im%22%5D`）
- scope（3197 原句）：「third_im（私信三方工具服务） 需要在授权 URL 的 scope 参数上添加 third_im，进行授权后才能访问私信三方工具服务接口」；线索推送域另有 `three_im_leads_push`。3754 对客授权示例逐字：`https://ad-market.xiaohongshu.com/auth?appId=234&scope=[%22third_im%22,%22three_im_leads_push%22]&redirectUri=https://www.xiaohongshu.com&state=abcd`
- 授权回调：redirectUri 收 query 参数 `auth_code` `[官方+多源]`（4945「授权时返回的 auth_code（auth_code有效期十分钟，超时未调用本接口，则auth_code失效，需要重新授权）」；leonardsite/xhs-api `url.searchParams.get('auth_code')` 佐证）
- 获取 token（4945）：`POST https://adapi.xiaohongshu.com/api/open/oauth2/access_token`，body `{app_id(long), secret, auth_code}`，示例逐字

```bash
curl --location 'https://adapi.xiaohongshu.com/api/open/oauth2/access_token' \
--header 'content-type: application/json' \
--data '{ "app_id": 3, "secret": "1234abc", "auth_code": "d6a0b18531a2b9599a2c1e2361659c00" }'
```

- 响应（4945 示例逐字，结构即字段全集）：`data` 内 `access_token`、`access_token_expires_in`、`refresh_token`、`refresh_token_expires_in`、`user_id`（授权账号）、`app_id`、`approval_role_type`（4 品牌/601 代理商）、`role_type`（1 品牌开发者/2 代理商开发者/3 服务商开发者/4 技术服务商）、`platform_type`（1 聚光/2 蒲公英/**3 私信三方**/4 乘风）、`approval_advertisers[]`（advertiser_id/advertiser_name）、`scope`、`corporation_name`、`virtual_seller_id`、`create_time`/`update_time`

```json
{"code":0,"success":true,"msg":"成功","data":{"user_id":"5c8650cb0000000001004367","role_type":3,"approval_advertisers":[{"advertiser_id":1234,"advertiser_name":"品牌测试账号222"}],"refresh_token":"5be1789576f45f90ccfbf4ba16ca4a5b","advertiser_id":1234,"refresh_token_expires_in":2591999,"approval_role_type":4,"platform_type":1,"access_token":"0cde2287cd0dedcf472ceb266d0710ba","access_token_expires_in":86399}}
```

- 刷新（4808）：`POST https://adapi.xiaohongshu.com/api/open/oauth2/refresh_token`，body `{app_id(long), secret, refresh_token}`；「每次刷新都会产生新的 access_token 和 refresh_token，同时重置二者的有效期」
- 寿命（2607 原句）：access_token **1 天**（示例 86399s）、refresh_token **30 天**（示例 2591999s）；「多次获取token以最后一次token为准，之前的token会在获取新token后5min失效」；refresh_token 失效后须重新走授权
- 业务 API 网关与鉴权头：`https://adapi.xiaohongshu.com`，token 放 **Access-Token 请求头** `[多源]`（leonardsite/xhs-api `headers['Access-Token'] = accessToken` 并注明「不是 Authorization: Bearer」）——与 ark 网关「body 公共参数 + md5 签名」（§4.1）完全不同族

### 13.5 双步授权与账号体系（3754 + FAQ，`[官方]`）

- 客户侧两步（3754 原文）：**第一步**在聚光「线索工具-三方客服管理」绑定小红书号↔三方客服账号（跳转应用创建时填写的【跳转绑定地址】，平台侧端点形如 `https://ad.xiaohongshu.com/api/leona/three/im/account/add`）；**第二步**在开放平台授权 URL 授权（允许小红书把消息推给三方）。建议三方在客服工具放按钮引导跳授权 URL
- 授权账号必须是品牌主账号（企业专业号）：FAQ 二.13 「请使用主账号登陆，其他账号（如代理商子账号）无法对三方IM服务商进行授权」——子账号「不存在三方绑定的概念」
- KOS（员工号）规则：三方接入必须对 KOS 完成授权，授权后 KOS 消息进入企业号客服账号、以来源账号区分，KOS 自身私信通不可用（FAQ 二.10）；企业号授权完成即返回企业号信息含头像，员工号头像在绑定成功通知里（FAQ 二.5）；KOS 绑定第 14 天清退逻辑生效，消费不达标失去高级权益（3754/FAQ 二.6）
- 意向评论与 KOS（FAQ 二.15/二.18，已完整上线）：员工号意向评论统一通过企业号 UID 获取（员工号 UID 获取返回空）；B 拉到 S 的意向评论后仍须以 S 的 UID 调消息发送回复（以 B 回复报「意向评论未查到」）；**KOS 意向评论回复须在 user_id 和 from_user_id 字段中均填入 KOS UID**

### 13.6 消息、卡片与频控（4439 FAQ，`[官方]`）

- 消息类型：接口文档露出 **text/image/video**（收发接口均无语音类型）；语音来件呈未知消息体并自动同步「暂不支持此消息类型，请到小红书 App 端查看」
- 卡片组件 5 类：交易卡/留资卡/名片/落地页/服务卡——「在文档中有露出的都支持收发，包括企业号和KOS」；KOS 不能创建/发送企业号落地页；交易卡为获客组件、在专业号后台配置（三方接收接口已有、创建无三方接口）；2026-04 新账号体系后名片/留资卡/交易卡/表单发送可能报「当前账号无发送权限或次数已超限，请至小红书客户端处理」
- 媒体限制：「视频有，50兆左右；图片没有」
- 推送重试：「正常情况下推送1次，如出现异常会整体推送3次」
- 能力边界：无已读未读事件；账号接入量/消息量无限制；小红书内备注不提供给三方
- 手机号语义：留资手机号只走客资线索推送、会话内不提供；用户在会话主动发的手机号会推到接收消息接口，同时产生一条留资线索推送（未被社区规则屏蔽时）
- 社区风控（不支持扩容）：主动对非粉丝用户——一天最多 20 个陌生人；对方未回复 24h 内只能发 1 条，24h 后可再发 1 条，累计最多 3 条；「触发小红书私信规则时，会有通知消息说明」（平台推送风控通知给三方呈现）

### 13.7 私信客资 API（3115）——线索推送，独立于实时会话 `[官方+多源]`

- 定位：客户完成一次有效私信标注且完成广告归因后，平台以 POST + JSON 推送到聚光后台「工具-线索行业工具-私信API」配置的接收地址；仅聚光品牌主账户有对接入口，子账户无
- 应答/重试：「对于response code 为 200 即认为推送成功，对于推送失败的情况，会每隔 30s 重试一次，最多重试 3 次」；联调以 response code 200 判定
- 验签（非必须）：header `X-Red-Signature`，格式 `sha1=bf0a961d504467e3ce78c0b9401d311ccc03b395`；「以私信api对接工具获取的token 为secretKey，和body 数据生成签名（未经反序列化的原始body），与header 中的signature 进行校验」。算法多源实锤为 **HMAC-SHA1(rawBody, token) 输出 hex**（Maskvvv/java-study `HmacSHA1`+Hex 实现佐证）；fengqililin59-cpu/syqw 的 `SHA1(token + rawBody)` 为第三方变体、与官方示例不符，勿采用
- 推送字段表（3115）：类型（新增/更新内容/更新归因信息）、时间、小红书号、用户昵称、省份、城市、线索标签、电话号码、微信号、备注、标注客服、投放账号、是否留资、笔记链接、广告计划(ID)/广告单元(ID)/广告创意(ID)、私信接收人(id)——KOS/KOB 模式必须对接私信接收人字段
- 第三方 DTO 佐证 `[多源]`（Maskvvv/java-study）：`PushLeadsRequest{data, timestamp, source}`；`LeadsInfo{landing_page_id, url, submitted_time(yyyy-MM-dd HH:mm:ss GMT+8), source_channel, account_id, account_name, campaign_id, campaign_name, unit_id, unit_name, creative_id, leads_id, data:[{label,value}], keyword}`

### 13.8 与小程序客服消息体系（§10）的关系：并行双体系

| 维度 | 小程序客服消息（§10，dudu-server 已实现） | 商业开放平台私信三方（本节） |
|---|---|---|
| 服务对象 | 小程序生态的客服会话 | 专业号私信/私信通（聚光广告线索营销语境） |
| 账号主体 | 小程序（appid） | 企业专业号品牌主账号 + KOS 员工号 |
| 凭证 | appid+secret → access_token（2h，无 refresh） | app_id+secret → access_token（1 天）+ refresh_token（30 天，OAuth 双 token） |
| 授权 | 平台控制台配 URL + Token + EncodingAESKey | 客户两步授权（聚光绑定 + 开放平台 scope 授权） |
| 网关 | miniapp.xiaohongshu.com | adapi.xiaohongshu.com |
| token 携带 | query/body 参数 | Access-Token 请求头 |
| 握手/验签 | GET echostr + sha1 四值签名 + AES-256-CBC 加密体 | 接收推送验签未公开（另有接入加解密 secretKey 由平台下发）；客资线为 X-Red-Signature HMAC-SHA1 |
| 应答 | `success` 字符串 | 待核验 |
| 准入 | 小程序 + 交易能力授权 | 严苛资质与人工开白（§13.3） |

- 两体系互不打通：FAQ 二.12 交易卡跳小程序后的转化关联「这三方服务商是无法直接打通的」；属**并行体系**，非同一渠道的两条通道

### 13.9 对 DuDu 的可行性判定

- 协议形态与 dudu-server「接收=平台回调推送、发送=调平台 API」模型吻合（third_im 接收推送 + 发送 API），领域模型可作第三个小红书渠道容纳；客资线索推送（3115）协议完整，可作线索域候选
- 但当前阶段**工程接入不可行**，前置条件缺三样：
  1. **字段规格不公开**：接收/发送消息的 URL、信封、字段表在企业微信文档登录墙内（须服务商/年框身份经人工开白获取）——无规格不能开发
  2. **准入门槛**：等保备案+等级测评报告+ICP 增值电信许可证+隐私政策；三方服务商另须 50/10 家客户门槛；品牌自研仅年框客户
  3. **人工流程**：测试账号/域名/secretKey 均经对接群周度开白下发，无自助沙箱
- 若未来接入：channel_info 需 app_id/secret + OAuth 双 token（1 天/30 天，5 分钟平滑失效）自动刷新模型、Access-Token 请求头网关（`api-base` 缺省 `https://adapi.xiaohongshu.com`）、scope=`third_im`+`three_im_leads_push`；发送侧频控须内建（20 陌生人/天、24h 窗口、累计 3 条）
- 对 mock 基准：官方未公开任何接收/发送载荷样例，third_im 暂不构成模拟基准；客资线索推送的 3115 字段表完整，若做线索域可依此造模板

### 13.10 待核验(11-03)——第二轮(14)复扫后全部仍卡

> **2026-11-05 渠道状态精修**：企业微信文档四件经 webReader（渲染浏览器 + guest 会话）实测**游客可读**——「登录墙」精修为「渲染可读、提取受限」：主文档标题「三方客服接口文档」正文首章「客服消息接入指南」（开头句「以下接口对接说明适用于对接小红书-三方客服接口文档…」）；流程文档含「一，整体接入流程（17 步）」章节。webReader 单次输出仅数百字符，字段表未透出；curl 直抓与 dop-api 匿名调用仍拒（isLogin:false，retcode 20006x）。字段级提取需长输出渲染会话或人工导出，五项维持待核验

1. 三方客服接收消息推送：URL 配置入口、信封字段、验签算法、有无首次握手、应答格式——仍卡：docs-center 全库/厂商文档/GitHub 三路复扫零字段级旁证（§14.2/14.4/14.5）
2. 三方客服发送消息：接口 URL 与请求体字段、错误码——仍卡（同上）；已知消息类型与频控见 §13.6/§14.1
3. 接收侧「加解密 secretKey」的具体算法与下发形态——仍卡：仅证实存在且开白后群内下发（FAQ 一.3/一.4）
4. `/api/open/im/comment/list`（意向评论）请求/响应字段——仍卡：仅有端点 URL 与 B/S 归拢、KOS 双字段语义（FAQ 二.15/二.18，§14.1）
5. third_im 消息与私信通产品（3213 私信通-新端产品手册）会话界面的对应关系——仍卡：3213 为产品手册，无接口映射

### 13.11 本次来源清单

- docs-center 数据接口（POST 直抓）：`https://ad-market.xiaohongshu.com/api/open/article/biz/type`、`/api/open/category/list`、`/api/open/article/list`（categoryId 959/960/953/1521 等，全库 656 篇）
- 关键文章：3754（入驻全流程）、4439（FAQ 库）、3115（私信客资API）、3197（scope权限说明）、2603（授权流程）、2607（Token有效期&续期）、4945（获取token）、4808（刷新token）、4437/4438/4447（MAPI）
- GitHub 交叉 `[多源]`：leonardsite/xhs-api src/index.js（auth_code 回调参数、Access-Token 头、adapi 端点）、Maskvvv/java-study XiaoHongShuController.java（HMAC-SHA1 验签+客资 DTO）、YspCoder/social-hub（Access-Token+scope）、fengqililin59-cpu/syqw（X-Red-Signature 变体，判不采用）、zyfjacksonchen-source/EcoreX、westng/xhs-marketing-api、crossover379/xiaohongshu-juguang-skill、BBiwen/Get_RedNote（auth_code 佐证）
- 未攻破：企业微信文档登录墙（`doc.weixin.qq.com`，匿名 opendoc 回 retcode 200060；webReader 两次网络错误）

## 14. 五次补摄：third_im 接口规格还原（2026-11-03 第二轮）

目标：把 §13 定性的私信三方体系还原到实施级。结论先行：四块规格均未达实施级，字段级文档确认只存在于企业微信文档登录墙内、随人工开白受控下发；公开互联网三路复扫（docs-center 全库、厂商文档、GitHub）零字段级旁证。§13.10 五项就地标注后全部仍卡。

### 14.1 四块还原度总览

| 块 | 还原度 | 已确证事实 | 缺口 |
|---|---|---|---|
| ① 接收消息推送 | 行为级（无信封） | 重试「正常 1 次，异常整体 3 次」（FAQ 二.4）；触发私信规则时推送通知消息给三方呈现（FAQ 一.7）；聚光账号绑定/解绑有通知事件（FAQ 二.3）；留资手机号只走线索推送、会话内用户主动发的手机号会推到接收接口（FAQ 二.10）；授权完成返回企业号信息含头像、KOS 头像在绑定成功通知（FAQ 二.5） | URL 配置入口、信封字段、验签算法、首次握手、应答格式 |
| ② 发送消息 API | 语义级 | 消息类型 text/image/video + 5 类卡片、视频约 50MB、频控 20 陌生人/天+24h 窗口 1 条+累计 3 条（§13.6）；KOS 意向评论回复须 user_id 与 from_user_id 均填 KOS UID；B 拉到的 S 意向评论须以 S 的 UID 调发送（FAQ 二.15/二.18） | 接口 URL、请求体信封、错误码表（鉴权头可依 §13.4 Access-Token 推断，未实锤） |
| ③ 加解密 secretKey | 存在级 | 「接入需要加解密」；secretKey 待加权开白后在对接群同步下发（FAQ 一.3/一.4）；域名+应用 ID 表单周度汇总处理 | 算法（模式/填充/密文格式）、字段覆盖范围 |
| ④ 意向评论 | 端点级 | `https://adapi.xiaohongshu.com/api/open/im/comment/list`（FAQ 二.15 原文）；传 B 的 UID 可获取 B 与授权 S 的评论、传 S 返回空；错报文案「意向评论未查到，确认评论是否存在」；意向笔记新增笔记作者 UID 字段区分来源账号（FAQ 二.15/二.18） | 请求/响应字段表、分页语义 |

### 14.2 docs-center 全库复扫（无新增字段级内容）

- 945 域目录树最终确认仅 5 篇：4808/2607/2603/3197（OAuth 族）+ 3754（入驻全流程）；全库 656 篇（bizType=945 分页 7 页取全）按 `私信|客服|IM|意向|线索|评论|消息|回调|推送|webhook` 扫描命中 20 篇，均为聚光产品手册、FAQ 或 MAPI 文章——复扫坐实「third_im 字段级规格不在 docs-center」
- FAQ（4439）本轮增量：意向笔记新增「笔记作者 UID」字段用于区分评论来源账号；新企微文档链接三条——企业号认证操作（`w3_AfcAtgblADUvM7ScpQ3SvSugRXWFC`）、意向评论附文档（`w3_ACwAJQbSACQm1hQiqDjS5u31S4oDs`）、员工号实名/授权/绑定（`w3_AccA6AbiAMMwLN01ELSSLSBolZqOo`），均在登录墙内；KOS 评论筛选灰度、4 月新账号体系报错文案（§13.6 已引）
- 3754 复核增量 `[官方]`：跳转绑定地址真实样例 `https://ai.youju360.com/qing-niao/xhsAuth.html?jumpUrl=https://ad.xiaohongshu.com/api/leona/three/im/account/add&uba_pre=...`（坐实聚光绑定端点 `api/leona/three/im/account/add`）；beta 测试应用仅填写的 uid 可见、正式应用上线后全部客户可见；功能加白表——意向评论/获客工具=满足消耗门槛自动开通、交易卡=by 部分行业客户加白、KOS=联系直客内部申请且第 14 天清退；广告链路测试步骤（聚光-竞价推广-新建计划-客资收集-私信进线量/开口量/留资量→创意 hover 二维码→App 扫码从胶囊组件进线触发）
- 3115 官方镜像佐证：juxuan.net/22581.html 逐字复刻 3115 全文（验签三步、200/30s×3 重试、字段表、KOS/KOB 须对接私信接收人）——§13.7 维持 `[官方+多源]`

### 14.3 登录墙攻防（全部未攻破）

- doc.weixin.qq.com：GET `/dop-api/opendoc` 匿名携带 scode → `retcode:30004`、`errcode "30004:200062"`、`errmsg "check userInfo failed"`——scode 不能匿名放行，强制登录
- docs.qq.com 两个疑似镜像 id（d26139c8…/e133a83c…）：`/dop-api/opendoc` 匿名 401；移动端 UA 抓 HTML 258KB 为纯 SPA 壳（无 clientVars 文档数据）；webReader 渲染 d26139c8… 返回的是无关文档「腾飞Webos插件前端开发教程」（撞 id 假象，非小红书文档），e133a83c… 500 网络错误（一次即弃）；搜索引擎对 d26139c8… 显示「没有此网页的信息」（未索引）
- 结论：字段级规格的唯一现实获取路径=完成准入开白后经对接群取得企微文档阅读权

### 14.4 厂商侧交叉（7 家均为产品配置级，零字段旁证）

- 共同授权路径复现 `[多源]`（与 §13.5 官方两步一致）：商业开放平台授权（米多客逐字「勾选授权功能：三方工具服务、私信留资数据」→【确认授权】）→ 聚光「工具-三方客服管理」对服务商点【授权新账号】绑定（米多客/合力亿捷/官方 3754 三方一致）；合力亿捷补充 OAuth 链接式描述（企业管理员点跳转 URL 至聚光完成授权，勾选「私信消息读取、私信消息回复、用户基础信息读取」，手机号等敏感信息需额外应用权限审核，授权长期有效直至手动解除）
- 合力亿捷 `[单源]`：消息「通过开放平台API实时推送至AI客服系统」、系统识别「消息内容、来源账号和用户open_id」；「单账号每分钟最多推送60条消息」（推送侧频控厂商口径，未证实，勿作实现依据）；评论标记格式「小红书-评论-笔记ID」；准入三条件=蓝V认证+聚光广告主+员工号预先绑定身份审核
- 米多客 `[单源]`：接收侧支持图片/视频，机器人自动回复仅图片+文字；门槛「账号必须是小红书企业号或者kos号认证」；自述「官方授权合作的IM工具服务商」
- 快商通 `[单源]`（163.com 软文）：专业号管理员扫码授权，确认开启「私信、评论读取、留资组件」权限；留资立刻推送至企微/钉钉/飞书/自有 CRM；无 KOS 内容、无任何 API 细节
- TP CX Cloud OCS `[单源]`（知乎营销稿）：自称 2025-02 通过「小红书三方IM服务商」资质审核、2025-04 评论回复与私信沟通功能上线——第三方过审服务商存在性旁证
- 网易七鱼/Udesk/容联七陌/智齿/Live800/语聚：帮助中心与搜索引擎检索均无小红书接入接口级文档（智齿/Live800/语聚上一轮已核，本轮七鱼/Udesk/七陌定向检索落空）
- 结论：七家厂商文档全部止步于授权 UI 操作与产品卖点，无一家泄露信封、字段或签名细节——与 FAQ「群内下发」互证，接口规格是开白后的受控资产

### 14.5 GitHub 复扫（无 third_im 收发实现）

- leonardsite/xhs-api `src/index.js`（本轮全文 18.6KB）：纯聚光 Marketing API 网关（OAuth/投放/报表/账户/素材/工具，路由全在 `/api/open/jg/*`），无 im/leads 路由——§13.11 对其引用（auth_code、Access-Token 头）仍有效但范围仅限 OAuth
- fengqililin59-cpu/syqw `publicInboxIngest.service.js`（本轮细读）：自研通用 webhook 归一化适配器，xiaohongshu 示例载荷 `{user_id, content, message_id}` 为该仓库自拟（open_id/user_id/sender_id/from_user_id 逐个兜底尝试），非官方信封——可见的第三方「实现」均未真正对接 third_im
- 关键词组 `adapi.xiaohongshu.com`、`X-Red-Signature`、`third_im`、`three_im_leads_push`、`小红书 私信通/三方客服 接口` GitHub 全网搜索：除 §13.11 已列客资域（3115）实现外，无任何 third_im 收发代码

### 14.6 准入双路径复核（维持 §13.3，补字段级原文）

- 两分法定义（3754 原表）：「三方服务商：申请后，该IM应用可被多品牌授权使用」「品牌自研自用：申请后，该IM应用仅可被品牌内部应用，其他品牌无法授权」
- 三方服务商硬门槛：IM 能力服务客户总数 ≥50 家、小红书渠道在服客户（含意向）≥10 家、公司官网；品牌自研自用：「是否是小红书年框客户……目前仅开放给年框客户对接」+ 在投账号名称 + 当前/预期私信营销日均预算
- 必备资质（无资质无法入驻）：隐私政策、公安部近一年《信息系统安全等级保护备案证明》+近一年《网络安全等级保护等级测评报告》、有效期《增值电信业务经营许可证》（ICP）、营业执照；AI 能力须 ≥200 个对话样本评估（不通过禁入 AI 能力；不接入也会被定期抽检，不符将关闭 API 权限）；等保等级 FAQ 明确「暂无等级要求」；材料造假「平台可随时取消合作」
- 双路径共性：均以企业主体+小红书广告投放关系为前提，开源项目本身不能作为申请主体；DuDu 的现实路径只有两条——未来服务的客户满足准入后以其名义走「品牌自研自用」，或对接已过审服务商（如 TP CX OCS、合力亿捷、米多客等）由其转发消息

### 14.7 实施缺口清单（按块）

1. 接收侧缺信封/验签/握手/应答——回调接收端无法设计；可先行建模的仅有行为契约：幂等（绑定/解绑通知）、推送重试（异常整体 3 次）、风控通知消息事件
2. 发送侧缺 URL/请求体信封/错误码——出站适配器无法实现；频控规则可先行建模（20 陌生人/天、24h 窗口 1 条、累计 3 条 + 风控通知事件回传）
3. 加解密算法未知——报文层无法实现；唯一可先行的是参考 §11 小程序体系（AES-256-CBC + Token 验签）设计加解密抽象层，不可假设同构
4. 意向评论缺字段表——无法实现；已知端点 + B/S 归拢 + KOS 双字段语义 + 笔记作者 UID 可先建领域模型占位
- 总判定：维持 §13.9「工程接入不可行」，规格获取依赖准入开白；本节作为待接入清单，待任一客户路径满足准入、拿到企微文档后一次性补齐上述四块

### 14.8 本轮来源清单

- docs-center 复扫：`/api/open/category/list`、`/api/open/article/list`（bizType=945 全局分页 656 篇 + 944/1084 目录树），缓存于 worktree `xhs-scan-tmp`（scan_full_report.txt、article_4439/3754.txt）
- 关键文章复核：4439（FAQ 库增量）、3754（入驻全流程字段级原文）、3115（客资 API，juxuan.net/22581.html 镜像逐字佐证）
- 厂商文档：hollycrm.com/blog/app/288.html、miduoke.net/info/consultation/3382.html、163.com/dy/article/LAAP6RV605389OCG.html（快商通）、zhuanlan.zhihu.com/p/1897590519900661246（TP CX OCS，WebFetch 403 仅得搜索摘要）；七鱼/Udesk/七陌定向检索落空
- GitHub：leonardsite/xhs-api src/index.js 全文、fengqililin59-cpu/syqw publicInboxIngest/publicWebhookAuth.service.js、多组关键词全网搜索（无 third_im 实现）
- 登录墙证据：doc.weixin.qq.com retcode 30004、docs.qq.com opendoc 401×2/SPA 壳/webReader 500、搜索引擎未索引——均记录于 worktree data 目录（weixin_opendoc.json、docsqq_*.json）
