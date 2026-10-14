# 微博开放平台 事件推送 事实库（粉丝服务平台）

> 研究日期：2026-09-10。方法：WebFetch 直抓 open.weibo.com wiki 官方文档正文（SSR，直接可抓，无反爬）。
> 只认 primary sources：open.weibo.com wiki 粉丝服务平台域 + API 本体。不用二手博客。
> 所有示例载荷均为官方文档原文逐字拷贝；官方原文笔误/转义符（`receiver\_id`、`MASSSENDJOBFINISH`、`san事件`）原样保留并标注。
> 范围声明：本次核验范围内仍可新接入的推送通道 = 粉丝服务平台（Eps）Webhook（“唯一”系推论：粉服推送体系有原文 + dm 系标“高级接口”且申请页停收旧版申请）；旧版 `2/direct_messages` 系冻结高级接口，不可新接入。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.weibo.com/ ；wiki 根：https://open.weibo.com/wiki/
- 粉丝服务平台域导航（左侧“粉丝服务平台”分类）：粉丝服务平台 / 新手接入指南 / 微信开发者迁移指南 / 接收消息 / 发送消息 / 自定义菜单 / 用户管理 / 生成带参数的二维码 / Fans Service Platform。

本次实际抓取并完整摄取的页面（均验证过正文内容，文档更新时间取自各页页脚）：

| # | 标题 | URL | 文档更新时间 | 覆盖内容 |
|---|---|---|---|---|
| 1 | 粉丝服务平台（总纲） | https://open.weibo.com/wiki/%E7%B2%89%E4%B8%9D%E6%9C%8D%E5%8A%A1%E5%B9%B3%E5%8F%B0 | 2015-08-24 | 认证账号+开发模式+授权第三方、推送/被动回复/客服接口三分法、`Messages_api_start` 入口 |
| 2 | 接收消息（索引页） | https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E6%B6%88%E6%81%AF | 2015-08-24 | 四子页索引 + `Eps/push/set_format` 切换 JSON/XML 入口 |
| 3 | 验证消息真实性 | https://open.weibo.com/wiki/%E9%AA%8C%E8%AF%81%E6%B6%88%E6%81%AF%E7%9C%9F%E5%AE%9E%E6%80%A7 | 2014-04-20 | GET 四参握手、sha1(appsecret,timestamp,nonce) 规则、后续推送同样验签 |
| 4 | 接收普通消息 | https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E6%99%AE%E9%80%9A%E6%B6%88%E6%81%AF | 2014-05-19 | text/position/voice/image 四 JSON 骨架、vfid/tovfid 下载法、5s×3+空串+FromUserName+CreateTime 排重 |
| 5 | 接收事件推送 | https://open.weibo.com/wiki/%E6%8E%A5%E6%94%B6%E4%BA%8B%E4%BB%B6%E6%8E%A8%E9%80%81 | 2024-07-30 | follow/unfollow、subscribe/unsubscribe、scan/scan_follow、mention（暂停）、click、view 六节全量 JSON |
| 6 | 发送消息（索引页） | https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E6%B6%88%E6%81%AF | 2015-10-28 | 被动响应/客服消息/高级群发/微信XML兼容四入口、联系邮箱 jingyi7@staff.weibo.com |
| 7 | 发送被动响应消息 | https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E8%A2%AB%E5%8A%A8%E5%93%8D%E5%BA%94%E6%B6%88%E6%81%AF | 2014-08-20 | 响应包 JSON（text/articles/position）、data 须 UTF-8 URLEncode、<300 汉字、PHP/Java demo 包地址 |
| 8 | 发送客服消息 | https://open.weibo.com/wiki/%E5%8F%91%E9%80%81%E5%AE%A2%E6%9C%8D%E6%B6%88%E6%81%AF | 2023-10-16 | `POST https://m.api.weibo.com/2/messages/reply.json`、form 参数表、48h 不限次/99 条配额、text/articles/position 三 data 格式、成功返回体 |
| 9 | 微信XML格式兼容 | https://open.weibo.com/wiki/%E5%BE%AE%E4%BF%A1XML%E6%A0%BC%E5%BC%8F%E5%85%BC%E5%AE%B9 | 2014-06-03 | JSON↔XML 字段对照全表、text/image/voice/position/event/scan/click-view 的 XML、被动回复 text/news 的 XML |
| 10 | Eps/push/set_format（格式切换 API） | https://open.weibo.com/wiki/Eps/push/set_format | 2014-05-19 | `POST https://api.weibo.com/2/eps/push/set_format.json`，参数 access_token+format(xml/json 小写)、成功/失败返回体 |
| 11 | 高级群发接口 | https://open.weibo.com/wiki/%E9%AB%98%E7%BA%A7%E7%BE%A4%E5%8F%91%E6%8E%A5%E5%8F%A3 | 2014-07-15 | `POST https://m.api.weibo.com/2/messages/sendall.json`、按分组/按 UID 两种 body、群发结果事件 `MASSSENDJOBFINISH` XML |
| 12 | 新手接入指南 | https://open.weibo.com/wiki/%E6%96%B0%E6%89%8B%E6%8E%A5%E5%85%A5%E6%8C%87%E5%8D%97 | 2015-07-14 | 三步接入（申请消息接口/验证 URL/拿 access_token）、sha1 黄金算例、PHP checkSignature 源码、长连接模式入口、粉服只支持 80 端口 |
| 13 | 2/messages/reply（长连接版回复接口） | https://open.weibo.com/wiki/2/messages/reply | 2014-06-03 | 同 URL 的 OAuth/BaseAuth 双调用法、id vs receiver_id 二选一规则、7 天 1 条配额（旧口径，与发送客服消息页 48h/99 条并存，见 §7） |
| 14 | 获取粉丝服务平台开发接口的 access token | https://open.weibo.com/wiki/Messages_api/access_token | 2014-06-12 | 粉服 access_token 定义（绑定认证账号非 APPKEY）、两途径（开发者模式页显示/OAuth2 scope 包开发中未上线） |
| 15 | 自定义菜单（索引页） | https://open.weibo.com/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%8F%9C%E5%8D%95 | 2015-10-28 | 创建/查询/删除/事件推送四子页入口（事件即 click/view） |
| 16 | 生成带参数的二维码（索引页） | https://open.weibo.com/wiki/%E7%94%9F%E6%88%90%E5%B8%A6%E5%8F%82%E6%95%B0%E7%9A%84%E4%BA%8C%E7%BB%B4%E7%A0%81 | 2015-08-24 | 临时（≤1800s）/永久（参数 1–100000）两种、scan vs scan_follow 分流规则（原文 `san事件` 为 `scan` 笔误）、ticket 两步法子页入口 |
| 17 | 高级接口申请（dm 冻结证据） | https://open.weibo.com/wiki/%E9%AB%98%E7%BA%A7%E6%8E%A5%E5%8F%A3%E7%94%B3%E8%AF%B7 | 2013-02-26 | 原文“API文档中标注为（高级接口图标，WebFetch 转写为空格）的接口，旧版接口不再接受申请” |
| 18 | 2/direct_messages（旧私信 API 样本） | https://open.weibo.com/wiki/2/direct_messages | 2022-02-09 | `GET https://api.weibo.com/2/direct_messages.json`，访问级别“高级接口（需要授权）”，since_id/max_id/count/page 分页 |

