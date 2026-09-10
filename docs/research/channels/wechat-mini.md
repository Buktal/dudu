# 微信小程序事件推送事实库（官方文档摄取）

> 调研日期：2026-09-10。方法：WebFetch 直抓 developers.weixin.qq.com 官方文档正文（SSR 文本）+ 站内搜索摘要交叉。
> 用途：mock-pulse 高保真模拟「微信 → 开发者服务器」的小程序消息/事件推送（GET echostr 握手、XML/JSON 双格式、signature/msg_signature 双验签、AES 安全模式、客服消息收发）。
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位值 `toUser/fromUser`、`AAAAA` 等）；凡未在 primary 抓到正文的条目标 `待核验(09-27)`。
> 参照约定：与同目录 `douyin.md/wecom.md/xiaohongshu.md` 同结构（§1 入口 / §2 事件 / §3 回调 / §4 验签加密 / §5 载荷 / §6 token / §7 待核验）。

## 1. 官方文档入口与关键页面地址

- 文档门户：https://developers.weixin.qq.com/（小程序文档站为 SPA，但文档正文页可被 WebFetch 抓到 SSR 文本；本次全部实际抓通）
- 消息推送总纲页同时是三形态入口：开发者服务器 / 云函数 / 微信云托管

本次实际抓到正文的页面（逐字已验）：

| # | 标题 | URL | 覆盖内容 |
|---|---|---|---|
| 1 | 消息推送（总纲：配置/握手/明文与安全模式/回包/云函数/云托管） | https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html | URL+Token+EncodingAESKey+三模式+XML/JSON；GET echostr；debug_demo 明/密两套完整算例；回包信封；云函数（仅客服消息，〈MsgType,Event〉二元组唯一）；云托管（x-wx-sources 头） |
| 2 | 客服消息-接收消息和事件 | https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/customer-message/receive.html | text / image / miniprogrampage 三种推送包（XML+JSON 双格式）+ `user_enter_tempsession` 进入会话事件 |
| 3 | 客服消息-发送消息（概述：48h 窗口+动作额度表） | https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/customer-message/send.html | 48 小时回复窗口；动作表：用户发送消息 5 条/48h、用户进入客服消息 2 条/1 分钟 |
| 4 | 发送客服消息（API 全字段） | https://developers.weixin.qq.com/miniprogram/dev/server/API/kf-mgnt/kf-message/api_sendcustommessage.html | `POST /cgi-bin/message/custom/send`；touser/msgtype 全类型体；text 小程序文字链；customservice/aimsgcontext/businessid；错误码；适用范围（小程序✔/小游戏✔/公众号·服务号仅认证） |
| 5 | 获取接口调用凭据 | https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getaccesstoken.html | `GET /cgi-bin/token`；expires_in 7200；多应用类型隔离；AppSecret 冻结 40243；IP 白名单 40164 |
| 6 | 获取稳定版接口调用凭据 | https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getstableaccesstoken.html | `POST /cgi-bin/stable_token`；与普通版隔离；force_refresh；频率限制（1 万/分、50 万/天、强制刷新 20 次/天间隔 30s）；存储 ≥512 字符 |
| 7 | 接口调用凭证索引 | https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/ | 凭证分组索引（内含 5、6 两页） |
| 8 | 获取微信推送服务器 IP | https://developers.weixin.qq.com/miniprogram/dev/server/API/openApi-mgnt/api_getcallbackip.html | `GET /cgi-bin/getcallbackip` → `ip_list`；建议每天请求 1 次更新 |
| 9 | 事件通知-授权用户信息变更（event_push 样例页） | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/platform/authorized_user_information_changes.html | event_push 信封字段表 + Event 枚举（user_info_modified/user_authorization_revoke/user_authorization_cancellation）+ RevokeInfo 枚举 + XML/JSON 双示例 + 回 `success`/空串（无需加密） |
| 10 | 云托管消息推送指引（搜索摘要交叉） | https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/weixin/push.html | 走内网链路、无需加解密签名；`x-wx-source` 头（与总纲页 `x-wx-sources` 拼写差异见 §7）；MsgId 去重提示 |

