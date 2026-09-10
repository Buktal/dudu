# 饿了么开放平台 消息推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 `openapi-doc.faas.ele.me` 官方文档正文（全部成功，逐字）+ WebSearch 官方站（`open.shop.ele.me`）页面摘录（标注 `[摘录]`）+ 抓不到全文的标 `待核验(09-27)`。
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`待核验(09-27)` = 未能取得官方原文（多为 `open.shop.ele.me` SPA 壳、无服务端渲染正文），需复核。非 primary 来源（第三方博客/镜像站/SDK 转述）一律不列为事实，只在 §7 注明其声称内容。
> 核心结论前置：饿了么存在**两代两线**——**用户线 OpenAPI**（`openapi-doc.faas.ele.me`，`consumer_key` + SHA1 签名，**无 token**，推送仅 4 种订单类，本文已全文核验）与**商户线开放平台**（`open.shop.ele.me`，`app_key` + OAuth `access_token` + 签名，消息 `type` 数字体系，站内文档为 SPA，**多数待核验**）。两者签名算法、凭证模型、推送信封**互不相同**，不可混用。

## 1. 官方文档入口与关键页面地址

门户与协议：

- 商户线门户：https://open.shop.ele.me/ —— `[摘录]` 首页 footer 含「开发文档 / 开发规范 / 授权说明 / 消息推送 / 接口能力说明 / SDK 下载 / 如何测试 / 运营规范」入口。
- 商户线在线服务协议：https://open.shop.ele.me/openapi/documents/agreement —— `[摘录]` 含"推送：开放平台向应用发送'新订单'、'运单状态变化'等消息"、"回调：商户同意或拒绝授权请求后开放平台打开应用设置的回调 URL"定义（与用户线 `listen.html` 全文定义同构，见 §3.3）。
- 用户线文档根：https://openapi-doc.faas.ele.me/ —— WebFetch 全文（版权 `openapi.dev@ele.me`，用户端联系 `openapi.coop@ele.me`、商户端 `openapi.merchant@ele.me`）。
- 用户线协议（旧版，定义 Key/Secret/OpenAPI/授权/推送）：https://openapi-doc.faas.ele.me/v2/listen.html —— WebFetch 全文（协议版本 2018-05-03；开放平台站写 `https://open.faas.ele.me`）。

本次实际抓到并核实的页面清单（用户线，全部 WebFetch 全文）：

| 主题 | URL | 核验方式 |
|---|---|---|
| 快速入门（系统参数/签名 5 步/测试地址） | https://openapi-doc.faas.ele.me/v2/quickstart.html | WebFetch 全文 |
| 数据推送接口总览（默认推送方式/返回要求） | https://openapi-doc.faas.ele.me/v2/api/signal/index.html | WebFetch 全文 |
| 订单状态推送 order-status | https://openapi-doc.faas.ele.me/v2/api/signal/order-signal.html | WebFetch 全文 |
| 订单配送信息推送 order-delivery | https://openapi-doc.faas.ele.me/v2/api/signal/order-delivery-signal.html | WebFetch 全文 |
| 退单状态推送 order-refund | https://openapi-doc.faas.ele.me/v2/api/signal/order-refund-status.html | WebFetch 全文 |
| 订单赔偿 order-compensate（暂不对外开放） | https://openapi-doc.faas.ele.me/v2/api/signal/order-compensate.html | WebFetch 全文 |
| 枚举值（订单状态/取消原因/配送码/退单码/角色/赔付类型） | https://openapi-doc.faas.ele.me/v2/appendix/enums.html | WebFetch 全文 |
| 签名示例代码（Python/PHP/Java） | https://openapi-doc.faas.ele.me/v2/appendix/sig-example-codes.html | WebFetch 全文 |
| API 请求限制（consumer_key 级 + 1009） | https://openapi-doc.faas.ele.me/v2/appendix/rate-limit.html | WebFetch 全文 |
| H5 订单推送（push_action=1/2 + 签名 + 响应） | https://openapi-doc.faas.ele.me/h5/api/order.html | WebFetch 全文 |
| 账户同步（account-login/auth-token/1019） | https://openapi-doc.faas.ele.me/v2/api/account.html | WebFetch 全文 |
| H5 账户 OAuth（饿了么作客户端） | https://openapi-doc.faas.ele.me/h5/api/account.html | WebFetch 全文 |
| H5v2 支付（RSA2 互换公钥，推送外） | https://openapi-doc.faas.ele.me/h5v2/payment.html | WebFetch 全文 |

