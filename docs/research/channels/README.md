# 二十渠道事实库索引（国内外全量）

> 摄取日期：2026-09-10；新增四渠道（飞书/微博/公众号/小程序）2026-09-10（4 路 research 并行＋4 路核验并行）；第二批十一渠道（钉钉/QQ/淘宝/京东/拼多多/美团/饿了么/B站/快手/知乎/支付宝）2026-09-10（逐个 research＋分批核验）
> 核验结论：抖音 23 URL 全 200 无伪造；企微 28 页中 23 页逐字验过；小红书 miniapp 逐字复现、ark 侧维持 `[多源]`；飞书 18 页全文已验；微博 18/18 通过；公众号 16/16 通过；小程序 9 页通过；钉钉 18 页直抓通过（通讯录 15 类、转交 redirect 落定）；淘宝 30 点位 24 通过（OffMsgPush 销项、token.create/refresh 拆分）；支付宝三地址/25h8次/notify_id/app_auth_token 旁证通过；京东网关/签名/OAuth 方向通过（JOS 关闭迁移新发现）；拼多多网关/MD5向量/OAuth链路通过（permit 方法名降级）；美团双体系/三态回调/签名通过（IM 体降级）；饿了么用户线 15/15 通过（商户线维持摘录）；B站六域/签名/OAuth302/直播报备通过（事件页降级）；快手 17 页全文通过（§4.2 截断已修复）；知乎无推送结论成立（官方 29 key 无推送类目）；QQ 30 点位基本全过（op13/Ed25519/双口径照录）
> 各文档 §1 均有完整页面地址清单；标注「待核验(09-27)」的条目等配额恢复后补——补摄计划见 issue #14
> 注：朴朴超市无开放平台（无公开文档入口），未建事实库。海外 WhatsApp/Telegram 2026-09-10 已入库（逐个 research＋并行核验）：WhatsApp 官方摘录交叉全过（3MB 上限落定、v23 快照注、无加密软化）；Telegram 7 页 WebFetch 全文全过（测试根地址落定、challenge 缺席收紧）

| 渠道 | 形态 | 官方文档门户 | 事实库 | 文档数 |
|---|---|---|---|---|
| 抖音 | 直连私信（dop IM，要求企业号）+ 小游戏/服务商/生活服务 | https://developer.open-douyin.com/ | [douyin.md](./douyin.md) | 24 项 |
| 小红书 | 小程序客服消息 + 电商 ark 推送 | https://miniapp.xiaohongshu.com/ ；电商 https://open.xiaohongshu.com/ | [xiaohongshu.md](./xiaohongshu.md) | 14 项 |
| 企业微信 | 直连私信（自建应用回调，XML+AES）+ 机器人 JSON | https://developer.work.weixin.qq.com/document/ | [wecom.md](./wecom.md) | 28 页 |
| 飞书 | Webhook 或 WebSocket 长连接（JSON v2.0） | https://open.feishu.cn/ | [feishu.md](./feishu.md) | 21 项 |
| 微博 | 粉丝服务平台 Webhook（JSON/微信XML 可切） | https://open.weibo.com/wiki/ | [weibo.md](./weibo.md) | 18 页 |
| 微信公众号 | Webhook（XML 仅，GET 明文 echostr，三模式） | https://developers.weixin.qq.com/doc/service/ | [wechat-mp.md](./wechat-mp.md) | 16 核心页 |
| 微信小程序 | Webhook（XML/JSON 可选，客服消息为主） | https://developers.weixin.qq.com/ | [wechat-mini.md](./wechat-mini.md) | 10 项 |
| 钉钉 | Stream 明文 / 新 HTTP 密文 / 旧 oapi 三体系 | https://open.dingtalk.com/ | [dingtalk.md](./dingtalk.md) | 21 项 |
| QQ 机器人 | WebSocket 网关 / Webhook（Ed25519） | https://bot.q.qq.com/wiki/ | [qq.md](./qq.md) | 30 点位 |
| 淘宝/天猫 | TMC 长连接（国内无 HTTP 回调）+ 全球栈 HTTP | https://open.taobao.com/ | [taobao.md](./taobao.md) | 30 点位 |
| 京东 | JOS 消息推送（listId=520，SPA 待复核） | https://open.jd.com/ | [jingdong.md](./jingdong.md) | 20+ 页 |
| 拼多多 | 订阅推送 PMC（SPA 待复核） | https://open.pinduoduo.com/ | [pinduoduo.md](./pinduoduo.md) | 17 页 |
| 美团 | 技术服务合作中心回调（表单 POST） | https://developer.meituan.com/ | [meituan.md](./meituan.md) | 20+ 页 |
| 饿了么 | 用户线推送（SHA1）/ 商户线（待核验） | https://openapi-doc.faas.ele.me/ | [eleme.md](./eleme.md) | 15+9 页 |
| B站 | Webhooks（仅 4 事件；私信无公开推送） | https://open.bilibili.com/ | [bilibili.md](./bilibili.md) | 15 页 |
| 快手 | 开放域 3 事件 + 小程序支付回调族 | https://open.kuaishou.com/ | [kuaishou.md](./kuaishou.md) | 17 页 |
| 知乎 | 无公开推送（拉取式只读 REST） | https://developer.zhihu.com/ | [zhihu.md](./zhihu.md) | 5 页（结论库） |
| 支付宝 | notify_url/应用网关/蚂蚁订阅三地址 | https://opendocs.alipay.com/ | [alipay.md](./alipay.md) | 50 页 |
| WhatsApp | Webhook（HMAC-SHA256，无加密）+ 7 天递减重试 | https://developers.facebook.com/docs/whatsapp/ | [whatsapp.md](./whatsapp.md) | 22 页 |
| Telegram | 长轮询/Webhook 互斥（恒等头，无 HMAC） | https://core.telegram.org/bots/ | [telegram.md](./telegram.md) | 8 页 |

## 七家速记

