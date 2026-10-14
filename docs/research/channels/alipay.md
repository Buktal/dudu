# 支付宝开放平台 消息推送 事实库

> 研究日期：2026-09-10。方法：WebSearch 官方站内摘录（opendocs.alipay.com / open.alipay.com 全文摘录，逐字引用）+ WebFetch（opendocs 页面为 JS 渲染，WebFetch 仅回壳，未取全文，故本次无 WebFetch 全文核验页）。
> 标注约定：无标注 = 下方给出的官方页面摘录原文已核验（以摘录为准，全文待复核）；`[全文待核验]` = 仅见标题/单句摘录；`待核验(09-27)` = 未能取得官方原文，需复核。
> 只认 primary sources：`opendocs.alipay.com`、`open.alipay.com`。其他域内容一律未采用。
> 范围：小程序客服消息、生活号、支付结果异步通知 notify_url、RSA2/SHA256withRSA 验签、app_auth_token、重试幂等、准入。
> 补证（2026-10-14，#116 动工前置）：票面指出的四个缺口——网关验证握手后半程（§3.2）、被动通知事件表/字段命名/应答（§2.3）、下行接口全文+频控（§2.3）、媒体下载（§2.3）——已按官方原文回填，标注 `已核验(10-14)`。取材三条，均为支付宝官方自有渠道：
> 1. 蚂蚁开放平台老版"生活号（原服务窗）"文档树的官方镜像 `https://developer.alibaba.com/docs/doc.htm?treeId=279&articleId=<id>&docType=1`（服务端直出全文；105933 快速接入、105937 事件订阅（2016-12-19 更新）、105938 发送消息（2017-06-29 更新））——opendocs.alipay.com 对应页现为 JS 壳，抓不到正文，镜像页与 opendocs 页同源同树；
> 2. 官方"服务窗 Demo（Java）"整包 `http://p.tb.cn/rmsportal_6680_ServiceWindow_Demo_Java.zip`（2017-11-06 版，GatewayServlet / InAlipayVerifyExecutor / AlipayMsgBuildUtil / Dispatcher 逐字）——握手验签 API 与回包包装逻辑的官方参考实现；
> 3. 支付宝官方 GitHub `alipay-sdk-php-all` V3 文档（AlipayOpenPublicMessageCustomApi）——custom.send 频控与 48h 窗口第二源。
> 第 1、3 条域不在上方 primary 名单内（名单系 09-27 那轮 WebSearch 口径），因同为支付宝官方发布渠道而采信；文档年代（2016/2017）照录，未见官方声明废弃。
> GBK 落地注意（10-14）：网关验证与被动通知实测口径 `charset=GBK`（示例工程常量、握手样例一致）；DUDU 服务端按原始字符串读 body，ASCII 内容安全，中文 Content 的实际编码行为待真实环境核验。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.alipay.com/
- 文档中心：https://opendocs.alipay.com/
- 控制台：https://open.alipay.com/（开放平台控制台；应用详情页 > 开发设置：接口加签方式 / 应用网关 / 接口内容加密方式 / IP 白名单 / 授权回调地址 / 消息服务）
- 生活号产品页：https://open.alipay.com/channel/publicAppIndex.htm
- 小程序产品页：https://open.alipay.com/module/miniApp

本次实际抓到并核实的页面清单（均为 WebSearch 官方站内摘录）：

| 主题 | URL | 核验方式 |
|---|---|---|
| 异步通知说明（APP 支付：参数表/验签/success/触发时机） | https://opendocs.alipay.com/open/270/105902 | 官方摘录（多轮一致） |
| 异步通知说明（APP 支付快速接入版，含 HTTP 200/notify_id） | https://opendocs.alipay.com/open/00dn78 | 官方摘录 |
| 异步通知说明（手机网站/电脑网站/通用版） | https://opendocs.alipay.com/open/194/103296、https://opendocs.alipay.com/open/204/105301、https://opendocs.alipay.com/open/203/105286、https://opendocs.alipay.com/open/064jha、https://opendocs.alipay.com/open/06j1la、https://opendocs.alipay.com/open/0507m8 | 官方摘录（标题+关键句） |
| 异步通知参数说明（25h/8次口径） | https://opendocs.alipay.com/open/04ij9t?pathHash=8b971aad | 官方摘录 |
| 自行实现验签（同步+异步，RSA2，生活号例外） | https://opendocs.alipay.com/common/02mse7 | 官方摘录 |
| 异步验签（密钥工具） | https://opendocs.alipay.com/open/02khjo、https://opendocs.alipay.com/common/02khjo | 官方摘录（标题级） |
| 如何使用 RSA 签名验签（含 SDK 验签与回调示例） | https://opendocs.alipay.com/support/01ravg | 官方摘录 |
| 附录：签名与验签（SHA256WithRSA） | https://opendocs.alipay.com/open/53/104105 | 官方摘录 |
| 签名（密钥工具：待签名字符串构造） | https://opendocs.alipay.com/common/02khjm | 官方摘录 |
| 应用网关 | https://opendocs.alipay.com/common/02qibh | 官方摘录 |
| 异步通知设置方式（3 种）/收不到排查 | https://opendocs.alipay.com/support/01raw4 | 官方摘录 |
| APP 支付异步通知设置（notify_url 不设置不触发） | https://opendocs.alipay.com/support/01rfrv?pathHash=1bc50c2f | 官方摘录 |
| 消息服务简介（From/To 蚂蚁） | https://opendocs.alipay.com/common/02km9i | 官方摘录 |
| From 蚂蚁消息服务使用（POST/产品地址优先/重试） | https://opendocs.alipay.com/common/02km9j | 官方摘录 |
| 订阅消息主题接口 alipay.open.app.message.topic.subscribe | https://opendocs.alipay.com/common/06tsxc | 官方摘录 |
| 查询消息订阅关系接口 | https://opendocs.alipay.com/common/06tsxd | 官方摘录（标题级） |
| 生活号快速接入（开发者模式激活） | https://opendocs.alipay.com/fw/guide、https://opendocs.alipay.com/fw/03kpzu | 官方摘录 |
| 管理生活号（小程序绑定生活号/关于面板） | https://opendocs.alipay.com/mini/introduce/life、https://opendocs.alipay.com/b/05hggn | 官方摘录 |
| 小程序客服组件 contact-button（零号云客服） | https://opendocs.alipay.com/mini/component/contact-button | 官方摘录 |
| 蚂蚁智能客服使用指南（专业模式/轻聊模式） | https://opendocs.alipay.com/mini/operation/custom-service、http://opendocs.alipay.com/b/03al9b | 官方摘录 |
| 小程序客服通道维护指南（客服电话+在线客服） | https://opendocs.alipay.com/b/0bc3ko?pathHash=b79e7b29 | 官方摘录（标题级） |
| 小程序设置客服方式 alipay.open.mini.miniapp.serviceconfig.modify | https://opendocs.alipay.com/mini/03l3ez | 官方摘录（标题级，`[全文待核验]`） |
| 客服设置 | https://opendocs.alipay.com/b/03d1r0 | 官方摘录（标题级） |
| 小程序订阅 my.requestSubscribeMessage | https://opendocs.alipay.com/mini/api/requestSubscribeMessage | 官方摘录 |
| 小程序发送模板消息 alipay.open.app.mini.templatemessage.send | https://opendocs.alipay.com/mini/6430ce5a_alipay.open.app.mini.templatemessage.send | 官方摘录 |
| 批量发送模板消息接口 | https://opendocs.alipay.com/mini/cb667597_alipay.open.app.mini.templatemessage.batchsend?referPath=03l9bb_19d2e0aa | 官方摘录（标题级） |
| 商家接入指南（订阅消息）/接入订阅消息/模板消息产品介绍 | https://opendocs.alipay.com/mini/03l9bb?pathHash=19d2e0aa、https://opendocs.alipay.com/b/03ksho、https://opendocs.alipay.com/open/repo-00qkqp | 官方摘录 |
| 小程序服务端 API 概览（含模板消息/转账状态变更通知行） | https://opendocs.alipay.com/mini/018pxw、https://opendocs.alipay.com/mini/server-api | 官方摘录 |
| 发送消息 3.3（含 3.3.1 异步单发客服接口 alipay.mobile.public.message.custom.send） | https://opendocs.alipay.com/open/53/104550?pathHash=c9669c5b | 官方摘录（标题级） |
| 群发消息定时发送 | https://opendocs.alipay.com/b/06y1fh | 官方摘录（标题级，`[全文待核验]`） |
| 换取应用授权令牌 alipay.open.auth.token.app | https://opendocs.alipay.com/isv/02r3q7 | 官方摘录 |
| 查询授权信息 alipay.open.auth.token.app.query | https://opendocs.alipay.com/isv/04hgcp | 官方摘录 |
| 第三方应用授权接入指南（含 code/token 有效期） | https://opendocs.alipay.com/isv/04h3ue | 官方摘录 |
| 如何设置 app_auth_token | https://opendocs.alipay.com/support/01rglv | 官方摘录 |
| 创建应用（含开发设置五项） | https://opendocs.alipay.com/open/03k9zr、https://opendocs.alipay.com/open/200/105310 | 官方摘录 |
| 上线应用（提交审核约 1 工作日） | https://opendocs.alipay.com/open/200/golive | 官方摘录 |
| 接入准备（含订阅消息服务/SDK 五语言/代调用） | https://opendocs.alipay.com/open/05osuy?pathHash=5bc4c039 | 官方摘录 |
| OpenAPI 接入指南（创建应用取 APPID/代调用传 token） | https://opendocs.alipay.com/cloud/089fvk | 官方摘录 |
| 接口加签方式说明 | https://opendocs.alipay.com/common/02mriz、https://opendocs.alipay.com/common/02kf5p | 官方摘录 |
| 接口内容加密方式（AES） | https://opendocs.alipay.com/mini/introduce/aes、https://opendocs.alipay.com/common/02mse3 | 官方摘录 |
| OpenAPI 网关（mapi/openapi） | https://opendocs.alipay.com/open/140/104613 | 官方摘录 |
| 沙箱快速接入 | https://opendocs.alipay.com/common/02kkv7 | 官方摘录 |