## 2. 消息/事件推送全清单

通道结论：可新接入的推送体系为粉丝服务平台 Webhook（HTTP POST 到认证账号在粉服后台绑定的接收 URL；“只有一套”系推论，见 §1 范围声明）。旧 `2/direct_messages` 等 dm 系为高级接口且官方停收旧版新申请，等效冻结，不可新接入。

### 2.1 普通消息（`type` 直接判型）［接收普通消息页］

| type | 含义 | 专有字段 | 触发场景 |
|---|---|---|---|
| text | 纯文本私信 | `text` 正文，`data:{}` 空 | 用户给认证账号发文本 |
| position | 位置私信（注意不是 location） | `data:{longitude, latitude}`（均为 string），`text` 为原文案、无则默认“发送了一个位置” | 用户发位置 |
| voice | 语音私信 | `data:{vfid, tovfid}`（vfid 发送者用，tovfid 接收者用），`text` 默认“发了一个语音消息” | 用户发语音 |
| image | 图片私信 | `data:{vfid, tovfid}` 同上，`text` 默认“发了一张图片” | 用户发图片 |

公共字段：`type`、`receiver_id`（int64，认证账号侧）、`sender_id`（int64，用户侧）、`created_at`（string，如 `Mon Jul 16 18:09:20 +0800 2012`）、`text`、`data`。媒体下载：`GET https://upload.api.weibo.com/2/mss/msget?access_token=<接收者OAuth2 token>&fid=<tovfid>`（语音另有 Basic Auth 法：`curl -u "USERNAME:PASSWORD" "...?source=APPKEY&fid=TOVFID"`，账号为 recipient_id 的微博登录账号且 APPKEY 属主为该账号）。

官方兼容性要求（逐字，括号内含“注意：”前缀）：“（注意：需要对接收到的消息体type或subtype做兼容，当出现未知类型时可忽略此消息。）”

### 2.2 事件推送（`type:"event"` + `data.subtype` 判型；`mention` 例外用 `type:"mention"`）［接收事件推送页］

| subtype（data 内） | 外层 type | 触发场景 | 附带字段 |
|---|---|---|---|
| follow / unfollow | event | 关注 / 取消关注 | 无（`text` 默认“关注事件消息”/“取消关注事件消息”） |
| subscribe / unsubscribe | event | 订阅 / 取消订阅；`text` 为触发订阅的私信关键词（如 `dy`），非私信触发（点订阅按钮）则为“订阅事件消息”/“取消订阅事件消息” | 无 |
| scan / scan_follow | event | 扫带参二维码：已关注推 `scan`；未关注→关注推 `scan_follow` | `data.key`（`action_name` 前缀 + `scene_id`）、`data.ticket`（换二维码图） |
| click | event | 点自定义菜单 Click 型 | `data.key` = 菜单 EVENT_KEY |
| view | event | 点自定义菜单 View（跳转链接）型 | `data.key` = 按钮 URL |
| status / comment（`type:"mention"`） | mention | 被@的微博 / 被@的评论；`data.key` = 微博 ID / 评论 ID | **功能已暂停，之前已申请并开通权限的第三方仍然可以使用**（官方原文）；默认仅返回可信用户 @，全量需认证用户到微博客户端“我的设置”里设置 |

