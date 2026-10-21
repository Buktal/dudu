# 淘宝/天猫开放平台（含千牛客服）消息推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓官方文档镜像站全文（`developer.alibaba.com`、`open.alitrip.com`、`open.fliggy.com`，均为阿里 TOP 文档体系官方域）+ WebSearch `open.taobao.com` 官方页面原文摘录（标注 `[摘录]`）
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`[镜像全文]` = 官方镜像域（developer.alibaba.com / open.alitrip.com / open.fliggy.com）全文，与 open.taobao.com 同源文档体系；`待核验(09-27)` = 未能取得官方原文，需复核
> 方法学注记：`open.taobao.com/doc.htm?...` 本体为 SPA（WebFetch 仅回 JS 壳、无正文），其内容以 `[摘录]` + `[镜像全文]` 互证；`developer.alibaba.com/docs/...` 为同一文档体系的可抓取镜像（页眉即"淘宝开放平台 - 文档中心"）
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文）

## 1. 官方文档入口与关键页面地址

- 门户：https://open.taobao.com/
- 开发者控制台：http://my.open.taobao.com/（应用管理、SDK 下载、消息服务、运维工具）
- 文档中心：https://open.taobao.com/doc/index.htm
- 消息文档（TMC topic 目录）：https://open.taobao.com/tmc.htm
- 消息类目树（`[镜像全文]` 同源）：https://developer.alibaba.com/docs/topic_list.htm
- 消息服务使用介绍（From淘宝/To淘宝、长连接/API/MQ 三方式、分组、重试）：https://open.taobao.com/doc.htm?docId=101663&docType=1（`[镜像全文]` https://open.alitrip.com/docs/doc.htm?articleId=101663&docType=1&treeId=1，更新 2026-08-28）
- TOP-SDK 使用说明（含 TMC 长连接示例、服务地址表）：https://open.taobao.com/doc.htm?docId=101618&docType=1（`[镜像全文]` https://open.alitrip.com/docs/doc.htm?articleId=101618&docType=1&treeId=1，更新 2026-06-26）
- API 调用方式/公共参数/签名算法（三算法 md5/hmac/hmac-sha256）：https://open.taobao.com/doc.htm?docId=101617&docType=1（`[镜像全文]` https://developer.alibaba.com/docs/doc.htm?articleId=101617&docType=1，更新 2026-04-24）
- 用户授权介绍（OAuth2 code→access_token/sessionkey）：https://open.taobao.com/doc.htm?docId=102635&docType=1（`[镜像全文]` https://open.alitrip.com/docs/doc.htm?articleId=102635&docType=1&treeId=1，更新 2024-09-25）
- 千牛开放业务（插件应用、AppKey/AppSecret、审核上架）：https://open.taobao.com/businessDetail.htm?tagId=79（`[摘录]`）
- 千牛工作台：https://qn.taobao.com/
- OAuth 授权入口（正式）：https://oauth.taobao.com/authorize ／ 换 token：https://oauth.taobao.com/token（`[摘录]` docId=102635；code 有效期 30 分钟）
- API 网关：正式 `http://gw.api.taobao.com/router/rest` ／ HTTPS `https://eco.taobao.com/router/rest`；海外 `http://api.taobao.com/router/rest`（`[镜像全文]` https://open.fliggy.com/docs/doc.htm?articleId=108101&docType=1&treeId=502）。注：101617（2026/04）简写正式 `https://gw…`/海外 `https://api…`（https-first）；101618 服务地址表为 `http://gw…`＋`https://eco…`，均为官方原文，按栈区分引用
- TMC 长连接地址：`ws://mc.api.taobao.com/`（生产），预发 `ws://premc.api.taobao.com/`（`[摘录]` docId=101663；`[摘录]` docId=101618）
- 收费规则（API/数据同步/瓦力）：https://open.alitrip.com/docs/doc.htm?articleId=104559&docType=1&treeId=23（`[摘录]`，TOP 收费细则官方页）

本次实际抓到并核实的页面清单

