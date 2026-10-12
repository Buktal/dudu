# 微信公众号（订阅号/服务号）事件推送事实库（官方文档摄取）

> 调研日期：2026-09-10。方法：WebFetch 直抓 `developers.weixin.qq.com` 服务号/公众号文档站 SSR 正文（逐字提取）。
> 用途：mock-pulse 高保真模拟「微信服务器 → 开发者 URL」的推送（GET 明文 echostr 握手、XML 明文/密文包、三模式、被动回复、客服窗口）。
> 约定：每个 claim 后标来源 URL；凡未抓到正文的一律标「待核验(09-27)」。示例载荷均为官方文档原文逐字拷贝（含原文占位符如 `toUser`/`FromUser` 大小写不一致，原样保留）。
> 文档站现状备注：原公众号文档（订阅号+服务号合一）已拆分为「公众号（订阅号）」与「服务号」两个独立文档区（来源：https://developers.weixin.qq.com/doc/subscription/guide/ 首段原文，本次实抓）。本次逐字核验的是 **服务号树**（`/doc/service/`）；订阅号树（`/doc/subscription/`）仅实抓指南首页确认目录同构，各消息/事件正文页未逐页抓 → 订阅号树正文复用结论标待核验(09-27)。

## 1. 官方文档入口与关键页面地址

- 门户：https://developers.weixin.qq.com/doc/（12 产品入口页）
- 服务号指南根：https://developers.weixin.qq.com/doc/service/guide/
- 公众号（订阅号）指南根：https://developers.weixin.qq.com/doc/subscription/guide/
- 公众平台（配置侧，非文档站）：https://mp.weixin.qq.com/（服务器配置、测试号、在线调试，见 §7 待核验）
- 微信开发者平台（新版配置入口，文档原文）：https://developers.weixin.qq.com/platform
- 加解密示例代码包（官方）：https://wximg.gtimg.com/shake_tv/mpwiki/cryptoDemo.zip（C++/PHP/Java/Python/C#，来源：encryption.html；包内源码本次未下载 → 待核验(09-27)）
- 在线调试工具：http://mp.weixin.qq.com/debug/（start.html 原文为 http，https 可达，照录原文 scheme；另有消息推送专用调试工具 https://developers.weixin.qq.com/apiExplorer?type=messagePush，来源：start.html / encryption.html / push/）

本次实际抓到并逐字核验的页面清单（§2–§6 的每种消息/事件均可回查到本表中的某一行）：