商户线（`[摘录]`，SPA 壳直抓仅回空壳，见 §7.1）：

| 主题 | URL | 核验方式 |
|---|---|---|
| 环境地址（authorize/token/api-v1/coupon-v1，强制 HTTPS） | https://open.shop.ele.me/base/documents/appenv | `[摘录]` |
| 推送失败补偿 `eleme.msgNew.getPushFailMsg` | https://open.shop.ele.me/openapi/apilist/eleme-msgNew/eleme-msgNew-getPushFailMsg | `[摘录]`（接口名 + 中文描述实锤） |
| 确认拉取 `eleme.msgNew.confirmPullMsg`（token 可传空） | https://open.shop.ele.me/openapi/apilist/eleme-msgNew/eleme-msgNew-confirmPullMsg | `[摘录]`（公共参数表实锤：nop/id/metas/action/token/params/signature） |
| token 状态查询方案 `eleme.user.getTokenStatus` | https://open.shop.ele.me/base/documents/checktokenstatus | `[摘录]` |
| 商家应用授权说明 | https://open.shop.ele.me/openapi/documents/khd001 | 待核验(09-27)（抓取回"发生了些问题，请返回重试"） |
| 消息推送协议 httppushmethod | https://open.shop.ele.me/openapi/documents/httppushmethod（及 `/base/documents/httppushmethod`） | 待核验(09-27)（直抓仅回 SPA 壳） |
| 回调说明 callback / token 说明 token | https://open.shop.ele.me/base/documents/callback、https://open.shop.ele.me/base/documents/token | 待核验(09-27)（直抓仅回壳） |
| 入驻介绍 PDF（双账号/资质/审核） | https://open.shop.ele.me/static/files/join-eleme-openapi.pdf | `[摘录]`（搜索返回正文片段） |
| 官方 Java SDK（`me.ele.openapi:eleme-openapi-sdk`） | Maven Central（scm 指向 coding.net 官方仓，维护者 `open.shop@ele.me`） | 非 primary，仅作 SDK 存在性旁证 → 待核验(09-27) |
| 蜂鸟配送开放平台 | https://open.ele.me/ | 待核验(09-27)（仅知存在，本库未覆盖） |

---

## 2. 消息/事件推送全清单

### 2.1 用户线推送（已全文核验，共 4 种 + H5 1 种）

推送总纲（signal/index 全文逐字）："需要合作方提供地址，推送相关信息给接收方"；"即使用 API 访问的逆反过程来推送，饿了么通过第三方的账号将数据进行签名……使用 HTTP POST 来推送数据"；"所有推送的接口都要按以下的形式返回，否则饿了么将认为对应的推送请求失败，并发起重试机制：HTTP 代码 200；内容 `{"message": "ok"}`"。

| 推送名 | 触发语义 | 关键字段 | 出处 |
|---|---|---|---|
| `order-status` | 订单状态变更；`push_action` 仅 `2 = order_status_update` | `push_action/eleme_order_id/tp_order_id/new_status/extra/created_at`；`new_status` 见订单状态枚举；取消时 `extra = {"invalid_type": N, "description": "…"}` | order-signal 全文 |
| `order-delivery` | 订单配送信息推送，HTTP POST | `eleme_order_id/tp_order_id/deliveryman_name/deliveryman_phone/state_code/update_at`；`state_code` 见"新"配送码（1 待分配 … 8 配送异常） | order-delivery-signal 全文 |
| `order-refund` | 退单状态推送 | `status_code/role/eleme_order_id/tp_order_id/update_at`；`status_code` 1–9（1 申请 … 8 自动成功 / 9 自动失败）；`role` 1 用户 / 2 系统 / 3 餐厅+napos+风控 / 4 客服 / 5 openapi+第三方 / 8 风控 | order-refund-status + enums 全文 |
| `order-compensate` | 订单赔偿（红包） | `compensate_type/hongbao_id/eleme_order_id/tp_order_id/phone/amount/sum_condition/begin_date/end_date/action/created_at`；`action`: 1 赔付 / 0 取消（取消时仅 hongbao/order 两 id 有值）；手淘 model 名 `ELEME_COMPENSATE_HONGBAO` | order-compensate 全文（页首警告"暂时不对外开放"） |
| H5 状态推送 | 新订单 / 状态更新 | `push_action`: 1 新订单，2 订单状态更新；`order_id/user_id/new_status/user_state`；格式 `POST application/x-www-form-urlencoded` | h5 order 全文 |