event_push 族其余页面（目录级：链接存在性已由上述各页站内导航树验证，正文未逐抓，字段明细见 §7）：

| 域 | 页面 | URL |
|---|---|---|
| 平台通知 | 小程序违规处罚信息通知 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/platform/Penalty_for_Violation.html |
| 物流助手-运力方 | 取消订单事件 / 审核商户事件 / 请求下单事件 / 查询商户余额事件 / 查询订单状态 / 用户催单 / 运力下单 / 取消订单 / 通过收发件地址查询标准运费 / 查询运单 / 查询所在城市的预约时间段 / 运单轨迹更新事件 / 支付完成通知 / 给小哥评价 / 用户投诉事件 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/express/provider/Cancel_order_event.html（同目录其余页同前缀，见总导航树） |
| 物流助手-小程序方 | 绑定商户审核结果更新事件 / 理赔结果推送 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/express/business/Bind_merchant_review_result_update_event.html |
| 即时配送-小程序方 | 配送单配送状态更新通知接口 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/deliver/deliver_by_business/Delivery_order_delivery_status_update_notification_interface.html |
| 即时配送-运力方 | 模拟更新订单状态接口 / 取消订单操作 / 异常妥投商户收货确认 / 预取消订单操作 / 查询订单状态 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/deliver/deliver_by_provider/Simulate_update_order_status_interface.html（同目录） |
| 短剧媒资管理 | 媒资上传完成事件 / 审核状态事件 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/mini_drama/asset_upload_completion_event.html |
| 付费管理 | 订单用量告警事件 / 订单有效期告警事件 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/charge/charge_mp_service_quota_notify.html |
| 小程序评价 | 评价管理差评通知事件 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/guarantee/negative.html |
| 小程序直播 | 长期订阅状态同步接口 / 长期订阅群发结果通知 | https://developers.weixin.qq.com/miniprogram/dev/server/event_push/liveplayer/status_synchronization.html |

客服消息配套页（同分组，链接已验、正文未抓）：转发消息 trans.html、下发客服输入状态 typing.html、临时素材 temp-media.html、概述 customer-message.html（均位于 `.../open-ability/customer-message/` 下）；服务端客服账号管理：api_addkfaccount / api_getkflist / api_getonlinekflist / api_delkfaccount / api_typing / api_setkfadmin / api_cancelkfadmin / api_uploadtempmedia / api_getmedia（均位于 `.../server/API/kf-mgnt/kf-message/` 下）。

## 2. 消息/事件推送全清单

### 2.1 客服消息推送（主场景）［receive.html］

用户在小程序客服会话中发消息（或由特定用户操作引发事件）时，微信服务器把数据包发到开发者填的 URL / 云函数 / 云托管。入口触发：页面 `<button open-type="contact" />` 进入客服会话按钮。

| MsgType | 专有字段 | 触发场景 |
|---|---|---|
| text | Content | 用户发文本 |
| image | PicUrl（系统生成链接）、MediaId（可调获取临时素材接口拉取） | 用户发图片 |
| miniprogrampage | MsgId、Title、AppId、PagePath、ThumbUrl、ThumbMediaId | 用户发小程序卡片 |

公共字段：ToUserName（小程序原始 ID）、FromUserName（发送者 OpenID）、CreateTime（整型）、MsgId（64 位整型）。注意：官方本页**只给出以上三种**推送包；voice/video 等接收包本页未列 → 待核验(09-27)。

### 2.2 进入会话事件（`user_enter_tempsession`，非 `user_enter_session`）［receive.html］

用户经「客服会话按钮」进入客服会话时推送（MsgType=event）：专有字段 `Event=user_enter_tempsession`、`SessionFrom`（开发者在客服会话按钮设置的 session-from 属性）。公共字段同 2.1（无 MsgId）。