| # | 标题 | URL | 覆盖事件/消息 |
|---|---|---|---|
| 1 | 快速入门（含 GET 验签 Python 示例、收/发消息示例、素材/菜单） | https://developers.weixin.qq.com/doc/service/guide/dev/start.html | 握手 `signature/timestamp/nonce/echostr`；text/image 收发示例；`success` 重试说明 |
| 2 | 消息与事件推送介绍（含服务器配置三要素+GET 校验 PHP 示例） | https://developers.weixin.qq.com/doc/service/guide/dev/push/ | 通道配置（URL/Token/EncodingAESKey/三模式/仅 XML）；GET 四参握手 |
| 3 | 消息加解密说明（三模式+签名算法+AES 流程+数值例） | https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html | 明文/兼容/安全；`signature` 三参 vs `msg_signature` 四参；AES-256-CBC/PKCS#7(32)；`random16B+msg_len4B+msg+appid`；`debug_demo` 示例包；加密回包 `Encrypt/MsgSignature/TimeStamp/Nonce` |
| 4 | 接收普通消息（7 种） | https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_standard_messages.html | `text/image/voice/video/shortvideo/location/link`（`MsgId/MsgDataId/Idx`，`MediaId16K`） |
| 5 | 接收事件推送（关注/扫码/地理/菜单拉取+跳转） | https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_event_pushes.html | `subscribe/unsubscribe/SCAN/LOCATION/CLICK/VIEW`（`qrscene_` 前缀、`Ticket`、`Latitude/Longitude/Precision`） |
| 6 | 自定义菜单事件推送（扫码/拍照/相册/位置+跳小程序） | https://developers.weixin.qq.com/doc/service/guide/product/menu/Custom_Menu_Push_Events.html | `CLICK/VIEW/scancode_push/scancode_waitmsg/pic_sysphoto/pic_photo_or_album/pic_weixin/location_select/view_miniprogram`（`ScanCodeInfo/SendPicsInfo/SendLocationInfo/MenuId`） |
| 7 | 被动回复用户消息 | https://developers.weixin.qq.com/doc/service/guide/product/message/Passive_user_reply_message.html | 回复 `text/image/voice/video/music/news/transfer_biz_ai_ivr`；5s×3 重试；`success`/空串；`msgid` vs `FromUserName+CreateTime` 排重 |
| 8 | 将消息转发到客服 | https://developers.weixin.qq.com/doc/service/guide/product/kf/forwarding.html | `transfer_customer_service`（`TransInfo>KfAccount`）；30 分钟自动停转；排队期仍推 URL；仅用户消息可转接 |
| 9 | 客服消息介绍（含下发规则表+接口目录） | https://developers.weixin.qq.com/doc/service/guide/product/kf/intro.html | 4 触发动作；5条/48h + 3条/1min×3；客服管理 7 接口；会话控制 5 接口；客服消息 3 接口 |
| 10 | 发送客服消息 API（含全字段+11 示例） | https://developers.weixin.qq.com/doc/service/api/customer/message/api_sendcustommessage.html | `POST /cgi-bin/message/custom/send`；msgtype `text/image/voice/video/music/news/mpnews/mpnewsarticle/msgmenu/wxcard/miniprogrampage`；`customservice.kf_account`；`aimsgcontext.is_ai_msg`；适用范围「公众号/服务号仅认证」 |
| 11 | 模板消息（含 TEMPLATESENDJOBFINISH 三态） | https://developers.weixin.qq.com/doc/service/guide/product/template_message/Template_Message_Interface.html | `TEMPLATESENDJOBFINISH`（`MsgID/Status`：`success` / `failed:user block` / `failed: system failed`）；模板 25 个/日 10 万次/5 类目 |
| 12 | 群发消息（含 MASSSENDJOBFINISH） | https://developers.weixin.qq.com/doc/service/guide/product/message/Batch_Sends.html | `MASSSENDJOBFINISH`（`MsgID/Status/TotalCount/FilterCount/SentCount/ErrorCount/CopyrightCheckResult/ArticleUrlResult`，FromUserName=`mphelper`）；订阅号 1 次/天；服务号每月每用户 4 条；`clientmsgid` 排重（45065/45066/45067） |
| 13 | 订阅通知的事件推送 | https://developers.weixin.qq.com/doc/service/guide/product/subscription_messages/push.html | `subscribe_msg_popup_event`（`accept/reject`，PopupScene 1/2）；`subscribe_msg_change_event`；`subscribe_msg_sent_event`（`MsgID/ErrorCode/ErrorStatus`） |
| 14 | 获取接口调用凭据 | https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken.html | `GET /cgi-bin/token?appid=&secret=&grant_type=client_credential`；`expires_in` 7200；多应用类型隔离；40243 冻结；40164 IP 白名单 |
| 15 | 获取稳定版接口调用凭据 | https://developers.weixin.qq.com/doc/service/api/base/api_getstableaccesstoken.html | `POST /cgi-bin/stable_token`；与普通版隔离；普通/强制刷新双模式；1万次/分、50万次/天；强制刷新 20 次/天+间隔 30s；提前 5 分钟更新；token 至少存 512 字符 |
| 16 | 获取微信推送服务器 IP | https://developers.weixin.qq.com/doc/service/api/base/api_getcallbackip.html | `GET /cgi-bin/getcallbackip?access_token=` → `ip_list`；建议每天请求 1 次更新 |

## 2. 消息/事件推送全清单

公共推送约束（多页重复原文）：推送方法 POST 到服务器配置 URL，编码 UTF-8，**数据格式仅 XML**（来源：push/ 页「数据格式：消息体的格式，仅支持 XML」；注意 encryption.html 另有用 JSON 演示加解密流程的示例包，属算法演示而非推送格式选项——推送格式以 push/ 页为准）。

### 2.1 普通消息（7 种）［Receiving_standard_messages］

公共字段：`ToUserName`（开发者微信号）、`FromUserName`（发送方 OpenID）、`CreateTime`（整型）、`MsgType`、`MsgId`（64 位整型）、`MsgDataId` + `Idx`（仅消息来自文章时）。

| MsgType | 专有字段 | 来源页备注 |
|---|---|---|
| text | Content | — |
| image | PicUrl（系统生成）、MediaId（调获取临时素材接口拉取） | — |
| voice | MediaId（8K amr）、Format（amr/speex 等）、**MediaId16K**（16K 采样，可拉 16K amr/speex） | 企微无此字段，公众号独有 |
| video | MediaId、ThumbMediaId | — |
| shortvideo | MediaId、ThumbMediaId | 与 video 同构，MsgType 不同 |
| location | Location_X（纬度）、Location_Y（经度）、Scale、Label | 注意 X=纬度/Y=经度（官方如此定义） |
| link | Title、Description、Url | — |

### 2.2 基础事件（6 种）［Receiving_event_pushes］

