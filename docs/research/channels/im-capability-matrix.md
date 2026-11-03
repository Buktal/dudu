# 渠道 IM 双向能力分类清单（事实库衍生结论）

> 定位：本文是 `docs/research/channels/` 事实库（20 渠道）的**衍生结论文档**，不是事实源；所有渠道事实以各渠道事实库文档为准，本文只做「IM 双向能力」维度的归类与依据索引。事实库新增/修订后本文须同步复核
> 结论日期：2026-10-13。方法：逐渠道核对事实库中「来访消息推送」与「文本回复 API」两侧证据；缺口渠道以 WebSearch 官方站内摘录补证（标注来源 URL 与日期）。中国域名官方页直抓受当前网络策略阻断（WebFetch 无法验证 `developer.open-douyin.com`/`opendocs.alipay.com`/`developer.waimai.meituan.com` 域名安全性），本轮补证全部经 WebSearch 摘录，全文直抓留待复核
> 判定口径：**IM 双向** = 「收来访消息推送（平台→开发者回调/长连）」与「回复文本 API（开发者→平台，会话语义）」两侧均有官方证据；**仅入站** = 仅收侧有推送、无会话回复 API；**无 IM** = 两侧均无会话语义证据（交易/模板/短信等非 IM 通道不计数）；**证据不足** = 至少一侧存在性与形态未定，无法落前三类
> 2026-11-03 复核：抖音（douyin.md §8）/快手（kuaishou.md §5）/小红书（xiaohongshu.md §13）三渠道按事实库补摄同步，明细见 §二.3、§二.7、§三.3；抖音发送接口全文已于 2026-10-14 落库（douyin.md §6.1）
> 2026-11-03 第二轮：快手全域深挖后分类修订为「有条件（电商域准入制）」，明细见 §二.3 末条与 kuaishou.md §6

## 一、分类总表（20 渠道）