- **抖音**：四套并行推送体系（dop/小游戏/服务商/生活服务），v0 主做 dop；验签头 `X-Douyin-Signature = sha1hex(client_secret + body)`
- **小红书**：官方消息型推送＝小程序客服消息（URL＋Token＋EncodingAESKey，GET echostr 握手，`sha1(字典序排序)` 验签，JSON 载荷，回 success，5s×3 重试）；推送信封 `{Nonce, Timestamp, Encrypt, MsgSignature}`（body 内），加解密＝微信同族（官方 MsgDecrypt.zip 源码实锤，见 xiaohongshu.md §11）；电商 ark 网关另有订单事件推送
- **企业微信**：`POST ?msg_signature=&timestamp=&nonce=`＋XML 信封；AES-256-CBC（Base64(EncodingAESKey+"=") 32B、IV=前 16B、PKCS#7 补 32B 倍数）；官方黄金自测样本在 wecom.md §5.1（`477715d11cdb4164915debcba66cb864d751f3e6` 已独立复算命中）
- **飞书**：双通道二选一（Webhook `application/json;charset=utf-8` / 长连接 WSS 仅自建、50 连接、集群随机其一）；握手 POST challenge（现行 1s，历史卡片 3s/1s 矛盾）；验签 `hex(sha256(timestamp+nonce+encrypt_key+body))`→`X-Lark-Signature`；AES-256-CBC（key=`sha256(encrypt_key)`、IV 前 16B）；重试 15s/5m/1h/6h×4；幂等 `event_id`（消息用 `message_id`）
- **微博**：现役可新接入＝粉服 Webhook（JSON 默认，`set_format` 切 XML）；握手 GET `signature/timestamp/nonce/echostr`，`sha1(排序(appsecret,timestamp,nonce))`（黄金算例 xyz123xyz→90e4c22c）；载荷 `type/receiver_id/sender_id/created_at/text/data`；事件 `follow/unfollow/subscribe/unsubscribe/scan/scan_follow/click/view`（mention 暂停）；客服 `reply.json`（48h/99 条）；5s×3；排重 `sender_id+created_at`
- **公众号**：服务器配置四项、推送仅 XML；GET 三参 sha1＋原样回 echostr；安全模式收包仅 `ToUserName+Encrypt`，四参 `msg_signature`（数值例 899cf89e/046e02f8/1b933996）；AES 同企微但尾部为 AppId 须校验；7 种消息（含 MediaId16K）+ 6 基础事件 + 9 菜单扩展 + 模板/群发/订阅通知回执；被动 7＋转客服 1；客服 11 msgtype；token 双轨（普通 GET/stable POST）
- **小程序**：配置五项、数据格式 XML/JSON 可选；GET 握手同公众号（算例 f464b24）；客服接收仅 `text/image/miniprogrampage`＋事件 `user_enter_tempsession`（证伪 `user_enter_session`）；加密回包 Nonce 复用请求值；云函数仅客服且二元组抢占、云托管内网免签（`x-wx-sources` vs `x-wx-source` 官方不一致）；客服发送 11 体＋窗口（发消息 5/48h、进会话 2/1min）；token 双轨 7200s 隔离
- **钉钉**：三体系（Stream 明文 WebSocket 50 连接/SUCCESS-LATER / 新 HTTP 大写密文信封 / 旧 oapi encrypt）；旧回调 sha1 四参＋AES（调试向量）；机器人 HmacSHA256；审批双信封＋按 Code 订阅；token 7200s（第三方重复获取返新）；asyncsend_v2 频控
- **QQ 机器人**：WS 网关（Hello/Identify/Ready/心跳/Resume/分片）或 Webhook（op13 `plain_token/event_ts`）；Ed25519 签名、无 AES（两组向量）；事件 `C2C/GROUP_AT/GROUP/AT频道/DIRECT/FRIEND_ADD/GROUP_ADD_ROBOT`；`access_token` 7200s＋60s 轮换；发送单聊/群 API；`msg_seq` 去重；准入企业/个人＋沙箱 20 人＋IP 白名单
- **淘宝**：国内 TOP 无 HTTP 回调——消息走 TMC 长连接（`ws://mc.api.taobao.com/`）/轮询 consume-confirm/ MQ；交易 27/退款 15/商品 14；OpenIM 仅 `OffMsgPush`；签名 md5/hmac 三算法；OAuth code 30min＋安全等级＋refresh 60/天；未 confirm 6min 重发；全球栈另有 HTTPS 回调
- **京东**：JOS 消息推送（listId=520，SPA 正文待复核；JOS 2026-07-01 融合至 open.jd.com）；订单 9 枚举；AFS 售后消息名；咚咚 `chat_message4.2`/`push2`；签名 MD5(secret+字母序+secret)＋timestamp 10min；OAuth token 商家绑定；测试 500/日→上线 30 万/日
- **拼多多**：订阅后主动推（`permit/cancel` 方法名待核验）；网关 `gw-api`；签名 `UPPER(MD5(secret+排序kv+secret))`（向量 E4DE3E 已重算）；token 经 `token.create` 放 body 或 OAuth 链路；订单 1-待发货/2-已发货/3-已签收；客服无开放 API 证据
- **美团**：双体系（合作中心回调 vs 生态 OAuth）；签名 MD5(url?字母序+secret)；POST 表单（form-urlencoded）限 80/8080；订单三态 4/8＋5 分钟未接单自动取消退款；IM `biz_type=1`（体待核验）；2s ok＋1 分钟×3；ISV/品牌商/个人三分
- **饿了么**：两代两线（用户线 SHA1 五步＋4 订单推送＋H5，无 token 无加密，200+ok；商户线 SPA 待核验）；频控 1009；账户 token 与推送无关
- **B站**：SPA 仅回壳；开放六域；Webhooks HTTPS POST（镜像）；封闭 4 事件（`authorize/deauthorize/video_open/video_fail`）；私信/客服无公开推送（禁令原文）；服务端 HMAC-SHA256＋OAuth302；直播双体系＋报备邮箱
- **快手**：开放域仅 3 事件（`TEST/AUTHORIZE/UN_AUTHORIZE`，上下篇链闭合）；私信无公开推送；小程序支付回调族（`PAYMENT/REFUND/SETTLE/WITHHOLD/CONTRACT`，16 次重试表）；`kwaisign=MD5(body+secret)` 无 AES；token 48h/refresh 180 天/code 2 分钟；企业资质认证
- **知乎**：无公开消息/私信推送（官方 29 key 无推送类目，枚举消极证据）；拉取式只读 REST＋任务轮询；Bearer＋秒级时间戳；OAuth 仅登录用途；只做请求-响应桩
- **支付宝**：三地址（接口 `notify_url` / 应用网关 / From 蚂蚁订阅）；支付通知仅 SUCCESS/FINISHED 认付款；success+200/fail 重推 25h 8 次；`notify_id` 幂等＋RSA2 验签（`rsaCheckV1`）；`app_auth_token` 代调用；生活号网关验证；小程序客服为前端组件非推送
- **WhatsApp**：单 URL＋`messages` 订阅；GET 三参握手＋200 裸回 challenge；信封 `object→entry→messages/statuses/contacts`；`wamid` 三处同源；`X-Hub-Signature-256=HMAC-SHA256(AppSecret,body)`；仅 HTTPS＋签名、无加密字段；mTLS 可选；发送 `POST graph.facebook.com/{v}/…/messages`＋Bearer；重试递减 7 天；阶梯 250→Unlimited＋80mps→1000mps；10-01 计费矛盾做开关
- **Telegram**：长轮询与 Webhook 互斥（24h 暂存）；端口 443/80/88/8443；IPv4 only；源段双段；TLS1.2+；无官方记述的 challenge；27 类 Update（默认排除 3 类）；`update_id` 去重；恒等头 1–256 无 HMAC；发送 `bot<token>/METHOD`；sendMessage 1–4096；失败包络＋`retry_after/migrate`；免费三档＋429；付费广播 1000/s；文件 50MB/20MB；BotFather 零门槛

---

## 一、抖音（24 项）——详见 `douyin.md §1`

### 1A. dop 推送总纲（信封 `{event,from_user_id,to_user_id,client_key,content,log_id}`，验签 sha1，握手 verify_webhook+challenge，5s×3+Msg-Id 去重）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [Webhooks 概述](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/summarize) | 握手/订阅/重试/验签总纲 | `verify_webhook` |
| [Webhooks 事件列表](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/event-list) | 全量事件目录+统一信封+各事件 content（`saved_time:2025-10-13`） | `create_video/authorize/unauthorize/im_receive_msg/im_send_msg/im_enter_direct_msg/enter_group_audit_change/group_fans_event/contract_authorize/contract_unauthorize/union_auth_info_for_c/union_auth_info_for_b/im_group_receive_msg/im_group_send_msg/new_video_digg/new_follow_action` |
| [获取事件订阅状态](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/get-event-subscription-status) | `GET /event/status/list/` 无参免鉴权 | 订阅管理 |
| [更新事件订阅状态](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/update-event-subscription-status) | `POST /event/status/update/`（event-list 内联表写 GET，官方自相矛盾，已复核，模拟按 POST） | 订阅管理 |
| [抖音服务市场订单事件](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/webhooks/service-market-order) | scope `market.service.user` 的订单推送 | `service_market_order`（order_event 1-5） |
| [企业号线索组件能力](https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/enterprise-account-open-ability/leads-b2c-im-ability/clue-component-open) | 私信组件消息格式+scope `ad.leads.im_event_open`（PR 2024112059215/v1.0.5） | `im_receive_msg/im_send_msg` 变体 `video/premium_online_appointment_card/leads_phone_card/lead_commodity_card/poi_card/applet_card/text/image` |

### 1B. IM 私信明细（mini-app 树，同 dop 信封/机制）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收私信消息事件](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook) | IM content 字段表+文本/表情/图片/视频/留资卡示例 | `im_receive_msg/im_send_msg`（message_type `text/image/user_local_image/emoji/video/user_local_video/retain_consult_card/other`） |
| [私信消息撤回事件](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-withdraw) | content 仅 `server_message_id`（JSON 字符串）+`msg_id`/`log_id`+双端推送规则 | `im_recall_msg` |
| [消息已读事件](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/message-read-webhook) | `conversation_short_id/conversation_type/read_open_id/index` 对齐 | `im_message_read` |
| [进入私信会话页事件](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/enter-direct-msg-webhook) | content 为 JSON 字符串，含 scene/query/path/ad_info | `im_enter_direct_msg` |

### 1C. 小游戏推送体系（`x-signature=base64(md5(字典序header&串+body+token))`，POST verify_request 回 200；旧客服 GET+echostr+sha1，2025-06-30 下线）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息推送配置接入指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push/msg-push-config-guide) | 新体系验签与配置 | `verify_request/gift_delivery/douyin_microgame_im` |
| [消息推送客服（旧）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push-customer-service) | 旧 echostr 体系+迁移公告 | 客服文本/图片（`ToUserName/FromUserName/CreateTime/MsgType/Content/PicUrl`） |
| [抖音客服平台新版指引（待抓全文）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/message-push/douyin-microgame-im-guide) | 迁移目标平台接入文档（2026-09-10 新定位） | 待核验 |