| Event | 专有字段 | 触发场景/备注（官方原文） |
|---|---|---|
| subscribe | （无关注）/ 带参关注时 `EventKey`（`qrscene_` 前缀+场景值 ID）+ `Ticket` | 关注；官方要求收到 unsubscribe 时删除该用户全部信息（隐私要求原文） |
| unsubscribe | — | 取消关注 |
| SCAN | EventKey=场景值 ID（无前缀）+ `Ticket` | 已关注扫带参码 |
| LOCATION | Latitude / Longitude / Precision | 同意上报后：每次进入会话上报，或进入后每 5 秒一次（公众平台网站可改设置） |
| CLICK | EventKey=菜单 key | 点击菜单拉取消息；点开弹出子菜单不产生上报 |
| VIEW | EventKey=跳转 URL | 点击菜单跳转链接 |

### 2.3 自定义菜单扩展事件（9 种）［Custom_Menu_Push_Events］

第 3–8 个事件官方注明客户端版本门槛：「仅支持微信 iPhone 5.4.1 以上、Android 5.4 以上，旧版本无回应且收不到推送」。

| Event | 专有字段 | 备注 |
|---|---|---|
| CLICK | EventKey | 同 2.2（本页重申） |
| VIEW | EventKey + MenuId | 本页 VIEW 比 2.2 多 `MenuId`（个性化菜单时标识规则） |
| scancode_push | EventKey + `ScanCodeInfo>ScanType`（一般 qrcode）/`ScanResult` | 扫码推事件 |
| scancode_waitmsg | 同上 | 扫码且弹「消息接收中」提示框 |
| pic_sysphoto | EventKey + `SendPicsInfo>Count/PicList>item>PicMd5Sum` | 弹出系统拍照发图 |
| pic_photo_or_album | 同上 | 拍照或相册发图 |
| pic_weixin | 同上 | 微信相册发图器 |
| location_select | EventKey + `SendLocationInfo>Location_X/Location_Y/Scale/Label/Poiname`（可为空） | 地理位置选择器；注意此处坐标包 CDATA（与 2.1 location 裸文本不同，原文如此） |
| view_miniprogram | EventKey=小程序路径 + MenuId | 点击菜单跳转小程序 |

### 2.4 结果回执事件（2 种，官方有则收）

| Event | 来源 | 专有字段/状态值 |
|---|---|---|
| TEMPLATESENDJOBFINISH | Template_Message_Interface | `MsgID` + `Status`：`success` / `failed:user block`（用户拒收）/ `failed: system failed`（其他失败） |
| MASSSENDJOBFINISH | Batch_Sends | FromUserName=`mphelper`；`MsgID/Status`（`send success`/`send fail`/`err(num)`，err 映射：10001 广告/20001 政治/20004 社会/20002 色情/20006 违法犯罪/20008 欺诈/20013 版权/22000 互推/21000 其他/30001-30003 原创校验/40001 管理员拒绝/40002 管理员 30min 超时/err(93115) 公开地图使用不规范等）+ `TotalCount/FilterCount/SentCount/ErrorCount/CopyrightCheckResult/ArticleUrlResult` |

### 2.5 订阅通知事件（3 种，服务号）［subscription_messages/push］

| Event | 结构 |
|---|---|
| subscribe_msg_popup_event | `SubscribeMsgPopupEvent>List[](TemplateId/SubscribeStatusString=accept\|reject/PopupScene=1 H5\|2 图文)` |
| subscribe_msg_change_event | `SubscribeMsgChangeEvent>List[](TemplateId/SubscribeStatusString=reject)`（仅拒收推送） |
| subscribe_msg_sent_event | `SubscribeMsgSentEvent>List[](TemplateId/MsgID/ErrorCode 0=成功/ErrorStatus)`（异步系统失败才记失败） |

### 2.6 被动响应 8 种［被动回复 7（Passive 页目录）+ 转客服 1（forwarding 页）］

回复方向与接收相反：`ToUserName`=用户 OpenID、`FromUserName`=开发者微信号。支持 text（Content，`\n` 换行）/ image（`Image>MediaId`，不支持 gif 动图）/ voice（`Voice>MediaId`）/ video（`Video>MediaId/Title/Description`）/ music（`Music>Title/Description/MusicUrl/HQMusicUrl/ThumbMediaId`）/ news（`ArticleCount+Articles>item(Title/Description/PicUrl/Url)`；用户发文本/图片/语音/视频/图文/地理位置六种消息时只能回 1 条图文，其余场景最多 8 条；超限只发限内条数）/ `transfer_customer_service`（转客服，可带 `TransInfo>KfAccount` 指定客服；30 分钟未关会话自动停转回推 URL；排队期消息仍推 URL；**仅用户消息可转接**，菜单点击/地理上报等事件不应转接）/ `transfer_biz_ai_ivr`（转公众号内置 AI 回复，需已开启 AI 回复且学习完历史文章；灰度中）。