> 澄清：线索中的 `user_enter_session` 在 primary 中不存在；官方实际事件名为 `user_enter_tempsession`。`user_enter_session` 是否另有所指 → 待核验(09-27)。

### 2.3 通用事件骨架（`debug_demo` 演示）［message-push.html］

`Event` 字段承载具体事件，官方以 `debug_demo` 演示全流程（见 §5.1），并明示「具体事件请查看各个消息的消息格式分文档」。ToUserName 为 `gh_` 开头小程序原始 ID，FromUserName 为用户 openid。

### 2.4 event_push 族（服务端事件通知，与客服推送同 URL 体系不同文档树）

已抓正文 1 页［authorized_user_information_changes.html］：

| Event | 触发场景 |
|---|---|
| user_info_modified | 授权用户资料变更（平台清理风险资料，通知近 30 天授权过的小程序开发者） |
| user_authorization_revoke | 用户撤回授权信息（带 RevokeInfo 枚举：1 车牌号 / 2 地址 / 3 发票 / 4 蓝牙 / 5 麦克风 / 6 昵称和头像 / 7 摄像头 / 8 手机号 / 12 运动步数 / 13 位置 / 14 选中的图片或视频 / 15 选中的文件 / 16 邮箱 / 18 选择的位置 / 19 昵称输入键盘选的昵称 / 20 头像组件选的头像；另含 PluginID/OpenPID 插件场景字段） |
| user_authorization_cancellation | 授权用户完成注销 |

其余 event_push 页（§1 表：平台违规处罚 / 物流助手运力方 15 事件+小程序方 2 事件 / 即时配送两端 / 短剧媒资 2 事件 / 付费管理 2 事件 / 评价差评 / 直播长期订阅 2 接口）：目录链接已验、正文字段 → 待核验(09-27)。

### 2.5 云函数分流规则［message-push.html］

- 云开发 `1.02.1906252` 起支持；**目前仅支持客服消息推送**。
- 控制台路径：云开发-设置-其他设置-消息推送，推送模式选「云函数」；消息类型对应填 `MsgType`，事件类型对应填 `Event`。
- 同一个〈消息类型，事件类型〉二元组**只能**推送到一个环境的一个云函数；被云函数接管的类型**不再**推送到后台配置的 URL。
- 云函数收到的 `event` 统一为 JSON（不支持 XML），客服文本消息结构见 §5.5。

## 3. 回调机制

来源：除单独标注外均为 message-push.html。

### 3.1 通道配置（小程序后台「开发-开发管理-消息推送配置」）

1. URL：接收微信消息和事件的接口 URL，必须 `http://`（80）或 `https://`（443）开头。
2. Token：用于签名处理。
3. EncodingAESKey：消息体加解密密钥。
4. 消息加解密方式三选一：明文模式（不建议）/ 兼容模式（不建议）/ 安全模式（纯密文，强烈推荐）。
5. 数据格式：XML 或 JSON 可选（与公众号不同点；JSON 为新文档主推）。
6. 该推送服务同时服务于小程序、公众号、小游戏、视频号小店、第三方平台（本页介绍小程序平台配置）。

### 3.2 GET 首次验证握手（echostr，明文签名）

点击提交后微信服务器向 URL 发 GET，带 `signature/timestamp/nonce/echostr`。算法：Token、timestamp、nonce 字典序排序 → 拼接 → sha1 → 得 signature；校验通过后**原样返回 echostr 字符串**。官方数值算例（Token=`AAAAA`）：排序后 `["1514711492","1714036504","AAAAA"]` → 拼接 `15147114921714036504AAAAA` → sha1 `f464b24fc39322e44b38aa78f5edd27bd1441696`，回包体即 `4375120948345356249`。
配套工具：URL 验证工具 + 调试工具（`https://developers.weixin.qq.com/apiExplorer?type=messagePush`，需填 AccessToken+URL+Token 发起验证 GET）。