---

## 2. 消息/事件推送全清单

支付宝没有统一的"事件订阅目录"（与飞书事件列表不同），推送分三类地址机制（见 §3.1）。下表 `出处` 均为官方摘录页。

### 2.1 支付结果异步通知（notify_url，接口级参数）

- 定义（https://opendocs.alipay.com/open/270/105902）："异步通知是指一笔订单支付完成后，支付宝会将该笔订单的变更信息，沿着商家调用支付请求时所传入的异步通知地址 notify_url，通过 POST 请求的形式将支付结果作为参数通知到商家系统。"
- 同页公共参数表（逐字转录摘录）：`notify_time`（通知发送时间，`yyyy-MM-dd HH:mm:ss`）、`notify_type`（通知类型，示例 `trade_status_sync`）、`notify_id`（通知校验 ID，128 位）、`charset`（如 utf-8/gbk）、`version`（固定 1.0）、`sign_type`（RSA2/RSA，推荐 RSA2）、`sign`（344 位）、`auth_app_id`（"由于本接口暂不开放第三方应用授权，因此 auth_app_id=app_id"）。
- 同页业务参数表（逐字转录摘录）：`trade_no`（支付宝交易号）、`app_id`、`out_trade_no`（原支付请求的商家订单号）、`out_biz_no`（商家业务号，"通常是退款通知中返回的退款申请流水号"）、`trade_status`（示例 `TRADE_SUCCESS`）。
- 交易状态语义（https://opendocs.alipay.com/open/00dn78）：
  - `TRADE_SUCCESS`："商家开通的产品支持退款功能的前提下，买家付款成功"；
  - `TRADE_FINISHED`："商家开通的产品不支持退款功能的前提下，买家付款成功；或…支持退款…并且已经超过可退款期限"；
  - 付款成功判定："只有交易通知状态为 TRADE_SUCCESS 或 TRADE_FINISHED 时，支付宝才会认定为买家付款成功"（https://opendocs.alipay.com/open/194/103296）。
  - 未支付态 `WAIT_BUYER_PAY`（https://opendocs.alipay.com/open/00dn78 换单号建议："若为买家仍未支付（trade_status = WAIT_BUYER_PAY），则调用 alipay.trade.close 关闭此订单后再请求支付宝进行支付"；若为 `TRADE_SUCCESS` 则不要重复支付）。
  - `TRADE_CLOSED`（指定时间未支付关闭，或支付完成全额退款关闭；收银台未提交则无交易、无通知；`open-v3/05vuxp` 旁证，原文全文待直抓复核）。
- 触发场景不限于支付成功（https://opendocs.alipay.com/open/00dn78 §9）："在交易支付成功、交易关单、交易退款、交易分账等场景下都可能触发异步通知"，区分特征：
  - 支付成功：`trade_status=TRADE_SUCCESS` 且不包含 `out_biz_no`；
  - 退款成功：含 `gmt_refund`、`refund_fee`、`out_biz_no`（= 退款请求号）；
  - 未支付超时关单：若用户在收银台没点过提交支付、未真正创建交易，则**无**此通知。
- 取参方式（https://opendocs.alipay.com/open/00dn78）："支付宝是用 POST 方式发送通知信息，商户获取参数的方式如下：request.Form("out_trade_no")、$_POST['out_trade_no']。"
- 不设置即不推（https://opendocs.alipay.com/support/01rfrv?pathHash=1bc50c2f）："notify_url 参数不设置，即不会触发发送异步通知。异步地址必须为外网 post 访问为 http200 的状态。"
- 同步跳转对照 `return_url`：支付接口请求参数 `return_url` 用于网站支付成功后的同步页面跳转，与 `notify_url` 各一个（opendocs 站内搜索页摘录，`[全文待核验]`）→ 待核验(09-27)。

### 2.2 From 蚂蚁消息（订阅制，网关级地址）与应用网关产品

- 定义（https://opendocs.alipay.com/common/02km9i）："From 蚂蚁：即蚂蚁集团向外推送官方消息。推送内容包括（蚂蚁集团交易、签约、商品等信息）…应用获取蚂蚁集团数据不需再不停轮询 API"；反向为 To 蚂蚁（应用向蚂蚁回流消息）。接入协议支持 `http(s)` 与 WebSocket 长连接，新接入订阅时二选一。
- 投递规则（https://opendocs.alipay.com/common/02km9j）："默认情况下，支付宝主动以 POST 方式发送通知消息给配置的应用网关地址。注意：产品地址优先。即：若具体对接的产品额外说明了消息投递的地址，则请…"（后半截未抓到 → 待核验(09-27)）；验签前置："为了在接收消息时能正常的验签，开发者需要在开放平台门户的开发信息页面的接口加签方式中设置应用公钥"。
- 应用网关定位（https://opendocs.alipay.com/common/02qibh）："应用网关用于接收支付宝异步通知消息，需要传入 http(s) 公网可访问网页地址…主要使用产品有生活号被动通知、口碑门店的被动通知、转账到支付宝账户、红包（原"现金红包"）以及其它部分产品和订阅消息"；"支付结果异步通知…根据支付 API 中传入的异步通知地址 notify_url…通知到商家系统"（即支付类不走应用网关）；"如需设置应用网关请先完成接口加签方式设置"。
- 已核验的消息接口名（订阅 topic 即接口英文名，https://opendocs.alipay.com/common/06tsxc 示例 `topic=alipay.open.auth.appauth.cancelled`）：