### 2.3 群发结果事件（`MASSSENDJOBFINISH`，XML only）［高级群发接口页］

群发任务提交成功≠发送完成；完成时向开发者 URL（callback URL）推送事件，XML 结构含 `Event=MASSSENDJOBFINISH`、`MsgID`（群发消息 ID）、`Status`（sendsuccess/sendfail）、`TotalCount`/`FilterCount`（官方等式主语仅 `FilterCount`：`FilterCount = SentCount + ErrorCount`）/`SentCount`/`ErrorCount`。注意该页示例 `ToUserName` 为 `gh_3e8adccde292`、`FromUserName` 为 `oR5Gjjl_eiZoUpGozMo7dbBJ362A` 系微信侧占位串，原文如此（照抄，勿当微博 UID 用）。

### 2.4 格式双轨（JSON ↔ 微信兼容 XML）［接收消息页 + Eps/push/set_format + 微信XML格式兼容页］

- 默认 JSON（原生）；可调 `POST https://api.weibo.com/2/eps/push/set_format.json`（需登录态/OAuth，参数 `access_token` + `format`=`xml|json` 小写）切换为微信 XML。
- “微博粉丝服务平台完全兼容微信XML格式”（官方原文）。XML 字段对照（官方表）：`ToUserName↔receiver_id`、`FromUserName↔sender_id`、`CreateTime↔created_at`、`MsgType↔type`、`Content↔text`、`Event↔data:subtype`、`EventKey↔data:key`、`Ticket↔data:ticket`、`MediaId↔data:tovfid`。
- XML 特有空字段（官方明示“该字段内容为空/该字段为空/会自动忽略”）：text/image/voice/position 的 `MsgId`；image 的 `PicUrl`；voice 的 `PicUrl`、`Format`；position 的 `Scale`、`Label`；被动回复图文的 `ArticleCount`。
- XML 命名差异（mock 必须照抄）：position 消息的 `MsgType` 是 `location`（JSON 侧 `type` 是 `position`）；`Location_X`=纬度（↔`data:latitude`）、`Location_Y`=经度（↔`data:longitude`）；scan 已关注的 `Event` 是全大写 `SCAN`，未关注是小写 `subscribe` + `EventKey=qrscene_123123`；菜单点击 `Event` 为全大写 `CLICK`；被动回复图文 `MsgType` 是 `news`（JSON 侧 `type` 是 `articles`）。

## 3. 回调机制

来源：除单独标注外均为接收普通消息页 + 接收事件推送页 + 新手接入指南页原文。

### 3.1 URL 配置与首次校验握手

- 配置路径：认证账号 Profile 页 → 管理中心 → 粉丝服务 → 高级功能 → 开启“开发模式”（与“编辑模式”二选一）→ 填写 URL + APPKEY（被授权代开发的第三方应用 KEY）。
- 提交后微博服务器发 **GET** 到该 URL，带四 query 参数：`signature` / `timestamp` / `nonce` / `echostr`。
- 校验通过后**原样返回 echostr 参数内容**即绑定成功，否则失败。之后每次推送也带 `signature/timestamp/nonce`（同样验签）。
- 官方黄金算例（新手接入指南页，逐字）：
  - 校验参数：`appsercret=xyz123xyz`（原文如此，多一 `r`，照抄）、`timestamp=1397022061823`、`nonce=57155157`
  - 拼接后字符串：`139702206182357155157xyz123xyz`
  - sha1 结果：`90e4c22c90a58f26526c2dd5b6c56c8822edeaa1`
  - 验证请求样例：`http://yoururl?nonce=57155157&timestamp=1397022061823&echostr=dnPdpTZz85&signature=90e4c22c90a58f26526c2dd5b6c56c8822edeaa1`，此时返回 `dnPdpTZz85` 即通过。
- 端口约束（新手接入指南页逐字，含句首状语；“接口”疑为“端口”笔误照抄）：“此外请注意，粉服平台开发接口只支持80接口。”

### 3.2 业务推送

- 建立连接后，有新消息/事件即 **POST 消息数据包**到该 URL（JSON 或 XML，取决于 set_format）。
- 被动回复：在该 POST 的**响应包中返回特定 JSON/XML**（支持文本、图文；另含 position，见 §5）。
- 备选通道：长连接模式（第三方主动建连、有新消息实时返回，功能完全一样；详见“粉服开发接口长连接接入指南”，本次未抓全文，见 §7）。