### 3.3 POST 业务推送

特定消息/事件触发时微信以 POST 发数据包到同一 URL，URL 带签名参数。

- 明文模式：query 为 `signature/timestamp/nonce`（三参签名，同握手算法）；包体即明文 JSON/XML（§5.1）。
- 安全模式：query 为 `signature/timestamp/nonce/openid/encrypt_type=aes/msg_signature`（官方示例 URL 原样）；包体仅 `ToUserName + Encrypt`（JSON 示例原样）；**校验必须用 `msg_signature`，「注意不要使用 signature 验证」**；msg_signature 为 token/timestamp/nonce/Encrypt（包体字段）四参字典序排序拼接后 sha1。

### 3.4 回包与加密回复

- 无特殊要求时「回复空串或者 success 即可」。
- 需加密回复时回包信封（JSON/XML 同名字段）：`Encrypt/MsgSignature/TimeStamp/Nonce`；TimeStamp 官方示例用当前时间（如 `1713424427`）；**Nonce 复用 URL 中的 nonce**（官方示例复用 `415670741`）；MsgSignature 为 token/TimeStamp/Nonce/Encrypt 四参字典序 sha1（官方算例 `1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1`）。
- event_push 页同样要求：回复 `success` 或空字符串（无需加密）［authorized_user_information_changes.html］。

### 3.5 重试与幂等

- 本页未明示 5 秒超时×重试三次规则（公众号同体系页面有该原文）→ 小程序侧是否同规则待核验(09-27)；mock 建议按同体系实现并标注。
- 幂等键：客服消息带 MsgId（64 位整型）；云托管指引页明示「MsgId 唯一消息 ID，可能发送多个重复消息，需要注意用此 ID 去重」［push.html 搜索摘要，developers.weixin.qq.com 域］。事件类无 MsgId，建议 FromUserName+CreateTime（沿用公众号官方建议，待核验）。

### 3.6 云托管形态（内网链路，免加解密签名）

- 小程序/公众号配置一个云托管服务即可接收**所有类型**消息推送：填环境 ID + 服务名称（只需 1 个）+ 服务内 path + 推送模式（JSON/XML）。
- 配置后微信后台先向该服务发一个检测请求。
- 来源确认：云托管**未开公网访问则可信任所有推送**；开了公网访问则验请求头——总纲页写作 `x-wx-sources`，云托管指引页写作 `x-wx-source`（单复数官方不一致，见 §7）；另有 `x-wx-openid` 等上下文头（总纲示例用 `headers['x-wx-openid']` 取 openid 再调客服发送接口，示例回 `success`）。

### 3.7 回调出口 IP［api_getcallbackip.html］

`GET https://api.weixin.qq.com/cgi-bin/getcallbackip?access_token=ACCESS_TOKEN` → `{"ip_list": ["106.55.206.146", "106.55.206.211"], ...}`（示例值）；官方建议每天请求 1 次更新 IP 列表，不要长期使用旧列表。

## 4. 验签与加密算法［message-push.html］

### 4.1 明文签名（三参）

`signature = sha1( sort(token, timestamp, nonce) 拼接 )`。用于 GET 握手与明文模式 POST 校验。

### 4.2 密文签名（四参）

`msg_signature = sha1( sort(token, timestamp, nonce, Encrypt) 拼接 )`，Encrypt 取包体内字段。官方安全模式算例：四参排序后 `["+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=", "1714112445", "415670741", "AAAAA"]` → `046e02f8204d34f8ba5fa3b1db94908f3df2e9b3`。

### 4.3 AES 加解密（WXBizMsgCrypt 同族）