| 主题 | URL | 核验方式 |
|---|---|---|
| 交易消息类目全表（taobao_trade_* 27 个） | https://developer.alibaba.com/docs/topic_list.htm?cid=101 | WebFetch 全文 |
| 退款消息类目全表（taobao_refund_*/retrieve_* 15 个） | https://developer.alibaba.com/docs/topic_list.htm?cid=102 | WebFetch 全文 |
| 商品消息类目全表（taobao_item_* 14 个） | https://developer.alibaba.com/docs/topic_list.htm?cid=103 | WebFetch 全文 |
| OpenIM 消息类目（taobao_openim_OffMsgPush） | https://developer.alibaba.com/docs/topic_list.htm?cid=233 | WebFetch 全文 |
| taobao_trade_TradeCreate 字段+示例 | https://developer.alibaba.com/docs/topicDetail.htm?apiId=101 | WebFetch 全文 |
| taobao_refund_RefundCreated 字段+示例 | https://developer.alibaba.com/docs/topicDetail.htm?apiId=118 | WebFetch 全文 |
| taobao_item_ItemAdd 字段+示例 | https://developer.alibaba.com/docs/topicDetail.htm?apiId=128 | WebFetch 全文 |
| 千牛接口类目（含 jindoucloud/tpn/qianniu/cloudkefu/bcpush） | https://developer.alibaba.com/docs/api.htm?apiId=22593 | WebFetch 全文（列表+taobao.qianniu.task.message.send 全文） |
| 全球栈 HTTP 接收消息（回调/重试/签名/正逆向示例） | https://open.alitrip.com/docs/doc.htm?articleId=119493&docType=1&treeId=735 | WebFetch 全文 |
| 全球栈配置消息服务（回调 URL+Verify+订阅） | https://open.alitrip.com/docs/doc.htm?articleId=119404&docType=1&treeId=735 | WebFetch 全文 |
| TOP API 调用（网关/公共参数/md5+hmac签名/Java+C#示例） | https://open.fliggy.com/docs/doc.htm?articleId=108101&docType=1&treeId=502 | WebFetch 全文 |
| TOP 用户授权（OAuth2 双流程/access_token/refresh） | https://open.fliggy.com/docs/doc.htm?articleId=108103&docType=1&treeId=502 | WebFetch 全文 |
| TMC API 双接口消费/确认（consume+confirm 代码） | https://developer.alibaba.com/docs/doc.htm?articleId=103623&docType=1&treeId=74 | `[摘录]` |
| 签名三算法+错误码表（25/26/27/28/29） | https://open.taobao.com/doc.htm?docId=101617&docType=1 ／ 镜像 https://developer.alibaba.com/docs/doc.htm?articleId=101617&docType=1 | `[摘录]` |
| 国内 OAuth（code 30min/sessionkey/安全等级） | https://open.alitrip.com/docs/doc.htm?articleId=102635&docType=1&treeId=1 | `[摘录]` |
| taobao.top.auth.token.create | https://open.taobao.com/api.htm?docId=25388&docType=2 | `[摘录]`（获取 Access Token） |
| taobao.top.auth.token.refresh | https://developer.alibaba.com/docs/api.htm?apiId=25387 | `[镜像全文]`（刷新 Access Token；正文“只有服务市场订购类应用可以刷新”，w2 不可刷新须重授权） |
| taobao.tmc.user.permit（开通用户消息） | https://open.taobao.com/en/api.htm?docId=21990&docType=2 | `[摘录]` |
| 千牛 TPN 系统消息发送（topic/NotifyMessage/订阅） | https://open.alitrip.com/docs/doc.htm?articleId=102422&docType=1&treeId=330 | `[摘录]` |

---

## 2. 消息/事件推送全清单

推送模型总述（`[摘录]` https://open.taobao.com/doc.htm?docId=101663&docType=1 ）：消息服务是"开放平台为提高应用API调用效率而推出的一种主动推送服务（From淘宝），推送内容包括（淘宝交易、商品、退款等信息）"；同时提供"消息回流服务（To淘宝）"。From淘宝=淘宝（含天猫）向外推交易/商品/退款等官方消息；To淘宝=向淘宝回流消息（如商品数源服务，topic 需内部二方申请创建，`taobao.tmc.message.produce` 发布）

授权模型（`[摘录]` 同页 + topicDetail 页"需要授权"标）：三类消息——①广播消息：消费者下单等操作产生的广播消息，需要卖家用户授权 appkey 且 appkey 添加卖家用户到分组；②点对点消息：appkey 与内部应用沟通场景后由内部应用定向发送；③回流消息。各 topicDetail 页标"推送消息"+"需要授权（通过 taobao.tmc.user.permit 接口开通用户授权）"即属①

### 2.1 交易类（cid=101，`[镜像全文]` topic_list.htm?cid=101，均为 From淘宝）

| topic | 触发语义（官方描述） | 出处 |
|---|---|---|
| `taobao_trade_TradeCreate` | 创建淘宝交易消息（买家 PC/手机端下单；同时会发 TradeAlipayCreate） | topicDetail apiId=101 全文 |
| `taobao_trade_TradeModifyFee` | 修改交易费用消息 | 类目表全文 |
| `taobao_trade_TradeCloseAndModifyDetailOrder` | 关闭或修改子订单消息 | 类目表全文 |
| `taobao_trade_TradeClose` | 关闭交易消息 | 类目表全文 |
| `taobao_trade_TradeBuyerPay` | 买家付完款，或万人团买家付完尾款 | 类目表全文 |
| `taobao_trade_TradeSellerShip` | 卖家发货消息 | 类目表全文 |
| `taobao_trade_TradeDelayConfirmPay` | 延长收货时间消息 | 类目表全文 |
| `taobao_trade_TradePartlyRefund` | 子订单退款成功消息 | 类目表全文 |
| `taobao_trade_TradePartlyConfirmPay` | 子订单打款成功消息 | 类目表全文 |
| `taobao_trade_TradeSuccess` | 交易成功消息 | 类目表全文 |
| `taobao_trade_TradeTimeoutRemind` | 交易超时提醒消息 | 类目表全文 |
| `taobao_trade_TradeRated` | 交易评价变更消息 | 类目表全文 |
| `taobao_trade_TradeMemoModified` | 交易备注修改消息 | 类目表全文 |
| `taobao_trade_TradeLogisticsAddressChanged` | 修改交易收货地址消息 | 类目表全文 |
| `taobao_trade_TradeChanged` | 订单信息变更消息 | 类目表全文 |
| `taobao_trade_TradeAlipayCreate` | 创建支付宝订单消息 | 类目表全文 |
| `taobao_trade_TradePartlySellerShip` | 交易的部分子订单发货消息 | 类目表全文 |
| `taobao_trade_TradeBuyerStepPay` | 分阶段订单付定金 | 类目表全文 |
| `taobao_rdcaligenius_OrderMsgSend` | 订单消息 | 类目表全文 |
| `taobao_recycle_OfnPreRedPacketSync` | 同步前置补贴红包的最新数据 | 类目表全文 |
| `taobao_content_OrderPaid` | 内容开放短视频模板支付消息 | 类目表全文 |
| `taobao_fuwu_FundsChange` | 以旧换新资金变更通知消息 | 类目表全文 |
| `taobao_fuwu_RecycleFinalService` | 以旧换新取送一体服务最终决策通知 | 类目表全文 |
| `taobao_ofn_OrderStatusSync` | 以旧换新回收单状态同步 | 类目表全文 |
| `taobao_trade_OrderSkuChanged` | 修改子订单SKU成功 | 类目表全文 |
| `taobao_ofn_DifferenceRefundPay` | 消费者补贴追差付款完成通知 | 类目表全文 |
| `taobao_ofn_BindWaybillResult` | 以旧换新顺丰直连绑定结果通知（不需要授权） | 类目表全文 + `[摘录]` tmc.htm |

