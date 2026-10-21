# 企业微信回调事件事实库（官方文档摄取）

> 调研日期：2026-09-10。来源：企业微信开发者中心官方文档（页面均为服务端渲染 HTML，curl 直抓 + 结构化提取）
> 用途：mock-pulse 高保真模拟「企业微信 → 第三方回调地址」的推送（XML + AES 加密载荷、msg_signature 验签头）
> 所有示例载荷均为官方文档原文逐字拷贝；官方原文的笔误（如 `![CDATA[`、`deparmtment`）原样保留并标注

## 1. 官方文档入口与关键页面地址

- 入口：https://developer.work.weixin.qq.com/document/ （首页为 JS 空壳；内容页 `/document/path/<id>` 为 SSR，可直接抓取。注意：部分页面首访返回空壳，重试即可拿到 SSR；2026-09-10 复验确认连续高频抓取会触发 `企业微信-验证码` 空壳（HTTP 200/1353B），属站方反爬而非页面下线）

本次实际抓取并完整摄取的页面（均验证过正文内容）

| 文档 ID | 标题 | URL | 最后更新 |
| --- | --- | --- | --- |
| 90930 | 回调配置 | https://developer.work.weixin.qq.com/document/path/90930 | 2024/12/13 |
| 90968 | 加解密方案说明 | https://developer.work.weixin.qq.com/document/path/90968 | 2025/06/25 |
| 90307 | 加解密库下载与返回码 | https://developer.work.weixin.qq.com/document/path/90307 | 2025/10/10 |
| 90239 | 消息格式（普通消息） | https://developer.work.weixin.qq.com/document/path/90239 | 2019/10/23 |
| 90240 | 事件格式（自建应用事件） | https://developer.work.weixin.qq.com/document/path/90240 | 2025/11/26 |
| 90241 | 被动回复消息格式 | https://developer.work.weixin.qq.com/document/path/90241 | 2024/11/21 |
| 90970 | 成员变更通知（通讯录） | https://developer.work.weixin.qq.com/document/path/90970 | 2026/02/26 |
| 90971 | 部门变更通知（通讯录） | https://developer.work.weixin.qq.com/document/path/90971 | 2022/08/04 |
| 90972 | 标签变更通知（通讯录） | https://developer.work.weixin.qq.com/document/path/90972 | 2021/09/16 |
| 92032 | 成员变更事件（家校通讯录） | https://developer.work.weixin.qq.com/document/path/92032 | 2023/11/29 |
| 92052 | 部门变更事件（家校通讯录） | https://developer.work.weixin.qq.com/document/path/92052 | 2023/11/29 |
| 92130 | 事件格式（客户联系） | https://developer.work.weixin.qq.com/document/path/92130 | 2024/06/03 |
| 94670 | 接收消息和事件（微信客服） | https://developer.work.weixin.qq.com/document/path/94670 | 2024/12/23 |
| 91039 | 获取 access_token | https://developer.work.weixin.qq.com/document/path/91039 | 2024/03/26 |
| 92521 | 获取企业微信回调IP段 | https://developer.work.weixin.qq.com/document/path/92521 | 2026/04/07 |
| 101033 | 回调和回复的加解密方案（智能机器人） | https://developer.work.weixin.qq.com/document/path/101033 | 2025/07/23 |
| 100719 | 接收消息（智能机器人） | https://developer.work.weixin.qq.com/document/path/100719 | 2026/05/18 |
| 101027 | 接收事件（智能机器人） | https://developer.work.weixin.qq.com/document/path/101027 | 2026/05/20 |
| 101463 | 智能机器人长连接 | https://developer.work.weixin.qq.com/document/path/101463 | 2026/05/25 |
| 91815 | 审批申请状态变化回调通知 | https://developer.work.weixin.qq.com/document/path/91815 | 2025/06/11 |
| 95796 | 上下游变更回调 | https://developer.work.weixin.qq.com/document/path/95796 | 2023/11/29 |
| 97299 | 获客助手事件通知 | https://developer.work.weixin.qq.com/document/path/97299 | 2026/07/22 |
| 95333 | 回调事件（会议室预定） | https://developer.work.weixin.qq.com/document/path/95333 | 2023/11/29 |
| 100080 | 回调通知（域名/IP 变更） | https://developer.work.weixin.qq.com/document/path/100080 | 2024/07/12（2026-09-10 冷 IP 复验通过，SSR 正文完整） |
| 100180 | 回调通知（公共邮箱） | https://developer.work.weixin.qq.com/document/path/100180 | 2024/09/03（2026-09-10 冷 IP 复验通过，SSR 正文完整） |
| 91770 | 消息推送配置说明（群机器人 webhook） | https://developer.work.weixin.qq.com/document/path/91770 | 2025/08/07（2026-09-10 冷 IP 复验通过：SSR 正文完整，91770 仍有效、未迁移/未下线；99110 为服务端 API 章节下同名页，两 ID 并存，二选一已决） |
| 90236 | 发送应用消息 | https://developer.work.weixin.qq.com/document/path/90236 | 2025/09/24（2026-09-10 冷 IP 复验通过，SSR 正文完整） |
| 90254 | 获取临时素材 | https://developer.work.weixin.qq.com/document/path/90254 | 2026/01/09（2026-10-14 冷 IP 复验通过，SSR 正文完整） |
| 90238 | 接收消息与事件概述（导航树来源） | https://developer.work.weixin.qq.com/document/path/90238 | 2024/07/22（2026-09-10 冷 IP 复验通过，SSR 正文完整；页内导航树含 99110 等全站链接） |