订单状态枚举（enums 全文）：`-5 等待支付 / -4 支付失败 / -1 已取消 / 0 未处理 / 2 已处理 / 11 用户确认（妥投，默认对接方没有该状态）`；注：`STATUS_CODE_PENDING` 为逻辑状态可忽略；`INVALID` 可由用户/商家/客服/风控触发。订单取消原因 `invalid_type` 0–16（0 其他 … 9 用户无理由退单 … 13 用户取消 … 14 长时未接单自动取消 … 16 暂无运力）。"新"配送码 1–8：1 待分配（物流已建单）/ 2 待分配（配送已接单）/ 3 待取餐 / 4 到店 / 5 配送中 / 6 配送成功 / 7 配送取消（可重发）/ 8 配送异常。赔付类型：1 准时达 / 2 物流运单取消 / 3 下单 30 分钟后商户取消。

### 2.2 商户线消息（`[摘录]` + 待核验）

- 推送/回调二分（`[摘录]` shop 协议页 + listen 全文互证）："推送：开放平台向应用发送'新订单'、'运单状态变化'等消息"；"回调：商户同意或拒绝应用的授权请求后，开放平台打开应用设置的回调 URL 并附带操作信息"。Key/Secret 定义："Key：应用的身份标识，全局唯一"；"Secret：应用私钥，配合 Key 验证应用合法性"；"申请发布新应用将得到唯一的 App key 和 App secret"。
- 推送失败补偿接口名实锤（`[摘录]` apilist 页）：`eleme.msgNew.getPushFailMsg`（获取推送失败的消息列表）、`eleme.msgNew.confirmPullMsg`（ISV 确认已成功拉取）。调用包络公共参数实锤（`[摘录]` confirmPullMsg 页）：`nop（固定 1.0.0）/ id（UUID4，响应回同值）/ metas{app_key, timestamp} / action（如 eleme.order.getOrder）/ token（access_token）/ params / signature（见 API 调用协议-接口签名）`；`timestamp` 单位秒，服务端允许 ±5 分钟误差；`token` 需传空字符串的接口（如 getTokenStatus）在列。
- 数字 `type` 消息体系（订单生效/接单/取消/无效/完结/退单/备注变更/小票打印/type=217 推拉结合等）：**仅见于非 primary 镜像站**（`dianj.com.cn`，自称转述 `httppushmethod`），官方 SPA 全文未取 → **不列为事实**，声称细节见 §7.3，待核验(09-27)。

### 2.3 商品类

- 用户线：**无商品推送**。已抓目录为证：商品/餐厅/食物/活动只有"补偿接口"（`markup.html`：餐厅/食物/食物分类/活动补偿）与"同步接口"（`sync-new.html`），均为**拉取式数据落地**，推送目录（signal/）仅 §2.1 四种。推送 model 名 `ELEME_FOOD / ELEME_FOOD_CATEGORY / ELEME_RESTAURANT / ELEME_ACTIVITY`（enums `model_name` 全文）为推送附加值含义，非推送类型。
- 商户线商品变更推送 → 待核验(09-27)（SPA 全文未取，不能排除）。

### 2.4 IM 类

- 用户线与 H5/H5v2 官方文档树**无任何 IM 推送页**（已抓总目录 + signal 目录为证；账户体系只有登录/token/OAuth；消息只指订单消息）。结论：用户线**无 IM 推送**（目录级已核验）。
- 商户线 IM → 待核验(09-27)（SPA 全文未取，不能排除；且商户线"消息"一词官方定义即订单/运单消息）。