- status 字段口径（`[摘录]` docId=101663 第 7 条，照录）："交易类 taobao_trade_xxx 消息体里面的状态字段 status……是指支付状态；支付状态只有有限的付款相关状态枚举值 [等待付款(未付款), 等待卖家发货(已付款), 交易成功(确认收货), 交易关闭(退款完成)], 没有已发货的状态；具体请以 api 核查订单详情, 物流详情为准"

### 2.2 退款类（cid=102，`[镜像全文]` topic_list.htm?cid=102，均为 From淘宝）

| topic | 触发语义（官方描述） | 出处 |
|---|---|---|
| `taobao_refund_RefundCreated` | 退款创建消息（买家"已买到的宝贝"点申请退款；同时产生 RefundCreateMessage 留言消息） | topicDetail apiId=118 全文 |
| `taobao_refund_RefundSellerAgreeAgreement` | 卖家同意退款协议消息 | 类目表全文 |
| `taobao_refund_RefundSellerRefuseAgreement` | 卖家拒绝退款协议消息 | 类目表全文 |
| `taobao_refund_RefundBuyerModifyAgreement` | 买家修改退款协议消息 | 类目表全文 |
| `taobao_refund_RefundBuyerReturnGoods` | 买家退货给卖家消息 | 类目表全文 |
| `taobao_refund_RefundCreateMessage` | 发表退款留言消息 | 类目表全文 |
| `taobao_refund_RefundBlockMessage` | 屏蔽退款留言消息-无此消息 | 类目表全文 |
| `taobao_refund_RefundClosed` | 退款关闭消息 | 类目表全文 |
| `taobao_refund_RefundSuccess` | 退款成功消息 | 类目表全文 |
| `taobao_refund_TaobaoInterApplied` | 申请淘宝介入消息 | 类目表全文 |
| `taobao_refund_TaobaoIntervened` | 淘宝介入退款消息 | 类目表全文 |
| `taobao_refund_RefundableMarked` | 退款标记创建消息 | 类目表全文 |
| `taobao_refund_RefundableCanceled` | 退款标记取消消息 | 类目表全文 |
| `taobao_retrieve_Started` | 开始商家挽回消息 | 类目表全文 |
| `taobao_retrieve_Completed` | 商家挽回完结消息 | 类目表全文 |

### 2.3 商品类（cid=103，`[镜像全文]` topic_list.htm?cid=103，均为 From淘宝）

| topic | 触发语义（官方描述） | 出处 |
|---|---|---|
| `taobao_item_ItemAdd` | 商品新增消息（API 或页面新增均产生） | topicDetail apiId=128 全文 |
| `taobao_item_ItemUpshelf` | 商品上架消息 | 类目表全文 |
| `taobao_item_ItemDownshelf` | 商品下架消息 | 类目表全文 |
| `taobao_item_ItemDelete` | 商品删除消息 | 类目表全文 |
| `taobao_item_ItemUpdate` | 商品更新消息 | 类目表全文 |
| `taobao_item_ItemRecommendAdd` | 橱窗推荐商品消息 | 类目表全文 |
| `taobao_item_ItemZeroStock` | 商品卖空消息 | 类目表全文 |
| `taobao_item_ItemPunishDelete` | 小二删除商品消息 | 类目表全文 |
| `taobao_item_ItemPunishDownshelf` | 小二下架商品消息 | 类目表全文 |
| `taobao_item_ItemPunishCc` | 小二CC商品消息 | 类目表全文 |
| `taobao_item_ItemSkuZeroStock` | 商品SKU卖空消息 | 类目表全文 |
| `taobao_item_ItemStockChanged` | 修改商品库存消息 | 类目表全文 |
| `taobao_item_ItemRecommendDelete` | 取消橱窗推荐商品消息 | 类目表全文 |
| `taobao_shangou_StoreItemSync` | 淘宝闪购门店品发布消息 | 类目表全文 |

### 2.4 客服/聊天消息（含千牛，核心差异区）

国内 TOP **没有**"客服收到买家聊天即推 HTTP 事件"的对等机制，客服消息分四条线（均有官方出处，语义不可混淆）