抓取方法备注：文档站全站导航树内嵌在任一 SSR 内容页中（本库从 90238 提取到 983 个页面链接）；旧版锚点 ID（12973 普通消息格式 / 12974 事件消息格式 / 12975 被动回复消息格式 / 12976 消息体签名校验 / 12977 设置接收消息的参数 / 10128 下载地址）在现行站点返回空壳，其内容分别对应现行页 90239 / 90240 / 90241 / 90968 原理详解 / 90930 回调配置 / 90307。（2026-09-10 冷 IP 复验：90238 SSR 正文完整，最后更新 2024/07/22，页内导航树仍含全站链接；服务端 API 章节下消息推送页为 99110，与客户端 API 章节下 91770 同名并存）

## 2. 消息/事件推送全清单

### 2.1 自建应用：普通消息（MsgType，明文 XML 结构体）［90239］

| MsgType | 专有字段 | 触发场景 |
| --- | --- | --- |
| text | Content | 成员在应用里发文本 |
| image | PicUrl、MediaId | 发图片 |
| voice | MediaId、Format（amr/speex 等） | 发语音 |
| video | MediaId、ThumbMediaId | 发视频 |
| location | Location_X/Y、Scale、Label、AppType（wxwork 绑定见于 90240 LOCATION 示例，90239 页内未独立断言，2026-09-10 弱验证注） | 发位置 |
| link | Title、Description、Url、PicUrl | 发链接 |

公共字段：ToUserName（企业 CorpID）、FromUserName（成员 UserID）、CreateTime（整型秒级时间戳）、MsgId（64 位整型）、AgentID（整型应用 id）。MediaId 仅三天内有效

### 2.2 自建应用：事件推送（MsgType=event）［90240］

| Event | 触发场景 | 备注 |
| --- | --- | --- |
| subscribe / unsubscribe | 成员加入/退出应用可见范围、加入/退出企业、被禁用 | 关注/取消关注 |
| enter_agent | 成员进入应用会话 | EventKey 为空 |
| LOCATION | 进入应用会话时上报地理位置 | Latitude/Longitude/Precision，AppType=wxwork |
| batch_job_result | 异步任务完成 | BatchJob{JobId, JobType(sync_user/replace_user/invite_user/replace_party), ErrCode, ErrMsg} |
| change_contact | 通讯录变更（详见 2.3） | FromUserName=sys |
| click / view / view_miniprogram | 菜单点击/跳转/跳小程序 | EventKey 对应菜单 key / URL / 小程序路径 |
| scancode_push / scancode_waitmsg | 扫码推事件 / 扫码且弹提示框 | ScanCodeInfo{ScanType=qrcode, ScanResult} |
| pic_sysphoto / pic_photo_or_album / pic_weixin | 弹出拍照/拍照或相册/微信相册发图 | SendPicsInfo{Count, PicList.PicMd5Sum} |
| location_select | 弹出地理位置选择器 | SendLocationInfo{Location_X/Y, Scale, Label, Poiname} |
| open_approval_change | 审批流程引擎状态变化（自建/第三方应用发起的申请） | ApprovalInfo 结构体（见 §5） |
| share_agent_change | 企业互联共享应用变更（上级共享/移除下级） | FromUserName=sys |
| share_chain_change | 上下游共享应用变更（上游共享/移除下游） | FromUserName=sys |
| template_card_event | 用户点击模板卡片按钮 | EventKey=btn:key、TaskId、CardType、ResponseCode（72h 内有效、仅一次）、SelectedItems |
| template_card_menu_event | 点击模板卡片右上角菜单 | CardType 取 text_notice/news_notice/button_interaction |
| inactive_alert | 长期未使用应用停用预警 | EffectTime 生效时间戳，FromUserName=sys |
| close_inactive_agent | 长期未使用应用被自动停用 | FromUserName=sys |
| reopen_inactive_agent | 停用应用被管理员重新启用 | |
| low_active_alert | 应用低活跃预警（即将限制客户数据访问） | EffectTime，FromUserName=sys |
| low_active | 应用变为低活跃 | FromUserName=sys |
| active_restored | 低活跃应用恢复活跃 | FromUserName=sys |

### 2.3 通讯录变更通知（Event=change_contact）［90970/90971/90972，推送目标为通讯录同步助手/代开发/上游共享应用］

| ChangeType | 触发场景 | 专有字段 |
| --- | --- | --- |
| create_user | 新增成员 | UserID、Name、Department、MainDepartment、IsLeaderInDept、DirectLeader、Position、Mobile、Gender、Email、BizMail、Status、Avatar、Alias、Telephone、Address、ExtAttr |
| update_user | 更新成员 | 同上 + NewUserID（userid 变更时） |
| delete_user | 删除成员 | 仅 UserID |
| create_party | 新增部门 | Id、Name、ParentId、Order |
| update_party | 更新部门 | Id、Name（变更时传）、ParentId（变更时传） |
| delete_party | 删除部门 | 仅 Id |
| update_tag | 标签成员变更 | TagId、AddUserItems、DelUserItems、AddPartyItems、DelPartyItems（逗号分隔列表） |

关键保真细节（官方原文）
- FromUserName 固定为 `sys`（系统生成）
- 「对于2022年8月15号后通讯录助手新配置或修改的回调url，成员属性只回调UserID/Department两个字段」（create_user）；update_user 只在部门相关变更或 UserId 变更时触发，且只回调 UserID/Department/NewUserId 三字段
- Status 取值：1=已激活 2=已禁用 4=未激活 5=成员退出
- Gender：0 未定义 / 1 男 / 2 女。Avatar 小图把结尾 `/0` 改 `/100`
- ExtAttr.Item：Type 0-文本（Text.Value）1-网页（Web.Title/Url）
- 通讯录同步助手自己通过 API 触发的变更不回调给自己