| 消息接口（topic） | 触发语义 | 出处 |
|---|---|---|
| `alipay.fund.trans.order.changed` | 单笔转账到支付宝账户/银行卡、C2C/B2C 现金红包单据状态变更后触发 | https://opendocs.alipay.com/open/03k9zr（创建应用页开发设置表） |
| `alipay.fund.trans.refund.success` | C2C 红包退款成功触发 | 同上 |
| `alipay.trade.refund.depositback.completed` | 收单退款冲退完成通知（交易组件） | https://opendocs.alipay.com/mini/07a79i（API 概述页） |
| `alipay.open.mini.order.changed` | 交易组件订单状态变更结果通知（需监听） | 同上 |
| `alipay.open.mini.order.settle.notify` | 资金结算到商家余额户结果通知（需监听） | 同上 |
| `alipay.trade.subscription.changed` | 订阅产品变更（生效 active/续费 period_extend/取消 cancel，change_type 区分） | 非 primary 域见过同名接口，opendocs 侧仅见通用订阅机制，业务语义 → 待核验(09-27) |
| `alipay.open.auth.userauth.cancelled` | 用户取消用户信息授权时发给被授权方（需先订阅） | https://opendocs.alipay.com/mini/02xtl7（PC 网页获取用户信息页"消息通知"节） |
| `alipay.open.auth.appauth.cancelled`（= 第三方应用授权取消消息接口） | 商户取消对 ISV 的应用授权 | https://opendocs.alipay.com/common/06tsxc（topic 示例值）、https://opendocs.alipay.com/isv/02r3q7（API 列表含"第三方应用授权取消消息接口"） |
| 商家券创建/修改/领取通知 | "通过 From 蚂蚁消息通知向商家应用或第三方应用应用网关推送异步通知" | https://opendocs.alipay.com/mini/02xtl7（同页"消息通知"节，接口名未给出 → 待核验(09-27)） |

- 订阅方式（https://opendocs.alipay.com/common/06tsxc）：`alipay.open.app.message.topic.subscribe`，必填 `auth_token` + `auth_type`（`app_auth`=第三方应用授权 / `user_auth`=用户授权）+ `topic`（消息接口英文名）+ `comm_type`（`HTTP` 或 `WebSocket`）；跨账号消费场景 ISV 需先经第三方应用授权拿到令牌再订阅。查询订阅关系另有接口（https://opendocs.alipay.com/common/06tsxd，标题级 → 待核验(09-27)）。
- 服务商自订阅：第三方应用详情页 开发设置 > 消息服务 中完成（https://opendocs.alipay.com/open/05osuy?pathHash=5bc4c039 §2.5）。

### 2.3 生活号消息

- 产品定位（https://open.alipay.com/channel/publicAppIndex.htm）："支付宝生活号是支付宝为企业、组织和个人提供的直接触达用户的服务平台，入驻商户可以通过此平台对用户进行信息推送、交易场景打通和会员服务管理。"接入四步：注册认证（推荐企业账户，部分功能仅企业开放）→ 创建生活号 → 配置生活号 → 上架生活号。
- 开发者模式激活（https://opendocs.alipay.com/fw/guide；https://opendocs.alipay.com/fw/03kpzu）："开发者验签成功之后，需要向支付宝网关回复一条消息，表示验签成功。支付宝收到符合规则的消息之后，开发者模式就激活了"；"激活开发者模式后，支付宝会认为开发者有能力对接生活号相关接口，开发者才能调用相关的生活号 api 接口"；激活步骤始于"登录蚂蚁金服开放平台，点击"管理中心"，进入生活号应用详情页面，点击"验证应用网关""（后继步骤未抓全 → 待核验(09-27)）。
- 被动通知（已核验(10-14)，官方镜像 105937《生活号事件订阅》，2016-12-19 更新；接口 `alipay.mobile.public.message.notify`）：生活号被动通知发往应用网关（https://opendocs.alipay.com/common/02qibh），**POST 表单**：`service=alipay.mobile.public.message.notify`、`sign_type=RSA2`、`sign=<base64>`、`biz_content=<XML 报文>`（GBK 编码，§GBK 落地注意）。
  - XML 信封字段：`AppId`（生活号 appId）、`FromUserId`（用户 OpenId，官方标注已废弃，仍随报文下发）、`FromAlipayUserId`（现用唯一用户标识 userid）、`CreateTime`（毫秒时间戳）、`MsgType`（`event`/`text`/`image`…）、`EventType`（仅 event 类携带）、`ActionParam`（菜单点击时携带菜单 action 参数）、`AgreementId`、`AccountNo`、`MsgId`（消息 id，可选，供幂等去重）、`UserInfo`（JSON 字符串：`logon_id`/`user_name`，可能缺省）。
  - 事件表（MsgType=event，EventType 取值）：`follow` 关注、`unfollow` 取关、`enter` 进入生活号、`click` 自定义菜单点击、`verifygw` 开发者模式网关验证（§3.2）。
  - 文本消息（MsgType=text）：`<Text><Content><![CDATA[Hello]]></Content></Text>` + 信封字段；图片消息（MsgType=image）：`<Image><MediaId><![CDATA[…]]></MediaId><Format><![CDATA[jpg]]></Format></Image>` + 信封字段；`MediaId` 为媒体下载凭据（见下）。
  - 接收应答（同源）：收到被动通知**必须同步应答接收成功**，否则视为推送失败；开启重试的产品按 **2 次、间隔 5s** 重试，菜单点击事件与接入验证消息不作重试。应答为**无签名 XML ack**，官方示例逐字（注：示例中 `CreateTime` 写作 `![CDATA[1406165628612]]` 系文档笔误，官方示例工程输出为裸毫秒数，无 CDATA）：

    ```xml
    <XML><ToUserId><![CDATA[2088802608984030]]></ToUserId><AppId><![CDATA[2014042900005397]]></AppId><CreateTime><![CDATA[1406165628612]]></CreateTime><MsgType><![CDATA[ack]]></MsgType></XML>
    ```

    `ToUserId` 取来报 `FromUserId`，`AppId` 为生活号 appId（官方示例工程 `AlipayMsgBuildUtil.buildBaseAckMsg` 逐字对照）。
  - 媒体下载（同源 105937）：网关 `https://openfile.alipay.com/chat/multimedia.do`（与消息网关分离，"消息体及调用方式相同"），接口 `alipay.mobile.public.multimedia.download`，`biz_content={"mediaId":"…"}`，签名方式同普通 OpenAPI 请求（§4.1）；成功时 HTTP 响应体即图片内容（Content-Type 为图片类型，流式返回，无 JSON 信封）。