### 2.5 其他域（用户线目录级已核验，均非推送）

- 评价（rating）：拉取/创建评价 API，无推送。红包：账户同步接口（login/auth-token/新用户），token 见 §6。支付：H5v2 为三方提供支付 URL、网关动态生成回调 URL（payment 全文），属支付专线非订单推送。GPG  detached 签名仅用于在线支付验证/下单（other_info 全文），与推送签名无关。

---

## 3. 回调机制

### 3.1 用户线：HTTP POST + 成功回执，无握手

- 传输（signal/index + h5 order，全文）：HTTP POST 推到合作方提供地址；H5 线为 `POST application/x-www-form-urlencoded`；默认推送为"API 访问的逆反过程"，带签名（可不校验但强烈建议校验）。
- 成功判定（两处全文一致）：HTTP 200 且 body 为 `{"message": "ok"}`（H5 页另要求 content-type 为 application/json）。否则判失败并"发起重试机制"。
- 重试：H5 页原文仅"饿了么会有一定的重试机制"——**间隔/次数/退避原文未给出** → 待核验(09-27)。signal 总览页同样只写"发起重试机制"，无数字。
- **无 challenge/URL 验证握手**：全部已抓推送页均无验证握手描述（与飞书 `url_verification` 不同）。商户线订阅生效时长（镜像声称 5–20 分钟）→ 待核验(09-27)。
- 幂等：官方**未指定幂等键**。建议消费方按 `eleme_order_id + push_action/new_status/update_at（或 created_at）` 去重——此为**工程建议，非官方原文**。有序性官方未声明。

### 3.2 商户线：订阅推送 + 拉取补偿（`[摘录]` + 待核验）

- 推送地址随应用信息审核（`[摘录]` shop 协议页片段："推送地址……等信息与审核通过的信息不相符……单方变更……须告知并经确认"）。
- 补偿闭环（`[摘录]` apilist 接口名实锤，参数待核验）: `getPushFailMsg` 拉取推送失败消息 → 业务处理 → `confirmPullMsg` 确认。触发与轮询周期 → 待核验(09-27)。
- 订阅/改订阅是否免审、生效时间、重试间隔次数 → 待核验(09-27)（镜像声称"修改订阅无需审核，5 分钟生效最长 20 分钟"，非 primary，不采用）。

### 3.3 授权回调（OAuth code，商户线，`[摘录]` + 全文协议定义）

- 地址（`[摘录]` appenv 页）：授权 `https://open-api.shop.ele.me/authorize`（沙箱 `https://open-api-sandbox.shop.ele.me/authorize`）；取令牌 `https://open-api.shop.ele.me/token`（沙箱对应）；API 网关 `https://open-api.shop.ele.me/api/v1/`（优惠券 `/api/coupon/v1/`）；`open-api.shop.ele.me` 与沙箱域名**强制 HTTPS**。
- 流程：应用配置回调地址 → 商户授权后平台打开回调 URL 并附 `code + state` → 用 code 换 token（换 token 的 grant/参数细节 → 待核验(09-27)，第三方实战转述为 `OAuthClient.getTokenByCode(code, callbackUrl)`，非 primary 不采用）。
- 沙箱：应用创建成功自动建测试商户账号与店铺，用于授权与绝大部分 API 调试（`[摘录]` appenv 页）；上线审核需勾选接口权限，通过后才可在生产环境授权调用（`[摘录]` 同页 + 入驻 PDF 摘录）。

---

## 4. 验签与加密算法

### 4.1 用户线签名（全文逐字，可直接实现）

quickstart `#gen-sig` 全文 5 步：