### 2.4 家校通讯录（Event=change_school_contact）［92032/92052］

| ChangeType | 触发场景 |
| --- | --- |
| create_student / update_student / delete_student | 新增/编辑/删除学生 |
| create_parent / update_parent / delete_parent | 新增/编辑/删除家长 |
| subscribe / unsubscribe | 家长关注/取消关注（学生关联变化） |
| create_deparmtment / update_deparmtment / delete_deparmtment | 新增/编辑/删除部门（注意：官方原文拼写就是 `deparmtment`，非 department，保真时必须照抄） |

载荷极简：ToUserName/FromUserName(sys)/CreateTime/MsgType=event/Event/ChangeType/Id（家校通讯录 userid 或部门 id）

### 2.5 客户联系（外部联系人）［92130］

| Event | ChangeType | 触发场景 |
| --- | --- | --- |
| change_external_contact | add_external_contact | 成员添加外部联系人（带 State 渠道参数 + WelcomeCode） |
| change_external_contact | edit_external_contact | 编辑企业客户信息 |
| change_external_contact | add_half_external_contact | 外部联系人免验证添加成员 |
| change_external_contact | del_external_contact | 删除企业客户 |
| change_external_contact | del_follow_user | 删除跟进成员 |
| change_external_contact | transfer_fail | 客户接替失败（在职/离职继承） |
| change_external_chat | create / update / dismiss | 客户群创建/变更/解散 |
| change_external_tag | create / update / delete / shuffle | 企业客户标签创建/变更/删除/重排 |

FromUserName 固定 `sys`。add_external_contact 载荷含 UserID（服务人员）、ExternalUserID（wo 开头）、State、WelcomeCode

### 2.6 微信客服［94670］（两段式：回调只通知，拉取拿内容）

- 回调 XML：Event 固定 `kf_msg_or_event`，载荷含 ToUserName、CreateTime、MsgType=event、Token（拉取用临时凭证，10 分钟有效）、OpenKfId（wk 开头客服账号）。注意：该 XML 没有 FromUserName 字段
- 真实消息通过 `POST https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg` 拉取（最近 3 天），msgtype：text、image、voice、video、file、location、link、名片、小程序、菜单、视频号商品、视频号订单、聊天记录、视频号、会议、日程、笔记、event
- event_type：enter_session（含 welcome_code）、msg_send_fail、servicer_status_change、session_status_change（change_type 1-接入 2-转接 3-结束 4-重新接入）、user_recall_msg、servicer_recall_msg、reject_customer_msg_switch_change
- origin：3-微信客户发送 4-系统事件 5-接待人员发送

### 2.7 审批［91815］

- Event=`sys_approval_change`（OA 审批应用；区别于流程引擎的 open_approval_change）
- 状态变化包括：催办、撤销、同意、驳回、转审、添加备注等
- 载荷：SpNo/SpNoStr、SpName、SpStatus（1-审批中 2-已通过 3-已驳回 4-已撤销 6-通过后撤销 7-已删除 10-已支付）、SpRecord、SpComment、StatuChangeEvent、NotificationMap 等结构体

### 2.8 上下游（Event=change_chain）［95796］

ChangeType：corp_join（企业加入）、create_chain / update_chain / delete_chain（创建/变更/删除上下游空间）、create_group / update_group / delete_group（企业分组）、remove_corp（移除企业）、update_corp（变更企业分组）。FromUserName=sys

### 2.9 获客助手（Event=customer_acquisition）［97299］

ChangeType：balance_increased / balance_low / balance_exhausted（余额变化）、customer_start_chat（首次收消息）、delete_link、del_follow_user、friend_request（好友申请，带 LinkId+State）、link_unavailable、message_from_customer、open_profile、quota_expire_soon。FromUserName=sys

### 2.10 智能机器人（JSON 载荷，XML 体系外的独立协议）［100719/101027/101033/101463］

- 回调格式为 JSON：`{"encrypt": "msg_encrypt"}`，加解密算法与经典方案相同但 receiveid 传空字符串
- msgtype：text、mixed（图文混排）、image、voice（转文本）、file、video（后四类仅单聊）+ quote（引用结构）
- 事件通用格式 msgtype=event，event.eventtype：enter_chat（当天首次进入会话）、template_card_event（button_interaction/vote_interaction/multiple_interaction 三种卡片子事件）、template_card_menu_event、用户反馈事件
- 公共字段：msgid（排重，可能重复回调）、aibotid、chatid（群聊）、chattype（single/group）、from.userid（超管创建的机器人是明文 userid，否则是加密 userid）、response_url（主动回复的临时 url）
- 模板卡片事件「只会发起一次请求，五秒内收不到响应会断掉连接，丢弃该回调事件」（无重试）
- 长连接模式（对照）：`wss://openws.work.weixin.qq.com`，订阅 `aibot_subscribe`{bot_id, secret}，回调 cmd：aibot_msg_callback / aibot_event_callback；明文 JSON、无加解密；心跳建议 30 秒；同一机器人只允许一条连接（新连接踢旧连接）。Webhook vs 长连接官方对比：长连接无需公网 IP、无需加解密

### 2.11 其他回调域（盘点级）