### 2.7 客服消息（主动 API 类型，11 种）［api_sendcustommessage］

`POST https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=ACCESS_TOKEN`，JSON `{touser(OpenID), msgtype, …}`。msgtype：text（content，支持小程序文字链 `data-miniprogram-appid/path`，小程序须与公众号绑定）/ image / voice / video（+thumb_media_id/title/description）/ music / news（外链图文，articles 限 1 条）/ mpnews（废弃，超 1 条报 45008）/ mpnewsarticle（`article_id`，经「发布」系列接口得到）/ msgmenu（`head_content/list[{id,content}]/tail_content`）/ wxcard（`card_id`）/ miniprogrampage（`title/appid/pagepath/thumb_media_id` 520*416）。可选 `customservice.kf_account`（指定客服身份发送）、`aimsgcontext.is_ai_msg`（1=下方灰字「内容由第三方AI生成」）、`businessid`（子商户）。

客服窗口（intro + sendcustommessage 两页同表，官方原文）：用户发送消息→**5 条/48 小时**；点击自定义菜单→3 条/1 分钟；关注→3 条/1 分钟；扫码→3 条/1 分钟。特别说明：点击菜单触发的是点击菜单事件，走场景 2 规则，不产生「用户发送消息」场景额度；仅点击推事件/扫码推事件/扫码推且弹提示框 3 种菜单类型可触发客服接口。可发 media_id 均可用永久素材。会话 API：`/customservice/kfsession/create|close|getsession|getsessionlist|getwaitcase`；输入状态 `/cgi-bin/message/custom/typing`；聊天记录 `/customservice/msgrecord/getmsglist`；客服账号管理 7 接口（add/del/update/inviteworker/getkflist/getonlinekflist/uploadheadimg，每个账号最多 100 个客服）。

## 3. 回调机制（URL 配置、GET 握手、重试）

### 3.1 服务器配置（push/ 页逐字）

- 配置入口：「微信开发者平台 - 我的业务 - 服务号 - 消息与事件推送」（来源：push/；start.html 旧表述为「微信开发者平台-我的业务与服务-服务号-开发信息」——新旧入口表述并存，原文照录）。
- 四项：URL（接收消息和事件的接口，`http://` 80 或 `https://` 443 开头）、Token（任意填写，用于生成签名比对）、EncodingAESKey（手动填写或随机生成，消息体加解密密钥）、消息加解密方式（明文/兼容/安全）+ 数据格式（仅 XML）。
- 生效：模式选择与服务器配置提交后立即生效；启用后用户消息转推该地址，网站自动回复与自定义菜单失效（来源：push/ 注意事项）。

### 3.2 GET 首次校验握手（明文 echostr）

微信发 GET 到 URL，携带 `signature/timestamp/nonce/echostr`（来源：push/ 参数表；start.html 同）。

校验流程（push/ 三步 + start.html Python 代码互证，原文要点合并）：

1. `token/timestamp/nonce` 字典序排序 → 拼接 → sha1（start.html：`list=[token,timestamp,nonce]; list.sort(); map(sha1.update,list); hexdigest`；push/ PHP 版：`sort($tmpArr,SORT_STRING); implode; sha1`）。
2. 与 `signature` 比对，一致则确认来自微信。
3. **原样返回 `echostr`**（不加引号）；失败返回空串。start.html 另述：验证成功后回基本配置页点「启动」按钮生效；并提供 URL 验证工具 `apiExplorer?type=messagePush`（填 AccessToken+URL+Token 发起验证 GET）。

### 3.3 POST 业务推送与响应

- 安全模式 URL 额外参数：`openid`、`encrypt_type=aes`（兼容/安全）、`msg_signature`（来源：encryption.html）。
- 安全模式收包体仅两字段：`ToUserName`（`gh_xxx`）+ `Encrypt`（XML/JSON 同名字段，来源：encryption.html 安全模式示例包）。
- 响应：5 秒内必须响应；无法保证 5 秒处理时必须回 `success`（推荐）或空串（字节长度 0，非 content 为空），微信不作处理且不重试，之后可用客服接口异步回复（来源：Passive_user_reply_message）。图片等多媒体被动回复需先经素材管理接口上传拿 MediaId（临时或永久均可，来源同页）。

### 3.4 重试与排重（官方原文，多页重复）