### 1D. 服务商体系（信封 `{Nonce,TimeStamp,Encrypt,MsgSignature}`，TOKEN 验签+KEY 解密，回 `success` 否则 3 次重试）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息推送及加解密说明](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/encryption/) | 授权/消息事件推送与加解密 | `component_ticket`/授权成功与解除/找回授权码/提审与信息变更审核结果 |

### 1E. 生活服务体系（信封 `{event,client_key,content(JSON字符串),log_id}`，sha1(AppSecret+去换行body)，200+2.5s 成功否则 N 次重试）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [WebHooks 接入](https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/webhooks) | 回调/验签/订阅/重试总纲 | `verify_webhook/life_trade_order_notify`（`pay_success`） |
| [消息推送配置接入](https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/message-push-configuration-access) | SPI（看响应体）vs WebHooks（只看状态码）选型 | 机制选型 |
| [加密字段解密方法](https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/decrypt) | `Enc.` 在线加解密（50 条/批）与旧 AES-256-CBC 本地解密 | 字段级加密 |

### 1F. 凭证/调用配套

| 文档 | 一句话 |
|---|---|
| [OpenAPI 通用参数](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/common-params) | client_key/secret 来源与 token 定义链 |
| [获取 access_token](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/get-access-token) | form 表单、15 天/`refresh 30 天` |
| [刷新 access_token](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/refresh-access-token/) | 续 15 天但 refresh 有效期不变 |
| [生成 client_token](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/client-token) | JSON、`client_credential`、7200s |

---

## 二、小红书（14 项）——详见 `xiaohongshu.md §1/§9/§10/§11`