| # | 渠道 | 分类 | 收侧（来访推送） | 发侧（文本回复 API） | 依据 |
|---|---|---|---|---|---|
| 1 | 微信公众号 | IM 双向 | 7 种消息推送（XML，三模式） | 被动回复 7 种 + 客服消息 `POST /cgi-bin/message/custom/send`（11 msgtype，48h/额度） | wechat-mp.md §1 表 7/9/10、§2.6/§2.7 |
| 2 | 微信小程序 | IM 双向 | 客服消息接收（`text/image/miniprogrampage` + `user_enter_tempsession`） | `POST /cgi-bin/message/custom/send`（48h 窗口：发消息 5 条/48h、进会话 2 条/1min） | wechat-mini.md §1 表 2/3/4 |
| 3 | 企业微信 | IM 双向 | 自建应用消息回调（成员发往应用，XML+AES）+ 微信客服两段式回调 | 发送应用消息 `POST /cgi-bin/message/send` + 被动回复（90241） | wecom.md 页 90239/90240/90241/90236/94670（README §3A/3B/3F） |
| 4 | 飞书 | IM 双向 | `im.message.receive_v1` 事件（Webhook/WSS 长连） | `POST /open-apis/im/v1/messages`（create 页全文） | feishu.md §1 表（receive/create 两行）、§5.4/§5.10 |
| 5 | 钉钉 | IM 双向 | 机器人收消息（HTTP 明文+HmacSHA256 头 / Stream topic `/v1.0/im/bot/messages/get`）+ 服务号 `isw_user_msg_received` | `sessionWebhook` 应答回复 + `POST /v1.0/robot/groupMessages/send` + 工作通知 `asyncsend_v2` | dingtalk.md §1 表、§2 通道表 D、§3.3、§5.1 |
| 6 | QQ 机器人 | IM 双向 | `C2C_MESSAGE_CREATE` / `GROUP_AT_MESSAGE_CREATE` / 频道 `AT_MESSAGE_CREATE` 等事件（WS 网关/Webhook Ed25519） | `POST /v2/users/{user_openid}/messages`、`POST /v2/groups/{group_openid}/messages`（`msg_type=0` 文本，`msg_id+msg_seq` 去重） | qq.md §2 事件矩阵、§5 发送 API 节 |
| 7 | 微博 | IM 双向 | 粉丝服务平台 Webhook 私信推送（`type/receiver_id/sender_id/text`） | `POST https://m.api.weibo.com/2/messages/reply.json`（48h/99 条） | weibo.md §1 表 7/8、公共字段节 |
| 8 | 小红书 | IM 双向 | 小程序客服消息接收（JSON，5 MsgType）；专业号私信另有 third_im 三方客服推送（官方存在，接口规格在登录墙后） | `POST /api/rmp/message/custom`（48h 回复通道）；third_im 另有三方发送 API（同墙后） | xiaohongshu.md §10（含勘误注）、§13、README §2B；third_im 复核见 §二.7 |
| 9 | 抖音 | IM 双向 | dop `im_receive_msg`（scope `im.direct_message`，企业号，content 字段全表）；入站媒体可经 `GET /api/im/message/resources/` 读取（§8） | 「发送私信消息」接口（dop 树 `send-msg` / mini-app 树 `send-message`，`content_list` 必传） | douyin.md §2.1/§2.2/§5.4-5.10、§6.1、§8；补证见 §三.3 |
| 10 | 美团 | IM 双向 | 外卖 IM 单聊消息回调（`biz_type=1`，`{"data":"OK"}` 4s 内，超时重推+短信报警） | `msg/send 发送IM消息（接单）`（`biz_type=1` 两方会话 / `biz_type=4` 评价匿名群聊） | meituan.md §2.4、§3.1、§5.4、§7.5；补证见 §三.1 |
| 11 | 支付宝 | IM 双向（生活号线） | 生活号被动通知 `alipay.mobile.public.message.notify`（用户发文本/图片消息、关注、菜单点击；应用网关 + 事件订阅 + 开发者模式激活） | 客服单发 `alipay.mobile.public.message.custom.send`（异步单发/客服接口，「实现对用户消息的回复」） | alipay.md §2.3、§7.3；补证见 §二.5 |
| 12 | WhatsApp | IM 双向 | `messages` webhook（HMAC-SHA256 验签，7 天递减重试） | `POST graph.facebook.com/{v}/{phone_number_id}/messages`（Bearer） | whatsapp.md §1 表（webhook/send-messages 两行）、§5.2 |
| 13 | Telegram | IM 双向 | getUpdates / Webhook（27 类 Update，`update_id` 去重） | `POST api.telegram.org/bot<token>/sendMessage`（1–4096 字符） | telegram.md §1 表、§2 Update 清单、sendMessage 节 |
| 14 | 知乎 | 无 IM | 无（29 key 官方全量目录无推送类目；拉取式只读 REST） | 无（无会话发送 API；站内 `v4/messages` 为登录态逆向，非开放平台） | zhihu.md §2、§2.2、§3；复核见 §二.1 |
| 15 | B站 | 无 IM | 无（开放域 6 域无私信/客服域；Webhooks 封闭 4 事件 `authorize/deauthorize/video_open/video_fail`） | 无（规约禁令「以关联 UP 主名义对外发布评论、弹幕、私信」；无发送私信 API） | bilibili.md §2.1/§2.3、§6；复核见 §二.2 |
| 16 | 快手 | 有条件（电商域准入制） | 电商域有准入制通道（kwaixiaodian 智能客服：买家消息异步推送 ISV 接口，`Ks-Sign`=MD5(appKey+entity)；标准推送 62 事件无会话事件；主站开放域/小程序域维持无 IM）；ISV 线 2021-08 暂停入驻、2022-12 收敛为晓多/追一/壁虎三家，商家自研线待实测 | 电商域智能客服 `open.cs.intelligent.message.send`（merchant_cs scope，商家角色，实锤但准入制）+ 物流会话 pull/send（厂家角色）；主站域仅「发送订阅消息」 | kuaishou.md §2.1/§2.3、§5、§6；复核见 §二.3 |
| 17 | 拼多多 | 无 IM | 无客服/会话推送（PMC 推送为订单/售后/商品变更；客服平台为单点登录人工台） | 无会话 API（发送侧仅短信 `pdd.open.msg.service.*`） | pinduoduo.md §2.5/§2.6、§7.6；复核见 §二.4 |
| 18 | 淘宝/天猫 | 无 IM（开放侧） | 无「买家聊天即推」机制（§2.4 明示）；OpenIM 仅 `OffMsgPush` 离线推送；传输为 TMC 长连接（非 HTTP 回调） | 千牛/金斗云/TPN 为卖家工作台系统消息下行，非买家会话回复 | taobao.md §2.4、§3.1 |
| 19 | 京东 | 证据不足 | 咚咚 inbound（顾客→客服）推送通道无官方证据（仅聊天记录查询系为 jmq 异步轮询口径） | `jingdong.dongdong.packet.josChatMessage.push2`（外部 ISV 接入咚咚发消息，实锤）+ `chat_message4.2` 协议页（仅 voice 片段） | jingdong.md §2.4、§3.1、§5.3、§7.4/§7.5；补证见 §三.2 |
| 20 | 饿了么 | 证据不足（商户线 IM） | 用户线无 IM 推送（目录级核验，仅 4 订单类）；商户线 IM 存在官方「IM 接入场景方案」但消息收发/推送细节公开检索不可见 | 商户线 `eleme.shop.im.getIMStatus/updateIMStatus`（IM 开关状态）实锤；消息发送接口未获公开证据 | eleme.md §2.1/§2.4、§7.8；补证见 §二.6 |