- 「微信服务器在五秒内收不到响应会断掉连接，并且重新发起请求，总共重试三次」（来源：Receiving_standard_messages / Receiving_event_pushes / Passive_user_reply_message 三页同句）。
- 以下情况用户端提示「该服务号暂时无法提供服务，请稍后再试」：5 秒内未回任何内容；回复异常数据（如 JSON）（来源：Passive_user_reply_message）。
- 排重官方建议原文：「有 msgid 的消息推荐使用 msgid 排重。事件类型消息推荐使用 FromUserName + CreateTime 排重。」（来源：Passive_user_reply_message；Receiving_standard_messages 页为「推荐使用 msgid 排重」；Receiving_event_pushes 页为「推荐使用 FromUserName + CreateTime 排重」）。
- 群发排重另有 `clientmsgid`（24h 检查，冲突 errcode 45065 带已存在 msg_id；重试过快 45066；超长 45067；缺省以后台摘要值充当。来源：Batch_Sends）。

### 3.5 回调出口 IP［api_getcallbackip］

- 动态接口：`GET https://api.weixin.qq.com/cgi-bin/getcallbackip?access_token=ACCESS_TOKEN` → `{ip_list:[…]}`（示例 `106.55.206.146/211`）。
- 官方建议每天请求 1 次更新 IP 列表，勿长期使用旧表作访问入口（来源同页注意事项）。

## 4. 验签与加密算法［encryption.html 原文］

### 4.1 三模式差异（逐字）

| 模式 | 收到内容 | 回复内容 | 要点 |
|---|---|---|---|
| 明文模式 | 明文 | 明文 | 默认；URL 只有 `signature`（三参） |
| 兼容模式 | 明文+密文并存（包长约 3 倍） | 明文或密文均可 | 调试过渡用；需先配 EncodingAESKey |
| 安全模式（推荐） | 仅密文（`Encrypt`） | 仅密文 | URL 加 `encrypt_type=aes` + `msg_signature`；官方强调「注意：不要使用 signature 验证！」 |

### 4.2 signature（明文/GET 握手）

`sha1(字典序排序(token, timestamp, nonce)后拼接)`。官方数值例（明文模式）：token=`AAAAA`、timestamp=`1714037059`、nonce=`486452656` → 排序 `["1714037059","486452656","AAAAA"]` → 拼接 `1714037059486452656AAAAA` → sha1=`899cf89e464efb63f54ddac96b0a0a235f53aa78`，与 URL 中 signature 比对。

### 4.3 msg_signature（兼容/安全）

`sha1(字典序排序(token, timestamp, nonce, Encrypt)后拼接)`，Encrypt 取包体内字段。官方数值例（安全模式）：token=`AAAAA`、timestamp=`1714112445`、nonce=`415670741`、Encrypt=`+qdx1OKCy…Gj04=`（224 字节 Base64，见 §5.4）→ sha1=`046e02f8204d34f8ba5fa3b1db94908f3df2e9b3`。加密回包签名同理：对（token、回包 TimeStamp、回包 Nonce、回包 Encrypt）四参排序 sha1；官方回包例签名=`1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1`（TimeStamp=`1713424427`、Nonce=`415670741`、Encrypt=`ELGduP2Y…tmxSQ==`）。

### 4.4 AES（逐字流程）

1. `AESKey = Base64_Decode(EncodingAESKey + "=")`（尾部补一个 `=` 解码得 32 字节）。
2. `Encrypt` Base64 解码得 TmpMsg；AES-256-CBC 解密（密钥 32 字节/256 位，PKCS#7 填充，K=32：尾部补 `(K−N%K)` 个同值字节）；官方提示尽量用官方示例代码。
3. 明文结构：`FullStr = random(16B) + msg_len(4B网络字节序) + msg + appid`；**appid 须校验与自身服务号相符**（与企微尾部 receiveid 对应，公众号尾部为 AppId）。官方数值例：random=`a8eedb185eb2fecf`、msg_len=`167`、appid=`wxba5fad812f8e6fb9`（解密例）；加密例 random=`707722b803182950`、msg_len=`25`、FullStr 63B → 加密后 64B → Encrypt=`ELGduP2Y…tmxSQ==`。
4. 加密回包信封四字段：`Encrypt/MsgSignature/TimeStamp/Nonce`（JSON 或 XML，Nonce 回填 URL 参数 nonce 即可，TimeStamp 用当前时间戳）。

### 4.5 mock 实现要点（从上述事实推导，非官方原文）

- 签名均为「字典序排序→直接拼接→sha1 小写 hex」；GET 握手三参、业务四参（含密文）。
- AES-256-CBC：key=Base64Decode(EncodingAESKey+"=")（32B），IV=key 前 16B（encryption.html 未明写 IV 取值，沿 WXBizMsgCrypt 同源实现；IV 断言标待核验(09-27)，见 §7）。
- 安全模式收包仅 `ToUserName+Encrypt`；回 `success`/空串无需加密。