### 3.3 重试与响应判定（官方原文，三页一致）

- “微博服务器在五秒内收不到响应会断掉连接，并且重新发起请求，总共重试三次”（接收普通消息页；接收事件推送页为“粉丝服务平台服务器在 5 秒内如收不到响应消息则会断掉连接，并且重新发起请求，总共重试 3 次”）。
- 空串短路：“假如开发者无法保证在五秒内处理并回复，可以直接回复空串，微博服务器不会对此作任何处理，并且不会发起重试。这种情况下，可以使用客服消息接口进行异步回复。”（被动响应页补“并且不会发起重试”后半句同义。）
- 排重：“关于重试的消息排重，目前微博消息暂时不支持消息ID，推荐使用FromUserName + CreateTime 排重”（即 `sender_id + created_at`；XML 侧 `MsgId` 字段官方明示为空，不可用）。

## 4. 验签与加密算法

### 4.1 签名算法（官方三页一致，逐字）

“将appsecret参数，timestamp参数，nonce参数进行字典排序后，将三个参数字符串拼接成一个字符串进行sha1加密”。

- 入参：开发者的 **appsecret**（APPKEY 对应的 App Secret，不是自定义 Token——与微信差异点，官方在新手接入指南第一步明示“该APPKEY所对应的APP Secret，将用作生成签名”）+ 请求中的 `timestamp` + `nonce`。
- 与微信/企微同族但只有三参（无 msg_encrypt/echostr 入签）。
- 官方 PHP 参考实现（新手接入指南页，逐字，含 `$appsecret= appsecret;` 占位写法）：

```php
function checkSignature() {
        $signature = $_GET["signature"];
        $timestamp = $_GET["timestamp"];
        $nonce = $_GET["nonce"];

	$appsecret= appsecret;  //开发者的appsecret
	$tmpArr = array($appsecret, $timestamp, $nonce);
	sort($tmpArr, SORT_STRING);
	$tmpStr = implode( $tmpArr );
	$tmpStr = sha1( $tmpStr );

	if( $tmpStr == $signature ){
		return true;
	}else{
		return false;
	}
}
```

- demo 包：`http://www.sinaimg.cn/blog/developer/wiki/xiaoxituisong_php_demo.rar`、`http://www.sinaimg.cn/blog/developer/wiki/xiaoxituisong_java_demo.rar`（被动响应页另有 `Messages/dev_demo` PHP 示例入口，未抓，见 §7）。

### 4.2 加密：无

官方文档**未见任何消息体加密机制**（无 AES/EncodingAESKey/MsgDecrypt）。推送为明文 JSON/XML；安全依赖 HTTPS URL + 上述 sha1 签名。mock 实现时不做解密层。

## 5. 示例载荷原文（逐字）

> 注：官方 wiki HTML 转义下划线为 `\_`；以下已还原为正常 JSON（`receiver_id` 等），字符串内容一字未改。`/** // */` 注释为官方原文所有。

### 5.1 纯文本私信（接收普通消息页逐字）

```json
{
    "type": "text",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "私信或留言内容",
    "data": {}
}
```

### 5.2 位置私信（逐字）

```json
{
    "type": "position",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "我在这里: http://t.cn/zQgLLYO",
    "data": {
        "longitude": "116.308586",
        "latitude": "39.982525"
      }
}
```

### 5.3 语音私信（逐字，含官方行内注释）

```json
{
    "type": "voice",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "发了一个语音消息",
    "data": {
        "vfid": 821804459,    // 发送者用此ID查看语音
        "tovfid": 821804469  // 接收者用此ID查看语音
    }
}
```

### 5.4 图片私信（逐字，含官方行内注释）

```json
{
    "type": "image",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "发了一张图片",
    "data": {
        "vfid": 821804459,     // 发送者用此ID查看图片
        "tovfid": 821804469    // 接收者用此ID查看图片
    }
}
```

### 5.5 关注/取消关注事件（接收事件推送页逐字）

```json
{
    "type": "event",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "关注事件消息",
    "data": {
        "subtype": "follow"
    }
}
```

（`unfollow` 同构，`subtype` 换为 `unfollow`，`text` 为“取消关注事件消息”。）

### 5.6 订阅/取消订阅事件（逐字）

```json
{
    "type": "event",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "订阅事件消息",
    "data": {
        "subtype": "subscribe"
    }
}
```

### 5.7 扫带参二维码事件（逐字，注意官方 `ticket` 行尾逗号）

```json
{
    "type": "event",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "扫描二维码",
    "data": {
        "subtype": "scan_follow",
        "key": "action_name_scene_id",
        "ticket": "TICKET",
    }
}
```

### 5.8 被@消息（逐字，含官方缺引号笔误与注释）

```json
{
    "type": "mention",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "被@的微博或评论文本信息",
    "data": {
        "subtype": "MENTION_TYPE,
        "key": "MENTION_KEY"
    }
}
// 默认仅返回可信用户的@，如需返回所有用户@，认证用户可到微博客户端我的设置里设置。
```

