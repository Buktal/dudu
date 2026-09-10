# 三渠道事实库索引

> 摄取日期：2026-09-10。三子代理并行复核日期：2026-09-10（primary source 直抓官方文档本身）。
> 复核结论：抖音 23 URL 全 200 存在、无伪造；企微 28 页中 23 页正文逐字验过、5 页因站方验证码限流待补、无伪造；小红书 miniapp 域官方 claim 逐字复现、ark 电商推送侧维持 `[多源]`（官方推送章节在 POST 墙后）。
> 各文档 §1 均有完整页面地址清单；标注「待核验(09-27)」的条目等配额恢复后补——补摄计划见 issue #14。

| 渠道 | 形态 | 官方文档门户 | 事实库 | 文档数 |
|---|---|---|---|---|
| 抖音 | 直连私信（dop IM，要求企业号）+ 小游戏/服务商/生活服务三套并行体系 | https://developer.open-douyin.com/ | [douyin.md](./douyin.md) | 24 项（23 已验 + 1 新定位待抓） |
| 小红书 | 小程序客服消息（微信同款协议族）+ 电商 ark 推送 | https://miniapp.xiaohongshu.com/ （客服消息/消息推送）；电商侧 https://open.xiaohongshu.com/ | [xiaohongshu.md](./xiaohongshu.md) | 14 项（5 电商 API + 7 小程序文档 + 2 示例包） |
| 企业微信 | 直连私信（自建应用回调，XML+AES）+ 机器人 JSON 独立协议 | https://developer.work.weixin.qq.com/document/ | [wecom.md](./wecom.md) | 28 页（23 已验 + 5 限流待补） |

## 三家速记

- **抖音**：四套并行推送体系（dop/小游戏/服务商/生活服务），v0 主做 dop；验签头 `X-Douyin-Signature = sha1hex(client_secret + body)`。
- **小红书**：官方消息型推送＝小程序客服消息（URL＋Token＋EncodingAESKey，GET echostr 握手，`sha1(字典序排序)` 验签，JSON 载荷，回 success，5s×3 重试）；推送信封 `{Nonce, Timestamp, Encrypt, MsgSignature}`（body 内），加解密＝微信同族（官方 MsgDecrypt.zip 源码实锤，见 xiaohongshu.md §11）；电商 ark 网关另有订单事件推送。
- **企业微信**：`POST ?msg_signature=&timestamp=&nonce=`＋XML 信封；AES-256-CBC（Base64(EncodingAESKey+"=") 32B、IV=前 16B、PKCS#7 补 32B 倍数）；官方黄金自测样本在 wecom.md §5.1（`477715d11cdb4164915debcba66cb864d751f3e6` 已独立复算命中）。

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