- 下行（生活号 → 用户）接口族（接口名前缀 `alipay.open.public.*` / `alipay.mobile.public.message.*`，OpenLife，见 https://opendocs.alipay.com/isv/03l221 产品能力表 + https://opendocs.alipay.com/open/53/104550?pathHash=c9669c5b §3.3 标题）：
  - 群发文本 `alipay.open.public.message.total.send`（EasySDK 映射 `sendText`，非 primary 域，接口名本身在官方能力语义"群发本文消息"中可互证，`[全文待核验]`）；
  - 群发图文（`sendImageText`）、创建/更新图文素材（`createImageTextContent` / `modifyImageTextContent`）（https://opendocs.alipay.com/isv/03l221）；
  - 单发模板消息、消息撤回 `alipay.open.public.life.msg.recall`（非 primary 域映射，→ 待核验(09-27)）；
  - 客服单发 `alipay.open.public.message.custom.send`（已核验(10-14)，官方镜像 105938《发送消息》，2017-06-29 更新）：窗口口径逐字——"用户主动与生活号交互的48小时之内，生活号可以使用该接口向该用户进行消息推送"；文本 biz_content：`{"to_user_id":"2088283746283746","msg_type":"text","text":{"content":"你好"}}`；频控（官方 V3 SDK 文档 AlipayOpenPublicMessageCustomApi，GitHub alipay-sdk-php-all）逐字——"每个生活号每天只能向1个用户推送100条消息，超过这个数目会报错频率超限"。同族已核验：`alipay.open.public.message.total.send`（群发，无 `to_user_id`）、`alipay.open.public.message.single.send`（单发模板消息，图文 article ≤6 篇）。
    - 接口名勘误：104550 §3.3.1 标题所载 `alipay.mobile.public.message.custom.send` 为老接口名；现行文档与 2017 版官方示例工程（`AlipayOpenPublicMessageCustomSendRequest`）均用 `alipay.open.public.*`，DUDU 按后者实现。
- 群发定时发送能力存在（https://opendocs.alipay.com/b/06y1fh，标题级 → 待核验(09-27)）。
- 小程序 × 生活号联动（https://opendocs.alipay.com/mini/introduce/life；https://opendocs.alipay.com/b/05hggn）："在支付宝 10.1.50 版本之后，小程序…关于面板…新增了生活号通道能力；在小程序绑定了生活号的情况下，在关于面板中将直接展示生活号入口；小程序通过生活号下发的消息都会直接显示，新消息将通过红点形式提示用户"。

### 2.4 小程序客服消息（重要：不是服务端推送 API，而是云客服组件）

- 结论：支付宝小程序客服由"蚂蚁集团零号云客服"提供，前端通过 `contact-button` 组件唤起，无"客服事件推送给开发者服务器"的官方机制（已抓页面中均无此类推送定义）。
- 组件（https://opendocs.alipay.com/mini/component/contact-button）："智能客服能力由蚂蚁集团零号云客服提供。唤起智能客服组件，开通智能客服：进入对应小程序详情页 > 小程序信息 > 在线客服即可打开云客服免费使用"；"智能客服仅支持企业用户"；版本要求基础库 1.14.1+、支付宝客户端 10.1.10+（`my.canIUse('contact-button')` 判断；Native 渲染引擎暂不支持）。
- 必填属性：`tnt-inst-id`（企业唯一编码）+ `scene`（聊天窗编码，"每个聊天窗编码都是唯一的"；取自云客服 设置 > 服务窗配置 > 部署）。
- 下行提醒（同页）：
  - `alipay-card-no`（支付宝访客用户 ID，2088 开头）："客服回答问题时，如客户已离开咨询窗口，则通过推送消息到支付宝 card 中提醒客户"；
  - 提醒频率："按一定的频率进行消息提醒，默认 30 分钟提醒一次"；
  - 未读同步："用户离开聊天窗期间客服发的消息会进行提醒"，"未读客服消息同步至"我的小程序-我的""（需 `ext-info` 传 appId，`encodeURIComponent({"appId":"商户小程序appid"})`，同页）。
- 服务端可配项仅有客服方式设置接口 `alipay.open.mini.miniapp.serviceconfig.modify`（"小程序设置客服方式"，https://opendocs.alipay.com/mini/03l3ez，标题级，入参 → 待核验(09-27)）。
- 运营侧（http://opendocs.alipay.com/b/03al9b；https://opendocs.alipay.com/mini/operation/custom-service）：专业模式（PC 工作台，有专职客服）/轻聊模式（手机支付宝 消息 > 客户咨询处理，"暂不支持机器人服务及聊天窗配置的个性化功能"）；入口默认开（三点菜单；首页悬浮窗需在智能客服后台关联聊天窗后打开，"由于缓存原因…建议第二天打开小程序查看"）。
- 通道要求（https://opendocs.alipay.com/b/0bc3ko?pathHash=b79e7b29）："向小程序商家提供的服务通道配置主要有客服电话和在线客服"（标题级 → 待核验(09-27)）。

### 2.5 小程序订阅消息（模板消息，下行；需用户先订阅）

- 前端订阅（https://opendocs.alipay.com/mini/api/requestSubscribeMessage）：`my.requestSubscribeMessage`，"唤起客户端小程序消息订阅界面"，基础库 2.7.10+；"订阅界面是根据当前小程序在商家平台配置的消息模板 id 来展示"；`entityIds` 最多传三个模板 id，一次性与长期性模板不可混传（错误码 106002）；订阅结果经 API 回调实时获取，服务端可经 `alipay.open.app.messagetemplate.subscribe.query` 查订阅关系、小程序内经 `my.getSetting` 的 `subscriptionsSetting` 查状态。
- 服务端发送（https://opendocs.alipay.com/mini/6430ce5a_alipay.open.app.mini.templatemessage.send；https://opendocs.alipay.com/mini/018pxw）：
  - `alipay.open.app.mini.templatemessage.send`："小程序通过 OpenAPI 给用户触达消息，主要为支付后的触达（通过支付宝订单号 trade_no）、用户提交表单后的触达（通过 formId）"，另有刷脸 ftoken 与订阅消息模板（同页首段摘录）。
  - 批量发送接口存在（https://opendocs.alipay.com/mini/cb667597_alipay.open.app.mini.templatemessage.batchsend?referPath=03l9bb_19d2e0aa，标题级 → 待核验(09-27)）。
  - 免代码方式：商家平台 运营中心 > 消息 > 配置发送；消息运营 > 消息接入 > 订阅消息 > 批量发送（requestSubscribeMessage 页接入流程 §5–6）。
  - `page` 字段带参跳转小程序：page 路径 `?` 后拼接参数并 urlEncode（官方 FAQ 摘录于非 primary 镜像，opendocs 侧 FAQ 页 https://opendocs.alipay.com/mini/03l8bx 标题级 → 待核验(09-27)）。
- 接入前置（同 requestSubscribeMessage 页）：开放平台开发设置（接口加签方式必填、应用网关必填、支付宝网关必填）→ 开放平台配置主营行业 → 商家平台领用订阅消息模板（https://opendocs.alipay.com/b/03ksho）→ 小程序调 API → 服务端发送。

---

## 3. 回调机制

### 3.1 三种异步地址（ unterschieden，二选一/按产品走）

来源：https://opendocs.alipay.com/support/01raw4；https://opendocs.alipay.com/common/02qibh；https://opendocs.alipay.com/common/02km9j。

| | 接口级 notify_url | 应用网关 | From 蚂蚁消息订阅 |
|---|---|---|---|
| 配置位置 | 支付 API 请求参数 `notify_url` | 应用详情 开发设置 > 应用网关（全应用仅 1 个） | 应用详情 开发设置 > 消息服务（按 topic 订阅） |
| 适用 | APP/手机网站/电脑网站支付等（"接口 API 设置 notify_url：如 APP 支付、电脑网站支付等"） | 生活号被动通知、口碑门店、转账到账户、红包等（"应用网关设置异步地址：如商家扣款主动解约等"） | 单笔转账、商家分账等（"FROM 蚂蚁消息订阅消息 API：如单笔转账到支付宝账户、商家…"） |
| 方法/格式 | POST 表单参数（`request.Form`/`$_POST`） | POST 到 http(s) 公网地址 | POST（默认）或 WebSocket（订阅时选 `comm_type=HTTP\|WebSocket`） |
| 优先级 | 最高（接口参数优先；"异步通知优先取接口中传的 notify_url，如果没传则取 openhome 中的应用网关地址"，https://opendocs.alipay.com/open/01kwnr?pathHash=fc61691d，协议签约场景） | 中 | 产品地址优先（"若具体对接的产品额外说明了消息投递的地址，则请…"，https://opendocs.alipay.com/common/02km9j，后半 → 待核验(09-27)） |
| 前置 | 外网 POST 返回 http 200 | 需先完成接口加签方式设置 | 需先订阅 topic（跨账号需 app_auth 授权） |

