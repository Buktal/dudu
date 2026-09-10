# 拼多多开放平台 消息推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 `open.pinduoduo.com`（本体为 SPA，仅回 `You need to enable JavaScript to run this app.` JS 壳，无正文——方法学同 `taobao.md` 注记）+ WebSearch 官方站内页面原文摘录（标注 `[摘录]`）。
> 标注约定：`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；无标注 = 门户级公开事实（首页/控制台导航原文）；`待核验(09-27)` = 未能取得官方原文，需复核。
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文，如 `client_id: 1`、`testSecret`）。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.pinduoduo.com/
- 开发者控制台（应用管理、授权管理、SDK 下载、消息服务）：https://open.pinduoduo.com/application/app/list（`[摘录]` 多多客文档页原文"【拼多多开放平台—开放管理—应用管理】…开放网址：https://open.pinduoduo.com/application/app/list"）
- 文档中心（SPA 目录树，基础文档/多多云文档/开放业务/运营规范/服务市场/常用工具/FAQ）：https://open.pinduoduo.com/application/document/browse
- API 网关（正式环境，http 已不允许调用）：`https://gw-api.pinduoduo.com/api/router`（`[摘录]` API 调用详解页）
- API 文档单页形态：`https://open.pinduoduo.com/application/document/api?id=<type>`，如 `?id=pdd.open.msg.service.send.msg`、`?id=pdd.order.number.list.increment.get`、`?id=pdd.cloud.isv.page.code`
- 技术支持：咨询服务号、工单（`[摘录]` 门户首页"高效的对接服务，提供咨询服务号、工单等多种渠道的技术支持"）

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| API 调用详解（网关/公共参数/MD5 签名/完整示例） | https://open.pinduoduo.com/application/document/browse?idStr=8EC06C399636041E | `[摘录]` 全文级摘录（更新时间 2020-12-24） |
| 授权说明（`pdd.pop.auth.token.create` 取 access_token） | https://open.pinduoduo.com/application/document/browse?idStr=BD3A776A4D41D5F5 | `[摘录]`（更新 2025-12-12） |
| 消息推送使用指南（主动推送定义/`pdd.pmc.user.permit`/`cancel`） | https://open.pinduoduo.com/application/document/browse?idStr=D3B6DBF3A5CB57E5 | `[摘录]`（更新 2026-01-15） |
| 订单接入方案（历史同步+消息推送+详情三段式） | https://open.pinduoduo.com/application/document/browse?idStr=ACD8CDA5CA04B827 | `[摘录]`（更新 2021-02-22） |
| 订单基础介绍（两种获取方式/订单状态 1-2-3） | https://open.pinduoduo.com/application/document/browse?idStr=10388E8ACD79B689 | `[摘录]`（更新 2021-08-30） |
| 售后接入说明（售后单模型/`after_sales_status` 部分状态值） | https://open.pinduoduo.com/application/document/browse?idStr=D6BA70A443D1C94F | `[摘录]`（更新 2021-05-28） |
| SDK 使用指南（控制台开发者工具生成 SDK） | https://open.pinduoduo.com/application/document/browse?idStr=7E28519022C8E799 | `[摘录]`（标题+首段，更新 2022-03-24） |
| 新手指南（注册/6 种角色/企业 ERP 等准入） | https://open.pinduoduo.com/application/document/browse?idStr=04DD98845AD2977D | `[摘录]`（更新 2025-12-12） |
| 审核订单说明 | https://open.pinduoduo.com/application/document/browse?idStr=697D8F2EC5A48FEA | `[摘录]`（更新 2025-03-17） |
| 商品发布说明（类目/运费模板/服务承诺校验） | https://open.pinduoduo.com/application/document/browse?idStr=EF2DB30A2A9C8FD7 | `[摘录]`（更新 2023-06-18） |
| 短信服务接入指南（`pdd.open.msg.service.*` 三接口） | https://open.pinduoduo.com/application/document/browse?idStr=74D221BBF6D69EA5 | `[摘录]` |
| 客服平台使用文档（单设备登录口径） | https://open.pinduoduo.com/application/document/browse?idStr=E76274EF14674199 | `[摘录]` |
| 第三方 IT 工具（电商软件服务商）入驻指南 | https://open.pinduoduo.com/application/document/browse?idStr=F4347B03A414B83F | `[摘录]`（更新 2020-12-06） |
| 方舟 ERP-自研数据传输场景接入指南 | https://open.pinduoduo.com/application/document/browse?idStr=1E4B7F919EC480E8 | `[摘录]`（更新 2025-10-19） |
| 用户授权介绍（OAuth2.0 双方式取 Access_Token） | https://mai.pinduoduo.com/autopage/83_static_3/index.html | `[摘录]`（2018-05-20，POP 协议页） |
| POP 协议签名页（参数排序+拼接+MD5 大写三步） | https://mai.pinduoduo.com/autopage/84_static_9/index.html | `[摘录]` |
| ERP 接入总览（订单/商品/物流/售后/发票 API 清单） | https://open.pinduoduo.com/application/document/doc?docReference=application_ERP | `[摘录]` |