（官方原文 `subtype` 值缺右引号，照抄；`subtype` 取 `status`（@的微博）/`comment`（@的评论），`key` 为微博 ID/评论 ID。）

### 5.9 点击菜单拉取消息 Click（逐字）

```json
{
    "type": "event",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "自定义菜单点击事件消息",
    "data": {
        "subtype": "click",
        "key": "EVENT_KEY"
    }
}
```

### 5.10 点击菜单跳转链接 View（逐字）

```json
{
    "type": "event",
    "receiver_id": 1902538057,
    "sender_id": 2489518277,
    "created_at": "Mon Jul 16 18:09:20 +0800 2012",
    "text": "自定义菜单跳转链接事件消息",
    "data": {
        "subtype": "view",
        "key": "url"
    }
}
```

### 5.11 被动回复文本（发送被动响应消息页逐字，两段式）

模板：

```json
{
    "result": true,
    "receiver_id":456,
    "sender_id":123,
    "type": "text",
    "data":"{
         "text": "中文消息"
                 }"
}
```

返回样例：

```json
{
    "result":true,
    "sender_id":"123",
    "receiver_id":"456",
    "type":"text",
    "data":"%7B%22text%22%3A%22%E4%B8%AD%E6%96%87%E6%B6%88%E6%81%AF%22%7D"
}
```

（官方注：JSON 中 data 内容必须 UTF-8 URLEncode；文本 <300 汉字。）

### 5.12 被动回复图文（逐字）

```json
{
    "result": true,
    "receiver_id":456,
    "sender_id":123,
    "type": "articles",
    "data": {
    "articles": [
        {
            "display_name": "两个故事",
            "summary": "今天讲两个故事，分享给你。谁是公司？谁又是中国人？​",
            "image": "http://storage.mcp.weibo.cn/0JlIv.jpg",
            "url": "http://e.weibo.com/mediaprofile/article/detail?uid=1722052204&aid=983319"
        },
        "... //最多支持8个图文，建议为1或3个"
    ]
 }
}
```

返回样例（data 为 URLEncode 串，官方原文含 `%8B%22` 截断换行，逐字）：

```json
{
    "result": true,
    "sender_id":"123",
    "receiver_id":"456",
    "type": "articles",
    "data":"%7B%22articles%22%3A%5B%7B%22display_name%22%3A%22%E4%B8%A4%E4%B8%AA%E6%95%85%E4%BA%8B%22%2C%22summary%22%3A%22%E4%BB%8A%E5%A4%A9%E8%AE%B2%E4%B8%A4%E4%B8%AA%E6%95%85%E4%BA%8B%EF%BC%8C%E5%88%86%E4%BA%AB%E7%BB%99%E4%BD%A0%E3%80%82%E8%B0%81%E6%98%AF%E5%85%AC%E5%8F%B8%EF%BC%9F%E8%B0%81%E5%8F%88%E6%98%AF%E4%B8%AD%E5%9B%BD%E4%BA%BA%EF%BC%9F%E2%80%8B%22%2C%22image%22%3A%22http%3A%2F%2Fstorage.mcp.weibo.cn%2F0JlIv.jpg%22%2C%22url%22%3A%22http%3A%2F%2Fe.weibo.com%2Fmediaprofile%2Farticle%2Fdetail%3Fuid%3D1722052204%26aid%3D983319%22%7D%5D%7D"
}
```

### 5.13 被动回复位置（逐字）

```json
{
    "result": true,
    "receiver_id":456,
    "sender_id":123,
    "type": "position",
    "data": {
    "longitude": "344.3344",
    "latitude": "232.343434"
                  }
}
```

返回样例：

```json
{
    "result":true,
    "sender_id":"123",
    "receiver_id":"456",
    "type":"position",
    "data":"%7B%22longitude%22%3A%22344.3344%22%2C%22latitude%22%3A%22232.343434%22%7D"
}
```

### 5.14 客服消息 text data（发送客服消息页逐字）+ 调用示例

```json
{
    "text": "纯文本回复"
}
```

调用（逐字）：

```
curl "https://m.api.weibo.com/2/messages/reply.json?access_token=ACCESS_TOKEN" -d 'receiver_id=RECEIVER_ID&type=text&data=%7B%22text%22%3A%22%E7%BA%AF%E6%96%87%E6%9C%AC%E5%9B%9E%E5%A4%8D%22%7D' -k
```

成功返回（逐字，注意官方 `type` 行缺逗号）：

```json
{
    "result": true,
    "sender_id": "123",
    "receiver_id": "456",
    "type":"position"
    "data": "%7B%22longitude%22%3A%22344.3344%22%2C%22latitude%22%3A%22232.343434%22%7D"
}
```

### 5.15 客服消息 articles / position data（逐字）

```json
{
    "articles": [
        {
            "display_name": "两个故事",
            "summary": "今天讲两个故事，分享给你。谁是公司？谁又是中国人？​",
            "image": "http://storage.mcp.weibo.cn/0JlIv.jpg",
            "url": "http://e.weibo.com/mediaprofile/article/detail?uid=1722052204&aid=983319"
        }
    ]
}
```