1. 排序得字符串 A：除 `sig` 外全部参数按参数名 ASCII 排序，`&` 连接，如 `consumer_key=7284397484&timestamp=1374908054`。注意（逐字）：除特别声明（如图片接口 `file`）外全部参数参与；GET/POST/PUT/DELETE 参数先 `utf-8` 编码再 urlencode；未保留字符为字母数字 `- _ . ~`；保留字符 `! * ' ( ) ; : @ & = + $ , / ? # [ ]` 必须编码；`x-www-form-urlencoded` 下空格编为 `+`。
2. 字符串 B = `请求url + ? + 字符串A + consumer_secret`（secret 直接拼接，无分隔符），如 `http://openapi.ele.me/v2/restaurants/?consumer_key=7284397484&timestamp=13749080544d31ba58fd73c71db697ab5e4946d52d`。
3. 字符串 C = B 经 UTF-8 编码后逐字节 HEX（`HEX Encode`）。
4. 签名 = `SHA1(C)` 十六进制小写，如 `e76dfee7276f0c7a382b4f0dbdad802a95c642aa`。
5. 拼 URL：`sig` 作 Query 参数，如 `http://openapi.ele.me/v2/restaurants/?consumer_key=7284397484&sig=e76dfee…&timestamp=1374908054`。

附加规则（逐字）：系统级参数（`timestamp/consumer_key/sig`）**一律放 Query String**，与 HTTP 方法无关；POST/PUT 默认 `Content-Type: application/x-www-form-urlencoded`（除特别声明）；计算 sig 时 URL 末尾**必须带 `/`**；`<>` 占位路径参数**不参与**签名。调用基址：`https://openapi.ele.me/v2/`（支持 https）。

### 4.2 推送验签（用户线，全文但字段级不全）

- H5 order 页逐字："签名方式和平台请求饿了么方式一样，具体方法参考饿了么签名计算"。signal 总览页逐字："饿了么通过第三方的账号将数据进行签名……使用方可以不做校验，但是强烈建议进行校验"。
- 含义：推送验签 = 同一 SHA1 机制（§4.1），但"第三方账号"对应的 secret 身份、推送参数是否含 `consumer_key/timestamp/sig` 三件套，**已抓正文未展开** → 字段级待核验(09-27)。实现时按 §4.1 同构验算并记录原始 body 以备对账。

### 4.3 商户线签名（`[摘录]`包络 + 算法待核验）

- 包络（`[摘录]` 官方 apilist 页实锤字段名）：`{nop, id, metas{app_key, timestamp}, action, token, params, signature}`，详见 §2.2。
- 算法：第三方转述（JustAuth 内复制的官方 Java SDK `SignatureUtil` 逻辑）声称为 `signature = UPPER(MD5(action + token + 排序后"key=JSON(value)"拼接 + secret))`，其中先并入 `app_key/timestamp` 再排序——**非 primary，不列为事实** → 待核验(09-27)。官方"API 调用协议-接口签名"页为 SPA，未取全文。

### 4.4 加密

- 用户线推送**无加密**（已抓推送/签名/附录页均无加密描述；只有在线支付 GPG detached 签名，不用于推送）。
- 商户线：网关**强制 HTTPS**（`[摘录]` appenv 页）；载荷级加密未知 → 待核验(09-27)。

---

## 5. 示例载荷原文（逐字）

### 5.1 成功回执（signal/index 全文逐字）

- HTTP 代码 200；内容 `{"message": "ok"}`（H5 页作 `{"message": "ok"}`，中文引号为原文排版，见 §5.6 注）。

### 5.2 order-status（order-signal 全文逐字）

```json
{
    "push_action": 2,
    "eleme_order_id": "12637645858619059",
    "tp_order_id": "1425223342",
    "new_status": 1,
    "extra": "{}",
    "created_at": "1531987437"
}
```

取消时 `extra` 形如 `{"invalid_type": 1, "description": "太忙"}`（页内行文，逐字）。

### 5.3 order-delivery（order-delivery-signal 全文逐字）

```json
{
    "eleme_order_id": "12374793708765809",
    "tp_order_id": "1425223342",
    "deliveryman_name": "李四",
    "deliveryman_phone": "13800001234",
    "state_code": 1234,
    "update_at": 1463943884
}
```

（注：`state_code: 1234` 为文档示意占位，非枚举值；枚举见 §2.1。）

### 5.4 order-refund（order-refund-status 全文逐字）