1. OpenIM 离线消息 topic（cid=233，`[镜像全文]` topic_list.htm?cid=233）：全类目仅一个——`taobao_openim_OffMsgPush`（openim 离线消息推送，From淘宝）。payload 全文 → 待核验(09-27)
2. 瓦力服务（旺旺聊天消息推送，`[摘录]` 收费细则页）："开发者通过开通使用瓦力-旺旺聊天消息服务&旺旺聊天（系统）消息服务，实现将旺旺聊天消息推送给用户"；计费"0.01元/百条"，按应用每日新增聊天消息量。开通/字段口径 → 待核验(09-27)
3. 千牛 TPN/金斗云系统消息（`[镜像全文]` apiId=22593 页接口表 + `[摘录]` articleId=102422）：`taobao.jindoucloud.message.send`（发送消息接口）、`taobao.jindoucloud.message.get`（获取消息列表）、`taobao.jindoucloud.message.authorize.permit`（订阅）、`taobao.tpn.message.offline`（离线消息）、`taobao.tpn.template.message.send`（模板消息）、`taobao.qianniu.bcpush.send.subscribecard`（bc 消息下行订阅卡片）、`taobao.bcpush.isv.event.emit`（ISV 提交标准事件）。TPN 发送需按协议构造 NotifyMessage（topic 一级类目 + msgStatus 二级类目 + 唯一 bizid + customerViewData/bizData），发前需邮件申请配置 topic/打开方式（`[摘录]`）。TPN 是**卖家工作台系统消息下行**，不是买家聊天上行
4. 千牛客服工作台 API（`[镜像全文]` 同页接口表，需授权、按场景调用）：`taobao.qianniu.task.message.send`（任务提醒下行，§5.7）、`taobao.qianniu.cloudkefu.forward`（转交用户）、`taobao.qianniu.cloudkefu.dispatchgroups.get`（分流分组查询）、`taobao.qianniu.airisland.plugin.scenecard.send`（接待场景小程序卡片）、`taobao.qianniu.quickphrase.*`（快捷短语 CRUD）、`taobao.qianniu.solution.*`（知识库）、`taobao.qianniu.refund.get` / `taobao.qianniu.item.get` / `taobao.qianniu.tradeprice.checkrules`（接待侧信息查询）
5. 旺旺聊天文本 envelope 形态（`[摘录]` articleId=103623，旧 TMC 文档页残留示例，仅作形态参考）：`{"content":"文本啊啊啊","to_id":"it3d3hxlxiaomishu","nickname":"it3d3hxltest0","from_id":"it3d3hxltest0","gmt_send":"1444297001","msg_id":"6269105334747922432"}`；表情 `content` 如 `"/:^_^/:^$^/:Q/:815/:809"`。所属 topic/现行有效性 → 待核验(09-27)

### 2.5 其他域（类目存在性，`[镜像全文]` topic_list.htm，本库不展开）

淘宝分销（cid=104）、数据推送（cid=204）、平台消息（cid=206）、交易全链路（cid=207）、淘宝物流（cid=224）、天猫服务（cid=218）、客户运营平台（cid=258）等数十个类目。全量 topic 枚举以 https://open.taobao.com/tmc.htm 消息工具"消息运维工具"/topic 详情页为准 → 待核验(09-27)

---

## 3. 回调机制

### 3.1 国内 TOP：TMC 长连接 vs API 轮询 vs MQ/ONS（三选一，无 HTTP 回调）

来源：`[摘录]` https://open.taobao.com/doc.htm?docId=101663&docType=1 。**国内 TOP 消息服务没有向 ISV 服务器 POST 的 HTTP 回调**（HTTP 回调仅见于全球/Lazada/供销平台栈，见 §3.2，不可混用）

| | TMC 长连接（推荐，高性能） | API 轮询（低门槛，低实时） | MQ/ONS 订阅 |
|---|---|---|---|
| 形态 | `TmcClient` websocket 长连接监听，服务端向连接推消息 | `taobao.tmc.messages.consume` 拉 + `taobao.tmc.messages.confirm` 确认循环 | 聚石塔 MQ 中间件实例，编码接入云中间件消费 |
| 适用 | 基本所有类型消息 | "对多线程和长连接处理不方便的语言……比如 PHP、Python"（`[摘录]` articleId=103623） | 仅商品正向逆向交易等官方消息及部分支持 mq 订阅的其他消息 |
| 费用 | 消息服务权限包（数据同步按量计费见 §6） | 同左（API 调用流量有限） | 需购买聚石塔 MQ 中间件实例，存储时间自控 |
| 存储 | 最多 24 小时（TMC 订阅）；旧口径 7 天未确认删除/新口径 8–24 小时（见 §3.3） | 同左 | 由 MQ 运维控制台自行控制 |
| 接入 | `new TmcClient("app_key","app_secret","default")` + `setMessageHandler` + `connect("ws://mc.api.taobao.com/")`（`[摘录]` docId=101618） | `DefaultTaobaoClient("http://gw.api.taobao.com/router/rest","app_key","app_secret","json")`（`[摘录]`） | 产品介绍/使用页另见（URL 待核验(09-27)） |

编码消费要点（`[摘录]` docId=101663）