- 四地址对照（授权回调地址=授权后带 auth_code 跳转，需与授权链接 redirect_uri 一致；应用网关=收异步通知；同步回调 return_url=页面跳转；异步回调 notify_url=判交易状态；全应用级地址各仅 1 个）见 opendocs 站内搜索页摘录（`[全文待核验]`）→ 待核验(09-27)。
- 生活号开发者模式验证是第 4 种握手（§3.2），不是业务推送。

### 3.2 生活号开发者模式验证握手（网关验证）——已核验(10-14)

来源：官方镜像 105933《生活号快速接入》（treeId=279）+ 官方服务窗 Java 示例工程（2017-11-06）`GatewayServlet`/`InAlipayVerifyExecutor` 逐字对照；§3.2 原有 fw/guide、fw/03kpzu 摘录与此互证。

- 触发：开放平台应用详情页点"验证应用网关"后，支付宝网关向应用网关地址发 **POST 表单**（示例工程 `doGet` 直接委托 `doPost`，无 GET 形态握手）：`service=alipay.service.check`、`charset=GBK`、`sign_type=RSA2`、`sign=<base64>`、`biz_content=<XML>`。biz_content XML（官方样例逐字）：

  ```xml
  <?xml version="1.0" encoding="gbk"?><XML><AppId><![CDATA[2014072300007148]]></AppId><FromUserId></FromUserId><CreateTime><![CDATA[1406083506817]]></CreateTime><MsgType><![CDATA[event]]></MsgType><EventType><![CDATA[verifygw]]></EventType><ActionParam></ActionParam><AgreementId></AgreementId><AccountNo></AccountNo></XML>
  ```

- 验签（示例工程逐字）：`AlipaySignature.rsaCheckV2(params, 支付宝公钥, "GBK", "RSA2")` —— 待验签串**保留 `sign_type`**（仅剔除 `sign`），即 §4.3 生活号例外；`rsaCheckV2` 就是"保留 sign_type"的官方 SDK 实现，`rsaCheckV1` 则剔除 `sign`+`sign_type`（支付类通知用）。§7-5 要的示例串补全：对上面握手报文，待验签串为 `biz_content=<url解码后XML>&charset=GBK&service=alipay.service.check&sign_type=RSA2`（ASCII 升序拼接，仅去 `sign`）。
- 成功回复（官方文档逐字 + 示例工程 `encryptAndSign` 包装逻辑）：

  ```xml
  <?xml version="1.0" encoding="GBK"?><alipay><response><biz_content><开发者公钥></biz_content><success>true</success></response><sign><RSA2签名></sign><sign_type>RSA2</sign_type></alipay>
  ```

  - `sign` = **应用私钥**对 `<response>` 节点内容（无空格的 `<biz_content>…</biz_content><success>true</success>`）作 SHA256WithRSA 后 base64；响应 Content-Type `text/xml;charset=GBK`。
  - 节点顺序两源略有出入（官方文档 biz_content 在前，示例工程 `<success>true</success>` 在前）：顺序本身不敏感，**签名必须与实际输出内容自洽**。
  - `<biz_content>` 内的开发者公钥 = 该生活号配置的应用公钥（示例工程常量注释"开发者公钥"；即应用私钥的配对公钥）。
- 失败行为：验签失败或回复不符合规则则开发者模式不激活（https://opendocs.alipay.com/fw/guide："支付宝收到符合规则的消息之后，开发者模式就激活了"）。
- 含义：验证串本质是"支付宝用生活号配置的密钥加签下发验证消息 → 开发者验签 → 按规则回签消息"的双向能力证明，与飞书 challenge 回显不同（原类比作废）。

### 3.3 应答与重试

- 成功应答（https://opendocs.alipay.com/open/00dn78 §8；https://opendocs.alipay.com/open/270/105902 §6）：
  - 响应值表：`fail`=消息获取失败→重试；`success`=消息获取成功→不重试；
  - HTTP 层："异步回调地址状态码（http 状态码）为 200 时表示异步通知成功，返回码为 404 或 500 时则表示服务器内部错误，需要商家自行排查"；
  - 地址卫生："商家设置的异步地址（notify_url）需保证无任何字符，如空格、HTML 标签，且不能重定向。（如果重定向，支付宝会收不到 success 字符，会被支付宝服务器判定为该页面程序运行出现异常，而重发处理结果通知）"；
  - 程序执行完"该…"后输出 success（https://opendocs.alipay.com/open/064jha 摘录截断，全文 → 待核验(09-27)；实践含义：纯文本 success，无多余字符）。
- 重试节拍（两处官方口径并存，照录）：
  - 支付类异步通知（https://opendocs.alipay.com/open/04ij9t?pathHash=8b971aad；https://opendocs.alipay.com/open/270/105902）："一般情况下，25 小时以内完成 8 次通知（通知的间隔频率一般是：4m、10m、10m、1h、2h、6h、15h）"；
  - From 蚂蚁消息（https://opendocs.alipay.com/common/02km9j）："一般情况下，25 小时以内完成 8 次通知，除了第一次是实时投递外…间隔频率一般是：2m、10m、10m、1h、2h、6h、15h"——首次重试 2m vs 4m 差异照录（2m 首重本次未获第二源，单源口径，模拟器暂按产品区分，标单源）。
- 交易通知 Crazy Diamond 规则外，还强调丢通知兜底（https://opendocs.alipay.com/open/00dn78）："由于网络异常、系统波动等原因，可能会存在用户支付成功、但是商户侧未能成功接收到支付结果异步通知的情况…需要商户同时接入支付结果异步通知与统一收单交易查询接口。当商户侧未收到支付结果异步通知时，必须调用 alipay.trade.query 查询订单的支付结果。"

### 3.4 幂等与正确性校验

- `notify_id` 不变（https://opendocs.alipay.com/open/00dn78 §4；https://opendocs.alipay.com/open/203/105286?pathHash=022a439c 同句）："支付宝针对同一条异步通知重试时，异步通知参数中的 notify_id 是不变的"——幂等键首选 `notify_id` + `out_trade_no`/`trade_no` 组合。
- 验签后必做（https://opendocs.alipay.com/open/270/105902 §7）："1 商家需要验证该通知数据中的 out_trade_no 是否为商家系统中创建的订单号。2 判断 total_amount 是否确实为该订单的实际金额"；"在上述验证通过后商家必须根据支付宝不同类型的业务通知，正确的进行不同的业务处理，并且过滤重复的通知结果数据。"
- 换单号前必查（https://opendocs.alipay.com/open/00dn78）："当商户针对同一笔业务订单更换商户订单号（out_trade_no）来请求支付宝前，强烈建议商户先查询前一个商户订单号的支付结果"（成功勿重付 / WAIT_BUYER_PAY 先 close，见 §2.1）。

---

## 4. 验签与加密算法

### 4.1 请求加签（商户 → 支付宝）

来源：https://opendocs.alipay.com/common/02khjm（密钥工具签名页）；https://opendocs.alipay.com/common/02mriz（接口加签方式说明）；https://opendocs.alipay.com/open/03k9zr（创建应用页）。