| Event | 域 | ChangeType/备注 | 页面 |
| --- | --- | --- | --- |
| security | 安全 | change_domain_ip（企微域名/IP 变更；FromUserName=sys；仅自建应用，需配入「我的企业 - 设置 - 域名IP - 可调用API的应用」，代开发/第三方暂不支持，无接收事件开关） | 100080 |
| public_email_change | 公共邮箱 | receive_email（公共邮箱收到邮件；FromUserName=sys；载荷 Id=公共邮箱 id、Amount=当前新邮件数） | 100180 |
| book_meeting_room / cancel_meeting_room | 会议室预定/取消 | MeetingRoomId、BookingId | 95333 |
| 微盘/文档/日历/会议/知识集等 | 各自域 | 变更事件众多（见导航树） | 97833+、97728+、98333+ 等 |

域名/IP 变更事件示例［100080 原文］

```xml
<xml>
	<ToUserName><![CDATA[toUser]]></ToUserName>
	<FromUserName><![CDATA[sys]]></FromUserName> 
	<CreateTime>1403610513</CreateTime>
	<MsgType><![CDATA[event]]></MsgType>
	<Event><![CDATA[security]]></Event>
	<ChangeType><![CDATA[change_domain_ip]]></ChangeType>
</xml>
```

参数：ToUserName=企业 CorpID；FromUserName 固定 sys（系统生成）；CreateTime 整型；MsgType 固定 event；Event 固定 security；ChangeType 固定 change_domain_ip。上/下一篇为 100079 获取企业微信域名IP信息 / 101680 概述

公共邮箱接收邮件事件示例［100180 原文］

```xml
<xml>
   <ToUserName><![CDATA[toUser]]></ToUserName>
   <FromUserName><![CDATA[sys]]></FromUserName> 
   <CreateTime>1668831860</CreateTime>
   <MsgType><![CDATA[event]]></MsgType>
   <Event><![CDATA[public_email_change]]></Event>
   <ChangeType><![CDATA[receive_email]]></ChangeType>
   <Id>1</Id>
   <Amount>2</Amount>
</xml>
```

参数：ToUserName=企业 CorpID；FromUserName 固定 sys；CreateTime 为 unix 时间戳；MsgType/Event/ChangeType 分别固定 event/public_email_change/receive_email；Id=公共邮箱 id；Amount=公共邮箱当前新邮件数。页内注「接收并解析事件的方法见接收事件」（指向旧锚点 12977，其内容现由 90930 覆盖）。上/下一篇为 98003 模糊搜索公共邮箱 / 100183 获取客户端专用密码列表

出站/配置页补证（非回调事件，2026-09-10 冷 IP 复验通过，备查）

- 91770 消息推送配置说明（2025/08/07）：webhook 为 `POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=KEY`，`Content-Type: application/json`；8 种消息类型 text / markdown / markdown_v2 / image / news / file / voice / template_card；text 最长 2048 字节、markdown（含 v2）最长 4096 字节（utf8）；text/markdown 支持 `<@userid>` @群成员（markdown_v2 不支持）；image 传 base64+md5（原图 ≤2M，仅 JPG/PNG）；file/voice 传 media_id；voice 仅 AMR、≤2M、≤60s；发送限 20 条/分钟；文件上传 `POST https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=KEY&type=TYPE`（multipart，字段名 media），media_id 仅三天内有效且仅对应上传的消息推送可用
- 90236 发送应用消息（2025/09/24）：`POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=ACCESS_TOKEN`；寻址 touser/toparty/totag（touser 支持 @all、最多 1000 个，以 `|` 分隔）+ agentid；频率限制每应用 ≤ 账号上限数×200 人次/天、同成员 ≤30 次/分钟且 ≤1000 次/小时（超限丢弃）；支持 enable_duplicate_check（默认去重窗 1800 秒）与 id 转译（8 种消息类型部分字段）；返回 invaliduser/invalidparty/invalidtag/unlicenseduser（全部无权限时 errcode=81013），msgid 用于撤回（94867），response_code（按钮/投票/多选型与带 action_menu 卡片）72 小时内有效且仅一次（用于更新模版卡片 94888）
- 90238 接收消息与事件概述（2024/07/22）：与 §3.1–§3.4 同源（GET echostr 握手、POST XML、5 秒超时重试三次、msgid / FromUserName+CreateTime 排重、空串 200 兜底）；含 `GET https://qyapi.weixin.qq.com/cgi-bin/getcallbackip?access_token=ACCESS_TOKEN` 返回 ip_list（示例 `["101.226.103.*", "101.226.62.*"]`，权限无限定）
- 90254 获取临时素材（2026/01/09，2026-10-14 冷 IP 复验通过，dudu-server 素材读取实现依据）：`GET https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=ACCESS_TOKEN&media_id=MEDIA_ID`；「正确时返回（和普通的http下载相同，请根据http头做相应的处理）」，示例响应头含 `Content-Type: image/jpeg` 与 `Content-disposition: attachment; filename="MEDIA_ID.jpg"`；「错误时返回（这里省略了HTTP首部）：`{ "errcode": 40007, "errmsg": "invalid media_id" }`」；「完全公开，media_id在同一企业内所有应用之间可以共享」「media_id有效期只有3天」；大文件「需使用 Range 分块下载，建议分块大小不超过 20M，否则返回错误码 830002」（206 Partial Content，分片长度须为 16 字节倍数以配合后台分片解密）。与公众号临时素材不同，该接口没有 `video_url` JSON 分支——视频素材同样走二进制流（页面通篇只有二进制与 JSON 错误两种返回形态）