- 长连接：连接失败抛异常"请不要捕获，避免未连接而不知晓，第一次启动成功后，后续断开会自动重连"；环境隔离（生产 `ws://mc.api.taobao.com/`，预发 `ws://premc.api.taobao.com/`），"各个环境消息隔离但分组配置公用"；`onMessage` 抛异常或 `status.fail()` 即消息处理失败回滚、服务端重发（`[摘录]` docId=101618 Java/.NET 双示例）
- API 轮询："消息消费后，指针自动后移，下次调用自动获取到未消费过的消息，但是消费确认后的消息无法再次获取"；"建议调用 consume 接口时尽量不要并发或并发量不要太大……拉取为空时等待 1 秒以上再轮询"；实时性不高，实时要求高用 SDK 长连接
- 分组："消息分组是用户消息隔离的一种方式……推荐使用默认分组 default"；每个应用最多创建 50 个分组、每组用户数不限；"同一组的消息，随机发送到组内的某一个连接"（同组多连接为竞争消费、非广播）；等价 API：`taobao.tmc.user.permit`（开通）/`taobao.tmc.group.add`（非 default 建组）/`taobao.tmc.user.get`（校验）/`taobao.tmc.group.delete` + `taobao.tmc.user.cancel`（移除）
- topic 订阅注意（`[摘录]` en/api.htm?docId=21990 `taobao.tmc.user.permit`）："topic 覆盖更新，务必传入全量 topic，或者不传 topics，使用 appkey 订阅的所有 topic"；未订阅指定 topic 会报 `isv.need-subscribe: subscribe-topic-first`

### 3.2 全球/Lazada/供销平台栈：HTTP 回调（仅该栈，不适用于国内 TMC）

来源：`[镜像全文]` https://open.alitrip.com/docs/doc.htm?articleId=119493&docType=1&treeId=735 ＋ 配置页 https://open.alitrip.com/docs/doc.htm?articleId=119404&docType=1&treeId=735 

- 配置：APP Console → Manage → Message service → 填回调地址 → Verify（返回 HTTP 200 即验证成功）→ 勾选订阅消息 → Save
- 回调要求（逐字）："请使用 https 协议的回调地址；请使用 CA 签发的证书，需要 OV/EV 级；收到消息后请返回 HTTP 200 状态码，确认签收消息。"
- 处理规范（逐字）："请勿在收到消息的同时进行业务处理；请收到消息后，存储至待处理队列中，并返回 HTTP 200。在此之后异步消费消息；订单中仅包含必要的标识信息，业务的详细情况请使用对应的查询接口查询。"
- 重试补偿（逐字）："超过 500ms 服务端未收到 200 确认，服务端则认为消息推送失败；失败后消息会在半个小时后重试推送，最大重试 12 次；若系统中断超过 12 次重试，则请通过相关查询接口重新获取数据。"
- 数据明文传输（逐字）："数据将使用明文传输。"签名见 §4.2

### 3.3 重试、幂等、堆积（国内 TMC，`[摘录]` docId=101663）

- 未确认重发："获取消息后，如果不确认，消息服务会选择时机（约 6 分钟）重发，重发次数由消息服务控制。"
- 消费不确认的流控 three strikes（逐字转述）：① appkey 一直不消费、堆积过多（万级）或过久（半小时以上），消费流控值预期 *30%；② 消费了不确认、每间隔约 6 分钟重发一次；③ 确认比过低（20%）会自适应限制消费速率，长期如此会酌情加白禁止消费
- 保留时长："消息最多保留 8 至 24 小时（不同集群有差异），不论发没发、有没有重发，紧急情况下会进一步减少保留时间，请即时消费并正常确认消息"（旧页 `[摘录]` articleId=103623 作"7 天内未确认删除"，口径差异照录，以新页 2024-08-30 为准）
- 关系失效："订阅关系失效后，短时间（5 分钟左右）可能查出缓存关系；失效场景：取消订阅、授权过期、删除用户；失效影响：不再产生新消息，但已产生堆积仍继续推送。"
- 幂等键：TMC 信封 `msg.getId()`（confirm 用 `sMessageIds`）；业务幂等以 `tid`/`oid`（交易）、`refund_id`（退款）、`num_iid`（商品）为准；交易 `status` 只有 4 态、必须回查 API（§2.1），天然要求"通知+回查"幂等模式

---

## 4. 验签与加密算法

### 4.1 TOP API 请求签名（三算法，`[摘录]` docId=101617 + `[镜像全文]` articleId=101617）

- 可选值：`sign_method` = `hmac`（HMAC_MD5）、`md5`、`hmac-sha256`（HMAC_SHA256）
- 步骤（逐字）：1）对所有 API 请求参数（公共+业务，除去 sign 和 byte[] 参数）按参数名 ASCII 排序（如 bar:2, foo:1, foo_bar:3, foobar:4）；2）拼装 `bar2foo1foo_bar3foobar4`；3）utf-8 编码后摘要——MD5 则前后加 secret（`md5(secret+...+secret)`），HMAC_MD5 则以 secret 初始化（`hmac_md5(...)`）；4）字节流转十六进制（MD5/HMAC_MD5 为 128 位 → 固定 32 个十六进制字符；示例 `hex("helloworld")="68656C6C6F776F726C64"`）
- 公共参数（`[摘录]`）：`method` / `app_key` / `session`（可选，需授权则必传）/ `timestamp`（`yyyy-MM-dd HH:mm:ss`，GMT+8，服务端允许最大 10 分钟误差）/ `v=2.0` / `format`（xml/json，默认 xml）/ `sign_method` / `sign` / `simplify`
- 平台级错误码（`[摘录]`，照录）：21 Missing Method、22 Invalid Method、24 Missing Signature、25 Invalid Signature（先查 appsecret 再查算法）、26 Missing Session、27 Invalid Session（重授权+检查 sessionkey 与 appkey 是否匹配）、28 Missing App Key、29 Invalid App Key；另 `isv.permission-ip-whitelist-limit`（配 IP 白名单）
- Java/C# 签名示例全文见来源页（排序→拼接→md5/hmac→转大写 hex 四步，与 `[镜像全文]` open.fliggy.com articleId=108101 同文，已核验）