```json
{
    "longitude": "344.3344",
    "latitude": "232.343434"
}
```

### 5.16 群发（高级群发接口页逐字）

按分组-文本：

```json
{
   "filter":{
      "group_id":"123"
   },
   "text":{
      "content":"CONTENT"
   },
    "msgtype":"text"
}
```

按 UID-文本：

```json
{
   "touser":[
    "uid1",
    "uid2"
   ],
   "text":{
      "content":"CONTENT"
   },
    "msgtype":"text"
}
```

成功返回：`{"result": true, "msg_id": "xxxxx"}`（原文 `msg_id` 为小写占位 `xxxxx`）。

群发结果推送 XML（逐字）：

```xml
<xml>
<ToUserName><![CDATA[gh_3e8adccde292]]></ToUserName>
<FromUserName><![CDATA[oR5Gjjl_eiZoUpGozMo7dbBJ362A]]></FromUserName>
<CreateTime>1394524295</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[MASSSENDJOBFINISH]]></Event>
<MsgID>1988</MsgID>
<Status><![CDATA[sendsuccess]]></Status>
<TotalCount>100</TotalCount>
<FilterCount>80</FilterCount>
<SentCount>75</SentCount>
<ErrorCount>5</ErrorCount>
</xml>
```

### 5.17 微信兼容 XML（微信XML格式兼容页逐字，每类一例）

text：

```xml
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName> 
 <CreateTime>1348831860</CreateTime>
 <MsgType><![CDATA[text]]></MsgType>
 <Content><![CDATA[this is a test]]></Content>
 <MsgId>1234567890123456</MsgId>
</xml>
```

image：

```xml
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName>
 <CreateTime>1348831860</CreateTime>
 <MsgType><![CDATA[image]]></MsgType>
 <PicUrl><![CDATA[this is a url]]></PicUrl>
 <MediaId><![CDATA[media_id]]></MediaId>
 <MsgId>1234567890123456</MsgId>
 </xml>
```

voice：

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[fromUser]]></FromUserName>
<CreateTime>1357290913</CreateTime>
<MsgType><![CDATA[voice]]></MsgType>
<MediaId><![CDATA[media_id]]></MediaId>
<Format><![CDATA[Format]]></Format>
<MsgId>1234567890123456</MsgId>
</xml>
```

position（注意 MsgType=location）：

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[fromUser]]></FromUserName>
<CreateTime>1351776360</CreateTime>
<MsgType><![CDATA[location]]></MsgType>
<Location_X>23.134521</Location_X>
<Location_Y>113.358803</Location_Y>
<Scale>20</Scale>
<Label><![CDATA[位置信息]]></Label>
<MsgId>1234567890123456</MsgId>
</xml>
```

关注/订阅：

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[FromUser]]></FromUserName>
<CreateTime>123456789</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[subscribe]]></Event>
</xml>
```

扫码（未关注→scan_follow / 已关注→SCAN，全大写差异逐字）：

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[FromUser]]></FromUserName>
<CreateTime>123456789</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[subscribe]]></Event>
<EventKey><![CDATA[qrscene_123123]]></EventKey>
<Ticket><![CDATA[TICKET]]></Ticket>
</xml>
```

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[FromUser]]></FromUserName>
<CreateTime>123456789</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[SCAN]]></Event>
<EventKey><![CDATA[SCENE_VALUE]]></EventKey>
<Ticket><![CDATA[TICKET]]></Ticket>
</xml>
```

菜单点击：

```xml
<xml>
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[FromUser]]></FromUserName>
<CreateTime>123456789</CreateTime>
<MsgType><![CDATA[event]]></MsgType>
<Event><![CDATA[CLICK]]></Event>
<EventKey><![CDATA[EVENTKEY]]></EventKey>
</xml>
```

被动回复 text：

```xml
<xml>
 <ToUserName><![CDATA[toUser]]></ToUserName>
 <FromUserName><![CDATA[fromUser]]></FromUserName> 
 <CreateTime>1348831860</CreateTime>
 <MsgType><![CDATA[text]]></MsgType>
 <Content><![CDATA[this is a test]]></Content>