## 3. 回调机制（URL 配置、echostr 握手、重试、官方库）［90930/90307/101033/101463］

### 3.1 三要素配置

- URL：开发者服务地址，需同时支持 GET（验证）与 POST（业务）
- Token：英文或数字、长度不超过 32 位，用于签名计算
- EncodingAESKey：长度固定 43 位字符（a-z, A-Z, 0-9 共 62 字符中选取），是 AESKey 的 Base64 编码

### 3.2 GET 首次校验握手（echostr）

保存配置时企微发 GET

```
GET https://api.3dept.com/?msg_signature=ASDFQWEXZCVAQFASDFASDFSS&timestamp=13500001234&nonce=123412323&echostr=ENCRYPT_STR
```

- msg_signature：签名（计算含 token、timestamp、nonce、加密消息体）
- echostr：加密串，解密后有 random、msg_len、msg、receiveid 四字段，msg 即明文
- 服务端四步：① 参数值 urldecode；② 用 token+timestamp+nonce+echostr 重算签名比对；③ 解密 echostr 取 msg；④ 1 秒内响应 GET，响应体为解密得到的明文「不能加引号，不能带bom头，不能带换行符」
- 智能机器人（101033）：流程相同，且「nonce 随机数，两个小时内保证不重复」；企业内部智能机器人场景 ReceiveId 为空字符串

### 3.3 POST 业务推送

```
POST https://api.3dept.com/?msg_signature=ASDFQWEXZCVAQFASDFASDFSS&timestamp=13500001234&nonce=123412323
Content-Type: 文档未单列（body 为 XML）

<xml>
   <ToUserName><![CDATA[toUser]]></ToUserName>
   <AgentID><![CDATA[toAgentID]]></AgentID>
   <Encrypt><![CDATA[msg_encrypt]]></Encrypt>
</xml>
```

- ToUserName：企业 CorpID；第三方应用回调时为 suiteid
- AgentID：仅应用相关回调带
- 处理：验签 → 解密 Encrypt → （可选）构造被动回复 → 响应
- 响应要求按业务不同：空串、`success` 或加密被动回复包

### 3.4 重试策略（官方原文）

> 企业微信服务器在五秒内收不到响应会断掉连接，并且重新发起请求，总共重试三次。（仅针对网络连接失败或者网络请求超时情况重试，建议开发者接受回调后立即应答，业务异步处理。目前无法保证100%回调成功，若开发者服务失败过多或者超时过多，企业微信可能会根据回调情况丢弃一些回调事件。建议开发者不要强依赖回调，需要额外机制对齐相关业务数据）

### 3.5 被动响应包格式

```
<xml>
   <Encrypt><![CDATA[msg_encrypt]]></Encrypt>
   <MsgSignature><![CDATA[msg_signature]]></MsgSignature>
   <TimeStamp>timestamp</TimeStamp>
   <Nonce><![CDATA[nonce]]></Nonce>
</xml>
```

智能机器人 JSON 版（101033）：`{"encrypt": "...", "msgsignature": "...", "timestamp": 1641002400, "nonce": "nonce"}`，其中 nonce「需要用回调url中的nonce」（复用请求 nonce）

### 3.6 回调出口 IP［92521］

- 动态：`GET https://qyapi.weixin.qq.com/cgi-bin/getcallbackip?access_token=ACCESS_TOKEN`
- 页面静态列表（2026/04/07 更新，官方注明仅供参考）：159.75.144.151、112.53.2.93、106.55.227.187、183.47.98.227、183.47.98.168、113.108.92.100、14.116.241.251、183.47.117.101、106.55.202.215、106.55.201.217、119.147.179.37

### 3.7 官方加解密库（下载地址与版本，出自 90307，2025/10/10 更新）

| 语言 | 版本/更新时间 | 下载地址 |
| --- | --- | --- |
| c++ (xml) | 2018-10-11 | https://open.work.weixin.qq.com/wwopen/downloadfile/c++.zip |
| c++ (json) | 2020-09-01 | https://codeload.github.com/workweixin/weworkapi_cplusplus/zip/master |
| python | — | https://dldir1.qq.com/wework/wwopen/callback/weworkapi_python-master.zip（依赖 PyCryptodome） |
| php | — | https://dldir1.qq.com/wework/wwopen/callback/callback_php.tar.gz |
| java (xml) | 2018-10-11 | https://open.work.weixin.qq.com/wwopen/downloadfile/java.zip |
| java (json) | 2020-09-01 | https://codeload.github.com/workweixin/weworkapi_java/zip/master |
| c# | 2018-10-11 | https://open.work.weixin.qq.com/wwopen/downloadfile/csharp.zip |
| golang (xml) | 2019-01-18 | https://github.com/sbzhu/weworkapi_golang/archive/master.zip |
| golang (json) | 2020-09-01 | https://codeload.github.com/workweixin/weworkapi_golang/zip/master |
| node | npm | https://www.npmjs.com/package/@wecom/crypto（`yarn add @wecom/crypto`） |

库统一三接口：VerifyURL / DecryptMsg / EncryptMsg。类名 WXBizMsgCrypt（xml）/ WXBizJsonMsgCrypt（json）

库返回码：-40001 签名验证错误、-40002 xml/json 解析失败、-40003 sha 加密生成签名失败、-40004 AESKey 非法、-40005 ReceiveId 校验错误、-40006 AES 加密失败、-40007 AES 解密失败、-40008 解密后 buffer 非法、-40009/-40010 base64 编/解码失败、-40011 生成 xml/json 失败