- `AESKey = Base64_Decode(EncodingAESKey + "=")`（尾部补一个 `=` 解出 32 字节）。
- AES-CBC，密钥 32 字节（256 位），数据按 PKCS#7 补位（K 取密钥字节数 32）。
- 明文结构：`FullStr = random(16B) + msg_len(4B 网络字节序) + msg + appid`；appid 须校验与本小程序一致。官方算例：random=`a8eedb185eb2fecf`、msg_len=167、msg 为 debug_demo JSON、appid=`wxba5fad812f8e6fb9`；密文 Base64 解码后 TmpMsg 224 字节、解密后 FullStr 205 字节。
- 加密回复算例：random=`707722b803182950`、msg=`{"demo_resp":"good luck"}`（25 字节）、FullStr 63→加密 64 字节→Base64 得 `ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==`（逐字见 §5.6；L148 与 §5.6 均已对齐全量串）。
- 官方示例代码包：https://wximg.gtimg.com/shake_tv/mpwiki/cryptoDemo.zip（PHP/Java/C++/Python/C#，本页引用；源码未下载核验）。

## 5. 示例载荷原文（逐字）

### 5.1 通用事件明文（JSON，debug_demo）［message-push.html］

推送 URL：`https://www.qq.com/recive?signature=899cf89e464efb63f54ddac96b0a0a235f53aa78&timestamp=1714037059&nonce=486452656`（Token=`AAAAA`）

```json
{
    "ToUserName": "gh_97417a04a28d",
    "FromUserName": "o9AgO5Kd5ggOC-bXrbNODIiE3bGY",
    "CreateTime": 1714037059,
    "MsgType": "event",
    "Event": "debug_demo",
    "debug_str": "hello world"
}
```

### 5.2 安全模式推送包（JSON）［message-push.html］

推送 URL：`https://www.qq.com/recive?signature=6c5c811b55cc85e0e1b54100749188c20beb3f5d&timestamp=1714112445&nonce=415670741&openid=o9AgO5Kd5ggOC-bXrbNODIiE3bGY&encrypt_type=aes&msg_signature=046e02f8204d34f8ba5fa3b1db94908f3df2e9b3`（Token=`AAAAA`，EncodingAESKey=`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` 43 个 A，AppID=`wxba5fad812f8e6fb9`）

```json
{
    "ToUserName": "gh_97417a04a28d",
    "Encrypt": "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04="
}
```

### 5.3 客服文本消息（XML + JSON）［receive.html］

```xml
<xml>
   <ToUserName><![CDATA[toUser]]></ToUserName>
   <FromUserName><![CDATA[fromUser]]></FromUserName>
   <CreateTime>1482048670</CreateTime>
   <MsgType><![CDATA[text]]></MsgType>
   <Content><![CDATA[this is a test]]></Content>
   <MsgId>1234567890123456</MsgId>
</xml>
```

```json
{
  "ToUserName": "toUser",
  "FromUserName": "fromUser",
  "CreateTime": 1482048670,
  "MsgType": "text",
  "Content": "this is a test",
  "MsgId": 1234567890123456
}
```

### 5.4 客服图片 / 小程序卡片 / 进入会话事件（JSON，XML 同构）［receive.html］

```json
{
  "ToUserName": "toUser",
  "FromUserName": "fromUser",
  "CreateTime": 1482048670,
  "MsgType": "image",
  "PicUrl": "this is a url",
  "MediaId": "media_id",
  "MsgId": 1234567890123456
}
```

```json
{
  "ToUserName": "toUser",
  "FromUserName": "fromUser",
  "CreateTime": 1482048670,
  "MsgType": "miniprogrampage",
  "MsgId": 1234567890123456,
  "Title": "title",
  "AppId": "appid",
  "PagePath": "path",
  "ThumbUrl": "",
  "ThumbMediaId": ""
}
```

```json
{
  "ToUserName": "toUser",
  "FromUserName": "fromUser",
  "CreateTime": 1482048670,
  "MsgType": "event",
  "Event": "user_enter_tempsession",
  "SessionFrom": "sessionFrom"
}
```