</xml>
```

被动回复图文（注意 MsgType=news，逐字，原文缺外层 `<xml>` 包裹）：

```xml
<ToUserName><![CDATA[toUser]]></ToUserName>
<FromUserName><![CDATA[fromUser]]></FromUserName>
<CreateTime>12345678</CreateTime>
<MsgType><![CDATA[news]]></MsgType>
<ArticleCount>2</ArticleCount>
<Articles>
<item>
<Title><![CDATA[title1]]></Title> 
<Description><![CDATA[description1]]></Description>
<PicUrl><![CDATA[picurl]]></PicUrl>
<Url><![CDATA[url]]></Url>
</item>
<item>
<Title><![CDATA[title]]></Title>
<Description><![CDATA[description]]></Description>
<PicUrl><![CDATA[picurl]]></PicUrl>
<Url><![CDATA[url]]></Url>
</item>
</Articles>
```

## 6. token / 凭证模型

| 凭证 | 换取/获取方式 | 寿命/约束 | 出处 |
|---|---|---|---|
| appsecret（验签密钥） | 应用 APPKEY 对应的 App Secret（开发者后台）；认证账号在粉服后台填 APPKEY 即绑定该密钥入签 | 长期（随应用） | 新手接入指南第一步、验证消息真实性页 |
| 粉服 access_token（客服/群发/切格式接口凭证） | 途径一：粉服后台 高级功能-开发者模式页自动显示（认证账号指定并授权 APPKEY 后），开发者联系认证用户获取；途径二：OAuth2 scope 包授权（文档注明“开发中，暂未上线”） | 官方未在本域列明有效期 | Messages_api/access_token、新手接入指南第三步、发送客服消息页参数表 |
| OAuth2 access_token（通用） | 标准 OAuth2 授权；`2/messages/reply` 页另支持 Base Auth（appkey 所有者账号 `curl -u "USERNAME:PASSWORD"` + `source=APPKEY`） | 通用有效期官方 wiki 未在本页列明 | 发送客服消息页、2/messages/reply 注意事项 |
| 客服消息配额 | 用户发消息/关注-订阅/点菜单/扫码后 48h 内不限发送次数（发送客服消息页，2023-10 更新口径）；用户@事件 48h 内可回 1 次（已有权限者）；取消关注后不可回；底层配额“接收方给发送方主动发过消息→48h 内发送方有对该接收方 99 条主动配额”（发送客服消息页注意事项第 2 条） | 48h 窗口 + 99 条 | 发送客服消息页 |
| 旧口径（并存） | `2/messages/reply` 页注意事项第 5 条：“接收方给发送方主动发送过消息，则在 7 天内，发送方具备对接收方的主动配额一条” | 7 天 1 条（旧页 2014-06-03 口径，与 2023-10 页 48h/99 条矛盾，模拟按新口径，旧口径备注） | 2/messages/reply |
| 被动回复文本上限 | <300 汉字（超则自动截断）；图文 ≤8 条（建议 1 或 3）；图文标题 <60 汉字、描述 <300 汉字；图片 JPG/PNG（首图推荐 280*155、非首图 64*64）；图文 url 必须完整 `http://` 开头 | — | 被动响应页、微信XML兼容页 |
| 切格式接口凭证 | `access_token`（OAuth 必填）+ `format` | — | Eps/push/set_format |

### 6.1 2026-10-14 补证（官方四页直抓复核，均可达）

| 页面（版本锚点） | 复核结论 |
|---|---|
| 验证消息真实性（oldid=12786，2014-04-20） | 签名规则逐字与 §4.1 一致（appsecret/timestamp/nonce 字典排序拼接 sha1）；原文证实「后续每次微博事件推送时也都会带上 signature、timestamp、nonce 三个参数……校验方式与首次建立连接一致」——§3.1/§4.1 无需修订 |
| 发送客服消息（oldid=16525，2023-10-16） | 参数表与 §6 一致；成功返回原文 `{"result": true, "sender_id": "123", "receiver_id": "456", "type": "position", "data": "<URLEncode>"}`；**官方页未给错误响应示例**——实现按 `result==true` 判成功、非成功响应提取 `error_code`/`error` 描述、无法识别按失败，不冒成功；`data.text`「文本大小必须小于300个汉字」；官方注明长连接接入模式 reply 调用方式略不同（HTTP 推送模式不涉及） |
| Messages_api/access_token（oldid=13360，2014-06-12） | 途径二 OAuth2 scope 包至今仍标注「（开发中，暂未上线）」，页面自 2014 年未更新——**直配 accessToken（途径一粉服后台开发者模式页直取）为现行唯一官方途径**；原文证实粉服权限「绑定在微博认证帐户上的，而不像之前微博开放平台的 OPEN API 那样是绑定在第三方开发者的 APPKEY 上的」 |
| 接收消息（oldid=14640，2015-08-24） | 索引页证实四类普通消息（文本/位置/语音/图片）与事件清单与 §2 一致；微信 XML 兼容经 `Eps/push/set_format` 可选，mock 基准取 JSON 不涉及 |

发送客服消息页同页口径并存（官方原文固有）：开头「用户发送消息，关注/订阅事件，点击自定义菜单，扫描二维码事件后，目前修改为开发者在48小时内不限制发送次数」，注意事项第 2 条仍保留「一般来说……主动配额99条」；另原文「用户取消关注后，开发者无法回复消息」「用户@事件，目前暂不开放，已有权限的开发者在48小时内可以回复一次」。access_token 参数说明原文：「在粉丝服务平台 - 高级功能 - 开发者模式页面中获取，或者OAuth2.0授权后获得」。

发送接口一览：