## 4. 验签与加密算法［90968 原文］

### 4.1 术语（逐字）

- msg_signature：消息签名，用于验证请求是否来自企业微信（防止攻击者伪造）
- EncodingAESKey：用于消息体的加密，长度固定为 43 个字符，从 a-z, A-Z, 0-9 共 62 个字符中选取，是 AESKey 的 Base64 编码。解码后即为 32 字节长的 AESKey。`AESKey=Base64_Decode(EncodingAESKey + "=")`
- AESKey：AES 算法的密钥，长度为 32 字节。AES 采用 CBC 模式，数据采用 PKCS#7 填充至 32 字节的倍数；IV 初始向量大小为 16 字节，取 AESKey 前 16 字节（RFC 2315）
- msg：消息体明文，格式为 XML（机器人场景为 JSON）
- msg_encrypt：明文消息 msg 加密处理后的 Base64 编码

### 4.2 消息体签名校验（官方步骤逐字）

1. 计算签名：`dev_msg_signature = sha1(sort(token、timestamp、nonce、msg_encrypt))`。sort 的含义是将参数值按照字母字典排序，然后从小到大拼接成一个字符串；sha1 处理结果要编码为可见字符，把每字节散列值打印为 %02x（16 进制，C printf 语法）格式，全部小写（即 40 位小写 hex）
2. 比较 dev_msg_signature 和 msg_signature 是否相等
3. 被动响应消息时同样用此方法生成签名传给企业微信

### 4.3 加密过程（官方步骤逐字）

1. 拼接明文字符串：`rand_msg = random(16B) + msg_len(4B) + msg + receiveid`。msg_len 为 msg 的字节数，网络字节序（大端）
2. `msg_encrypt = Base64_Encode(AES_Encrypt(rand_msg))`

解密为其逆：Base64_Decode → AES-256-CBC 解密（用 AESKey，不是 EncodingAESKey）→ 去掉头部 16 随机字节 → 读 4 字节 msg_len → 截取 msg_len 长度为 msg → 剩余为 receiveid 并校验

### 4.4 ReceiveId 含义（逐字）

1. 企业应用的回调，表示 corpid
2. 第三方事件的回调，表示 suiteid
3. 个人主体的第三方应用的回调，ReceiveId 是一个空字符串
（另：101033 补充——企业自建智能机器人 receiveid 直接传空字符串）

### 4.5 mock 实现要点（从上述事实推导）

- AES-256-CBC：key=Base64Decode(EncodingAESKey+"=")（32B），iv=key 前 16B，PKCS#7 以 32 字节为块单位补位（不是常见 AES 的 16）
- 签名参与方：token、timestamp、nonce、密文 Base64 字符串（echostr 验证时用 echostr 的密文本身），四值字典序拼接后 SHA-1 小写 hex
- 官方库 python 版（weworkapi_python）可直接作为 mock 的加解密参考实现（同算法）

## 5. 示例载荷原文（逐字）

### 5.1 加解密官方完整示例［90968］（参数真实可复算，mock 黄金样本）

参数

```
corpId = "wx5823bf96d3bd56c7"
token = "QDG6eK"
encodingAesKey = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C"
```

收到的回调（xml 请求示例，原文）

```
POST /cgi-bin/wxpush?msg_signature=477715d11cdb4164915debcba66cb864d751f3e6&timestamp=1409659813&nonce=1372623149 HTTP/1.1
Host: qy.weixin.qq.com
Content-Length: 603
<xml>
<ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>
<Encrypt><![CDATA[RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4aSknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZZIs2pDBS8R07+qN+E7Q==]]></Encrypt>
<AgentID><![CDATA[218]]></AgentID>
</xml>
```

json 请求示例（原文）

```
POST /cgi-bin/wxpush?msg_signature=477715d11cdb4164915debcba66cb864d751f3e6&timestamp=1409659813&nonce=1372623149 HTTP/1.1
Host: qy.weixin.qq.com
Content-Length: 603
{
	"tousername":"tousername",
	"encrypt": "msg_encrypt",
	"agentid":"218"
}
```

签名计算过程（原文）：排序后拼接串与结果签名

```
sort_str = "13726231491409659813QDG6eKRypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4aSknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZZIs2pDBS8R07+qN+E7Q=="
signature = sha1(sort_str) = "477715d11cdb4164915debcba66cb864d751f3e6"
```

该密文解密后的明文（原文）

```
<xml>
      <ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>
      <FromUserName><![CDATA[mycreate]]></FromUserName>
      <CreateTime>1409659813</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
      <Content><![CDATA[hello]]></Content>
      <MsgId>4561255354251345929</MsgId>
      <AgentID>218</AgentID>
  </xml>
```

### 5.2 文本消息明文（90239 原文）

```
<xml>
   <ToUserName><![CDATA[toUser]]></ToUserName>
   <FromUserName><![CDATA[fromUser]]></FromUserName> 
   <CreateTime>1348831860</CreateTime>
   <MsgType><![CDATA[text]]></MsgType>
   <Content><![CDATA[this is a test]]></Content>
   <MsgId>1234567890123456</MsgId>
   <AgentID>1</AgentID>
</xml>
```

### 5.3 subscribe 事件（90240 原文）

```
<xml>
	<ToUserName><![CDATA[toUser]]></ToUserName>
	<FromUserName><![CDATA[UserID]]></FromUserName>
	<CreateTime>1348831860</CreateTime>
	<MsgType><![CDATA[event]]></MsgType>
	<Event><![CDATA[subscribe]]></Event>
	<AgentID>1</AgentID>
</xml>
```