### 4.2 HTTP 回调签名（仅全球栈，`[镜像全文]` articleId=119493，全文逐字）

算法（逐字）："使用 AppKey 拼接请求 Body 作为消息体，以 AppSecret 作为密钥，签名加密算法为 HMAC-SHA256。"即 `Authorization = HEX_ENCODE(HMAC-SHA256(AppKey + message_body, AppSecret))`，与请求头 `Authorization` 比对。官方 Java 示例逐字

```java
public static String getSignature(String base, String secret) {
    try {
        Mac sha256Hmac = Mac.getInstance(HMAC_SHA256);
        SecretKeySpec secretKey = new SecretKeySpec(secret.getBytes(), HMAC_SHA256);
        sha256Hmac.init(secretKey);
        return byteArraytoHexString(sha256Hmac.doFinal(base.getBytes()));
    } catch (Exception e) {
        LOGGER.error("Failed to generate signature");
    }
    return null;
}
// base = {AppKey} + {messageBody}，如 "123456" + "{\"seller_id\":\"1234567\",...}"
// hex 小写（byteArraytoHexString 逐字节 %02x 拼接，toLowerCase）
```

### 4.3 无事件体加密

TMC 长连接/API 消息体为明文 JSON（content 字段即业务 JSON，见 §5）；全球栈 HTTP 回调"数据将使用明文传输"（`[镜像全文]`）。TOP 体系无飞书式 AES-256-CBC 事件加密/Encrypt Key 概念 → 模拟时不做解密层

---

## 5. 示例载荷原文（逐字）

### 5.1 TMC 长连接消费（`[摘录]` docId=101618，Java/.NET）

```java
TmcClient client = new TmcClient("app_key", "app_secret", "default");
client.setMessageHandler(new MessageHandler() {
    public void onMessage(Message message, MessageStatus status) {
        try {
            System.out.println(message.getContent());
            System.out.println(message.getTopic());
        } catch (Exception e) {
            e.printStackTrace();
            status.fail();// 消息处理失败回滚，服务端需要重发
        }
    }
});
client.connect("ws://mc.api.taobao.com/");
```

```csharp
TmcClient client = new TmcClient("app_key", "app_secret", "default");
client.OnMessage += (s, e) =>
{
    try {
        Console.WriteLine(e.Message.Content);
        Console.WriteLine(e.Message.Topic);
        // 默认不抛出异常则认为消息处理成功
    } catch (Exception exp) {
        Console.WriteLine(exp.StackTrace);
        e.Fail(); // 消息处理失败回滚，服务端需要重发
    }
};
client.Connect("ws://mc.api.taobao.com/");
```

### 5.2 API 轮询消费+确认（`[摘录]` docId=101663，Java；PHP 见 articleId=103623）

```java
TaobaoClient client = new DefaultTaobaoClient("http://gw.api.taobao.com/router/rest", "app_key", "app_secret", "json");
long quantity = 100L;
TmcMessagesConsumeRequest req = new TmcMessagesConsumeRequest();
req.setQuantity(quantity);
req.setGroupName("default");
TmcMessagesConsumeResponse rsp = client.execute(req);
for (TmcMessage msg : rsp.getMessages()) {
    System.out.println(msg.getContent());
    System.out.println(msg.getTopic());
    TmcMessagesConfirmRequest cReq = new TmcMessagesConfirmRequest();
    cReq.setGroupName("default");
    cReq.setsMessageIds(String.valueOf(msg.getId()));
    TmcMessagesConfirmResponse cRsp = client.execute(cReq);
}
```

要点：`quantity` 建议 100；空轮询等待 1 秒以上；`sMessageIds` 为逗号分隔 id 串（PHP 示例逐字：`$resp->messages->tmc_message[$i]->id` 拼接）

### 5.3 taobao_trade_TradeCreate（`[镜像全文]` topicDetail apiId=101，逐字）

```json
{
	"buyer_nick":"碎**",
	"buyer_open_uid":"AAGq5d-EAAeG3JedwSFpZMe1",
	"payment":"100.00",
	"oid":"987654321",
	"seller_nick":"麦包包",
	"type":"fixed",
	"tid":"123456789",
	"status":"TRADE_CREATE"
}
```

字段：buyer_nick（买家昵称）/ buyer_open_uid（buyer_id 加密，可对外开放，替代 buyer_nick 作唯一标识）/ oid（子订单 ID）/ payment（实付）/ seller_nick / status（交易状态）/ tid（主订单 ID）/ type（交易类型）。产生条件：买家 PC/手机端下单，同时创建支付宝订单（伴生 `taobao_trade_TradeAlipayCreate`）

### 5.4 taobao_refund_RefundCreated（`[镜像全文]` topicDetail apiId=118，逐字）

```json
{
	"buyer_nick":"碎**",
	"buyer_open_uid":"AAGq5d-EAAeG3JedwSFpZMe1",
	"refund_phase":"onsale",
	"refund_fee":"21.32",
	"bill_type":"refund_bill",
	"modified":"2000-12-30 12:32:20",
	"oid":"110770592823138",
	"seller_nick":"麦包包",
	"refund_id":"592823138",
	"tid":"110770592823138"
}
```