| 用途 | 方法与地址 | Content-Type/参数 |
|---|---|---|
| 被动回复 | 当前 POST 的响应包直接返回 JSON/XML | JSON `result/receiver_id/sender_id/type/data(URLEncode)`；XML `ToUserName/FromUserName/CreateTime/MsgType/Content 或 news Articles` |
| 客服消息 | `POST https://m.api.weibo.com/2/messages/reply.json` | `application/x-www-form-urlencoded`；`access_token`、`type`(text/articles/position)、`data`(JSON URLEncode，UTF-8)、`receiver_id`(int64)、`save_sender_box`(0/1，默认 1) |
| 高级群发 | `POST https://m.api.weibo.com/2/messages/sendall.json?access_token=ACCESS_TOKEN` | JSON body：`filter.group_id` 或 `touser[uid]` + `msgtype` + `text.content`/`articles[]` |
| 格式切换 | `POST https://api.weibo.com/2/eps/push/set_format.json` | `access_token` + `format` |
| 媒体下载 | `GET https://upload.api.weibo.com/2/mss/msget?access_token=...&fid=<tovfid>` | — |

## 7. 待核验清单（09-27 首标；③⑤已于 10-14 复核）

1. **粉服是否仍接受新账号接入开发模式**：总纲/接入页无“停止接入”公告，但主体文档停留在 2014–2015（仅事件推送页 2024-07-30、客服消息页 2023-10-16 有近年更新）；新接入可用性建议小流量验证。→ 待核验(09-27)
2. **长连接模式全文**：新手接入指南仅给入口“粉服开发接口长连接接入指南”（`message/receive` + `message/reply` 的 id 版调用），`2/messages/reply` 页第 4 条已证实 id 版语义，但长连接建连/心跳/取消息协议未抓。→ 待核验(09-27)
3. **配额口径矛盾**：`2/messages/reply`（2014）“7 天 1 条” vs 发送客服消息（2023）“48h 不限次 + 99 条主动配额”。已按新口径采用，旧口径是否为长连接专属待确认。→ 已复核(10-14)：矛盾为官方原文固有——发送客服消息页（oldid=16525）开头「48小时内不限制发送次数」与注意事项第 2 条「主动配额99条」同页并存；按新口径采用，实现不依赖配额数字，发送失败如实落库（见 §6.1）
4. **`Messages/dev_demo` PHP 示例包**：`2/messages/reply` 页引用的长连接版示例下载页未抓。→ 待核验(09-27)
5. **OAuth2 粉服 scope 包**：`Messages_api/access_token` 页称 OAuth2 粉服授权“开发中，暂未上线”（2014-06-12），现行 Scope 页是否已上线粉服 scope 未复核。→ 已复核(10-14)：该页（oldid=13360）至今仍标注「（开发中，暂未上线）」，直配 accessToken 为现行唯一官方途径，channel_info `accessToken` 键即按此（见 §6.1）
6. **个人认证（橙V）现状/费用与蓝V回复类型限制**：客服消息页有“蓝V可回复的私信类型”一节（text/articles/position），个人认证号是否同权、认证费用政策未在本域列明。→ 待核验(09-27)
7. **自定义菜单创建/查询/删除三 API 与带参二维码 ticket 两步 API 正文**：本次仅抓索引页，事件侧已由接收/兼容两页全覆盖，管理侧（菜单结构、ticket 换取 URL）未抓。→ 待核验(09-27)
8. **群发频次/审核规则**：高级群发页只给“提交成功≠发送完成、可能审核、需耐心等待”，具体限频数字未列。→ 待核验(09-27)
9. **通用 OAuth2 access_token 有效期**：粉服域内未列明，需到授权机制/OAuth2 页复核（本次域外未抓）。→ 待核验(09-27)

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟“微博推私信给回调”：`POST` JSON `{type, receiver_id:int64, sender_id:int64, created_at:"Mon Jul 16 18:09:20 +0800 2012"格式, text, data}`；事件用 `type:"event"` + `data.subtype`（follow/unfollow/subscribe/unsubscribe/scan/scan_follow/click/view），mention 例外 `type:"mention"`。
- 模拟握手：`GET ?signature=&timestamp=&nonce=&echostr=`，`signature=sha1hex(字典序排序(appsecret,timestamp,nonce)直接拼接)`；黄金算例 `xyz123xyz/1397022061823/57155157→90e4c22c90a58f26526c2dd5b6c56c8822edeaa1`；通过则原样回 `echostr`。
- 模拟重试：5s 无响应断开，共 3 次；回空串=跳过不重试；幂等键 `sender_id + created_at`（无消息 ID；XML `MsgId` 为空不可用）。
- 模拟回复：被动=响应包回 `{result:true, sender_id, receiver_id, type, data(URLEncode)}`；异步= `POST m.api.weibo.com/2/messages/reply.json` form（48h/99 条）。
- ID 形态：`receiver_id/sender_id` 为 int64 数字 UID（如 1902538057/2489518277）；`created_at` 为 `Mon Jul 16 18:09:20 +0800 2012` 字符串；`key` 为 `action_name_scene_id`；`ticket` 为 `TICKET` 占位。