### 5.4 create_user 通讯录事件（90970 原文，截取结构）

```
<xml>
	<ToUserName><![CDATA[toUser]]></ToUserName>
	<FromUserName><![CDATA[sys]]></FromUserName> 
	<CreateTime>1403610513</CreateTime>
	<MsgType><![CDATA[event]]></MsgType>
	<Event><![CDATA[change_contact]]></Event>
	<ChangeType>create_user</ChangeType>
	<UserID><![CDATA[zhangsan]]></UserID>
	<Name><![CDATA[张三]]></Name>
	<Department><![CDATA[1,2,3]]></Department>
	<MainDepartment>1</MainDepartment>
	<IsLeaderInDept><![CDATA[1,0,0]]></IsLeaderInDept>
	<DirectLeader><![CDATA[lisi,wangwu]]></DirectLeader>
	<Position><![CDATA[产品经理]]></Position>
	<Mobile>13800000000</Mobile>
	<Gender>1</Gender>
	<Email><![CDATA[zhangsan@gzdev.com]]></Email>
	<BizMail><![CDATA[zhangsan@qyycs2.wecom.work]]></BizMail>
	<Status>1</Status>
	<Avatar><![CDATA[http://wx.qlogo.cn/mmopen/ajNVdqHZLLA3WJ6DSZUfiakYe37PKnQhBIeOQBO4czqrnZDS79FH5Wm5m4X69TBicnHFlhiafvDwklOpZeXYQQ2icg/0]]></Avatar>
	<Alias><![CDATA[zhangsan]]></Alias>
	<Telephone><![CDATA[020-123456]]></Telephone>
	<Address><![CDATA[广州市]]></Address>
	<ExtAttr>
		<Item>
		<Name><![CDATA[爱好]]></Name>
		<Type>0</Type>
		<Text>
			<Value><![CDATA[旅游]]></Value>
		</Text>
		</Item>
		<Item>
		<Name><![CDATA[卡号]]></Name>
		<Type>1</Type>
		<Web>
			<Title><![CDATA[企业微信]]></Title>
			<Url><![CDATA[https://work.weixin.qq.com]]></Url>
		</Web>
		</Item>
	</ExtAttr>
</xml>
```

注意：ChangeType/Mobile/Gender/Status 等在官方示例中是裸文本（非 CDATA），而 update_tag、92130 等页面用 CDATA——各页原文如此，mock 模板按各域照抄

### 5.5 add_external_contact（92130 原文）

```
<xml>
	<ToUserName><![CDATA[toUser]]></ToUserName>
	<FromUserName><![CDATA[sys]]></FromUserName> 
	<CreateTime>1403610513</CreateTime>
	<MsgType><![CDATA[event]]></MsgType>
	<Event><![CDATA[change_external_contact]]></Event>
	<ChangeType><![CDATA[add_external_contact]]></ChangeType>
	<UserID><![CDATA[zhangsan]]></UserID>
	<ExternalUserID><![CDATA[woAJ2GCAAAXtWyujaWJHDDGi0mAAAA]]></ExternalUserID>
	<State><![CDATA[teststate]]></State>
	<WelcomeCode><![CDATA[WELCOMECODE]]></WelcomeCode>
</xml>
```

### 5.6 微信客服回调（94670 原文；注意无 FromUserName）

```
<xml>
   <ToUserName><![CDATA[ww12345678910]]></ToUserName>
   <CreateTime>1348831860</CreateTime>
   <MsgType><![CDATA[event]]></MsgType>
   <Event><![CDATA[kf_msg_or_event]]></Event>
   <Token><![CDATA[ENCApHxnGDNAVNY4AaSJKj4Tb5mwsEMzxhFmHVGcra996NR]]></Token>
   <OpenKfId><![CDATA[wkxxxxxxx]]></OpenKfId>
</xml>
```

### 5.7 智能机器人 JSON 回调（100719 原文，加密 envelope 内的明文）

```
{
    "msgid": "CAIQ16HMjQYY\/NGagIOAgAMgq4KM0AI=",
    "aibotid": "AIBOTID",
    "chatid": "CHATID",
    "chattype": "group",
    "from": {
        "userid": "USERID"
    },
    "response_url": "RESPONSEURL",
    "msgtype": "text",
    "text": {
        "content": "@RobotA hello robot"
    },
    "quote": {
        "msgtype": "text",
        "text": {
            "content": "这是今日的测试情况"
        }
    }
}
```

### 5.8 其他保真样本（原文照录）

上下游 corp_join（95796 原文——注意 `![CDATA[` 缺 `<` 是官方原文笔误，mock 高保真可保留或修正，建议按真实线上行为修正为标准 CDATA）

```
	<ChangeType><![CDATA[corp_join]]></ChangeType>
	<ChainId>![CDATA[xxxxxx]</ChainId>
	<CorpIds>
		<CorpId>![CDATA[xxxxxx]</CorpId>
		<CorpId>![CDATA[xxxxxx]</CorpId>
	</CorpIds>
</xml>
```

会议室预定（95333 原文）

```
<xml>
	<ToUserName><![CDATA[toUser]]></ToUserName>
	<FromUserName><![CDATA[fromUser]]></FromUserName>
	<CreateTime>1348831860</CreateTime>
	<MsgType><![CDATA[event]]></MsgType>
	<Event><![CDATA[book_meeting_room]]></Event>
	<MeetingRoomId>1</MeetingRoomId>
	<BookingId><![CDATA[bkebsada6e027c123cbafAAA ]]></BookingId>
</xml>
```