---

## 2. 消息/事件推送全清单

推送模型总述（`[摘录]` 消息推送使用指南页，2026-01-15 更新，照录）："消息服务是拼多多开放平台为了提高API访问效率的一种主动推送服务。不同于以往轮询访问API，当订阅的服务有新的消息后会主动进行推送"。

订阅授权模型（`[摘录]` 同页，接口名未经 primary 全文复核，待核验(09-27)；仅 PMC 通道存在经 SDK 旁证）："如果服务商订阅了新的消息内容，需要重新调用 `pdd.pmc.user.permit` 接口给用户开通消息。取消用户订阅关系时，需要调用 `pdd.pmc.user.cancel` 接口。"

### 2.1 订单类（推送 + API 三段式，`[摘录]` 接入方案页）

官方推荐链路（照录）："通过消息推送服务客户端实时监听订单变更消息，再通过 `pdd.order.information.get` 订单详情接口获取订单信息"；"新用户接入使用 `pdd.order.list.get` 同步历史订单（至多可获取90天内订单）"。

| 接口 | 用途（官方描述） | 出处 |
|---|---|---|
| `pdd.order.list.get` | 按成交时间查订单；单次入参成交时间区间可达 24 小时；限流较大，仅建议接入新用户同步 90 天历史订单 | `[摘录]` 接入方案页 |
| `pdd.order.number.list.increment.get` | 按订单更新时间取增量（所有变动订单）；单次入参更新时间区间 30 分钟；承载强于列表接口，建议实时获取当前订单 | `[摘录]` 同页 |
| `pdd.order.information.get` | 按订单号取单笔详情；已知订单号时用，配合消息推送使用 | `[摘录]` 同页 |
| `pdd.order.status.get` | 查单个订单状态 | `[摘录]` ERP 总览页 |
| 订单同步服务（多多云云数据库推送，推荐） | "可以将订单等重要数据实时、准确地推送到服务商与商家的多多云数据库中"；订单基础介绍页列为两种获取方式之一（"推荐使用"），字段与订单 API 相同 | `[摘录]` ERP 总览页 + 订单基础介绍页 |

订单状态口径（`[摘录]` 订单基础介绍页，照录；primary 页 SPA 不可直抓，引文经次级逐字镜像 + 参数表交叉收敛）："目前仅支持获取已成交订单，即成交状态 `confirm_status=1`：已成交"；"第一步：已成交…订单状态：1-待发货；第二步：卖家发货，订单状态：2-已发货代签收；第三步：消费者确认收货，订单状态：3-已签收"。

### 2.2 售后类（`[摘录]` 售后接入说明页）

- 模型（照录）："从买家发起售后申请开始，系统会为该订单生成一个售后单，根据此售后单可以持续跟踪售后详情。"
- 轮询方案（照录）："使用 `pdd.refund.list.increment.get` 售后列表接口实时获取店铺新增或发生更新的售后单…单次入参时间间隔较短为 30 分钟，在使用时需要定时轮询"。
- 部分 `after_sales_status` 值（照录，同意退款接口可用状态）："【2】买家申请退款，待商家处理；【3】退货退款，待商家处理；【6】驳回退款…"（全表待核验(09-27)）。
- 退货入库链路（照录）："用户申请退货退款场景，商家同意退货→用户退回货品回传退货物流单号→商家收到退货确认入库后调用此接口告知平台退货入库成功"。

### 2.3 商品类（`[摘录]` ERP 总览页《商品接入场景》）

| 接口 | 用途（官方描述） |
|---|---|
| `pdd.goods.information.update` | 完整编辑所有商品信息 |
| `pdd.goods.sale.status.set` | 修改商品上下架状态 |
| `pdd.delete.goods.commit` | 删除商品，只能删除下架的商品 |
| `pdd.goods.quantity.update` | 改库存（专项接口之一） |
| `pdd.goods.sku.price.update` | 改价格（专项接口之一） |
| `pdd.goods.authorization.cats` / `pdd.goods.cats.get` | 取可发布类目（叶子类目循环取）/标准类目映射 |
| `pdd.goods.logistics.template.get` | 商品运费模板 |