- 待签名字符串构造（逐字转录）："1 获取所有支付宝开放平台的 post 内容，不包括字节类型参数，如文件、字节流，剔除 sign 字段，剔除值为空的参数；2 按照第一个字符的键值 ASCII 码递增排序（字母升序排序），如果遇到相同字符则按照第二个字符的键值 ASCII 码递增排序，以此类推；3 将排序后的参数与其对应值，组合成参数=参数值的格式，并且把这些参数用 & 字符连接起来，此时生成的字符串为待签名字符串。"
- 证书模式附加："若使用公钥证书模式签名，在拼接待签名字符串时需添加解析出来的应用公钥证书 SN（app_cert_sn）和支付宝根证书 SN（alipay_root_cert_sn）。"
- 算法：RSA2 = SHA256WithRSA（2048 位，新建应用必须；"目前已使用 RSA 密钥长度即 1024 位密钥长度的应用仍然可以正常调用接口"，https://opendocs.alipay.com/common/02khjm）；RSA = SHA1WithRSA。公共参数 `sign_type=RSA2` 必须与控制台上传的密钥加签方式一致。
- 公共请求参数（https://opendocs.alipay.com/isv/02r3q7 表头，逐字）：`app_id`（32）、`method`（128）、`format`（仅 JSON，可选）、`charset`（utf-8/gbk/gb2312，必填）、`sign_type`（RSA2/RSA，必填）、`sign`（344，必填）、`timestamp`（`yyyy-MM-dd HH:mm:ss`，必填）、`version`（固定 1.0，必填）、`app_auth_token`（可选，40）、`biz_content`（业务参数集合）。
- 网关：OpenAPI 网关 `https://openapi.alipay.com/gateway.do`；老 MAPI 网关 `https://mapi.alipay.com/gateway.do`（https://opendocs.alipay.com/open/140/104613；密钥工具签名页声明"暂仅支持新版 OpenAPI 网关接口签名，不支持老版 MAPI 网关接口签名"）。
- 密钥与应用一一对应："密钥和应用（APPID）一一对应，即开发者需要为名下的每个应用分别设置密钥，且不同应用的密钥不能混用"（https://opendocs.alipay.com/open/03k9zr）。

### 4.2 同步返回验签（支付宝 → 商户，接口响应）

来源：https://opendocs.alipay.com/common/02mse7。

- 只验 `xxx_response`："开发者只对支付宝返回的 JSON 中 xxx_response 的值做验签（xxx 代表接口名）"；"xxx_response 的 JSON 值内容需要包含首尾的 { 和 } 两个尖括号，双引号也需要参与验签"；"如果字符串中包含 http:// 的正斜杠，需要先将正斜杠做转义…建议验签不通过时将正斜杠转义一次后再做一次验签。"
- 公钥模式：取出 `sign`，"调用验签函数使用各自语言对应的 SHA256WithRSA（对应 sign_type 为 RSA2）或 SHA1WithRSA（对应 sign_type 为 RSA）签名验证函数，传入待验签字段、支付宝公钥、签名内容（sign），验签方法（signType）进行验签"。
- 证书模式：同步响应报文多一个与 `xxx_response`、`sign` 平级的 `alipay_cert_sn`（支付宝公钥证书序列号），用该 SN 对应的支付宝公钥证书验签。
- SDK 封装：初始化 `DefaultAlipayClient` 传入网关/app_id/应用私钥/charset/支付宝公钥/sign_type 即可做同步验签（https://opendocs.alipay.com/support/01ravg）。

### 4.3 异步通知验签（notify_url / 应用网关 / From 蚂蚁统一规则）

来源：https://opendocs.alipay.com/common/02mse7；https://opendocs.alipay.com/open/270/105902 §7。

- 四步（逐字转录 02mse7）："1. 获取异步通知…2. 获取待验签参数：(1) 在通知返回参数列表中，除去 sign、sign_type 两个参数外，凡是通知返回的参数皆是待验签的参数。说明：生活号异步通知组成的待验签串里需要保留 sign_type 参数。(2) 将剩下参数进行 url_decode，然后进行字典排序，组成字符串，得到待签名字符串。3. 获取签名值 sign：将签名参数（sign）使用 base64 解码为字节码串。4. 调用验签函数：使用 RSA 的验签方法，通过签名字符串、签名参数（经过 base64 解码）及支付宝公钥验证签名"（SDK 对应 `AlipaySignature.rsaCheckV1`（公钥）/`rsaCertCheckV1`（证书）（support/01rawm 实证；`verifyV1` 系 02mse7 单源名称，并列保留待复核），同页）。
- 生活号例外：待验签串**保留** `sign_type`（同页说明，原因未给 → 待核验(09-27)）。
- 密钥工具可核查自验签结果：左侧导航 异步验签，"此功能只支持对支付宝异步通知内容做验签，响应报文需要填支付宝异步通知内容，格式为 key1=value1&key2…"（https://opendocs.alipay.com/open/02khjo）。
- From 蚂蚁消息同样用支付宝公钥验签（https://opendocs.alipay.com/mini/02xtl7"商家/服务商可使用支付宝 SDK 根据…验签"，截断；https://opendocs.alipay.com/common/02km9j 要求先设应用公钥）。

### 4.4 接口内容加密（AES，与签名正交）

来源：https://opendocs.alipay.com/mini/introduce/aes；https://opendocs.alipay.com/common/02mse3；https://opendocs.alipay.com/open/03k9zr。

- 定位："AES 密钥是对接口请求和响应内容进行加密，密文无法被第三方识别，从而防止接口传输数据泄露。…RSA 密钥是对接口请求和响应内容进行签名"；"支付宝开放平台中所有使用 bizContent 方式入参的 OpenAPI 均支持对接口的请求内容和响应内容进行 AES 加密。"
- 顺序："开发者可对请求参数先做 AES 加密，然后对密文进行 RSA 签名"；"不论接口内容是明文还是密文，RSA 均可正常签名。"
- 配置：应用详情 开发设置 > 接口内容加密方式（步骤 4，可选）；"接入 my.getPhoneNumber、my.getRunData 等需解密数据功能必须配置"。
- ISV 代设：`alipay.open.auth.app.aes.set`（授权应用 AES 密钥设置；"接口返回的商户应用 AES 密钥内容为加密内容，需要 ISV 使用三方应用的 AES 密钥解密，Java SDK 内部自动完成"）（https://opendocs.alipay.com/isv/04h0d4；https://opendocs.alipay.com/isv/7014cef9_alipay.open.auth.app.aes.set，标题级 → 待核验(09-27)）。

### 4.5 SDK 与 V3

- 服务端 SDK（通用版）语言：Java、PHP、NodeJS、Python、.NET（C#）（https://opendocs.alipay.com/open/05osuy?pathHash=5bc4c039 §3.1；另有"包含 JAVA、PHP 和 .NET 三语言版本"旧页，https://opendocs.alipay.com/open/203/105910，以五语言新页为准）。
- 私钥保管："由于实例化 SDK 客户端时需要指定应用的私钥信息，请务必注意不要将私钥信息配置在源码中…推荐将私钥信息储存在专用的私钥文件中"（https://opendocs.alipay.com/isv/03l221 能力表页眉）。
- V3（OAS3.0）："支付宝现已推出符合 OAS3.0 规范的 API（V3 版本），拥有更简洁的签名/验签处理逻辑，推荐无法使用 SDK 的用户，直接对接 V3 版本的 OpenAPI"（https://opendocs.alipay.com/common/02mse7）。V3 具体签名算法细节 → 待核验(09-27)。

---

## 5. 示例载荷原文（逐字，均为官方摘录转录）

### 5.1 支付异步通知公共参数（https://opendocs.alipay.com/open/270/105902 表格行转录）