```json
{
    "status_code": 1,
    "role": 1,
    "eleme_order_id": "100025663239521904",
    "tp_order_id": "tb1020303434342",
    "update_at": 1458721474
}
```

### 5.5 order-compensate（order-compensate 全文逐字）

```json
{
    "compensate_type": 1,
    "action": 1,
    "hongbao_id": "1234",
    "eleme_order_id": "100967782022644505",
    "tp_order_id": "212433333745",
    "phone": "18843225250",
    "amount": 2.7,
    "sum_condition": 27,
    "begin_date": "2016-07-01",
    "end_date": "2016-07-31",
    "created_at": 1469361386
}
```

### 5.6 H5 状态推送（h5 order 全文逐字转表）

请求：`POST application/x-www-form-urlencoded`，字段 `push_action(int, 1 新订单 / 2 订单状态更新) / order_id / user_id / new_status(订单状态) / user_state(唤起时传递的用户渠道信息)`。平台响应要求逐字：(1) `status_code 200，并且 content-type 为 application/json`；(2) 推送成功内容为 `{“message”: “ok”}`（中文引号照录原文）。订单详情查询：`GET /api/thirdparty/orders/<order_id>/`（需签名，字段见订单回传模型）。

### 5.7 签名请求 URL（quickstart 全文逐字）

```text
http://openapi.ele.me/v2/restaurants/?consumer_key=7284397484&sig=e76dfee7276f0c7a382b4f0dbdad802a95c642aa&timestamp=1374908054
```

### 5.8 Python 签名示例（sig-example-codes 全文逐字，Python2 风格照录）

```python
import hashlib
import urllib
from cgi import FieldStorage


def concat_params(params):
    pairs = []
    for key in sorted(params):
        if key == 'sig':
            continue
        val = params[key]
        if isinstance(val, unicode):
            val = urllib.quote_plus(val.encode('utf-8'))
        elif isinstance(val, str):
            val = urllib.quote_plus(val)
        if not isinstance(val, FieldStorage):
            pairs.append("{}={}".format(key, val))
    return '&'.join(pairs)


def gen_sig(path_url, params, consumer_secret):
    params = concat_params(params)

    to_hash = u'{}?{}{}'.format(
        path_url, params, consumer_secret
    ).encode('utf-8').encode('hex')

    sig = hashlib.new('sha1', to_hash).hexdigest()
    return sig
```

### 5.9 PHP 签名示例（同页逐字）

```php
<?php

  function concatParams($params) {
    ksort($params);
    $pairs = array();
    foreach($params as $key=>$val) {
        array_push($pairs, $key . '=' . urlencode($val));
    }
    return join('&', $pairs);
  }

  function genSig($pathUrl, $params, $consumerSecret) {
    $params = concatParams($params);
    $str = $pathUrl.'?'.$params.$consumerSecret;
    return sha1(bin2hex($str));
  }

?>
```

### 5.10 Java 签名核心（同页逐字，`concatParams/byte2hex` 从略）

```java
public static String genSig(String pathUrl, Map<String, String> params,
                            String consumerSecret) throws NoSuchAlgorithmException, UnsupportedEncodingException {
    String str = concatParams(params);
    str = pathUrl + "?" + str + consumerSecret;

    MessageDigest md = MessageDigest.getInstance("SHA1");
    return byte2hex(md.digest(byte2hex(str.getBytes("UTF-8")).getBytes()));
}
```

### 5.11 账户 token（account 全文逐字结构）

`account-auth-token` 成功返回：`{"code": 200, "data": {"token": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "expire_at": "2015-01-01 11:11:11"}, "message": "ok", "request_id": "115bc4a55e3c4e9eaf3f1a111a3e7271"}`。未授权/过期访问需授权接口返回 `1019 USER_AUTHENTICATION_REQUIRED`；验证码错误 `1020 INVALID_MOBILE_VERIFY_CODE`。

### 5.12 商户线包络（`[摘录]`，非逐字全文）