商品变更消息 topic 名与载荷 → 待核验(09-27)（消息推送指南页仅证实订阅/permit 机制，未摘到 topic 目录）。

### 2.4 物流发货类（`[摘录]` ERP 总览页《物流发货》）

1. 通过订单 API 取"所有待发货且无售后或售后关闭的订单"；2. `pdd.logistics.companies.get` 取快递公司编号；3. `pdd.refund.address.list.get` 取退货地址 id；4. `pdd.logistics.online.send` 发货，"调用发货接口之后订单状态变更为'已发货'"。

### 2.5 客服类（应用外发客服消息无公开 API 证据）

- 客服平台使用文档（`[摘录]`，照录）："客服平台可以在多台设备上登录吗？不可以呢，同一账号可以在不同设备登录开放平台，但是进入客服平台只能为一个账号"——即客服工作台为单点登录人工台，非开放消息通道。
- 商家服务商角色含"客服外包…为商家提供售前/售后客服服务"（`[摘录]` 门户首页），属人工服务类目，非 API。
- `KNOCK使用指南` 为基础文档目录独立条目（与客服平台使用文档并列），正文未摘到 → 待核验(09-27)（注意：非美国 Knock 公司产品）。
- PDD 客服消息（消费者↔商家聊天）开放收发接口 → 待核验(09-27)（本次未在官方站摘到任何客服消息 API；第三方自动化均走商家后台模拟登录，非官方通道）。

### 2.6 发送类 API（短信服务，`[摘录]` 短信服务接入指南页）

| 接口 | 用途（官方描述） |
|---|---|
| `pdd.open.msg.service.send.msg` | 短信发送接口（单发；API 文档单页存在，入参正文未摘到 → 待核验(09-27)） |
| `pdd.open.msg.service.send.batch.msg` | 批量发送短信，"至多支持 1000 个手机号"（`phone_numbers` 列表） |
| `pdd.open.msg.service.query.msg.record` | 按发送日期及手机号码查询短信发送记录 |

---

## 3. 回调机制

### 3.1 订阅—推送模型（`[摘录]` 消息推送使用指南页）

- 主动推送替代轮询（§2 总述照录）；消费端形态为"消息推送服务客户端实时监听"（`[摘录]` 订单接入方案页）——即官方提供推送客户端（SDK/客户端形态），非裸 Webhook 回调地址（回调 URL 配置、challenge 握手、HTTP 方法/头字段 → 待核验(09-27)）。
- 用户级开通：`pdd.pmc.user.permit`（开通）、`pdd.pmc.user.cancel`（取消）；新增订阅内容须重新 permit（§2 照录）。
- 标准消费三段式：① `pdd.order.list.get` 补历史（90 天）→ ②推送客户端监听变更 → ③ `pdd.order.information.get` 拉详情（`[摘录]` 接入方案页"方案一/方案二"）。

### 3.2 备选实时通道：订单同步服务（`[摘录]`）

多多云云数据库推送订单数据（字段同订单 API），官方标"推荐使用"；对接方案见《订单同步服务》（`idStr=098A2CBA3F76DFAD`，正文未摘到 → 待核验(09-27)）。另多多云含 DTS 数据传输服务、OSS、Solr（`[摘录]` 多多云目录页）。

### 3.3 重试、幂等、有序 → 待核验(09-27)

推送失败重试间隔/次数、去重键、是否有序，均未在官方站摘到原文。模拟器实现时按"收到变更即按订单号拉详情，以详情为准做幂等"（三段式天然幂等）处理，并标待核验。

---

## 4. 验签与加密算法

### 4.1 请求签名（MD5 唯一算法，`[摘录]` API 调用详解页逐字）

步骤（照录）："本次请求中所有请求参数（包含公共参数与业务参数）进行首字母以 ASCII 方式升序排列（ASCII ASC），对于相同字母则使用下个字母做二次排序…排序后的结果按照参数名（key）参数值（value）的次序进行字符串拼接，拼接处不包含任何字符…在该长串的头部及尾部分别拼接 `client_secret`…最后对签名字符串，使用 MD5 算法加密后，得到的 MD5 加密密文后转为大写，即为 sign 值。"

即：`sign = UPPER(MD5(client_secret + k1+v1 + k2+v2 + … + client_secret))`。POP 协议页互证（`[摘录]` 照录）："1-所有参数进行按照首字母先后顺序排列 · 2-把排序后的结果按照参数名+参数值的方式拼接 · 3-拼装好的字符串首尾拼接 client_secret 进行 md5 加密后转大写"。

公共参数（`[摘录]` 同页表格，照录）：