字段：bill_type（refund_bill/return_bill/replace_bill）/ refund_fee / refund_id / refund_phase（onsale 售中 / aftersale 售后）/ modified（yyyy-MM-dd HH:mm:ss）/ oid / tid

### 5.5 taobao_item_ItemAdd（`[镜像全文]` topicDetail apiId=128，逐字）

```json
{
	"nick":"麦包包",
	"sku_num":"12",
	"price":"4000",
	"num":"100",
	"num_iid":"12312321",
	"sku_id":"1231241231",
	"title":"Nokia N97全新行货",
	"status":"new"
}
```

### 5.6 全球栈 HTTP 回调正向/逆向示例（`[镜像全文]` articleId=119493，逐字，含官方注释）

正向（下单/付款/发货/收货）

```json
{
 "seller_id":"1234567",
 "message_type":0,
 "data":{
    "order_status":"unpaid",
    "trade_order_id":"260422900198363",
    "trade_order_line_id":"260422900298363",
    "status_update_time":1603698638
 },
 "timestamp":1603766859530,
 "site":"lazada_vn"
}
```

逆向（取消/退货退款）

```json
{
 "seller_id":"1000114855",
 "message_type":0,
 "data":{
    "order_status":"canceled",
    "reverse_order_id":"501977696648153",
    "reverse_order_line_id":"502491640048153",
    "status_update_time":1603703663,
    "trade_order_id":"252883361348153",
    "trade_order_line_id":"252883361948153"
 },
 "timestamp":1603715010436,
 "site":"lazada_vn"
}
```

请求头：`Authorization: 34f7b258df045d4ed9341850ca85b866f34828fd7d51862f11137216294a894c`（HMAC-SHA256 hex，§4.2），`Content-Type: application/json`

### 5.7 发送 API：taobao.qianniu.task.message.send（`[镜像全文]` apiId=22593，curl 逐字，公共参数齐全）

```bash
curl -X POST 'http://gw.api.taobao.com/router/rest' \
-H 'Content-Type:application/x-www-form-urlencoded;charset=utf-8' \
-d 'app_key=12129701' \
-d 'format=json' \
-d 'method=taobao.qianniu.task.message.send' \
-d 'partner_id=apidoc' \
-d 'session=d76dd8c6-5b9f-4669-8de1-cc87205723ed' \
-d 'sign=BE60749A23286AD10D6E73C641F58CDC' \
-d 'sign_method=hmac' \
-d 'timestamp=2026-09-10+23%3A10%3A24' \
-d 'v=2.0' \
-d 'metadata_id=1' \
-d 'task_id=123'
```

语义："如果 taskid 不为空，则只发给 task 对应的单个接收人；为空则发给 metadata_id 对应的所有接收人；消息会以任务消息的形式发给客户端。"响应 `{"qianniu_task_message_send_response":{"result":true}}`。Java：`client.execute(req, sessionKey)`

### 5.8 旺旺聊天消息 envelope 形态（`[摘录]` articleId=103623，仅形态参考）

```json
{"content":"文本啊啊啊","to_id":"it3d3hxlxiaomishu","nickname":"it3d3hxltest0","from_id":"it3d3hxltest0","gmt_send":"1444297001","msg_id":"6269105334747922432"}
```

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `app_key` / `app_secret` | 控制台 我的应用→应用管理→概览（`[摘录]` 授权页：client_id 即 appkey，AppSecret 同处） | 应用唯一身份；secret 参与 §4.1 签名，严禁前端暴露 | `[摘录]` articleId=102635 |
| `session` / access_token（国内） | OAuth2：拼 `https://oauth.taobao.com/authorize?response_type=code&client_id={appkey}&redirect_uri={…}&state=…&view=web` → 用户登录授权 → code 回回调地址 → `taobao.top.auth.token.create`（https only，参 code）换 access_token | code 有效期 30 分钟（`[摘录]` docId=102635）；token 有安全等级 r1/r2/w1/w2 四档过期（如 2 级应用 w2=1800s，过期后不可调 w2 级 API/字段）；`taobao.top.auth.token.refresh` 刷新（旧 refresh 作废；单 session 一天最多刷新 60 次） | `[摘录]` docId=102635 / api.htm?docId=25388 / articleId=102635 |
| 调用传参 | 公共参数 `session`（需要授权的 API 必传）+ §4.1 签名 | 时间误差 ≤10 分钟；`v=2.0` | `[摘录]` docId=101617 |
| TMC 用户开通 | `taobao.tmc.user.permit`（topics 不传=继承 appkey 全部订阅；传则覆盖更新须全量） | 需先在控制台订阅 topic，否则 `isv.need-subscribe` | `[摘录]` en/api.htm?docId=21990 |
| API 收费 | 基础 API：塔内 0.02 元/百次/appkey，塔外 0.2 元；增值 API：塔内 0.06 元，塔外 0.6 元（增值禁塔外） | 按实际调用量；免费 API 除外 | `[摘录]` 收费细则页 |
| 数据同步收费 | 每应用每日新增订单量 0.12 元/百单（含当日新增推送用户历史订单+全部推送用户当日新增；仅计淘宝/天猫主订单；商品/分销/退款不计）＋ 高级/铂金/旗舰套餐费 79/149/299 元/天 | 账单/充值：控制台 财务→费用中心→技术服务费 | `[摘录]` 收费细则页 |
| 瓦力（旺旺聊天）收费 | 每应用每日新增聊天消息量 0.01 元/百条 | 旺旺聊天消息服务 & 系统消息服务同价 | `[摘录]` 收费细则页 |
| 网关 | 正式 `gw.api.taobao.com` / `eco.taobao.com`（https）；调用量上限按应用类目（如服务市场 100 万次/天，`[镜像全文]` articleId=108101） | 测试应用限 5000 次/天+5 授权用户（同页） | `[镜像全文]` articleId=108101 |