「仅入站」类：**20 渠道中无渠道落入**——有来访会话推送的渠道全部同时具备回复 API；只有交易/授权类推送的渠道（淘宝/拼多多/京东订单线）本身就不构成会话入站

## 二、六个疑点渠道核验记录

### 二.1 知乎——「无推送」结论复核：成立，维持无 IM

- 事实库证据：zhihu.md §2——官方文档 JSON 全量 29 key（guide 3 + api 18 + skill 4 + mcp 4，`https://developer.zhihu.com/console/api/v2/docs`，2026-09-11 逐 key 对敲）无 webhook/事件/回调/私信类目；正文关键字 `webhook/推送/订阅/私信/长连接` 全部零命中；能力实现交叉（4 个独立第三方实现）均为拉取式 REST + 轮询任务；`回调` 仅指 OAuth `redirect_uri`
- 发送侧排除：`www.zhihu.com/api/v4/messages` 私信发送为 2017 年登录 cookie 逆向（zhihu.md §2.2 明确排除），非开放平台能力
- 本轮复核（2026-10-13）：无新增官方推送证据线索；**结论维持：无 IM**

### 二.2 B站——私信禁令边界：开放平台无私信收发，维持无 IM

- 事实库证据：bilibili.md §2.3——官方能力总览六域（账号授权/用户管理/视频管理/数据开放/专栏管理/直播能力）无「私信/客服/会话」域；站内检索 `site:open.bilibili.com 私信 OR 客服` 仅命中管理规约禁令；Webhooks 事件表封闭 4 事件（镜像 + 官方 deauthorize 印证）
- 禁令边界（§2.3 证据 3）：管理规约原文禁止「以关联 UP 主名义对外发布评论、弹幕、私信」——平台层面明确限制开发者代用户发私信，与「无发送私信 API」互证；`api.vc.bilibili.com` 私信接口为社区逆向（需 Cookie+WBI），不属于开放平台，本库不收录
- 本轮复核（2026-10-13）：无新增；**结论维持：无 IM**

### 二.3 快手——无私信推送：主站域成立；电商域发现准入制消息通道（2026-11-03 修订）