| 参数 | 类型 | 必须 | 描述 |
|---|---|---|---|
| `type` | string | 是 | API 接口名，形如 `pdd.*` |
| `client_id` | string | 是 | 已创建成功的应用标志，可在应用详情中查看 |
| `timestamp` | string | 是 | 时间戳，UNIX 时间（秒） |
| `sign` | string | 是 | 签名（上算法） |
| `data_type` | string | 否 | 返回格式 XML/JSON，默认 JSON |
| `access_token` | string | 否 | 用户授权令牌，经 `pdd.pop.auth.token.create` 获取 |
| `version` | string | 否 | API 版本，默认 V1 |

请求：`POST https://gw-api.pinduoduo.com/api/router`，头 `Content-Type: application/json`（`[摘录]` 调用示例节）。

### 4.2 敏感数据加密（`[摘录]`，细则待核验）

- 订单收件人信息为密文（`[摘录]` ERP 总览 FAQ 照录）："为了提高数据安全，对从平台获取的敏感数据进行加密…加解密改造请参阅开放平台文档'安全保障'部分"。
- 基础文档目录含安全保障四件套：加密接入流程/数据加密说明/算法简介/加密接口及字段说明 + 加密数据检索方案变更说明/解密相关接口/解密接口限流策略/前端解密规范 → 全文待核验(09-27)。
- 方舟目录含"签名与验签机制说明"（场景回调验签疑似落点）→ 全文待核验(09-27)。

---

## 5. 示例载荷原文（逐字）

### 5.1 签名示例（`[摘录]` API 调用详解页，逐字）

输入参数：`access_token=asd78172s8ds9a921j9qqwda12312w1w21211`、`client_id=1`、`data_type=XML`、`type=pdd.order.number.list.get`、`timestamp=1480411125`、`order_status=1`、`page=1`、`page_size=10`；`client_secret=testSecret`。

签名字符串（头尾拼接，无缝连接）：

```text
testSecretaccess_tokenasd78172s8ds9a921j9qqwda12312w1w21211client_id1data_typeXMLorder_status1page1page_size10timestamp1480411125typepdd.order.number.list.gettestSecret
```

```text
UPPER_CASE(MD5(testSecretaccess_tokenasd78172s8ds9a921j9qqwda12312w1w21211client_id1data_typeXMLorder_status1page1page_size10timestamp1480411125typepdd.order.number.list.gettestSecret)) => E4DE3ED21002510DED352819E7AE6775
```

可作签名回归向量（`sign=E4DE3ED21002510DED352819E7AE6775`）。

请求 body（`[摘录]` 同页 JSON 示例，逐字）：

```json
{
  "type": "pdd.order.number.list.get",
  "sign": "E4DE3ED21002510DED352819E7AE6775",
  "client_id": "1",
  "page": 1,
  "page_size": 10,
  "data_type": "XML",
  "timestamp": 1480411125,
  "order_status": 1,
  "access_token": "asd78172s8ds9a921j9qqwda12312w1w21211"
}
```

### 5.2 推送订阅开/关（`[摘录]` 消息推送使用指南页，接口名实锤）

```text
pdd.pmc.user.permit   # 给用户开通消息（新订阅内容需重新调用）
pdd.pmc.user.cancel   # 取消用户订阅关系
```

入参/响应正文 → 待核验(09-27)。

### 5.3 订单状态三步（`[摘录]` 订单基础介绍页，照录）

```text
confirm_status=1（已成交）→ 1-待发货 → 2-已发货代签收 → 3-已签收（消费者确认收货）
```

### 5.4 售后状态片段（`[摘录]` 售后接入说明页，照录）

```text
after_sales_status: 【2】买家申请退款待商家处理 / 【3】退货退款待商家处理 / 【6】驳回退款…
```

### 5.5 短信三接口（`[摘录]` 短信服务接入指南页，照录）