### 5.5 云函数收到的客服消息（event 统一 JSON）［message-push.html］

```json
{
  "FromUserName": "ohl4L0Rnhq7vmmbT_DaNQa4ePaz0",
  "ToUserName": "wx3d289323f5900f8e",
  "Content": "测试",
  "CreateTime": 1555684067,
  "MsgId": "49d72d67b16d115e7935ac386f2f0fa41535298877_1555684067",
  "MsgType": "text"
}
```

（注意：云函数形态 MsgId 为 `xxx_timestamp` 字符串形态，与服务器推送的 64 位整型不同，原文如此。）官方云函数回消息示例（wx-server-sdk）：`cloud.openapi.customerServiceMessage.send({touser: wxContext.OPENID, msgtype: 'text', text: {content: '收到'}})`，函数返回 `'success'`。

### 5.6 加密回复包（JSON + XML 信封）［message-push.html］

```json
{
    "Encrypt": "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==",
    "MsgSignature": "1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1",
    "TimeStamp": 1713424427,
    "Nonce": "415670741"
}
```

```xml
<xml>
    <Encrypt><![CDATA[${msg_encrypt}$]]></Encrypt>
    <MsgSignature><![CDATA[${msg_signature}$]]></MsgSignature>
    <TimeStamp>${timestamp}$</TimeStamp>
    <Nonce><![CDATA[${nonce}$]]></Nonce>
</xml>
```

### 5.7 event_push：授权用户信息变更（XML + JSON）［authorized_user_information_changes.html］

```xml
<xml>
  <ToUserName><![CDATA[gh_870882ca4b1]]></ToUserName>
  <FromUserName><![CDATA[owAqB1v0ahK_Xlc7GshIDdf2yf7E]]></FromUserName>
  <CreateTime>1626857200</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[user_authorization_revoke]]></Event>
  <OpenID><![CDATA[owAqB1nqaOYYWl0Ng484G2z5NIwU]]></OpenID>
  <AppID><![CDATA[wx13974bf780d3dc89]]></AppID>
  <RevokeInfo><![CDATA[1]]></RevokeInfo>
  <PluginID><![CDATA[wx13974bf780d3dc89]]></PluginID>
  <OpenPID><![CDATA[G7esq5NVzP76HIHoB95t4CVBP6to]]></OpenPID>
</xml>
```

```json
{
  "ToUserName": "gh_870882ca4b1",
  "FromUserName": "oaKk346BaWE-eIn4oSRWbaM9vR7s",
  "CreateTime": 1627359464,
  "MsgType": "event",
  "Event": "user_authorization_revoke",
  "OpenID": "oaKk343WOktAaT2ygsX138BGblrg",
  "AppID": "wx13974bf780d3dc89",
  "RevokeInfo": "1",
  "PluginID": "wx13974bf780d3dc89",
  "OpenPID": " G7esq5NVzP76HIHoB95t4CVBP6to"
}
```

（JSON 示例中 OpenPID 值前带空格，官方原文如此。）返回：`success`。

## 6. token / 凭证模型与客服发送

### 6.1 access_token 双轨［api_getaccesstoken.html / api_getstableaccesstoken.html］

| 凭证 | 换取方式 | 寿命/约束 |
|---|---|---|
| access_token（普通版） | `GET https://api.weixin.qq.com/cgi-bin/token?appid=AppID&secret=AppSecret&grant_type=client_credential` | expires_in 7200；需服务端妥善缓存 |
| access_token（稳定版，推荐） | `POST https://api.weixin.qq.com/cgi-bin/stable_token` body `{grant_type: client_credential, appid, secret, force_refresh?}` | 7200；与普通版**完全隔离互不影响**；普通模式有效期内重复调用不更新（平台提前 5 分钟更新）；强制刷新每天限 20 次且间隔 ≥30s；接口限 1 万次/分、50 万次/天；存储空间至少保留 512 字符 |