## 5. 示例载荷原文（逐字）

### 5.1 文本消息（start.html / Receiving_standard_messages 两页一致，字段以 Receiving 页为准）

```
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName>
 <CreateTime>1348831860</CreateTime>
 <MsgType><![CDATA[text]]></MsgType>
 <Content><![CDATA[this is a test]]></Content>
 <MsgId>1234567890123456</MsgId>
 <MsgDataId>xxxx</MsgDataId>
 <Idx>xxxx</Idx>
</xml>
```

### 5.2 图片消息（Receiving_standard_messages 原文）

```
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName>
 <CreateTime>1348831860</CreateTime>
 <MsgType><![CDATA[image]]></MsgType>
 <PicUrl><![CDATA[this is a url]]></PicUrl>
 <MediaId><![CDATA[media_id]]></MediaId>
 <MsgId>1234567890123456</MsgId>
  <MsgDataId>xxxx</MsgDataId>
 <Idx>xxxx</Idx>
</xml>
```

### 5.3 语音消息（原文，含 MediaId16K）

```
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName>
 <CreateTime>1357290913</CreateTime>
 <MsgType><![CDATA[voice]]></MsgType>
 <MediaId><![CDATA[media_id]]></MediaId>
 <Format><![CDATA[Format]]></Format>
 <MsgId>1234567890123456</MsgId>
 <MsgDataId>xxxx</MsgDataId>
 <Idx>xxxx</Idx>
 <MediaId16K><![CDATA[media_id_16k]]></MediaId16K>
</xml>
```

### 5.4 视频 / 小视频 / 位置 / 链接（原文骨架，字段见 §2.1）

视频：`MsgType=video`，`MediaId` + `ThumbMediaId`；小视频：`MsgType=shortvideo` 同构。位置：`Location_X=23.134521 / Location_Y=113.358803 / Scale=20 / Label`（CDATA）。链接：`Title/Description/Url`。公共尾 `MsgId/MsgDataId/Idx` 同 5.1。

### 5.5 subscribe / unsubscribe（Receiving_event_pushes 原文；注意 FromUser 大小写原文如此）

```
<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[FromUser]]></FromUserName>
  <CreateTime>123456789</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[subscribe]]></Event>
</xml>
```

带参关注：加 `EventKey=qrscene_123123` + `Ticket=TICKET`；已关注扫码：`Event=SCAN` + `EventKey=SCENE_VALUE` + `Ticket`。

### 5.6 LOCATION（原文）

```
<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[fromUser]]></FromUserName>
  <CreateTime>123456789</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[LOCATION]]></Event>
  <Latitude>23.137466</Latitude>
  <Longitude>113.352425</Longitude>
  <Precision>119.385040</Precision>
</xml>
```

### 5.7 CLICK / VIEW（原文）

CLICK：`Event=CLICK` + `EventKey=EVENTKEY`。VIEW：`Event=VIEW` + `EventKey=www.qq.com`（Receiving 页无 MenuId；Custom_Menu 页 VIEW 另带 `MenuId=MENUID`）。

### 5.8 scancode_push / scancode_waitmsg（Custom_Menu_Push_Events 原文）

```
<xml><ToUserName><![CDATA[gh_e136c6e50636]]></ToUserName>
<FromUserName><![CDATA[oMgHVjngRipVsoxg6TuX3vz6glDg]]></FromUserName>
<CreateTime>1408090502</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[scancode_push]]></Event>
<EventKey><![CDATA[6]]></EventKey>
<ScanCodeInfo><ScanType><![CDATA[qrcode]]></ScanType>
<ScanResult><![CDATA[1]]></ScanResult>
</ScanCodeInfo>
</xml>
```

（scancode_waitmsg 同构，Event 不同，CreateTime=`1408090606`、ScanResult=`2`。）

### 5.9 pic 系三事件（原文，以 pic_sysphoto 为例）

```
<xml><ToUserName><![CDATA[gh_e136c6e50636]]></ToUserName>
<FromUserName><![CDATA[oMgHVjngRipVsoxg6TuX3vz6glDg]]></FromUserName>
<CreateTime>1408090651</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[pic_sysphoto]]></Event>
<EventKey><![CDATA[6]]></EventKey>
<SendPicsInfo><Count>1</Count>
<PicList><item><PicMd5Sum><![CDATA[1b5f7c23b5bf75682a53e7b6d163e185]]></PicMd5Sum>
</item>
</PicList>
</SendPicsInfo>
</xml>
```

### 5.10 location_select / view_miniprogram（原文要点）