准入链路（`[摘录]` 拼图：docId=101663 §四 + businessDetail tagId=79 + 授权页）：注册开发者→创建应用（自用/ISV；千牛插件为独立应用类型，走"创建千牛插件应用→申请开发环境→开发测试→提交审核发布上架"）→确保"消息服务"+业务权限包→控制台订阅 topic→引导卖家 OAuth 授权（自研/订购链路）→`tmc.user.permit`+分组→长连接/API 消费。正式上线企业资质、API 权限审批细节 → 待核验(09-27)

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **TMC consume 响应信封全字段**：`TmcMessage` 除 id/topic/content 外是否有 user_nick/user_id 等字段；长连接帧格式与 consume 是否同构。→ 待核验(09-27)
2. **其余 50+ topic payload 全文**：§2.1–2.3 仅 TradeCreate/RefundCreated/ItemAdd 三页全文，其余（BuyerPay/SellerShip/Success/RefundSuccess/ItemUpshelf 等）字段。→ 待核验(09-27)
3. **`taobao_openim_OffMsgPush` payload 全文**（topicDetail apiId=786）。→ 待核验(09-27)
4. **瓦力-旺旺聊天消息开通与字段**：权限包名、topic 名、聊天消息字段、与 §5.8 envelope 的对应关系（§5.8 出处页为旧 TMC 文档残留）。→ 待核验(09-27)
5. **千牛 TPN 下行 vs 客服上行边界**：TPN/jindoucloud/bcpush 是否有"买家发消息即推给 ISV"的上行能力，还是一律下行；`taobao.tpn.message.offline` 与 OpenIM 的关系。→ 待核验(09-27)
6. **openim.* 发送 API 清单**（api.htm 仅见类目名 openimAPI，`[摘录]` API.htm?docId=45562）。→ 待核验(09-27)
7. **MQ/ONS 订阅细节**：产品页 URL、费用、可订阅 topic 范围、与 TMC 的去重关系。→ 待核验(09-27)
8. **保留时长口径**：新页 8–24h vs 旧页 7 天（§3.3 已照录双口径，模拟器按 8–24h+6min 重发实现）。→ 待核验(09-27)
9. **hmac-sha256 向量**：官方页仅 md5/hmac 给出示例串，hmac-sha256 无示例。→ 待核验(09-27)
10. **沙箱网关**：`gw.api.tbsandbox.com` 是否现行（仅第三方社区文提及，非官方）。→ 待核验(09-27)
11. **准入审批全文**：新手接入指南、API 权限申请指南、应用环境说明页（doc 中心"接入指南"树）未直抓。→ 待核验(09-27)
12. **分组上限 50 与预发环境地址现行有效性**（`[摘录]` 2024-08-30 页，控制台可能已变）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"淘宝推交易/退款/商品消息"：**没有 webhook**——模拟 TMC 长连接服务端（`ws://mc.api.taobao.com/` 语义）：client 上报 app_key/app_secret/group(`default`) 后，服务端推明文 JSON（§5.3–5.5 形态，字段全字符串型数字如 `"tid":"123456789"`）；消费端 `status.fail()`/不 confirm → 约 6 分钟后重推；同组多连接随机投其一
- 模拟 API 轮询：`taobao.tmc.messages.consume`（`quantity`+`group_name`）→ 返回 `messages.tmc_message[{id,topic,content}]`，指针后移；`taobao.tmc.messages.confirm`（`sMessageIds` 逗号串）确认；未确认 6min 重发
- 模拟 HTTP 回调**仅限全球栈**：`POST` JSON（`seller_id/message_type/data/timestamp/site`，§5.6），头 `Authorization: hex(HMAC-SHA256(AppKey+body, AppSecret))`（小写 hex），500ms 内回 HTTP 200，否则半小时后重试、最多 12 次；回调地址需配 Verify（回 200 即成功）
- 模拟签名：请求验签按 §4.1（ASCII 排序→拼接→md5(secret+…+secret)/hmac→大写 hex，`timestamp` 允许 ±10min）；`sign`/`byte[]` 不参签
- 模拟授权：OAuth `https://oauth.taobao.com/authorize?response_type=code&client_id=&redirect_uri=&state=&view=web` → code（30min 有效）→ `taobao.top.auth.token.create` → access_token(session)；调用业务 API 带 `session`
- ID 形态：`tid/oid: 123456789`（数字，JSON 里常为字符串）；`refund_id`；`num_iid/sku_id`；`buyer_open_uid: AAGq5d-EAAeG3JedwSFpZMe1`（可对外）；昵称脱敏如 `碎**/麦包包`；`status` 仅 4 态、详情必须回查 API
- 勘误（相对直觉假设）：国内 TOP **无 HTTP 事件回调**（别按飞书 webhook 建模）；**无 AES 事件加密**（明文）；交易 `status` 无"已发货"态；`topic` 传参是覆盖更新（须全量）；确认比 <20% 会被限速