被动回复文本（90241 原文，注意方向反转：ToUserName=成员 UserID，FromUserName=CorpID）

```
<xml>
   <ToUserName><![CDATA[toUser]]></ToUserName>
   <FromUserName><![CDATA[fromUser]]></FromUserName> 
   <CreateTime>1348831860</CreateTime>
   <MsgType><![CDATA[text]]></MsgType>
   <Content><![CDATA[this is a test]]></Content>
</xml>
```

## 6. token / 凭证模型（拿什么换什么、寿命）

| 凭证 | 换取方式 | 寿命/约束 | 出处 |
| --- | --- | --- | --- |
| access_token | `GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=ID&corpsecret=SECRET` | expires_in 正常 7200 秒（2 小时）；最长 512 字节；每应用独立，需缓存，频繁调用会被频率拦截；可能被运营提前作废 | 91039 |
| 回调验签三元组 | 管理端配置，无换取 | Token ≤32 位英数；EncodingAESKey 43 位 | 90930 |
| 微信客服拉取 Token | 回调 XML 内直接携带 | 10 分钟内有效，不填则接口严格限频 | 94670 |
| WelcomeCode（客户联系） | add_external_contact 事件携带 | 用于发送欢迎语；客户已开始聊天或已用过则不再返回 | 92130 |
| welcome_code / msg_code（客服） | enter_session / session_status_change 事件携带 | 用于事件响应消息；欢迎语条件=用户过去 48 小时未收欢迎语且未发过消息 | 94670 |
| ResponseCode（模板卡片） | template_card_event 事件携带 | 72 小时内有效，且只能使用一次 | 90240 |
| response_url（机器人） | 消息回调携带 | 主动回复用临时 url | 100719 |
| media_id | 媒体上传接口 | 仅三天内有效；企业内应用间共享；读取走 media/get 二进制流（>20M 需 Range 分块，错误返回 JSON errcode 如 40007） | 90239 / 90254 |
| 机器人长连接 Secret | 管理端长连接模式 | 与回调模式的 Token/AESKey 独立；单连接，新连接踢旧连接 | 101463 |
| 群机器人 webhook key | 群配置页（消息推送详情页取专属 webhookurl，需保密防泄漏） | 发送限 20 条/分钟；media_id 仅三天内有效且仅对应 webhook 可用；POST 为 application/json | 91770（2026-09-10 冷 IP 复验通过，未迁移/未下线） |
| 应用消息发送配额 | access_token 调用 message/send | 每应用≤账号上限×200 人次/天；同成员≤30 次/分、1000 次/时（超限丢弃）；可选 enable_duplicate_check（默认 1800 秒窗） | 90236 |

access_token 返回示例（91039 原文）

```
{
   "errcode": 0,
   "errmsg": "ok",
   "access_token": "accesstoken000001",
   "expires_in": 7200
}
```

## 7. 待核验清单（抓取失败/未覆盖，2026-09-27 配额恢复后补）

1. 旧锚点页 SSR 始终空壳：`12977 设置接收消息的参数`（内容基本被 90930 覆盖，但管理端配置路径/截图未取）；`10128 下载地址`（被 90307 覆盖）。→ 待核验(09-27)
2. `92128 回调通知`（客户联系域，客户联系回调总说明页）：curl 重试 4 次均为 JS 空壳；其 change_type 清单已由 92130 完整覆盖，但该页可能含回调开关配置说明与客户群变更详细字段。→ 待核验(09-27)
3. 第三方应用（服务商）回调协议：suite_ticket 推送、suite_access_token、ticket 换取流程（ReceiveId=suiteid 已确认，但推送样例与频率未取）。→ 待核验(09-27)
4. 会话内容存档回调（95039 产生会话回调事件、99994 产生会话回调通知、92005 客户同意存档）未细抓。→ 待核验(09-27)
5. 微盘/文档/日历/日程/会议/知识集专区等新域回调（97833+、97728+、98333+、99963/99996 等）仅盘到导航，未抓正文。→ 待核验(09-27)
6. 回调 POST 的 Content-Type 头（官方文档页面未显式标注，真实请求一般为 `text/xml`）→ 待核验(09-27)；其中 webhook 机器人侧已消项：91770 curl 示例明示 `Content-Type: application/json`（2026-09-10 冷 IP 复验通过）
7. 官方加解密库源码内部实现（下载 zip 中的 Sample 与 PKCS7 pad 32 常量）未下载核验；如需可取 weworkapi_python-master.zip 比对。→ 待核验(09-27)
8. B 类冷 IP 补证（2026-09-10，5 页单发串行、页间 ≥5 秒，一次通过、无验证码反爬）：100080（security/change_domain_ip）、100180（public_email_change/receive_email）、91770（webhook，迁移猜测已证伪）、90236（message/send）、90238（接收概述 + 导航树实证）均已入 §1/§2.11/§6，本轮消项完毕
9. 素材读取补证（2026-10-14，dudu-server #115 实施依据）：90254 获取临时素材已核验入 §1/§2.11/§6——成功为二进制流按 HTTP 头处理、错误为 JSON errcode（40007 无效 media_id）、media_id 3 天有效且企业内共享、>20M 需 Range 分块（830002）；确认无 `video_url` JSON 分支（区别于公众号临时素材）。90236 发送响应补证：成功返回 `errcode=0` 且带 `msgid`（撤回用，94867）、全部接收人无效时 `errcode=81013`，已作为 WecomTextSender 成功/失败响应的构造依据