```text
notify_time = 2018-10-21 15:45:22   # 通知发送时间 yyyy-MM-dd HH:mm:ss
notify_type = trade_status_sync
notify_id   = ac05099524730693a8b330c45cf72da943
charset     = utf-8
version     = 1.0
sign_type   = RSA2
sign        = 601510b7970e52cc63db0f44997cf70e   # 样例截断，344 位，base64
auth_app_id = 2018072300007418                  # 非三方场景 = app_id
trade_no    = 2013112011001004330000121536
app_id      = 2019082200007148
out_trade_no = 6823789339978248
```

> 完整原始 POST body 样例官方页提及但摘录未含（"某商家设置的通知地址为 https://商家网站通知地址，对应接收到通知的示例如下"后截断）→ 待核验(09-27)。切勿用本 §5.1 拼出的串做验签回归向量。

### 5.2 异步验签待签名字符串构造（规则逐字，https://opendocs.alipay.com/common/02mse7）

```text
1. 去掉 sign、sign_type（生活号通知保留 sign_type）
2. 其余参数 url_decode
3. 字典排序后以 key=value&... 拼接
4. sign 经 base64 解码为字节串
5. RSA/RSA2 公钥验签
```

### 5.3 应答（https://opendocs.alipay.com/open/00dn78 §8）

```text
success   # 纯文本，无空格/HTML/重定向；HTTP 200；不再重试
fail      # 重试（25h/8次）
```

### 5.4 公共请求参数（加签侧，https://opendocs.alipay.com/isv/02r3q7）

```text
app_id=2014072300007148&method=alipay.open.auth.token.app&format=JSON&charset=utf-8
&sign_type=RSA2&sign=<RSA2签名>&timestamp=2014-07-24 03:07:50&version=1.0
[&app_auth_token=<三方代调用时必填>]
&biz_content={...}
```

### 5.5 换取应用授权令牌请求语义（https://opendocs.alipay.com/isv/02r3q7）

```text
grant_type=authorization_code  + code=<app_auth_code>      # 授权码换 token
grant_type=refresh_token      + refresh_token=<app_refresh_token>  # 刷新
```

### 5.6 小程序订阅消息链路标识（https://opendocs.alipay.com/mini/api/requestSubscribeMessage）

```text
my.requestSubscribeMessage({ entityIds: [<模板id>×≤3，同为一次性或同为长期性] })
  → 服务端 alipay.open.app.mini.templatemessage.send(trade_no/formId/ftoken/订阅)
  → 服务端 alipay.open.app.messagetemplate.subscribe.query（查订阅关系）
```

### 5.7 小程序客服组件（https://opendocs.alipay.com/mini/component/contact-button）

```text
<contact-button tnt-inst-id="<企业编码>" scene="<聊天窗编码>"
  size="25" color="#00A3FF" alipay-card-no="2088..." ext-info="<urlEncode({appId})>" />
```

---

## 6. token / 凭证与准入链路

### 6.1 凭证模型

| 凭证 | 换取/配置方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `app_auth_token`（应用授权令牌） | 商户应用授权给 ISV 第三方应用后，ISV 用回调中的 `app_auth_code` 调 `alipay.open.auth.token.app`（`grant_type=authorization_code` + `code`）换取；刷新用 `grant_type=refresh_token` + `refresh_token` | `app_auth_code` 一次有效，未使用 24h 过期（批量授权 10 分钟）；`app_auth_token` 在无重授权/取消/刷新下**永久有效**；同一商家应用重复授权给同一 ISV 会刷新 token、旧值失效；`refresh_token` 刷新后老值按 `re_expires_in` 失效 | https://opendocs.alipay.com/isv/02r3q7、https://opendocs.alipay.com/isv/04h3ue、opendocs 站内搜索页"授权 FAQ"摘录 |
| `app_auth_token` 传参位置 | 公共请求参数，可选；三方代调用场景必填 | "在三方业务场景中，第三方应用代商家应用调用支付宝 OPEN API 时，必须传入 app_auth_token"；代调用须用**第三方应用**的 APPID/密钥构造 AlipayClient | https://opendocs.alipay.com/support/01rglv、https://opendocs.alipay.com/cloud/089fvk、https://opendocs.alipay.com/open/05osuy?pathHash=5bc4c039 |
| 授权回调 | 商户授权成功同步跳转第三方应用配置的授权回调地址，请求含 `app_auth_code=xxx`、`source=alipay_app_auth`（区别于用户授权） | 授权回调地址须与应用配置一致 | https://opendocs.alipay.com/isv/04h3ue |
| 授权查询 | `alipay.open.auth.token.app.query`（`app_auth_token` 必选入参）查授权者/授权接口列表等 | 支持第三方代理调用 | https://opendocs.alipay.com/isv/04hgcp |
| `auth_app_id` | 异步通知回参；非三方场景 `auth_app_id=app_id` | 判三方代调用通知归属 | https://opendocs.alipay.com/open/270/105902 |
| 用户授权 `auth_code`/`access_token` | 用户授权后 `auth_code` → `alipay.system.oauth.token` 换 `access_token` + user_id/open_id → `alipay.user.info.share` 取信息 | `auth_code` 一次有效，不用时 3 分钟–24 小时（业务动态）；`access_token` 有效期取授权 scope 最短者；App 支付宝登录完整版 `auth_code` 永久有效（特例） | https://opendocs.alipay.com/mini/02xtl7 |
| `APPID` | 创建应用生成，调用一切 OpenAPI 的身份 | 密钥与 APPID 一一对应，不混用 | https://opendocs.alipay.com/open/03k9zr |
| 应用公钥/私钥/支付宝公钥（证书） | 控制台 开发设置 > 接口加签方式；密钥工具生成 | 公钥模式/公钥证书模式；`sign_type` 须与设置一致，RSA2/2048 位新建必选 | https://opendocs.alipay.com/common/02mriz、https://opendocs.alipay.com/open/03k9zr |
| AES 密钥 | 开发设置 > 接口内容加密方式 | 加密 bizContent；手机号/运动数据等必填 | https://opendocs.alipay.com/mini/introduce/aes |

### 6.2 准入链路（自研应用）

来源：https://opendocs.alipay.com/open/03k9zr；https://opendocs.alipay.com/open/200/golive；https://opendocs.alipay.com/open/05osuy?pathHash=5bc4c039；https://opendocs.alipay.com/cloud/089fvk。