协议请求参数表（confirmPullMsg 官方 apilist 页摘录）：`nop(String, 1.0.0) / id(String, UUID4) / metas(Object, 含 app_key + timestamp) / action(String, 如 eleme.order.getOrder) / token(String, access_token) / params(Object) / signature(String)`。完整示例与签名页正文 → 待核验(09-27)。

---

## 6. token / 凭证模型

| 凭证 | 换取/使用方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| 用户线 `consumer_key / consumer_secret` | 饿了么分配（后台查看；H5v2 明确"由饿了么提供，可在接入后台查看"）；每次调用带 `consumer_key + timestamp(秒) + sig` | 无过期（密钥对）；`timestamp` 为调用时 unix 秒 | quickstart 全文 + h5v2 account 全文 |
| 用户线账户 `token` | `account-login`（手机号发验证码）→ `account-auth-token`（手机号+验证码） | `expire_at` 到期；过期/未授权调接口报 1019，重新验证 | account 全文 |
| 用户线 OAuth | **反向**：饿了么作客户端，第三方平台作授权方；`authorize?response_type=code&client_id&redirect_uri&state` → `token?grant_type=authorization_code&code…&client_secret`；回 `access_token/token_type(bearer)/expires_in/refresh_token` + 资源字段（mobile/device_id/user_id/auth_token） | 遵 OAuth2（`oauth_rfc6749`），饿了么引用未自定 | h5 account 全文 |
| 商户线 `app_key / app_secret` | 发布应用唯一配发；请求 `metas` 带 `app_key + timestamp`，服务端允差 ±5 分钟 | 机密责任在开发者；泄露立即通知平台 | `[摘录]` apilist + 协议（shop 摘录 / faas listen 全文） |
| 商户线 `access_token` | OAuth：authorize → 回调收 `code + state` → `/token` 换 token | 有效期/刷新细节 → 待核验(09-27)（第三方转述沙箱 1 天，`tokenType Bearer/expires/refreshToken`，非 primary 不采用） | `[摘录]` appenv（端点实锤）；细节待核验 |
| 商户线 token 运维 | `eleme.user.getTokenStatus`（token 传空串调用）；`UNAUTHORIZED`"token认证失败,请重新申请token"时先核对再决定刷新或重授权 | 沙箱查询结果"不符合预期，后续迭代"（官方原话摘录） | `[摘录]` checktokenstatus 页 |
| 发送 API（用户线） | 订单：`order-create / order-mget / order-status-get / batch-order-status-get / order-get-by-tp-id / order-contact-info-get / order-confirm(接单) / order-remind(催单)`；配送跟踪：`order-delivery-info(-get)`；支付状态：`order-payment-status-update`；均同 §4.1 签名 | 频控：按 `consumer_key` 限每分钟请求总数，超限 `1009`；**具体数值由饿了么与第三方协商确定**，异常时平台可任意修改（事后通知） | api 目录 + rate-limit 全文 |
| 发送 API（商户线） | `eleme.order.getOrder / eleme.order.mgetOrders / eleme.order.confirmOrderLite / eleme.order.getUnprocessOrders / eleme.order.getCancelOrders / eleme.order.getRefundOrders / eleme.message.getNonReachedMessages / eleme.user.getUser` 等 | 接口名见官方 apilist/第三方转述，**参数与签名页全文** → 待核验(09-27) | `[摘录]`（apilist action 示例 `eleme.order.getOrder` 实锤）；余待核验 |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **商户线推送协议全文**：`httppushmethod`（信封字段、签名算法、订阅/退订、重试、幂等）。直抓仅回 SPA 壳。→ 待核验(09-27)
2. **商户线回调/token/KOC 文档全文**：`base/documents/callback`、`base/documents/token`、`openapi/documents/khd001`（授权说明页抓取回"发生了些问题"）。→ 待核验(09-27)
3. **数字 type 消息体系事实性**：镜像站（非 primary）声称信封 `{appId, requestId, type, message(JSON 字符串), shopId, timestamp(毫秒), signature(大写十六进制), userId}`，type 如 12 接单 / 14 取消 / 15 无效 / 17 强制无效 / 18 完结 / 30 退单 / 39 售中部分取消 / 105 服务市场订购 / 214 备注变更 / 217 订单生效（推拉结合）/ 218 小票打印 / 233 预订单改时，以及 `role` 1–9、推送 5–20 分钟生效等——**全部未在官方原文核实，本库不采用**，仅记于此。→ 待核验(09-27)
4. **商户线签名算法全文**："API 调用协议-接口签名"页（MD5 传述、`action+token+排序key=JSON(value)+secret`→大写，源为第三方复制的 SDK 代码，非 primary）。→ 待核验(09-27)
5. **商户线 token 寿命与刷新**：`expires/refresh_token` 有效期、刷新 endpoint 参数、沙箱与生产差异。→ 待核验(09-27)
6. **用户线推送重试间隔/次数**：官方仅"重试机制"/"一定的重试机制"，无数字；商户线重试策略亦未知。→ 待核验(09-27)
7. **用户线推送验签字段级**："通过第三方的账号签名"的参与字段（是否含 consumer_key/timestamp/sig、secret 身份）。→ 待核验(09-27)
8. **商户线商品/IM 推送存在性**：用户线目录级已证伪；商户线 SPA 未取不能排除。→ 待核验(09-27)
9. **商户线补偿接口参数**：`getPushFailMsg / confirmPullMsg / getNonReachedMessages` 请求/响应体、轮询周期、`confirmPullMsg` 以外 token 传空口径。→ 待核验(09-27)
10. **商户线发送 API 参数**：`eleme.order.* / eleme.user.* / eleme.ticket.*` 等 apilist 全文（含计费 L1/基础/限免口径）。→ 待核验(09-27)
11. **准入链路全文**：`[摘录]` 入驻 PDF 称"商家账号（自研）/开发者账号（多商家）两类登录；资质认证后提交审核；开发者应用须填正式回调地址；审核约 3 工作日；连锁店总账号授权、层级变更解绑重授"——摘录级，需控制台流程页复核；服务市场订购关系与商户授权差异亦未核实。→ 待核验(09-27)
12. **官方 SDK 本体**：`me.ele.openapi:eleme-openapi-sdk`（Maven 存在，scm 指向官方 coding.net 仓）内容、`Config/Token/OAuthClient/ShopService` 用法、签名实现原文。→ 待核验(09-27)
13. **蜂鸟配送线**：`open.ele.me` 文档体系与本库两线关系。→ 待核验(09-27)
14. **文档时效**：用户线 faas 文档页脚"最后更新于 2019-03-22"，商户线已更名"淘宝闪购服务商平台"（`©ele.me 2026`）；用户线推送口径是否为现行有效（商户线是否已替代）需官方确认。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"饿了么（用户线）推订单状态"：`POST`（form 或 JSON，H5 线为 `application/x-www-form-urlencoded`）字段 `{push_action: 2, eleme_order_id, tp_order_id, new_status, extra, created_at}`，成功回 `HTTP 200 + {"message": "ok"}`；无 challenge、无加密；验签按 §4.1 SHA1 同构实现（字段级以 §7.7 为限，模拟器侧可配置 secret 参与方式）。
- 模拟退单/配送/赔偿：分别用 §5.4 / §5.3 / §5.5 载荷；`status_code` 1–9、`role` 1/2/3/4/5/8、`state_code` 1–8、`compensate action` 0/1。
- ID 形态：`eleme_order_id` 纯数字字符串（如 `12637645858619059`）；`tp_order_id` 第三方自定；时间 `created_at/update_at` 为**秒级**字符串或数字（官方示例混用，照录）。
- 重试语义：失败重推（间隔次数未知，模拟器默认可配指数退避并标注待核验）；官方无幂等键声明，模拟器按 `eleme_order_id + push_action/new_status` 去重并在文档中声明为模拟器约定。
- 商户线模拟（`app_key` 包络、`type` 数字体系、MD5 签名、OAuth token）：**暂不实现**，待 §7.1–7.5 核验后再议；如需占位，仅按 `[摘录]` 包络字段名搭建空壳并打标待核验。
- 与飞书库的关键差异：饿了么无事件订阅握手、无 `event_id`、无 AES、无长连接；成功语义是 body 内容判定而非仅状态码。