- 「不同的应用类型的 Access Token 是互相隔离的，且仅支持调用应用类型的接口」（小程序与公众号等 token 不互通）。
- AppSecret 冻结后调 token 接口报 40243；调接口 IP 不在白名单报 40164（需配 IP 白名单）。
- 云开发可用云调用免维护 access_token；云托管可用微信令牌/开放接口服务免维护。

### 6.2 客服消息发送全字段［api_sendcustommessage.html］

`POST https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=ACCESS_TOKEN`，JSON：`touser`（用户 OpenID）+ `msgtype` + 类型体，可选 `customservice.kf_account`（指定客服账号发出）、`aimsgcontext.is_ai_msg`（1 则消息下方加灰字「内容由第三方 AI 生成」）、`businessid`（子商户 ID，普通账号不传）。

| msgtype | 体字段 |
|---|---|
| text | text.content（支持小程序文字链：`data-miniprogram-appid` + `data-miniprogram-path`，appid 须与公众号有绑定关系；小程序发文字链时 appid 须为本小程序） |
| image / voice | 对应体.media_id（素材上传接口获得） |
| video | media_id + thumb_media_id + title? + description? |
| music | title + description + musicurl + hqmusicurl? + thumb_media_id |
| news（外链图文） | news.articles[]（限 1 条：title/description/url/picurl） |
| mpnews（已废弃，草稿灰度完成后不再支持） | mpnews.media_id（超 1 条报 45008） |
| mpnewsarticle | mpnewsarticle.article_id（发布系列接口得到的 article_id） |
| msgmenu | head_content? + list[{id, content}] + tail_content? |
| wxcard | card_id |
| miniprogrampage | title + appid + pagepath + thumb_media_id（520*416 图片 media_id） |
| link | 顶层 msgtype 枚举含 link（体结构本页未单列，见 §7） |

返回：`{"errcode": 0, "errmsg": "ok"}`。错误码：-1 系统繁忙、40001 token 无效、40013 AppID 非法、70000 未成年人保护拒发（§6 表）；45008 图文超限（见 Body.mpnews 小节，非 §6 表）。

### 6.3 回复窗口规则（两表并存，官方自相矛盾处已标出）

小程序客服概述页［send.html］（小程序适用，以此为准）：

| 用户动作 | 下发条数 | 时限 |
|---|---|---|
| 用户发送消息 | 5 条 | 48 小时 |
| 用户进入客服消息 | 2 条 | 1 分钟 |

发送接口 API 页［api_sendcustommessage.html］（4 动作，含公众号菜单/关注/扫码，为公众号同族规则）：用户发送消息 5 条/48h；点击自定义菜单（仅点击推/扫码推/扫码推且弹提示框 3 种）3 条/1 分钟；关注公众号 3 条/1 分钟；扫描二维码 3 条/1 分钟。另：该 API 页适用范围为小程序✔、小游戏✔、公众号/服务号**仅认证**（仅允许企业主体已认证账号）——小程序未标注“仅认证”（与公众号/服务号对比），推断个人主体可用（primary 无“个人主体”原文）。

### 6.4 其他凭证

| 凭证 | 说明 | 出处 |
|---|---|---|
| 消息推送三元组 | 后台配置，无换取：URL + Token + EncodingAESKey | message-push.html |
| 回调验签参数 | GET/POST query 中的 signature/msg_signature/timestamp/nonce（安全模式另有 openid/encrypt_type） | message-push.html |
| 推送来源头 | 云托管 `x-wx-sources`（总纲）/ `x-wx-source`（指引页），拼写待核验 | §3.6 |
| 临时素材 media_id | 新增/获取临时素材接口（api_uploadtempmedia/api_getmedia），客服图片/语音/视频发送与图片推送拉取用 | kf-message 分组 |
| AppID/AppSecret | 小程序后台开发管理-开发设置获取（常识位，官方页仅述及冻结/解冻与获取指引链接）→ 待核验(09-27) |