1. 注册：用**需实名认证的支付宝账号**登录开放平台控制台（"开发者使用支付宝账号登录开放平台控制台（需实名认证的支付宝账号）"）。
2. 创建应用：选类型（网页/移动应用；小程序、生活号、第三方应用各有独立创建页 → 待核验(09-27)）；"创建应用时的应用状态为开发中，无法在线上正式调用接口"；基础信息（名称/图标/绑定商家账号）随时可改、无需审核，但上线时按审核规范审名称与图标（禁"测试/test/支付宝/蚂蚁金服…"字样）。
3. 配置开发设置（必须填接口加签方式才可提交审核）：接口加签方式（必填）→ IP 白名单（可选，资金安全建议）→ 应用网关（可选，按需）→ 接口内容加密（可选，敏感数据必填）→ 授权回调地址（可选，授权场景必填且须与链接 redirect_uri 一致）。
4. 上线："创建应用并完成配置后，可点击提交审核，预计会有 1 个工作日的审核时间"（https://opendocs.alipay.com/open/200/golive）；"应用上线后，还需要完成产品开通才能在线上环境使用产品"；支付/资金类需先绑定商家账号（商家平台 > 产品中心）。
5. 沙箱联调：沙箱控制台取 APPID/应用私钥/支付宝公钥/网关，"调用接口无需具备所需的商业资质，无需绑定和开通产品"（https://opendocs.alipay.com/common/02kkv7）；沙箱应用网关收 From 蚂蚁类通知；WebSocket 接入需把订阅方式切 WebSocket。
6. ISV/服务商链路另有：创建第三方应用（企业账号，最多 10 个）→ 配置 → 上线 → 准备商家资质 → 协助商家开通产品 → 拿 `app_auth_token` 代调用（https://opendocs.alipay.com/isv/03kvcj 系列标题，`[全文待核验]`）。

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **异步通知完整原始 POST body 全文**（§5.1 系表格行拼接，非官方原始串；含 total_amount/gmt_refund 等业务字段全表）：`open/270/105902` 全文直抓。→ 待核验(09-27)
2. ~~**生活号开发者模式验证后半程**~~ **已核验(10-14)**：POST 表单 `service=alipay.service.check` + `EventType=verifygw`，验签 rsaCheckV2（保留 sign_type），回包为签名 XML（开发者公钥入 biz_content）——全文见 §3.2。原"公钥加密下发？"猜测不成立：是签名不是加密。
3. ~~**生活号被动通知事件表**~~ **已核验(10-14)**：接口 `alipay.mobile.public.message.notify`，事件 `follow`/`unfollow`/`enter`/`click`/`verifygw`，字段 `FromUserId`(废弃 OpenId)/`FromAlipayUserId`(现用 userid)/`MsgType`/`CreateTime`(毫秒)/`MsgId`/`UserInfo` 等，应答为无签名 XML ack，重试 2 次×5s——全文见 §2.3。模板消息送达事件未见此文档树记载（生活号 doc 树 2016 版只列五事件）。
4. ~~**生活号下行接口全文**~~ **部分已核验(10-14)**：`custom.send` 全文+48h 窗口+频控（接口名勘误为 `alipay.open.public.message.custom.send`）、`total.send`（群发，无 to_user_id）、`single.send`（模板单发）见 §2.3；`alipay.open.public.life.msg.recall` 与群发定时 `b/06y1fh` 入参 → 仍待核验(09-27)。
5. ~~**生活号异步验签保留 sign_type 的原因与示例串**~~ **已核验(10-14)**：示例串见 §3.2（`…&charset=GBK&service=…&sign_type=RSA2`）；机制由官方示例工程 `rsaCheckV2` 实证（V2=保留 sign_type，V1=剔除）；保留原因官方仍未述，不影响实现。
6. **小程序客服服务端接口全文**：`alipay.open.mini.miniapp.serviceconfig.modify` 入参（客服电话/在线客服开关？）；云客服访客名片 `ext-info` 中 `cinfo/key` 语义；客服下行 card 推送的频控与模板。→ 待核验(09-27)
7. **小程序模板消息接口全文**：`templatemessage.send` / `batchsend` 的 biz_content 全字段（to_user_id/user_template_id/page/data keyword 结构）、频控、错误码；`page` 带参跳转 FAQ 全文（`mini/03l8bx`）。→ 待核验(09-27)
8. **四地址对照页全文**（授权回调/应用网关/return_url/notify_url 各 1 个口径，当前仅站内搜索摘录）。→ 待核验(09-27)
9. **From 蚂蚁"产品地址优先"后半句**（`common/02km9j` 截断）与 topic 全量目录（`msgapi 类型列表` FAQ）。→ 待核验(09-27)
10. **订阅类通知重试口径**：`alipay.trade.subscription.changed` 的网关地址=NOTIFY_URL=应用网关？success/fail 大小写不敏感口径（当前见于非 primary 域）。→ 待核验(09-27)
11. **trade_status 全枚举**（TRADE_CLOSED/REFUND_SUCCESS 等是否存在于异步通知）。→ 待核验(09-27)
12. **V3（OAS3.0）签名/验签算法全文**。→ 待核验(09-27)
13. **AES 密钥算法细节**（模式/填充/IV，`common/02mse3` 全文）与 `alipay.open.auth.app.aes.set` 全文。→ 待核验(09-27)
14. **第三方应用创建/上线/商家资质链路全文**（`isv/03kvcj` 系列）与小程序/生活号独立创建页。→ 待核验(09-27)
15. **WebSocket 长连接接入全文**（From/To 消息的 WS 协议、沙箱 serverHost）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"支付宝推支付结果"：`POST` 表单（非 JSON）到 `notify_url`，字段含 `notify_time/notify_type=trade_status_sync/notify_id/charset/version/sign_type/sign/auth_app_id/trade_no/app_id/out_trade_no[/out_biz_no/gmt_refund/refund_fee]/trade_status/total_amount`；签名=`RSA2(SHA256withRSA)`，待签串=去 `sign/sign_type` → `url_decode` → 字典排序 → `k=v&…`，`sign` 为 base64；**生活号通知验签串保留 `sign_type`**。
- 模拟成功判定：回 `HTTP 200` + 纯文本 `success`（无空格/HTML/重定向）；`fail` 或非 200 即按 25h/8 次（支付 4m 首重 / From 蚂蚁 2m 首重，后续 10m/10m/1h/2h/6h/15h）重推；幂等键 `notify_id`（同条重试不变）+ `out_trade_no`；仅 `TRADE_SUCCESS/FINISHED` 认付款成功，且必须回查 `out_trade_no` 存在性与 `total_amount` 金额一致性。
- 模拟"生活号被动通知"：发往**应用网关**（非 notify_url）：`POST service=alipay.mobile.public.message.notify` + `biz_content=<XML 信封>`（§2.3）；须同步回**无签名 XML ack**；重试 2 次、间隔 5s（菜单点击与 verifygw 不重试）。
- 模拟"验证应用网关"握手（已核验(10-14)，勿再引"细节待核验"旧口径）：`POST service=alipay.service.check`、`EventType=verifygw`（§3.2）；验签**保留 sign_type**（rsaCheckV2 语义）；回 `<alipay><response><biz_content>开发者公钥</biz_content><success>true</success></response><sign>…</sign><sign_type>RSA2</sign_type></alipay>`，sign 对 response 节点内容。
- **mock-pulse 分歧（10-14 照录）**：`mock-pulse/src-tauri/src/connections/alipay/mod.rs` 按通用 rsaCheckV1 语义加签——`signing_concat` 剔除 `sign` **和** `sign_type`（其头部注释自述"rsaCheckV1 语义"）；探测（GOLDEN_PROBE_BODY=§5.1 支付通知形态）只要求 HTTP 200、不校验应答体（`no_body_check`），且未实现 alipay.service.check XML 握手（其注释自述"官方网关验证握手细节待核验(09-27)…不硬编码"）。DUDU #116 按票面/事实库以**生活号口径（保留 sign_type）**实现，故 mock-pulse 探测报文的**签名值不可作 DUDU 验签向量**；报文形态（表单编码、键、percent-encode 的 sign 位置）仍按其对拍。该分歧需在 #116 票评如实说明（mock-pulse 侧为只读，不在本票修改）。
- 模拟"小程序客服"：**无服务端推送可模拟**——客服=前端 `contact-button(tnt-inst-id+scene)` + 零号云客服；可模拟的是客服下行 card 提醒（默认 30 分钟一次）与未读同步语义。
- 模拟"小程序订阅消息"：先 `my.requestSubscribeMessage(entityIds≤3)` 获用户同意 → 服务端调 `templatemessage.send(trade_no/formId/ftoken)`；批量与订阅关系查询接口另计。
- 三方代调用：请求公共参数带 `app_auth_token`（`app_auth_code` 一次性、24h；token 准永久；重复授权刷旧值）；非三方通知里 `auth_app_id=app_id`。
- 准入模拟：`开发中` 应用不可线上调用；上线约 1 工作日审核；沙箱免资质联调。