```text
pdd.open.msg.service.send.msg          # 短信发送
pdd.open.msg.service.send.batch.msg    # 批量发送，至多 1000 个手机号（phone_numbers 列表）
pdd.open.msg.service.query.msg.record  # 按发送日期+手机号查发送记录
```

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `client_id` / `client_secret` | 创建应用即得（应用详情查看）；参与每次请求签名（头尾拼接） | 长期有效；`secret` 泄漏即伪造签名 | `[摘录]` API 调用详解页 |
| `access_token` | 经 `pdd.pop.auth.token.create` 获取（调用方式同普通 API，也需签名） | 注意事项页存在但正文未摘到 → 有效期/刷新待核验(09-27) | `[摘录]` API 调用详解页公共参数表 + 授权说明页 |
| OAuth2 授权（code→token） | 商家在授权页点击授权后，平台返回 `code` 到应用回调地址（应用管理中配置）；凭 `code` 换 `access_token` | 国际通用 OAuth2.0 标准协议，支持两种方式获取 Access_Token（细则未摘到 → 待核验(09-27)） | `[摘录]` 旺店通转述官方流程 + `mai.pinduoduo.com` 用户授权介绍页 |
| 自研商家测试授权 | 应用详情—授权管理页配置 `pdd` 开头店铺账号（店铺后台右上角账号管理查看），再经接口授权取该店 `access_token` | 测试链路 | `[摘录]` ERP 总览页 |
| 服务商线上授权 | 商家在服务市场订购服务，点击"去使用-授权登录"，服务商即得商家 `access_token` | 线上链路 | `[摘录]` 方舟 ERP-自研指南页通用参数节 |
| 调用传参 | `access_token` 作普通业务参数放入签名参数集，随 body 发送（非 Authorization 头） | 见 §5.1 示例 | `[摘录]` API 调用详解页 |
| `refresh_token` | 第三方 SDK 称"官方刷新令牌功能暂时无效，token 失效就重新授权" | 非官方说法，不采信 → 待核验(09-27) | 第三方（asialong/pinduoduo-sdk README），仅作线索 |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **消息 topic 目录与消息体**：订单/售后/商品各 topic 精确名、触发场景表、推送载荷字段（对标淘宝 `taobao_trade_*` 类目表）。→ 待核验(09-27)
2. **推送传输形态**：推送客户端（SDK/长连接？）协议细节；是否有裸 Webhook 回调 URL 配置、challenge 握手、推送签名头。→ 待核验(09-27)
3. **重试/幂等/有序**：失败重试间隔次数、去重键、是否保序。→ 待核验(09-27)
4. **订单同步服务全文**：`idStr=098A2CBA3F76DFAD`（表结构、延迟、费用）。→ 待核验(09-27)
5. **售后状态全表**：`after_sales_status` 枚举 + 售后状态流转逻辑页全文。→ 待核验(09-27)
6. **客服消息开放性**：消费者—商家聊天消息有无开放收发 API；KNOCK 使用指南正文；`pdd.open.msg.service.send.msg` 入参正文。→ 待核验(09-27)
7. **授权细则全文**：授权说明页（两种 OAuth 方式、`pdd.pop.auth.token.create` 入参、`access_token` 有效期/刷新/过期码）。→ 待核验(09-27)
8. **安全保障全文**：数据加密说明/算法简介/解密接口/解密限流/前端解密规范；方舟签名与验签机制说明。→ 待核验(09-27)
9. **限流与费用**：API QPS/限流码、费用中心说明（短信是否计费）、服务市场保证金。→ 待核验(09-27)
10. **入云强制口径**：敏感信息接口是否仅限云内调用（第三方 IT 工具页有"部署入云"流程，强制范围未摘到）。→ 待核验(09-27)
11. **SDK 语言矩阵**：控制台"生成 SDK"支持语言（仅有流程首段摘录）。→ 待核验(09-27)
12. **准入链路**：六角色认证细则、企业经营范围/保证金/违规联查（第三方 IT 工具页有摘录，服务市场管理规范未摘）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"PDD 推订单变更"：优先模拟三段式中的②→③——先推轻量变更通知（含订单号），期望消费方调 `pdd.order.information.get` 拉详情；详情状态机按 `1-待发货→2-已发货→3-已签收`（`confirm_status=1` 前提）。
- 模拟 API 网关：`POST https://gw-api.pinduoduo.com/api/router`，`Content-Type: application/json`，body 含 `type/client_id/timestamp/sign/data_type/access_token?/业务参数`；验签用 `UPPER(MD5(secret+kv拼接+secret))`，回归向量 `E4DE3ED21002510DED352819E7AE6775`（§5.1）。
- 模拟订阅关系：`pdd.pmc.user.permit` 开通 / `pdd.pmc.user.cancel` 取消；新增订阅内容要重新 permit（可做状态机约束）。
- 模拟售后：售后单模型（买家申请→售后单→跟踪处理）；`pdd.refund.list.increment.get` 30 分钟轮询窗口；`after_sales_status` 2/3/6 仅为片段，全表待补。
- 模拟发送：短信三接口（批量上限 1000 手机号；记录查询按日期+手机号）；**不要模拟客服聊天消息下发**（无官方依据）。
- 凭证形态：`client_id` 应用标识；`access_token` 放 body 参数参与签名（非 Bearer 头，与飞书/淘宝均不同）；自研测试用 `pdd` 开头店铺账号。