### 2A. 电商 ark 推送（统一 POST 网关；事件体为 SDK 多源，官方推送章节仍在 POST 墙后）——5 API

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [API 分类树](https://open.xiaohongshu.com/api/doc/listNew) | 公共/订单/售后/商品/库存/素材/物流/财务等分类 | 目录 |
| [公共参数官方定义](https://open.xiaohongshu.com/api/doc/common/paramNew?gatewayId=103&gatewayVersionId=1661) | `appId/method/sign/timestamp秒级/version2.0` 必填，`accessToken` 不参签；网关 `POST /ark/open_api/v3/common_controller` | 签名/网关 |
| [分类下接口清单](https://open.xiaohongshu.com/api/doc/second/listNew?apiNavigationId=14) | 如 `common.getCategories` 等 21 个 | 目录 |
| [单接口 OpenAPI 规格示例](https://open.xiaohongshu.com/api/doc/infoNew?gatewayId=103&gatewayVersionId=1661&apiId=5747) | 单接口规格样例 | — |
| [接口错误码示例](https://open.xiaohongshu.com/api/doc/errorcodeNew?apiNavigationDetailId=35) | 错误码表样例 | — |
| （SDK 多源，非官方 URL）ark 推送信封 `[{msgTag,sellerId,data}]` + 应答 `{"success":true,"error_code":0}` | 平台 POST JSON 数组，`data` 二次反序列化 | `msg_fulfillment_status_change/msg_fulfillment_receiver_change/msg_fulfillment_seller_remark_change/msg_fulfillment_deliver_time_change/msg_after_sale_create/msg_after_sale_transfer/msg_sku_create/msg_sku_buyable/msg_sku_delete/msg_item_audit_reject` |

### 2B. 小程序客服消息——2 文档

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收消息与发送消息 DC897608](https://miniapp.xiaohongshu.com/doc/DC897608) | JSON 推送结构+48h 回复说明 | 5 MsgType：`text(Content)/image(PicUrl)/video(VideoUrl)/item(OutProductId)/order(OutOrderId)`，通用 `MsgId/FromOpenId/ToAppId/MsgType/CreateTime(秒)` |
| [发送客服消息 DC234367](https://miniapp.xiaohongshu.com/doc/DC234367) | `POST /api/rmp/message/custom` 回复通道 | 同上 5 类型（`openid/msg_type/content/pic_url/out_product_id/out_order_id`） |

### 2C. 小程序事件回调——2 文档

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [支付结果回调 DC753163](https://miniapp.xiaohongshu.com/doc/DC753163) | 担保支付 `Event=PAY_RESULT`，`OrderType` 区分主单/预约单，解密后字段全表 | `PAY_RESULT`（主单 `OrderId/OutOrderId/Status(2成功/998取消)/PayChannel(1微信/2支付宝/99其它)/TotalAmount/VoucherInfos[].VoucherCode/ProductType/PayTime`；预约单 `OutBookOrderId`/`ProductType 2/3`） |
| [小程序简介 DC026595](https://miniapp.xiaohongshu.com/doc/DC026595) | 仅作“事件回调”目录证据（侧栏 11 篇） | 目录：`商品审核/代码审核结果/小程序服务状态/支付结果/退款结果/交易能力切换/群聊人数已满/用户加群通知/笔记发布/服务组件自动下架/服务组件门店审核结果`（除支付外正文未抓） |

### 2D. 消息推送配置与加解密——3 项

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息推送 DC577113](https://miniapp.xiaohongshu.com/doc/DC577113) | URL+Token+EncodingAESKey 配置；GET 四参握手+sha1 三值排序；`success`+5s×3 | 握手 `signature/timestamp/nonce/echostr` |
| [第三方平台消息加解密 DC519884](https://miniapp.xiaohongshu.com/doc/DC519884?path=/third/api-3rd-doc/msgCrypt) | POST body 四字段+GET query 验证+`success`/熔断+加解密指引（必须带 path 参） | 信封 `Nonce/Timestamp/Encrypt/MsgSignature`；算法 `MsgSignature.getSignature`（sha1 四值排序）/`MsgDecrypt.decrypt` |
| [官方 Java 示例包 MsgDecrypt.zip](https://fe-video-qc.xhscdn.com/fe-platform/87989404f48299d3ab814cef6ce4013d85fb827b.zip?attname=MsgDecrypt.zip) | `com.xiaohongshu.mp.security.util` 三类源码实锤 | `AES/CBC/NoPadding+Base64(encodingAesKey+"=")+IV=key[0:16]+PKCS#7(32)+random16B+len4B大端+msg+appId` |
| [开放数据校验与解密 DC591932](https://miniapp.xiaohongshu.com/doc/DC591932) | **错链目标**，属 session_key 用户数据体系，非推送加解密；含另一包 `DataDecrypt.zip`，勿混 | 反证错链 |

---

## 三、企业微信（28 页）——详见 `wecom.md §1`

### 3A. 回调机制（URL+Token+EncodingAESKey，GET echostr 握手，POST 推送，5s×3 重试）——4 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [回调配置 90930](https://developer.work.weixin.qq.com/document/path/90930) | 三要素配置+GET 四步握手+POST 结构+重试 | `echostr` 握手、`msg_signature` 验签 |
| [加解密方案说明 90968](https://developer.work.weixin.qq.com/document/path/90968) | SHA1/AES-256-CBC 原理+黄金样本（已独立复算） | `msg_signature/msg_encrypt` |
| [加解密库下载与返回码 90307](https://developer.work.weixin.qq.com/document/path/90307) | 七语言 SDK+三接口+返回码 -40001…-40011 | `VerifyURL/DecryptMsg/EncryptMsg` |
| [服务端 API 概述 90238](https://developer.work.weixin.qq.com/document/path/90238) | 导航树来源页（2026-09-10 限流待补） | 导航 |

### 3B. 自建应用消息——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息格式 90239](https://developer.work.weixin.qq.com/document/path/90239) | 成员发往应用的明文 XML | MsgType `text/image/voice/video/location/link` |
| [被动回复消息格式 90241](https://developer.work.weixin.qq.com/document/path/90241) | 应用响应包格式（存在已验，样本待补） | 被动回复包 |
| [发送应用消息 90236](https://developer.work.weixin.qq.com/document/path/90236) | 服务端下发应用消息接口（限流待补） | 下发接口 |

### 3C. 自建应用事件——1 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [事件格式 90240](https://developer.work.weixin.qq.com/document/path/90240) | 自建应用全部回调事件字典 | Event `subscribe/unsubscribe/enter_agent/LOCATION/batch_job_result/change_contact/click/view/view_miniprogram/scancode_push/scancode_waitmsg/pic_sysphoto/pic_photo_or_album/pic_weixin/location_select/open_approval_change/share_agent_change/share_chain_change/template_card_event/template_card_menu_event/inactive_alert/close_inactive_agent/reopen_inactive_agent/low_active_alert/low_active/active_restored` |

### 3D. 通讯录——5 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [成员变更通知 90970](https://developer.work.weixin.qq.com/document/path/90970) | 成员增删改+2022-08-15 精简规则 | `change_contact/create_user/update_user/delete_user` |
| [部门变更通知 90971](https://developer.work.weixin.qq.com/document/path/90971) | 部门增删改（日期订正 2022/08/04） | `change_contact/create_party/update_party/delete_party` |
| [标签变更通知 90972](https://developer.work.weixin.qq.com/document/path/90972) | 标签成员变更 | `change_contact/update_tag` |
| [成员变更事件（家校）92032](https://developer.work.weixin.qq.com/document/path/92032) | 家校学生/家长变更 | `change_school_contact/create_student/update_student/delete_student/create_parent/update_parent/delete_parent/subscribe/unsubscribe` |
| [部门变更事件（家校）92052](https://developer.work.weixin.qq.com/document/path/92052) | 家校部门变更（官方笔误 `deparmtment` 照抄，已实锤） | `change_school_contact/create_deparmtment/update_deparmtment/delete_deparmtment` |

### 3E. 客户联系——2 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [事件格式（客户联系）92130](https://developer.work.weixin.qq.com/document/path/92130) | 外部联系人/客户群/客户标签字典 | `change_external_contact/add_external_contact/edit_external_contact/add_half_external_contact/del_external_contact/del_follow_user/transfer_fail`；`change_external_chat/create/update/dismiss`；`change_external_tag/create/update/delete/shuffle` |
| [获客助手事件通知 97299](https://developer.work.weixin.qq.com/document/path/97299) | 获客链接余额/首聊/好友申请（日期订正 2026/07/22） | `customer_acquisition` |

### 3F. 微信客服——1 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收消息和事件 94670](https://developer.work.weixin.qq.com/document/path/94670) | 两段式回调（先 Token 后 sync_msg 拉取） | `kf_msg_or_event`；拉取 `msgtype/event_type/origin` |

### 3G. 审批——1 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [审批申请状态变化回调通知 91815](https://developer.work.weixin.qq.com/document/path/91815) | OA 审批单状态回调 | `sys_approval_change` |

### 3H. 智能机器人（JSON 独立协议）——4 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [回调和回复的加解密方案 101033](https://developer.work.weixin.qq.com/document/path/101033) | JSON 回调加解密（receiveid 空、nonce 2h 不重复） | 加密 envelope `{"encrypt":"msg_encrypt"}` |
| [接收消息 100719](https://developer.work.weixin.qq.com/document/path/100719) | 机器人收消息（存在验，载荷待补） | msgtype `text/mixed/image/voice/file/video/quote` |
| [接收事件 101027](https://developer.work.weixin.qq.com/document/path/101027) | 机器人收事件 | `event/enter_chat/template_card_event/template_card_menu_event` |
| [智能机器人长连接 101463](https://developer.work.weixin.qq.com/document/path/101463) | wss 长连接对照方案 | cmd `aibot_subscribe/aibot_msg_callback/aibot_event_callback` |

### 3I. 其他——7 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [上下游变更回调 95796](https://developer.work.weixin.qq.com/document/path/95796) | 空间/分组/企业变更（日期订正 2023/11/29） | `change_chain/corp_join/create_chain/update_chain/delete_chain/create_group/update_group/delete_group/remove_corp/update_corp` |
| [回调事件（会议室预定）95333](https://developer.work.weixin.qq.com/document/path/95333) | 会议室预定/取消 | `book_meeting_room/cancel_meeting_room` |
| [回调通知（域名/IP 变更）100080](https://developer.work.weixin.qq.com/document/path/100080) | 域名 IP 变更（限流待补） | `security/change_domain_ip` |
| [回调通知（公共邮箱）100180](https://developer.work.weixin.qq.com/document/path/100180) | 公共邮箱变更（限流待补） | `public_email_change` |
| [消息推送配置说明（群机器人 webhook）91770](https://developer.work.weixin.qq.com/document/path/91770) | 群机器人 webhook（限流未验，疑已迁至 99110，待二选一） | 群机器人 webhook |
| [获取 access_token 91039](https://developer.work.weixin.qq.com/document/path/91039) | corpid+corpsecret 换 token（7200s） | 凭证 |
| [获取企业微信回调 IP 段 92521](https://developer.work.weixin.qq.com/document/path/92521) | 动态接口+静态表 | 出口 IP |

---

## 四、飞书（21 项）——详见 `feishu.md §1`

### 4A. 事件订阅（通用语义 + Webhook + 审批前置）——7 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [事件订阅概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview) | 双通道选型 + v1 `uuid`/v2 `event_id` 去重 + 重试 15s/5m/1h/6h×4 + 有序 | 全部事件通用语义 |
| [发往开发者服务器](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/choose-a-subscription-mode/send-notifications-to-developers-server) | Webhook `application/json;charset=utf-8`、单地址、公网 IPv4、challenge 1s | `url_verification` |
| [配置请求网址（旧版）](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/configure-web-hook-url) | 明文/加密双格式 challenge 老口径互证 | `url_verification` |
| [事件订阅 FAQ](https://open.feishu.cn/document/event-subscription-guide/event-subscriptions/faq) | curl 自测 + `retry cnt` 排障 | `url_verification` + 通用重试 |
| [审批事件概述](https://open.feishu.cn/document/server-docs/approval-v4/event/function-introduction) | 审批四公用 + 请假/出差等特殊事件入口 | 审批全系事件 |
| [订阅审批事件接口](https://open.feishu.cn/document/server-docs/approval-v4/event/event-interface/subscribe) | 按 Code 开启（100/min），审批必调前置 | 审批全系事件 |
| [审批定义更新事件模板](https://open.feishu.cn/document/server-docs/approval-v4/event/common-event/custom-approval-event) | 唯一 type 名实锤（空字符串模板，ID 示意） | `approval.approval.updated_v4` |

### 4B. 长连接——1 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [长连接收事件](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case) | WSS、50 连接、集群随机其一、仅自建、SDK 四语言、明文零验签 | 全部事件的传输通道 |

### 4C. 消息/通讯录事件——5 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收消息](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive) | 9 scope + `message_id` 去重 | `im.message.receive_v1` |
| [消息已读](https://open.feishu.cn/document/server-docs/im-v1/message/events/message_read) | 真名 `message_read`（`read_v1` 不存在） | `im.message.message_read_v1` |
| [撤回消息](https://open.feishu.cn/document/server-docs/im-v1/message/events/recalled) | 真名 `recalled` + 四种 `recall_type` | `im.message.recalled_v1` |
| [机器人进群](https://open.feishu.cn/document/server-docs/group/chat-member/event/added-2) | bot 邀 bot 语义（im-v1 路径仅 JS 壳） | `im.chat.member.bot.added_v1` |
| [员工离职](https://open.feishu.cn/document/server-docs/contact-v3/user/events/deleted) | 14 类字段 scope + `old_object.department_ids` | `contact.user.deleted_v3` |

### 4D. 加解密——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收事件验签/AES](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case) | `X-Lark-Signature` sha256 + 回归向量 `P37w…→hello world` | 全部 Webhook 安全层 |
| [卡片回调配置（历史）](https://open.feishu.cn/document/historical-version/build-a-beautiful-message-card-in-5-minutes/add-interaction) | 旧 3s 口径出处 | 卡片 `url_verification`（兼容参考） |
| [卡片回调安全校验（历史）](https://open.feishu.cn/document/common-capabilities/message-card/add-card-interaction/message-card-security-verification) | 自声明不再维护的 sha1 口径（同页 1s，与上页 3s 矛盾） | 卡片验签（不采用） |

### 4E. 凭证/发送——2 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [自建取 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal) | 2h / <30min 发新 / ≥30min 返旧 / `expire:7200` | 全部 `Bearer` API |
| [发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create) | 同用户/群各 5QPS + `uuid` 1h 去重 + 150KB/30KB | 消息发送与去重 |

---

## 五、微博（18 页）——详见 `weibo.md §1`

### 5A. 握手与接入——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [新手接入指南](https://open.weibo.com/wiki/%E6%96%B0%E6%89%8B%E6%8E%A5%E5%85%A5%E6%8C%87%E5%8D%97) | 三步接入 + 黄金算例 + PHP 验签源码 + 80 端口 | 握手 GET `signature/timestamp/nonce/echostr` |
| [验证消息真实性](https://open.weibo.com/wiki/%E9%AA%8C%E8%AF%81%E6%B6%88%E6%81%AF%E7%9C%9F%E5%AE%9E%E6%80%A7) | `sha1(排序(appsecret,timestamp,nonce))` | 首次建连 + 每次推送验签 |
| [粉服 access_token](https://open.weibo.com/wiki/Messages_api/access_token) | 绑定认证账号；OAuth2 scope 未上线 | 客服/群发/切格式凭证 |

### 5B. 接收（推送载荷）——6 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收普通消息](https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E6%99%AE%E9%80%9A%E6%B6%88%E6%81%AF) | text/position/voice/image 骨架 + vfid/msget + 5s×3/排重 | 普通私信 `text/position/voice/image` |
| [接收事件推送](https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E4%BA%8B%E4%BB%B6%E6%8E%A8%E9%80%81) | 六节全量 JSON | `follow/unfollow/subscribe/unsubscribe/scan/scan_follow/click/view` + `mention`（已暂停） |
| [微信XML格式兼容](https://open.weibo.com/wiki/%E5%BE%AE%E4%BF%A1XML%E6%A0%BC%E5%BC%8F%E5%85%BC%E5%AE%B9) | JSON↔XML 对照 + `location/SCAN/CLICK/news` 差异 | 双轨格式 |
| [格式切换 set_format](https://open.weibo.com/wiki/Eps/push/set_format) | `POST set_format.json` 切 xml/json | 格式切换 |
| [接收消息索引](https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E6%B6%88%E6%81%AF) | 四子页索引 | 接收域导航 |
| [粉丝服务平台总纲](https://open.weibo.com/wiki/%E7%B2%89%E4%B8%9D%E6%9C%8D%E5%8A%A1%E5%B9%B3%E5%8F%B0) | 认证账号 + 开发模式 + 三分法 | 通道定位 |

### 5C. 发送（回复与群发）——5 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [发送被动响应消息](https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E8%A2%AB%E5%8A%A8%E5%93%8D%E5%BA%94%E6%B6%88%E6%81%AF) | 响应包回 text/articles/position（URLEncode，<300 汉字） | 被动回复 |
| [发送客服消息](https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E5%AE%A2%E6%9C%8D%E6%B6%88%E6%81%AF) | `POST reply.json` form + 48h/99 条 | 客服异步回复 |
| [高级群发接口](https://open.weibo.com/wiki/%E9%AB%98%E7%BA%A7%E7%BE%A4%E5%8F%91%E6%8E%A5%E5%8F%A3) | `POST sendall.json` 分组/UID 群发 | `MASSSENDJOBFINISH` |
| [长连接版回复](https://open.weibo.com/wiki/2/messages/reply) | id 双法 + 7 天 1 条旧口径（与 48h/99 条并存） | 长连接回复 |
| [发送消息索引](https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E6%B6%88%E6%81%AF) | 被动/客服/群发/XML 四入口 | 发送域导航 |

### 5D. 管理与冻结证据——4 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [自定义菜单](https://open.weibo.com/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%8F%9C%E5%8D%95) | 创建/查询/删除/事件推送索引 | `click/view` 来源 |
| [带参数二维码](https://open.weibo.com/wiki/%E7%94%9F%E6%88%90%E5%B8%A6%E5%8F%82%E6%95%B0%E7%9A%84%E4%BA%8C%E7%BB%B4%E7%A0%81) | 临时 1800s / 永久 1–100000 + ticket 两步（含 `san` 笔误） | `scan/scan_follow` 来源 |
| [高级接口申请](https://open.weibo.com/wiki/%E9%AB%98%E7%BA%A7%E6%8E%A5%E5%8F%A3%E7%94%B3%E8%AF%B7) | 旧版高级接口停收申请 | dm 冻结证据 |
| [旧私信 API](https://open.weibo.com/wiki/2/direct_messages) | `GET direct_messages.json` 高级接口样本 | 冻结对照样本 |

---

## 六、微信公众号（16 核心页）——详见 `wechat-mp.md §1`

### 6A. 通道与加解密——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [快速入门 start.html](https://developers.weixin.qq.com/doc/service/guide/dev/start.html) | GET 验签 Python + 收发示例 + `success` | 握手 + text/image 收发 |
| [消息与事件推送介绍 push/](https://developers.weixin.qq.com/doc/service/guide/dev/push/) | 服务器配置 + GET 校验总纲（三要素+三模式+仅 XML） | 握手 + 通道配置 |
| [消息加解密 encryption.html](https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html) | 三模式/双签名/AES 全流程 + 三组数值例 + cryptoDemo.zip | `debug_demo` + 加密回包 |

### 6B. 接收消息——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接收普通消息](https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_standard_messages.html) | 7 种全字段（含 `MediaId16K`） | `text/image/voice/video/shortvideo/location/link` |
| [接收事件推送](https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_event_pushes.html) | 基础 6 种（`qrscene_`/`Ticket`） | `subscribe/unsubscribe/SCAN/LOCATION/CLICK/VIEW` |
| [自定义菜单事件](https://developers.weixin.qq.com/doc/service/guide/product/menu/Custom_Menu_Push_Events.html) | 菜单扩展 9 事件（含 `view_miniprogram`） | `CLICK/VIEW/scancode_push/scancode_waitmsg/pic_sysphoto/pic_photo_or_album/pic_weixin/location_select/view_miniprogram` |

### 6C. 回复与客服——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [被动回复](https://developers.weixin.qq.com/doc/service/guide/product/message/Passive_user_reply_message.html) | 被动 7 节 + 5s/`success` 规则 | `text/image/voice/video/music/news/transfer_biz_ai_ivr` |
| [转客服](https://developers.weixin.qq.com/doc/service/guide/product/kf/forwarding.html) | 30 分钟/排队规则 | `transfer_customer_service(+KfAccount)` |
| [客服消息介绍](https://developers.weixin.qq.com/doc/service/guide/product/kf/intro.html) | 4 触发动作额度 + 接口目录 | 4 动作（5条/48h、3条/1min×3） |
| [发送客服消息 API](https://developers.weixin.qq.com/doc/service/api/customer/message/api_sendcustommessage.html) | 下发 11 msgtype 全字段 | `text/image/voice/video/music/news/mpnews/mpnewsarticle/msgmenu/wxcard/miniprogrampage` |

### 6D. 回执事件——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [模板消息](https://developers.weixin.qq.com/doc/service/guide/product/template_message/Template_Message_Interface.html) | 模板三态回执 | `TEMPLATESENDJOBFINISH(success/failed:user block/failed: system failed)` |
| [群发消息](https://developers.weixin.qq.com/doc/service/guide/product/message/Batch_Sends.html) | 群发回执 + `clientmsgid`（补 err93115） | `MASSSENDJOBFINISH(send success/send fail/err(num))` |
| [订阅通知](https://developers.weixin.qq.com/doc/service/guide/product/subscription_messages/push.html) | 订阅通知 3 事件 | `subscribe_msg_popup_event/subscribe_msg_change_event/subscribe_msg_sent_event` |

### 6E. 凭证/出口——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [普通 token](https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken.html) | GET/7200/隔离/40243/40164 | 出网签发 |
| [稳定 token](https://developers.weixin.qq.com/doc/service/api/base/api_getstableaccesstoken.html) | POST/双模式/20次/30s/512字符/隔离 | 出网签发 |
| [推送服务器 IP](https://developers.weixin.qq.com/doc/service/api/base/api_getcallbackip.html) | `ip_list`，日更一次 | 回调出口 |

---

## 七、微信小程序（10 项）——详见 `wechat-mini.md §1`

### 7A. 推送总纲——1 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息推送总纲](https://developers.weixin.qq.com/doc/framework/server-ability/message-push.html) | 唯一全量可复算向量页（握手 f464b24、明文 899cf89e、密文 046e02f8、回包 1b933996、AES）+ 三通道 | `debug_demo` 通用骨架 + 服务器/云函数/云托管 |

### 7B. 客服消息——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [客服接收](https://developers.weixin.qq.com/doc/open-ability/customer-message/receive.html) | 推送三包 + `user_enter_tempsession`（证伪 `user_enter_session`） | `text/image/miniprogrampage` + `user_enter_tempsession` |
| [客服窗口](https://developers.weixin.qq.com/doc/open-ability/customer-message/send.html) | 小程序窗口 5条/48h、进会话 2条/1min | 窗口规则 |
| [客服发送 API](https://developers.weixin.qq.com/doc/server/API/kf-mgnt/kf-message/api_sendcustommessage.html) | `POST message/custom/send` 全类型体 + 公众号 4 场景对照 + 适用范围 | `text/image/voice/video/music/news/mpnews/mpnewsarticle/msgmenu/wxcard/miniprogrampage/link` 枚举 |

### 7C. 凭证/出口——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [普通凭据](https://developers.weixin.qq.com/doc/server/API/mp-access-token/api_getaccesstoken.html) | `GET token` 7200s、多应用隔离 | 出网签发 |
| [稳定凭据](https://developers.weixin.qq.com/doc/server/API/mp-access-token/api_getstableaccesstoken.html) | `POST stable_token` 隔离 + force_refresh 20次/天 | 出网签发 |
| [出口 IP](https://developers.weixin.qq.com/doc/server/API/openApi-mgnt/api_getcallbackip.html) | `GET getcallbackip→ip_list` 每天 1 次 | 回调出口 |

### 7D. 事件——2 项

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [授权变更事件](https://developers.weixin.qq.com/doc/server/event_push/platform/authorized_user_information_changes.html) | 三枚举 + RevokeInfo + 回 success/空串免加密 | `user_info_modified/user_authorization_revoke/user_authorization_cancellation` |
| [云托管指引](https://developers.weixin.qq.com/doc/wxcloudservice/wxcloudrun/src/guide/weixin/push.html) | 内网免签、单数 `x-wx-source`（与总纲复数冲突，双写兼容）、MsgId 去重 | 云托管通道 |
| 事件族目录（违规/物流/配送/短剧/付费/评价/直播） | 导航树已验、正文字段待核验(09-27)，只列入口不列字段 | 目录级 |

---

## 八、钉钉（21 项）——详见 `dingtalk.md §1`

### 8A. 事件订阅总纲——3 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [事件订阅总纲](https://open.dingtalk.com/document/development/event-subscription-overview.md) | Stream 免加解密 vs HTTP 密文自验签（前者内部+第三方，后者仅内部） | 全部新事件通道选型 |
| [Stream 接入](https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode.md) | 50 连接 / SUCCESS-LATER / 三 topic / ClientID-Secret 鉴权 | 全部 Stream 事件 + 机器人/卡片回调 |
| [企业内部事件总目录](https://open.dingtalk.com/document/orgapp/org-event-overview.md) | 通讯录/审批/IM/考勤/会议/直播/存储全量链接 | 事件选型入口 |

### 8B. 旧回调与握手——4 页

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [旧回调加解密](https://open.dingtalk.com/document/app/callback-event-message-body-encryption-and-decryption.md) | sha1 四参 + AES-CBC + 调试向量 | 全部旧 oapi 回调 + 新 HTTP 验签算法 |
| [回调测试地址事件](https://open.dingtalk.com/document/development/event-subscription-callback-test-url-event.md) | 握手事件 + success 加密回包（不回连推 100 次） | 握手系 + suite_ticket |
| [旧回调注册](https://open.dingtalk.com/document/isvapp/register-callback-events.md) | 单 URL / token≥6<64 / aes_key43 | 15 类 call_back_tag |
| [失败推送兜底](https://open.dingtalk.com/document/development/obtain-the-event-list-of-failed-push-messages.md) | 10s/30s 重试，3~5min 查失败列表≤200 | 旧体系全事件 |

### 8C. 消息/审批/通讯录/群事件

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [机器人收消息](https://open.dingtalk.com/document/orgapp/receive-message.md) | 明文 6 msgtype + HmacSHA256 + 1h 时钟 | 机器人收消息 |
| [审批实例变更](https://open.dingtalk.com/document/development/event-bpms-instance-change.md) | 双信封 + 订阅规则 bizCategoryId/processCode/type | `bpms_instance_change` |
| [审批任务变更](https://open.dingtalk.com/document/development/event-bpms-task-change.md) | 双信封（转交 finish+redirect，结束 cancel） | `bpms_task_change` |
| [通讯录更改/离职](https://open.dingtalk.com/document/orgapp/event-v3user-modify-org.md) | 双信封（diffInfo/字符串 timeStamp） | `user_modify_org/user_leave_org` |
| [群加人](https://open.dingtalk.com/document/orgapp/event-chat-add-member.md) | Stream/HTTP/SyncHTTP 三形态（biz_type=177） | 群管理系 |
| [套件票据](https://open.dingtalk.com/document/isvapp/event-suite-ticket.md) | 5h 推一次（biz_type=2） | `suite_ticket` |
| [旧审批语义](https://open.dingtalk.com/document/isvapp/approval-events-2.md) | 实例 start/finish/terminate，任务 finish/cancel | 旧审批回调 |
| [旧通讯录 15 类字典](https://open.dingtalk.com/document/app/tvgq1n.md) | 旧体示例 | 旧通讯录回调 |

### 8D. 凭证/发送

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [新内部 token](https://open.dingtalk.com/document/development/obtain-the-access-token-of-an-internal-app.md) | 7200s，重复获取相同并续期 | api.dingtalk.com 凭证 |
| [旧内部 token](https://open.dingtalk.com/document/orgapp/obtain-orgapp-token.md) | GET gettoken，7200s | oapi 凭证 |
| [第三方 corp token](https://open.dingtalk.com/document/isvapp/obtain-the-access_token-of-the-authorized-enterprise.md) | 7200s，重复获取返新 | 第三方凭证 |
| [工作通知 asyncsend_v2](https://open.dingtalk.com/document/development/asynchronous-sending-of-enterprise-session-messages.md) | 5000/1000/500/100/同内容1天1条 | 发消息频控 |
| [机器人发群消息](https://open.dingtalk.com/document/development/the-robot-sends-a-group-message.md) | POST robot/groupMessages/send | 机器人发消息 |

---

## 九、QQ 机器人（30 点位）——详见 `qq.md §1`

### 9A. 网关与连接

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [通用 WSS 接入点](https://bot.q.qq.com/wiki/develop/api-v2/openapi/wss/url_get.html) | `GET /gateway` → wss 地址 | 全部 WS 事件 |
| [分片接入点](https://bot.q.qq.com/wiki/develop/api-v2/openapi/wss/shard_url_get.html) | url/shards/session_start_limit（示例缺键笔误注） | 分片连接 |
| [WebSocket 方式](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/websocket.html) | Hello/Identify/Ready/心跳/Resume/分片/错误码 | 全部 WS 事件 |
| [WebSocket 错误码](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html) | 与上页互证（4900系仅 identify） | 重连决策 |

### 9B. 事件订阅

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [事件订阅总览](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html) | 信封+OpCode+Intents 全表 | 全部事件选型 |
| [通用 payload](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/payload.html) | 四件套复述交叉证 | 同上 |
| [单聊消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html) | 去重双句 + message_type 表 | `C2C_MESSAGE_CREATE` |
| [群@消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_at_message_create.html) | content 去@前缀 | `GROUP_AT_MESSAGE_CREATE` |
| [群全量](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html) | 与群@字段完全一致 | `GROUP_MESSAGE_CREATE` |
| [频道事件](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/channel/message/event.html) | AT(公域)/全量(私域)/私信/审核 | `AT_MESSAGE_CREATE/MESSAGE_CREATE/DIRECT_MESSAGE_CREATE` |
| [好友添加](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/friend_add.html) | scene 全表 | `FRIEND_ADD` |
| [加群](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_add_robot.html) | 群 openid + 操作人 | `GROUP_ADD_ROBOT` |

### 9C. 签名/收发/凭证/准入

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [Ed25519 验签](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html) | 无 AES，两组向量 | 全部 Webhook 安全层 |
| [Webhook 方式](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/webhook.html) | op13 验证 + 端口 + HTTPS | Webhook 通道 |
| [消息收发概述](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html) | 频控/去重/撤回/窗口双口径 | 收发矩阵 |
| [单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html) | msg_type 0/2/6/7，60min×4/msg_id 5min 双口径 | 单聊发送 |
| [群发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) | msg_type 0/2/7，5min×5 | 群发送 |
| [access_token](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html) | 7200s＋60s 轮换，`QQBot` 头 | 全部 API 凭证 |
| [介绍与接入](https://bot.q.qq.com/wiki/) | 企业/个人＋沙箱 20 人＋IP 白名单 | 准入 |

---

## 十、淘宝/天猫（30 点位）——详见 `taobao.md §1`

### 10A. 消息服务（TMC 三方式）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [消息服务介绍 101663](https://open.alitrip.com/docs/doc.htm?articleId=101663&docType=1&treeId=1) | TMC 长连接/API 轮询/MQ，分组＋6min 重发＋8–24h | 全部 TMC 事件 |
| [TOP-SDK 101618](https://open.alitrip.com/docs/doc.htm?articleId=101618&docType=1&treeId=1) | `ws://mc.api.taobao.com/`＋服务地址表 | 连接与网关 |
| [消费确认 103623](https://developer.alibaba.com/docs/doc.htm?articleId=103623&docType=1&treeId=74) | consume 指针/confirm＋`status.fail()` | 轮询消费 |

### 10B. 事件清单（交易 27/退款 15/商品 14/OpenIM 1）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [交易类目 cid=101](https://developer.alibaba.com/docs/topic_list.htm?cid=101) | 27 条全表 | `taobao_trade_*` |
| [退款类目 cid=102](https://developer.alibaba.com/docs/topic_list.htm?cid=102) | 15 条全表 | `taobao_refund_*/retrieve_*` |
| [商品类目 cid=103](https://developer.alibaba.com/docs/topic_list.htm?cid=103) | 14 条全表 | `taobao_item_*` |
| [OpenIM cid=233](https://developer.alibaba.com/docs/topic_list.htm?cid=233) | 唯一 `OffMsgPush`（免授权） | `taobao_openim_OffMsgPush` |
| [TradeCreate/RefundCreated/ItemAdd 载荷](https://developer.alibaba.com/docs/topicDetail.htm?apiId=101) | 三页全文载荷 | 代表事件体 |
| [千牛接口 22593](https://developer.alibaba.com/docs/api.htm?apiId=22593) | jindoucloud/tpn/qianniu/cloudkefu/bcpush | 千牛上下行 |
| [TPN 通知 102422](https://open.alitrip.com/docs/doc.htm?articleId=102422&docType=1&treeId=330) | 工作台系统消息下行 | TPN NotifyMessage |

### 10C. 签名/授权/全球栈/收费

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [签名 101617](https://developer.alibaba.com/docs/doc.htm?articleId=101617&docType=1) | md5/hmac 三算法＋timestamp 10min＋错误码 21–29 | 全部 API 签名 |
| [授权 102635](https://open.alitrip.com/docs/doc.htm?articleId=102635&docType=1&treeId=1) | code 30min＋r1/r2/w1/w2＋refresh 60/天（仅订购类） | OAuth |
| [token.create/refresh](https://developer.alibaba.com/docs/api.htm?apiId=25387) | create 25388 / refresh 25387 拆分 | token 换取 |
| [全球栈接收 119493](https://open.alitrip.com/docs/doc.htm?articleId=119493&docType=1&treeId=735) | HTTPS 回调＋500ms/半小时/12 次＋HMAC-SHA256 | 全球栈事件 |
| [全球栈配置 119404](https://open.alitrip.com/docs/doc.htm?articleId=119404&docType=1&treeId=735) | 回调 URL+Verify+订阅 | 全球栈配置 |
| [收费 104559](https://open.alitrip.com/docs/doc.htm?articleId=104559&docType=1&treeId=23) | 基础/增值/数据同步/瓦力量级 | 费用 |

---

## 十一、京东（20+ 页）——详见 `jingdong.md §1`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 推送 | [消息推送 listId=520](https://open.jd.com/home/home#/doc/common?listId=520) | 投递/订阅/重试全文待核验(09-27) | JOS 推送（指针） |
| 订单 | 查询 API 群（apilist） | 订单 9 枚举＋查询接口实锤 | 订单状态/查询 |
| 售后 | AFS 消息名 | `AFS_StepResult_JOS` 名实锤，载荷待核验 | 售后全流程 |
| 咚咚 | [chat_message4.2](https://jos.jd.com/platformdetail?itemId=2222&listId=0)＋push2 | 标题+voice 片段＋外发五参数 | 咚咚收发 |
| 签名 | listId=33/530 | MD5(secret+字母序+secret)＋timestamp 10min＋三算法 | 全部 API 签名 |
| 凭证 | listId=32 | `open-oauth.jd.com` 双端点＋token 商家绑定 10500001 | OAuth |
| 准入 | listId=298/160 | 三类账号＋3 工作日＋500/日→30 万/日 | 准入 |
| 迁移 | JOS 首页公告 | 2026-07-01 融合至 open.jd.com、08-30 关闭 | 入口变更 |
| 排除 | EMOP 白皮书 | APP 触达推送，与 JOS 无关 | — |

---

## 十二、拼多多（17 页）——详见 `pinduoduo.md §1`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 网关 | `POST https://gw-api.pinduoduo.com/api/router` | 正式网关（84_static_9 原文） | 全部 API |
| 签名 | POP 签名页 | `UPPER(MD5(secret+ASCII排序kv+secret))`＋向量 E4DE3E（已重算） | 全部 API 签名 |
| 授权 | OAuth 页＋`pdd.pop.auth.token.create` | code 10min＋token 放 body 参签（双链路） | 授权 |
| 推送 | 消息推送指南 | 订阅后主动推（permit/cancel 名待核验）；PMC 通道 SDK 旁证 | 推送通道 |
| 订单 | 接入方案＋基础介绍 | 三接口分工＋24h/30min/90天＋状态 1/2/3 | 订单事件 |
| 短信 | 短信指南 | 三接口名弱证，配额待核验 | 短信 |
| 客服 | 客服平台页 | 无开放 API 证据（第三方声称未证实） | — |

---

## 十三、美团（20+ 页）——详见 `meituan.md §1`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 体系 | developer.meituan.com＋openapi.meituan.com | 合作中心回调 vs 生态 OAuth 双体系＋ISV/品牌/个人三分 | 选型 |
| 签名 | guide/31 | MD5(url?字母序+secret) 5 步＋示例串 | 全部回调验签 |
| 订单 | docDetail/177/180/172/111 | 已支付必接/已确认 4/已完成 8＋5 分钟未接单自动取消退款 | 订单三态 |
| 配送结算 | docDetail/169/181/168/235 | 配送/结算/催单/隐私号降级存在性 | 履约事件 |
| IM | docDetail/842/845 | 单聊 biz_type=1（体待核验）＋工单审批待核验 | IM 推送 |
| 可靠性 | docDetail/177/254 | 2s ok＋1 分钟×3＋4 次失败记异常 | 重试 |
| 准入 | ability-center/list | 联系邮箱＋三分入驻 | 准入 |

---

## 十四、饿了么（15+9 页）——详见 `eleme.md §1`

### 14A. 用户线（全文已验）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [协议 listen](https://openapi-doc.faas.ele.me/v2/listen.html) | Key/Secret/App key 定义＋推送定义 | 通道选型 |
| [快速开始](https://openapi-doc.faas.ele.me/v2/quickstart.html) | 签名五步＋sig 作 Query＋末尾 `/` | 签名 |
| [推送总纲](https://openapi-doc.faas.ele.me/v2/api/signal/index.html) | 4 推送目录＋200+ok＋重试 | 推送总纲 |
| [订单/配送/退款/赔付推送](https://openapi-doc.faas.ele.me/v2/api/signal/order-signal.html) | 4 载荷逐字（赔付暂不开放） | `order_status_update` 等 4 推送 |
| [H5 推送](https://openapi-doc.faas.ele.me/h5/api/order.html) | push_action 1/2＋form＋签名同构 | H5 订单推送 |
| [枚举](https://openapi-doc.faas.ele.me/v2/appendix/enums.html) | 订单/取消/配送/退单/role/赔付全表 | 枚举 |
| [签名示例](https://openapi-doc.faas.ele.me/v2/appendix/sig-example-codes.html) | Python/PHP/Java 三语言 | 签名实现 |
| [频控](https://openapi-doc.faas.ele.me/v2/appendix/rate-limit.html) | consumer_key 级＋1009＋协商制 | 频控 |
| [账户/H5 账户](https://openapi-doc.faas.ele.me/v2/api/account.html) | token/1019/1020＋反向 OAuth | 账户（非推送） |

### 14B. 商户线（SPA，维持摘录/待核验）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [商户门户](https://open.shop.ele.me/) | footer 入口（已更名淘宝闪购服务商平台） | 导航 |
| [推送/回调/token/包络页组](https://open.shop.ele.me/openapi/documents/httppushmethod) | 全文待核验(09-27) | 商户推送 |

---

## 十五、B站（15 页）——详见 `bilibili.md §1`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 总览 | [能力总览](https://openhome.bilibili.com/doc) | 账号/用户/视频/数据/专栏/直播长连六域 | 选型 |
| 签名 | [签名页](https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b) | 头表＋HMAC-SHA256＋包络（4000 系码未见） | 服务端签名 |
| 授权 | [OAuth 页](https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c) | 有效期/提前刷新（一次性未见） | OAuth |
| 授权 | [网页 OAuth](https://open.bilibili.com/doc/4/aac73b2e-4ff2-b75c-4c96-35ced865797b) | 302 `${return_url}?code=&state=` | 网页授权 |
| 事件 | [事件列表](https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623) | 4 事件（正文待复核，镜像印证） | `authorize/deauthorize/video_open/video_fail` |
| 视频 | [投稿页](https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f) | ARC_BASE＋审核＋非正式会员日投 5 稿 | 投稿 |
| 直播 | [双体系页](https://open.bilibili.com/doc/4/19350a57-2e2d-43cf-3e6d-c7de132b24b6) | 双体系＋报备邮箱 | 直播 |
| 直播 | [直播间数据](https://open.bilibili.com/doc/4/c7b549c9-d5d6-0331-b510-465ed4107e01) | CMD（DM/DM_MIRROR）存在性 | 弹幕 |
| 规约 | [管理规约](https://openhome.bilibili.com/agreement/management-protocol) | 私信禁令原文 | 合规 |
| Webhook | 镜像 doc-895911（非 primary） | HTTPS POST＋SHA1＋5s＋共推 3 次 | 回调（镜像） |

---

## 十六、快手（17 页）——详见 `kuaishou.md §1`

### 16A. 开放域事件（`event` 判型，仅 3 个）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [接入指南](https://open.kuaishou.com/platformDocs/openAbility/webHook/accessGuide) | 信封 5 字段＋200+result＋kwaisign＋上下篇链 | 通道总纲 |
| [测试事件](https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/testEvent.html) | 配地址握手 | `TEST` |
| [授权事件](https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/authorizationEvent.html) | open_id/scope/is_new | `AUTHORIZE` |
| [解约事件](https://open.kuaishou.com/platformDocs/openAbility/webHook/eventList/revocationOfAuth.html) | 下划线命名原文 | `UN_AUTHORIZE` |

### 16B. 小程序支付回调族（`biz_type` 判型）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [附录](https://open.kuaishou.com/docs/develop/server/epay/appendix.html) | 五 biz_type＋kwaisign＋16 次重试表 | 回调总纲 |
| [支付](https://open.kuaishou.com/docs/develop/server/epay/open-api-new/prePay-new.html) | 三态＋地址优先级＋禁查询串 | `PAYMENT` |
| [签约代扣](https://open.kuaishou.com/docs/develop/server/epayAuto/contract-new.html) | 双回调＋三地址＋统一解约 | `CONTRACT/WITHHOLD` |
| [退款](https://open.kuaishou.com/docs/develop/server/epay/open-api-new/refund-new.html) | 三态＋30QPS | `REFUND` |
| [结算](https://open.kuaishou.com/docs/develop/server/epay/open-api-new/settle-new.html) | 360 天＋核销规则 | `SETTLE` |

### 16C. 安全/身份/准入/发送侧

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| 安全 | 附录1/2：出站 MD5(body+secret)/入站 ASCII+secret 后缀，无 AES | 签名 |
| 身份 | kwaiLogin/getAccessToken/code2Session：OAuth code 2 分钟/access 48h/refresh 180 天/js_code 10 分钟 | token |
| 准入 | entry/login/introduce：企业资质认证→应用注册→app_id/secret | 准入 |
| 发送侧 | sendMessage：订阅模板单向下发 QPS 100（私信仅用户端开关） | 下发 |

---

## 十七、知乎（结论库）——详见 `zhihu.md`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 门户 | [开发者平台](https://developer.zhihu.com/) | UMI SPA 空壳（同域 29 key 无推送类目） | —（无推送） |
| 文档 | [文档 JSON](https://developer.zhihu.com/console/api/v2/docs) | guide 3＋api 18＋skill 4＋mcp 4 | 拉取式 REST |
| 旧域 | `https://open.zhihu.com/` | 根 422，无文档 | 历史 |
| 鉴权 | 官方鉴权文档 | Bearer＋秒级时间戳（容差 10 分钟） | 鉴权 |
| 端点 | 搜索/热榜/直答/quota/PDF/PPT | 拉取＋任务轮询（task_id＋succeeded） | 查询 |
| 排除 | v4 messages/sugar 回调/营销文 | 非开放推送体系 | — |

---

## 十八、支付宝（50 页）——详见 `alipay.md §1`

| 分类 | 文档 | 一句话 | 覆盖事件 |
|---|---|---|---|
| 支付通知 | `open/270/105902`＋`open/04ij9t` | POST 表单＋仅 SUCCESS/FINISHED 认付款＋success/200＋25h 8 次＋notify_id＋RSA2 四步 | `trade_status_sync` |
| 网关 | `common/02qibh`＋`support/01raub` | 应用网关（生活号被动/订阅）＋fund 示例 | 网关通知 |
| 订阅 | `common/02km9j`＋三地址对照 | notify_url/应用网关/From 蚂蚁（首重 2m 单源） | 订阅消息 |
| 生活号 | `fw/guide`＋验证流程 | 网关验证＋被动通知（事件表待核验） | 生活号 |
| 小程序客服 | `mini/component/contact-button` | 零号云客服前端组件（企业用户），非服务端推送 | — |
| 授权 | `isv/*` | app_auth_token 代调用必填＋永久/刷新失效 | 代调用 |
| 准入 | 创建/上线/加签/沙箱组 | 实名→五项设置→审核约 1 工作日 | 准入 |

---

## 十九、WhatsApp（22 页）——详见 `whatsapp.md §1`

### 19A. 订阅与握手

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [配置 Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/) | App Dashboard 配单 URL＋Verify token，必订 `messages` | 通道配置 |
| [Webhooks 总览](https://developers.facebook.com/docs/whatsapp/webhooks/) | 字段表＋mTLS 可选＋重试 7 天＋载荷上限 3MB | 通道总纲 |
| [创建回调端点](https://developers.facebook.com/docs/whatsapp/webhooks/create-webhook-endpoint/) | GET 三参＋HMAC-SHA256＋200 裸回 challenge/403 | 握手＋验签 |
| [Graph 通用入门](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/) | hub.mode/challenge/verify_token 通用语义 | 握手 |
| [Echo 机器人](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-whatsapp-echo-bot/) | fbsamples app.py 回显实锤 | 握手 |

### 19B. 载荷（messages/statuses）

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [messages 参考](https://developers.facebook.com/docs/whatsapp/webhooks/reference/messages) | inbound/outbound 逐字载荷 | `messages/statuses` |
| [载荷示例](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples/) | 示例集 | 各 type 载荷 |
| [组件](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/) | 字段组件 | 载荷组件 |

### 19C. 管理面/发送/凭证/配额

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [管理面组件](https://developers.facebook.com/docs/whatsapp/business-management-api/webhooks/components/) | account/capability/template/phone 更新表 | 管理面事件 |
| [发送指南](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/) | 同步受理＋TTL 30 天 | 发送 |
| [Messages 参考](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) | `POST /{v}/{id}/messages`＋wamid 同源 | 发送 |
| [文本消息](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages/) | 4096＋to＋preview_url（v25/v26） | 文本发送 |
| [接入指南](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) | 临时 token＋系统用户＋v23 示例快照 | 凭证 |
| [Token 指南](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens) | 系统用户长效 | 凭证 |
| [阶梯](https://developers.facebook.com/docs/whatsapp/messaging-limits/) | 250→Unlimited（组合级） | 配额 |
| [吞吐](https://developers.facebook.com/docs/whatsapp/throughput/) | 80mps→1000mps，超限 130429 | 频控 |
| [定价](https://developers.facebook.com/docs/whatsapp/pricing/) | 8-01/10-01 更新与主站矛盾（做开关） | 计费 |

---

## 二十、Telegram（8 页）——详见 `telegram.md §1`

| 文档 | 一句话 | 覆盖事件 |
|---|---|---|
| [机器人平台](https://core.telegram.org/bots) | 1000 万+机器人＋BotFather＋token 即全权 | 准入总纲 |
| [Bot API](https://core.telegram.org/bots/api) | 互斥/24h/端口/恒等头/发送基式/包络/限流 | 全部机制 |
| [Webhooks](https://core.telegram.org/bots/webhooks) | IPv4/源段/TLS/CN/自签/自测 Update | 建联＋握手（无 challenge） |
| [FAQ](https://core.telegram.org/bots/faq) | 互斥/去重/secret path/三档限流/文件尺寸 | 常见口径 |
| [功能](https://core.telegram.org/bots/features) | BotFather/命名/转让/测试根地址/Bot-to-Bot/Guest | 准入＋测试 |
| [教程](https://core.telegram.org/bots/tutorial) | token 形＋浏览器直调＋发送三件套 | 上手 |
| 事件 | `Update` 27 类字段（Bot API 10.3 时点，默认排除 3 类） | 全部事件 |
| 验签 | 恒等头 `X-Telegram-Bot-Api-Secret-Token` 原样比对，无 HMAC | 安全层 |