- 事实库证据：kuaishou.md §2.3——开放域 WebHook 事件目录穷尽 3 事件（官方文档站 bundle `app.0028ffe6.js` 路由枚举仅 `testEvent/authorizationEvent/revocationOfAuth` 三组）；站内搜索 `私信` 仅命中端上分享 SDK 与订阅消息；小程序服务端「消息」仅有发送侧订阅消息（模板下发，需用户先订阅）
- 本轮复核（2026-10-13 WebSearch）：发现事实库未收录页 [客服消息能力 | 快手小程序文档](https://open.kuaishou.com/docs/develop/functionAccessGuide/customerService.html)——官方称「提供通用的客服能力，辅助开发者实现用户和小程序的客服咨询」，但公开检索未见其有「客服消息回调到开发者服务器」或服务端收发 API 文档；快手已知回调族（支付/签约/代扣/行业事件回调）均为交易域。该页正文直抓留待复核（当前网络策略阻断直抓），**在取得服务端收发证据前不改变分类**：无 IM（保留一条待核验注记）
- 2026-11-03 复核（kuaishou.md §5）：新文档站（`/doc/docs-page`，qiankun 微前端）四棵文档树合计 1304 页穷尽扫描＋官方搜索索引 11 个 IM 关键词扫描＋ bundle 关键词扫描，均无 IM/客服服务端 API；上述「客服消息能力」页已抓全文——button `open-type="contact"` 打开客服会话＋平台人工工作台，全页无 API/回调/token；另发现服务商推送族（信封 `{encryptedMsg, msgId, componentAppId, timestamp}`，`kwaisign`=SHA1(body+TOKEN)+AES）事件穷尽为授权/审核管理域。**§五.5 待核验项关闭，主站域结论维持：无 IM**
- 2026-11-03 第二轮修订（kuaishou.md §6）：电商开放平台 open.kwaixiaodian.com 匿名文档网关穷尽——推送事件目录 12 类 62 事件（零会话事件）+ API 目录 26 类 347 接口（客服类目仅物流会话 4 接口）+ 官方 jar 反编译；**发现准入制买家↔商家消息通道**：智能客服（收=买家消息异步推送 ISV 接口 `Ks-Sign`=MD5(appKey+entity)，发=`open.cs.intelligent.message.send`，scope `merchant_cs`）与物流会话（pull/send，oauthRole 厂家）；准入三道关卡（2021-08 暂停类目入驻、2022-12 收敛为晓多/追一/壁虎、识别率 85%/覆盖率 65% 上线门槛），商家自研线为官方方案明示路径、开通待实测。**分类修订：无 IM → 有条件（电商域准入制）**

### 二.4 拼多多——无客服 API 证据：成立，维持无 IM

- 事实库证据：pinduoduo.md §2.5——客服平台使用文档（官方摘录）「进入客服平台只能为一个账号」= 单点登录人工工作台，非开放消息通道；`KNOCK使用指南` 仅为文档目录条目（正文未取）；「PDD 客服消息（消费者↔商家聊天）开放收发接口 → 待核验」，本次未摘到任何客服消息 API；发送侧仅有短信三接口（§2.6）
- 本轮复核（2026-10-13 WebSearch）：`pdd.im.msg.list`/`pdd.knock.msg.push` 等接口名零命中；「KNOCK」在公开语境为开放平台站内即时沟通群/文档目录条目（平台↔服务商沟通），非商家↔消费者客服消息 API；近期公告（2026-09）新增推送能力均为订单/商品域。**结论维持：无 IM**

### 二.5 支付宝——小程序客服为前端组件（维持）+ 生活号线存在双向（本轮补证修正）

- 事实库既有证据：alipay.md §2.4——小程序客服由蚂蚁零号云客服提供，前端 `contact-button(tnt-inst-id+scene)` 组件唤起，**无服务端客服事件推送**（结论维持）；§2.3——生活号被动通知发往应用网关，但「关注/取关/菜单点击等 eventType 与字段」标待核验（§7.3）
- 本轮补证（2026-10-13 WebSearch 官方站内摘录，全文直抓待网络恢复后复核）
  - 事件消息 [alipay.mobile.public.message.notify](https://opendocs.alipay.com/open/53/103426)（接收用户操作事件通知）之下存在 [文本消息](https://opendocs.alipay.com/open/53/103433)（「接收用户主动发送的文字消息，可用异步单发消息接口回复用户」）与 [图片消息](https://opendocs.alipay.com/open/53/103434) 两页——即**用户→生活号的消息有推送事件**，回填事实库 §7.3 缺口
  - [生活号事件订阅](https://opendocs.alipay.com/fw/api/105937)：管理中心 → 生活号应用配置 → 「事件订阅与重试机制」选择订阅的事件消息——推送需显式订阅
  - 回复接口：alipay.md §2.3 已录 `alipay.mobile.public.message.custom.send`（[发送消息 3.3.1 异步单发（客服接口）](https://opendocs.alipay.com/open/53/104550)，标题级）；本轮另见 [生活号发送消息页](https://opendocs.alipay.com/fw/007kci) 摘录作 `alipay.open.public.message.custom.send`，「开发者可以使用该接口实现对用户消息的回复功能」——`mobile.*` 与 `open.*` 两个前缀并存，以事实库已核验的 104550 标题为准，fw/007kci 页正文待直抓核对命名
- **结论修正：支付宝按「IM 双向（生活号线）」归类**——前提为生活号应用形态（非小程序）+ 开发者模式激活 + 应用网关 + 事件订阅 + RSA2 验签；小程序客服线维持「前端组件、无服务端推送」。地图 #96 Out of scope 中「支付宝」不应整体排除

### 二.6 饿了么——用户线仅订单推送（维持）+ 商户线 IM 存在接入方案（本轮补证升级为证据不足）

- 事实库既有证据：eleme.md §2.1/§2.4——用户线（`openapi-doc.faas.ele.me`）推送仅 4 订单类 + H5，官方文档树无任何 IM 推送页（目录级核验）；商户线「消息」官方定义即订单/运单消息；§7.8「商户线 IM 存在性不能排除（SPA 全文未取）」
- 本轮补证（2026-10-13 WebSearch 官方站内摘录）
  - [IM(即时消息)接入场景方案](https://open.shop.ele.me/openapi/documents/shopim)（更新 2026-03-19）实锤存在：「本文档面向对象为期望接入 IM（即时消息、在线联系）的第三方开发者或者自研商家，方便商家、骑手与用户之间的在线实时沟通」——回填事实库 §2.4/§7.8 缺口：商户线 IM 体系**存在**且有公开接入文档
  - 接口面公开可见部分仅 [eleme.shop.im.updateIMStatus](https://open.shop.ele.me/openapi/apilist/eleme-shop/eleme-shop-im-updateIMStatus)（更新店铺 IM 开关状态）与 `eleme.shop.im.getIMStatus`（查询）；`eleme.shop.im.sendMsg`/消息推送事件名等**公开检索零命中**（疑在登录墙/未索引页）
  - 注意公告区含「全双工推送下线通知」（[公告中心](https://open.shop.ele.me/openapi/publicnotice/0)）——商户线推送通道形态可能正在收敛，IM 消息推送是否受影响未知
- **结论：证据不足（商户线 IM）**——用户线维持「无 IM 推送」；商户线 IM 接入方案与状态接口实锤，但「收来访消息推送 + 回复文本 API」两侧细节均未获公开原文，无法落「IM 双向」或「无 IM」。**不列入本批实施票，待官方文档直抓复核后再分类。**

### 二.7 小红书——专业号私信官方通道疑点：推翻，third_im 体系存在（规格部分未公开）

- 事实库既有结论（xiaohongshu.md §2.4，2026-09-10）：专业号私信（DM）无官方公开 webhook/API，仅商家工作台逆向通道
- 2026-11-03 复核（xiaohongshu.md §13）：商业开放平台 ad-market.xiaohongshu.com 文档中心「私信三方」域（bizType=945）提供 third_im 三方客服体系——OAuth 授权（scope `third_im`，access_token 1 天/refresh_token 30 天，业务 API 走 `Access-Token` 请求头）＋三方客服接收消息推送＋三方客服发送消息 API＋意向评论接口＋私信客资线索推送（`X-Red-Signature` HMAC-SHA1 验签，30s×3 重试）。**旧结论推翻**
- 工程接入当前不可行：接收/发送接口字段规格在企业微信文档登录墙后（匿名 opendoc 回 retcode 200060）；准入需等保备案＋测评报告＋ICP 增值电信许可证＋隐私政策，三方服务商须 IM 客户 ≥50 家且小红书在服 ≥10 家；secretKey/测试号须人工对接群周度开白。社区风控硬约束：陌生人 20 人/天、未回复 24h 内 1 条、累计 3 条
- 分类影响：小红书维持「IM 双向」（miniapp 线已实现并接入）；third_im 为并行第二体系（服务专业号私信，与小程序客服会话互不打通），规格取得且过准入前不开实施票（缺口清单见 xiaohongshu.md §13.10）

## 三、三渠道补证记录

### 三.1 美团 IM biz_type=1 载荷证据

- 事实库已有（meituan.md §2.4/§5.4）：收侧 docDetail/842 单聊消息回调字段表（`biz_type` 固定 1 / `app_poi_code` / `push_content` / `extended_field`），应答 `{"data":"OK"}` 4s 内，超时重推+短信报警；发侧 docDetail/845 `msg/send`（`biz_type=1` 两方会话 / `biz_type=4` 评价匿名群聊）
- 本轮补证（2026-10-13 WebSearch）：[docDetail/842 官方页摘要](https://developer.waimai.meituan.com/home/docDetail/842)证实推送语义：「当用户或商家通过IM发送会话消息时，会通过此消息将会话消息推送至服务商。服务商自身通过美团技术服务合作中心接口发送的会话消息不会通过此消息进行推送」——**回环排除语义实锤**（收侧只推对端消息，双向链路自洽）。相关页 docDetail/830（IM 发送被风控拦截回调）同族存在
- 遗留缺口：`push_content` 内部消息结构（文本/图片/订单卡片）正文仍未取得（官方页直抓受网络策略阻断，搜索摘要不含结构）→ 维持 meituan.md §7.5 待核验，**不影响双向判定**

### 三.2 京东咚咚 chat_message4.2 双向证据

- 事实库已有（jingdong.md §2.4）：发侧 `jingdong.dongdong.packet.josChatMessage.push2`（官方 API 页描述「发送咚咚消息。开放场景：咚咚客服消息。开放接入方：外部isv接入咚咚发消息」）+ 消息发送结果查询 + `DataService` 历史聊天记录查询系（jmq 异步，秒级误差口径）；协议页 `chat_message4.2` 仅标题 + voice 一片段；**inbound（顾客→客服）推送通道待核验（§7.5）**
- 本轮补证（2026-10-13 WebSearch）：[chat_message4.2 协议页](https://jos.jd.com/platformdetail?itemId=2222)（更新 2023-04-10）仍仅见 voice 片段级摘要；京麦 JSSDK 消息类型（1 文本/2 图片/3 链接/4 商品）为客户端侧定义；opendj「咚咚场景化消息接入」需申请 `aspid`——为商家触达用户的场景化消息，非顾客→客服来访推送；**未见任何 inbound 推送通道官方文档**。另注意 JOS 已于 2026-07-01 融合至 open.jd.com、2026-08-30 关闭（jingdong.md §7.1b），JOS 域页面可达性与新平台文档入口需在配额恢复后复核
- **结论：证据不足**——发送侧实锤、接收侧无官方证据（仅聊天记录异步查询系），不满足「收来访消息推送」半边；不列入本批实施票

### 三.3 抖音 dop IM 发送侧 API

- 事实库已有（douyin.md §2.1/§2.2）：收侧 `im_receive_msg`（scope `im.direct_message`，事件 content 字段全表）；发送侧仅有旁证——`source` 字段「通过发送私信消息接口发送显示具体 clientkey」+ 企业号线索页发送侧 msgType 数值对照（text=1、image=2 等），正式接口页未定位（§7.7）
- 本轮补证（2026-10-13 WebSearch 官方文档位实锤）
  - dop 树：[发送私信消息（移动/网站应用）](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/interaction-management/private-message/send-msg)——「消息接收方身份需为认证企业号及其员工号和小程序品牌号及员工号」「授权过 `im.direct_message` 私信管理能力」「调用接口时 `content_list` 字段必传」
  - mini-app 树：[发送私信消息（小程序）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/send-message)——`content_list` 必传且最多 3 条，其中必有 1 条小程序卡片消息（小程序卡片私信场景）
  - 能力总览：[私信/群管理](https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/interaction-management/im)——「私信消息管理（接收和发送）」；进入会话页事件 webhook 后 30 秒内发送的被动回复约束
- **结论：发送侧官方 API 存在实锤，抖音落「IM 双向」**（前提：企业号 + `im.direct_message` 授权）。发送接口完整参数表与频控已于 2026-10-14 全文直抓落库（douyin.md §6.1），本项收口；2026-11-03 另补（douyin.md §8）：入站媒体下载接口 `GET /api/im/message/resources/`（scope `im.multimedia_message`）推翻「无通用下载接口」旧结论；小游戏树「抖音客服平台」体系（`douyin_microgame_im` 推送＋`reply_user_text/reply_user_image` 回复，48h/5 条窗口，`v2/token` 免用户授权）全文落库——接入前提为小游戏 appid，与 dop 客户群不重叠，暂不据此改类或开票

## 四、对地图 #96 的影响

- **Out of scope 排除记录**（待「渠道建模决策」票回填）：知乎、B站、拼多多、淘宝（开放侧；TMC 交易推送与聊天推送语义区分，长连接传输另决）；快手移出本组——电商域准入制通道实锤后改列「有条件」（§一.16、§二.3，2026-11-03 第二轮）
- **不落入 Out of scope、亦暂不开实施票**：京东（发侧实锤、收侧无证据）、饿了么（商户线 IM 接入方案实锤、细节未公开）——证据不足，待官方文档直抓复核后重分类
- **地图 Notes 中「美团待核验」可解除**：美团 IM 双向成立（回调+发送两侧官方页面均在，`push_content` 结构为实施期细节）
- **实施票全集（本批 11 张候选）**：微信公众号、微信小程序、企业微信、飞书、钉钉、QQ、微博、小红书、抖音、美团、WhatsApp、Telegram（12 渠道具备 IM 双向）；其中支付宝（生活号线）双向成立但需「渠道建模决策」票先定生活号应用形态的建模取舍，不计入本批

## 五、遗留待核验（延续各事实库 §7，本次新增项标注）

1. 美团 `push_content` 消息结构全文（meituan.md §7.5 延续）
2. 京东咚咚 `chat_message4.2` 协议全文与 inbound 推送通道（jingdong.md §7.4/7.5 延续；JOS 迁移后新入口）
3. 抖音 dop/mini-app「发送私信消息」接口完整参数与频控——已关闭（douyin.md §6.1 全文落库，2026-10-14）
4. 支付宝生活号事件消息全文（文本 103433 / 图片 103434 / 事件订阅 105937 / fw/007kci 命名核对；alipay.md §7.3 部分回填）
5. 快手小程序「客服消息能力」页正文——已关闭（人工工作台、无服务端 API，kuaishou.md §5，2026-11-03）
9. 快手电商域智能客服通道商家自研开通实测：商家开发者应用能否开通 `merchant_cs` 推送与 `open.cs.intelligent.message.send` 权限、推送地址线下报备流程、send.toUser 买家寻址字段（结构体无 openId，疑 requestId 关联）（kuaishou.md §6.5/§6.11，2026-11-03 第二轮新增）
6. 饿了么商户线 shopim 方案全文与 `eleme.shop.im` 消息收发接口清单（本轮新增；含「全双工推送下线」对 IM 的影响）
7. 小红书 third_im 接收推送信封/验签/握手/应答与发送接口字段规格（企业微信文档登录墙后，需服务商身份；xiaohongshu.md §13.10，2026-11-03 新增）
8. 抖音客服平台开通资格要求与小程序「抖音 IM 客服私信」内测申请通道（douyin.md §8，2026-11-03 新增）