## 7. 待核验清单（均标：待核验(09-27)）

1. **5 秒超时×重试三次**：message-push.html 全页只写「回复空串或者 success」，未见公众号同体系页面的 5 秒断连+重试三次原文 → 待核验(09-27)。
2. **`user_enter_session`**：primary 实际事件名为 `user_enter_tempsession`（§2.2）；`user_enter_session` 是否另有所指 → 待核验(09-27)。
3. **客服接收 voice/video 包**：receive.html 仅列 text/image/miniprogrampage；语音/视频/位置等接收包结构 → 待核验(09-27)。
4. **event_push 其余页正文**（§1 表：违规处罚/物流助手/即时配送/短剧/付费管理/评价/直播）：仅目录链接已验，字段明细 → 待核验(09-27)。
5. **云托管来源头拼写**：总纲 message-push.html 作 `x-wx-sources`，云托管指引 push.html 作 `x-wx-source`（后者经站内搜索摘要二次确认，developers.weixin.qq.com 域）→ 以总纲为准、差异待冷页复验(09-27)。
6. **回调 POST 的 Content-Type**：官方页未明示（JSON 时常见 application/json）→ 待核验(09-27)。
7. **安全模式 XML 信封**：安全模式示例仅给 JSON（ToUserName+Encrypt）；XML 安全包是否为 ToUserName+Encrypt 同名字段 → 待核验(09-27)（公众号同族为是）。
8. **link 消息体结构**：发送接口顶层 msgtype 枚举含 link 但无 Body.link 小节 → 待核验(09-27)。
9. **cryptoDemo.zip 源码**（https://wximg.gtimg.com/shake_tv/mpwiki/cryptoDemo.zip）：未下载核验 PKCS#7/随机数实现 → 待核验(09-27)。
10. **准入与认证费**：个人主体可注册小程序、客服消息个人主体可用（§6.3 已由适用范围页佐证）；微信认证 300 元/次（本地档案标注未验证）→ 金额待核验(09-27)。
11. **客服配套页正文**：trans.html（转发消息）/ typing.html（输入状态）/ temp-media.html（临时素材）/ 客服账号管理 9 接口 → 待核验(09-27)。
12. **mp-access-token 索引页正文**：仅引用作索引，未抓取其正文（5、6 两子页已覆盖实质）→ 待核验(09-27)。

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟「微信推客服消息给回调」：`POST {URL}?signature=&timestamp=&nonce=`（明文）或 `?signature=&timestamp=&nonce=&openid=&encrypt_type=aes&msg_signature=`（安全，包体 `{ToUserName, Encrypt}`），JSON/XML 双格式；握手为 GET 四参 + 原样回 echostr。
- 签名算法：三参 `sha1(sort(token,timestamp,nonce))`；四参 `sha1(sort(token,timestamp,nonce,Encrypt))`；AES 与企微同族（`Base64(EncodingAESKey+"=")` 32B、IV 未在本页明示按同族实现并标注、PKCS#7 K=32、`random16+len4大端+msg+appid`），黄金算例：§4.2/§5.2/§5.6（含可复算向量 `f464b24…`、`899cf89e…`、`046e02f8…`、`1b933996…`）。
- ID 形态：ToUserName `gh_` 开头；FromUserName 为 openid（`o…`/`o9AgO…`）；CreateTime 秒级整型；MsgId 服务器推送为 64 位整型、云函数为 `id_timestamp` 字符串。
- 回复：空串/`success`（event_push 明确无需加密）；加密回复信封 `{Encrypt,MsgSignature,TimeStamp,Nonce}` 且 Nonce 复用请求 nonce。
- 出网模拟：双轨 token（普通 GET / 稳定版 POST，7200s、隔离）+ `POST /cgi-bin/message/custom/send`（48h 窗口：发消息 5 条/48h、进会话 2 条/1 分钟；小程序个人主体可用）。