location_select：`SendLocationInfo>Location_X(23)/Location_Y(113)/Scale(15)/Label(␣广州市海珠区客村艺苑路␣106号，首尾空格逐字，原文 <Label><![CDATA[ 广州市海珠区客村艺苑路 106号]]>)/Poiname(空)` 全套 CDATA。view_miniprogram：`Event=view_miniprogram` + `EventKey=pages/index/index` + `MenuId=MENUID`。

### 5.11 TEMPLATESENDJOBFINISH（原文，成功态）

```
<xml>
  <ToUserName><![CDATA[gh_7f083739789a]]></ToUserName>
  <FromUserName><![CDATA[oia2TjuEGTNoeX76QEjQNrcURxG8]]></FromUserName>
  <CreateTime>1395658920</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[TEMPLATESENDJOBFINISH]]></Event>
  <MsgID>200163836</MsgID>
  <Status><![CDATA[success]]></Status>
</xml>
```

（失败态 Status 为 `failed:user block` / `failed: system failed`，结构相同。）

### 5.12 订阅通知三事件（原文节选，完整包见 push.html）

popup：`Event=subscribe_msg_popup_event` + `SubscribeMsgPopupEvent>List[](TemplateId/SubscribeStatusString=accept|reject/PopupScene=2)`；change：`Event=subscribe_msg_change_event` + `SubscribeMsgChangeEvent>List[](TemplateId/reject)`；sent：`Event=subscribe_msg_sent_event` + `SubscribeMsgSentEvent>List[](TemplateId/MsgID=1700827132819554304/ErrorCode=0/ErrorStatus=success)`。ToUserName=`gh_123456789abc`，FromUserName=`otFpruAK8D-E6EfStSYonYSBZ8_4`（原文）。

### 5.13 被动回复文本 / 转客服（原文）

文本回复：`ToUserName=粉丝号 / FromUserName=服务号 / CreateTime=1460541339 / MsgType=text / Content=test`（start.html）。转客服：`MsgType=transfer_customer_service`；指定客服时加 `TransInfo>KfAccount=test1@test`（forwarding.html）。

### 5.14 安全模式收包 + 加密回包（encryption.html 数值例，JSON 演示）

收：`{"ToUserName":"gh_97417a04a28d","Encrypt":"+qdx1OKCy…Gj04="}`（URL 带 `signature/timestamp=1714112445/nonce=415670741/openid/encrypt_type=aes/msg_signature=046e02f8…`）。回：`{"Encrypt":"ELGduP2Y…tmxSQ==","MsgSignature":"1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1","TimeStamp":1713424427,"Nonce":"415670741"}`。XML 版回包四字段同名（`Encrypt/MsgSignature/TimeStamp/Nonce`）。

### 5.15 客服文本发送（api_sendcustommessage 原文）

```
{
    "touser":"OPENID",
    "msgtype":"text",
    "text":
    {
         "content":"文本内容<a href=\"http://www.qq.com\" data-miniprogram-appid=\"appid\" data-miniprogram-path=\"pages/index/index\">点击跳小程序</a>"
    },
    "customservice":{
         "kf_account": "test1@kftest"
    }
}
```

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/约束 | 出处 |
|---|---|---|---|
| access_token（普通版） | `GET https://api.weixin.qq.com/cgi-bin/token?appid=AppID&secret=AppSecret&grant_type=client_credential` | `expires_in` 7200；多应用类型互相隔离；AppSecret 冻结后报 40243；非白名单 IP 报 40164；服务端调用，禁前端直调 | api_getaccesstoken |
| access_token（稳定版，推荐） | `POST https://api.weixin.qq.com/cgi-bin/stable_token` JSON `{grant_type:appid/secret[/force_refresh]}` | 7200；与普通版完全隔离互不影响；普通模式有效期内重复调用不更新（提前 5 分钟更新）；强制刷新每天 ≤20 次且间隔 ≥30s；频率 1万次/分、50万次/天；token 至少保留 512 字符 | api_getstableaccesstoken |
| 服务器配置三元组 | 开发者平台配置，无换取 | URL + Token（任意填）+ EncodingAESKey | push/ |
| openid | 用户对每个服务号唯一（加密结果） | 推送 FromUserName 即 openid；业务逻辑按 openid 区分用户 | push/ 第三步 |
| media_id | 素材管理接口上传 | 被动回复图片/语音/视频、客服多媒体消息均需先上传换取；客服侧永久素材 media_id 通用 | Passive / intro |
| clientmsgid | 开发者群发时自填（≤32 字节） | 24h 内重复拒绝（45065）；重试过快 45066；超长 45067 | Batch_Sends |
| IP 白名单 | 公众平台配置 | 调 token 需白名单，否则 40164 | api_getaccesstoken §6 |

access_token 返回示例（两版同形，原文）：`{"access_token":"ACCESS_TOKEN","expires_in":7200}`。

## 7. 待核验清单（均标：待核验(09-27)）

1. **POST 回调的 Content-Type**：官方推送页未明示（2026-09-10 复核直抓 Receiving_standard_messages 全文：首句仅"微信服务器将POST消息的XML数据包到开发者填写的URL上"，无 Content-Type 头口径；wireshark 常识为 `text/xml`）→ 待核验(09-27)。
2. **AES IV 取值**：encryption.html 只写 CBC+PKCS#7，未明写 IV=key 前 16B（同源 WXBizMsgCrypt 实现如此，但本页无原文）→ 待核验(09-27)。加解密示例包 `cryptoDemo.zip` 未下载核验 → 待核验(09-27)。
3. **准入主体**：订阅号个人可注册、服务号仅企业主体——本次 primary 仅见旁证（subscription/guide「为媒体和个人提供信息传播方式」；sendcustommessage 适用范围「公众号/服务号仅认证」；模板消息「只有认证后的服务号才可申请」；start.html 含服务号注册入口链接；同系旁证：小程序 `api_sendcustommessage` 适用范围表小程序/小游戏可用、公众号·服务号仅认证，2026-09-10 直抓 `wechat-mini.md` §6.3），`mp.weixin.qq.com` 注册页原文未抓 → 待核验(09-27)。微信认证费 300 元/次（本地档案说法，本次官方页未见）→ 待核验(09-27)。
4. **测试号**：`mp.weixin.qq.com/debug/cgi-bin/sandbox` 扫码即得、IP 白名单要求——start.html 本次抓取未见测试号段落（2026-09-10 复核直抓 start.html 全文：§1.1–1.4 为申请服务器/搭建服务/注册服务号/开发者基本配置，无测试号小节；配置入口作「微信开发者平台-我的业务与服务-服务号-开发信息」；5 秒×3 重试有实证日志段落）→ 待核验(09-27)。
5. **订阅号树正文**：`/doc/subscription/guide/product/message/*`、`/.../kf/*`、`/.../menu/*` 与服务号树是否字字相同——仅确认目录同构，未逐页抓 → 待核验(09-27)。旧 `doc/offiaccount/*` 重定向行为 → 待核验(09-27)。
6. **卡券/门店/发票等运营类事件**（`Coupons_Vouchers_and_Cards_Event_Push_Messages`、认证事件 `Accreditation`、一次性订阅消息、自动回复规则）：存在性已由服务号导航树复核确认（2026-09-10 直抓 Receiving_standard_messages 左侧导航：卡券事件推送/微信认证事件推送/一次性订阅消息/微信门店均在列），正文未抓 → 待核验(09-27)（残：正文；与消息总水管无关，如需再补）。
7. **群发额度细节**：服务号「每月 4 条」按自然月、认证服务号高级群发日调用上限、API 群发保护 30 分钟确认——Batch_Sends 页原文已录，但 MP 后台实际配额数字以线上为准 → 口径性待核验(09-27)。
8. **客服「48 小时」窗口起算口径**（最后一次互动起算 vs 自然时间）与 mpnewsarticle 草稿灰度状态：官方页未明示 → 待核验(09-27)。
9. **获取临时素材接口正文**（2026-10-12 新增）：DuduDesk 媒体读取票按 `GET https://api.weixin.qq.com/cgi-bin/media/get?access_token=&media_id=`、成功返回二进制（带 `Content-Type`/`Content-disposition`）、失败返回 `{"errcode":40007,"errmsg":"invalid media_id"}`、视频素材返回 JSON `video_url` 再取一次字节实现（官方文档 `material/temporary/api_getmedia`）；本次未能直抓官方正文，路径与响应形状来自 2026-10-12 检索摘要与既有实现经验 → 待核验(10-12)。

## 附：对 MockPulse 模拟的直接含义（速查，非官方原文）

- 握手模拟：`GET ?signature=&timestamp=&nonce=&echostr=`，`sha1(字典序[token,timestamp,nonce])`，通过则原样回 echostr。
- 推送模拟：`POST` XML（明文 7 种 / 事件 2.2–2.5）；安全模式只发 `{ToUserName, Encrypt}`（XML 版 `<ToUserName><Encrypt>`），query 带 `encrypt_type=aes&msg_signature=&openid=`。
- 响应判定：5s 超时×3 次重试；回 `success`/空串即停；事件排重 `FromUserName+CreateTime`、消息排重 `MsgId`。
- 出网模拟：`GET /cgi-bin/token` 与 `POST /cgi-bin/stable_token` 双签发方（7200s、隔离）；`POST /cgi-bin/message/custom/send` 客服下发（窗口 5条/48h、3条/1min×3）。
