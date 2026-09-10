# 飞书开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓 open.feishu.cn 官方文档英文版正文（全部成功，逐字）+ WebSearch 官方站内摘录（标注 `[摘录]`）+ 本地档案 `.scratch/open-platforms-survey/` 只读引用（标注 `[本地]`，为 2026-09-03 官方文档站逐页抓取物）。
> 标注约定：无标注 = 本次 WebFetch 官方正文已核验；`[摘录]` = WebSearch 返回的官方页面原文摘录（未取全文）；`[本地]` = 本地档案抓取物（官方文档原文存档）；`待核验(09-27)` = 未能取得官方原文，需复核。
> 事实分级参照 `xiaohongshu.md`：本库 §2–§6 均为官方来源；`[本地]` 引用均给出档案路径以便复查。
> 所有示例载荷均为官方文档原文逐字拷贝（含官方占位符原文）。

## 1. 官方文档入口与关键页面地址

- 门户：https://open.feishu.cn/
- 开发者后台（控制台）：https://open.feishu.cn/app（应用详情页 > **开发配置 > 事件与回调** > 事件配置/回调配置/加密策略三个页签）
- 事件列表（动态目录，`<md-event-list>` JS 组件渲染，无静态正文）：https://open.feishu.cn/document/server-docs/event-subscription-guide/event-list
- 官方 SDK（四语言，包名出自官方文档正文示例）：Go `github.com/larksuite/oapi-sdk-go/v3`、Python `lark-oapi`（`pip install lark-oapi -U`）、Java `com.larksuite.oapi:oapi-sdk`、Node `@larksuiteoapi/node-sdk`（>=1.24.0）

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| 事件订阅概述（双通道/v1/v2/重试/幂等/有序） | https://open.feishu.cn/document/server-docs/event-subscription-guide/overview | WebFetch 全文 |
| 长连接收事件（WSS、50 连接、集群随机、仅自建） | https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case | WebFetch 全文 |
| 接收事件（验签 6 语言示例/AES 解密 6 语言示例） | https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case | WebFetch 全文 |
| 将事件发送至开发者服务器（Webhook+challenge 1s+单地址） | https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/choose-a-subscription-mode/send-notifications-to-developers-server | WebFetch 全文（2026-09-10 复核升级） |
| 配置请求网址（旧版 challenge 明文/加密双格式） | https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/configure-web-hook-url | WebFetch 全文（2026-09-10 复核升级） |
| 事件订阅 FAQ（含 curl 自测 challenge 命令） | https://open.feishu.cn/document/event-subscription-guide/event-subscriptions/faq | WebFetch 全文（2026-09-10 复核升级） |
| 接收消息 im.message.receive_v1 | https://open.feishu.cn/document/server-docs/im-v1/message/events/receive | WebFetch 全文 |
| 消息已读 im.message.message_read_v1 | https://open.feishu.cn/document/server-docs/im-v1/message/events/message_read | WebFetch 全文 |
| 撤回消息 im.message.recalled_v1 | https://open.feishu.cn/document/server-docs/im-v1/message/events/recalled | WebFetch 全文 |
| 机器人进群 im.chat.member.bot.added_v1 | https://open.feishu.cn/document/server-docs/im-v1/chat-member-bot/events/added | WebFetch 仅回 JS 壳；全文以 server-docs/group/chat-member/event/added-2 为准（双路径同文待复核） |
| 员工离职 contact.user.deleted_v3 | https://open.feishu.cn/document/server-docs/contact-v3/user/events/deleted | WebFetch 全文 |
| 自建应用获取 tenant_access_token | https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal | WebFetch 全文 |
| 发送消息 POST /open-apis/im/v1/messages | https://open.feishu.cn/document/server-docs/im-v1/message/create | WebFetch 全文 |
| 审批实例状态变更事件 | https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/approval-v4/instance/events/status_changed | `[摘录]`（标题+触发语义） |
| 审批事件概述（含 subscribe 前置接口/3s/幂等） | https://open.feishu.cn/document/server-docs/approval-v4/event/function-introduction | WebFetch 全文（2026-09-10 复核升级） |
| 审批定义更新 approval.approval.updated_v4 | https://open.feishu.cn/document/server-docs/approval-v4/event/common-event/custom-approval-event | WebFetch 全文（页面为空字符串模板，ID 为示意，见 §5.8 注） |
| 订阅审批事件 POST /open-apis/approval/v4/approvals/:approval_code/subscribe | https://open.feishu.cn/document/server-docs/approval-v4/event/event-interface/subscribe | WebFetch 全文（2026-09-10 复核升级） |
| 卡片回调配置（challenge 三参数+3s，历史教程页） | https://open.feishu.cn/document/historical-version/build-a-beautiful-message-card-in-5-minutes/add-interaction | WebFetch 全文（历史页，3s 口径） |
| 卡片回调安全校验（历史文档，Verification Token 版 sha1 步骤） | https://open.feishu.cn/document/common-capabilities/message-card/add-card-interaction/message-card-security-verification | WebFetch 全文（历史页，自声明不再维护；同页作 1s，与上页 3s 矛盾） |
| 群组 API/事件总览（bot.deleted_v1、user 进群行） | https://open.larkoffice.com/document/uAjLw4CM/ukTMukTMukTM/group/overview | `[摘录]`（官方多地域镜像站） |
| 机器人进群（中文页，2025-03-24 更新） | https://open.feishu.cn/document/server-docs/group/chat-member/event/added-2 | `[摘录]`（仅标题行） |

---

## 2. 消息/事件推送全清单

推送方式统一为 **Webhook**（下表 `推送方式` 均为各事件页原文 `Push Mode: Webhook`；长连接为传输通道，事件语义相同）。

### 2.1 消息类（Messenger）

| 事件类型 | 触发语义 | 订阅所需权限（任一） | 出处 |
|---|---|---|---|
| `im.message.receive_v1` | 机器人收到用户/机器人发来的消息 | `im:message.p2p_msg:readonly`（单聊）/`im:message.group_at_msg:readonly`（群 @，不含 bot 发的消息）/`im:message.group_msg`（群全量，敏感）/`im:message.group_at_msg.include_bot:readonly`（群 @，含 bot）/`im:message.group_msg.include_bot:read`（群全量含 bot，不含自己发的）/历史版 `im:message.p2p_msg`、`im:message.group_at_msg`/`im:message.group_bot_msg:readonly`/`im:message.group_msg:readonly` | receive 页全文 |
| `im.message.message_read_v1` | 用户已读机器人发的单聊消息 | `im:message` / `im:message:readonly` | message_read 页全文（**注意：官方真名为 `message_read`，`im.message.read_v1` 不存在**） |
| `im.message.recalled_v1` | 机器人所在会话（单聊/群）有消息被撤回 | `im:message` / `im:message:readonly`；仅自己会话内 | recalled 页全文（**注意：官方真名为 `recalled`，`recall_v1` 不存在**） |

- 字段级权限：`user_id` 需 `contact:user.employee_id:readonly`；`user_agent` 需 `im:user_agent:read`（receive 页原文）。
- 幂等（receive 页原文）："In special scenarios, repeated pushes may be received. If you have idempotent needs, please use ==message_id== to deduplicate, do not rely on event_id."——**消息类用 `message_id` 去重，不要用 `event_id`**。

### 2.2 群组类

| 事件类型 | 触发语义 | 订阅所需权限（任一） | 出处 |
|---|---|---|---|
| `im.chat.member.bot.added_v1` | 机器人被用户拉进群（bot 邀 bot 时仅被邀方收到，已在群内者收不到） | `im:chat` / `im:chat.members:bot_access` / `im:chat:readonly` | added 页全文 |
| `im.chat.member.bot.deleted_v1` | 机器人被移出群 | 订阅机器人进出群事件（`im:chat.members:bot_access` 系） | `[摘录]` group/overview + 待核验(09-27)（全文未取） |
| `im.chat.member.user.added_v1` | 新用户进群 | 查看群成员系 | 概述页例文链接（事件页全文待核验(09-27)） |
| 群更新/解散 `group/chat/events/updated`、`disbanded` | 群信息变更/解散 | — | `[本地]` event_pages.json（全文待核验(09-27)） |
| v1.0 `p2p_chat_create` | 机器人被拉单聊（v1.0 结构，`event.type` 判型） | — | 概述页 v1.0 示例原文（全文页待核验(09-27)） |

### 2.3 通讯录类（contact-v3）

`contact.user.deleted_v3` 已全文核验（事件体见 §5.7；`department_ids` 注明不返回值、以 `old_object.department_ids` 为准）。

其余以 `[本地]` 为下限（`data/scrape-v1/feishu/event_pages.json`，官方路径存活探测）：

- 用户：`contact-v3/user/events/created`、`updated`、`deleted`
- 部门：`contact-v3/department/events/created`、`updated`、`deleted`
- 员工类型枚举：`employee_type_enum/events/{actived,created,deactivated,deleted,updated}`
- 授权范围：`contact-v3/scope/events/updated`；自定义字段：`custom_attr/events/updated`
- 通讯录事件字段权限粒度极细（deleted_v3 页列 14 类字段 scope，见 §5.7 表头）→ 全文待核验(09-27)。

### 2.4 审批类（approval-v4，特殊订阅机制）

- 已核验 `approval.approval.updated_v4`（审批定义更新，`[摘录]` 含完整事件体示例，见 §5.8）。
- 审批实例/任务/抄送状态变更：`[摘录]` function-introduction + reference 概述确认存在"实例状态变更、任务状态变更、抄送状态变更、定义更新"四公用事件 + 请假/加班/出差/换班/外出等特殊事件；实例状态取值 `PENDING/APPROVED/REJECTED/CANCELED/DELETED`（instance/get `[摘录]`）。
- **关键机制差异**（`[摘录]` subscribe 页）：订阅审批事件后，还必须调用 `POST /open-apis/approval/v4/approvals/:approval_code/subscribe` 按审批定义 Code 开启订阅（100 次/分钟；同一应用调一次即可；多应用可同时订阅同一 Code）。取消用对应 unsubscribe 接口。
- 审批事件 3s/幂等（`[摘录]` function-introduction）："服务端收到事件需 3 秒内响应，否则超时重推；事件可能重复，按 `event_id` 或 `uuid` 做幂等（不同事件类型幂等 key 不同）"。
- 各 v4 事件精确 type 名与事件体 → 待核验(09-27)（仅 `approval.approval.updated_v4` 有 type 名实锤）。

### 2.5 其他域（`[本地]` 下限，全文待核验(09-27)）

- 日历：`calendar-v4/{calendar-acl,calendar-event,calendar}/events/*`（4 页）
- 视频会议：`vc-v1/meeting/events/*`（8 页：started/ended/join/leave/recording_*/share_*）+ `room/events/*`（3 页）+ `room_level/events/*`（3 页）+ `scope_config/events/updated`
- 任务：`task-v1/task/events/{update_tenant,updated}` + `task-comment/events/updated`
- 服务台：`helpdesk-v1/{ticket/events/{created,updated},ticket-message/events/created,notification/events/approve}`
- 招聘：`hire-v1/.../offer/events/status_changed`、`onboard/events/{import-ehr,imported}`、`talent/events/deleted`、`eco_{account,background_check,exam}/events/*`
- 门禁：`acs-v1/{access_record/events/created,user/events/updated}`
- 总量口径：官方事件列表为动态目录；`[本地]` 11-feishu.md 实测 server-docs 树内 57 个事件文档页存活为**保守下限**，非全量。

---

## 3. 回调机制

### 3.1 两种订阅通道（二选一）

来源：overview 页全文 + 长连接页全文。

| | 长连接（Receive events through persistent connection） | Webhook（Send notifications to developer's server） |
|---|---|---|
| 形态 | SDK 内置 WebSocket 全双工通道；`cli.Start()` 成功后控制台打印 `connected to wss://xxxxx`，主线程阻塞 | 平台向公网地址发 HTTP POST，`application/json;charset=utf-8`，JSON 载荷 |
| 网络要求 | 本机能访问公网即可，无需公网 IP/域名、无需内网穿透 | 必须是 IPv4 公网地址；每个应用只能配**一个**请求地址，所有订阅事件都发往该地址 |
| 应用类型 | **仅企业自建应用**（商店应用看 Webhook 列） | 自建/商店均可 |
| 加解密 | 内置通信加密+鉴权，**业务侧零验签解密**（仅建连时鉴权，后续明文推送） | 按加密策略自行验签；加密事件先解密再解析 |
| 消费时限 | 3 秒内处理完且不抛异常，否则触发超时重试 | 3 秒内回 HTTP 200（TCP 建联超时 2s、整体回调超时 3s），否则判失败 |
| 配置位置 | 开发者后台 > 事件与回调 > 事件配置 > 订阅方式；**保存时要求本地 client 已在线** | 同页填请求地址；保存即发 challenge 验证 |
| 集群语义 | **集群模式，不广播**：同一应用多 client 只随机投递其中一个 | — |
| 连接上限 | 每应用最多 **50 个连接**（每次初始化 client 计一个） | — |

SDK 接入（长连接页原文）：Go `go get -u github.com/larksuite/oapi-sdk-go/v3`；Python `pip install lark-oapi -U`；Java `com.larksuite.oapi:oapi-sdk`（最新版见 mvnrepository）；Node `yarn add @larksuiteoapi/node-sdk`（>=1.24.0）。事件分发器两参必须空字符串（`NewEventDispatcher("", "")`）；v2.0 用 `OnP2XxxV1`/`register_p2_*`，v1.0 用 `OnCustomizedEvent`/`register_p1_customized_event`。

### 3.2 首次验证握手（url_verification challenge）

- 未配置 Encrypt Key，明文 POST（`[摘录]` send-notifications 页）：
```json
{
  "challenge": "ajls384kdjxxxx",
  "token": "xxxxxx",
  "type": "url_verification"
}
```
- 已配置 Encrypt Key：body 只有一个字段（`[摘录]` 同页）：
```json
{ "encrypt": "ds3da3sj32421lkkld4xxxx" }
```
解密后即上式（含 challenge/token/type），再回显 challenge。
- 应答（逐字）："当请求地址收到开放平台推送的 POST 验证请求时，需要解析出 `challenge` 值，并在 **1 秒内**原样返回该值作为响应"（现行事件页口径）：
```json
{ "challenge": "ajls384kdjxxxx" }
```
- **口径差异（已核验，照录）**：历史卡片回调教程页为 **3 秒内**原样返回（`[摘录]` historical-version 页 + `[本地]` `data/scrape-v1/feishu/md/a8017ce9ef6c.md` 卡片回调配置原文，三参数为 `challenge/type/url_verification/token=qjSwzC****4T1uhJ`）。另同一历史卡片安全校验页作 1s（与本 3s 页矛盾，均非现行事件口径；模拟器仍按现行事件页 1s 为准）。模拟器实现按现行事件页 1s 为准，兼容 3s 旧口径。
- 自测命令（`[摘录]` FAQ 页，Encrypt Key 未配置时）：
```bash
curl -v --location '{YOUR_CALLBACK_URL}' \
--header 'Content-Type: application/json' \
--data '{"challenge": "<test code>", "type": "url_verification", "token": "<your verification token>"}'
```
- 卡片交互回调走「回调配置」页签的独立请求地址，验证机制相同（`[摘录]` historical-version 卡片回调页 + 上述本地档案）。

### 3.3 重试、幂等、有序（overview 页逐字）

- 失败重推："it must respond … with an HTTP 200 status code **within 3 seconds** … Otherwise … will retry the event push at intervals of **15 seconds, 5 minutes, 1 hour, and 6 hours, with a maximum of 4 retries**."
- 成功也可能重推："the messaging strategy … adopts **at least one-time delivery** … will result in receiving duplicate messages even when the event is successfully received."——必须做幂等。
- 幂等键：v1.0 用 `uuid`，v2.0 用 `header.event_id`；**消息类用 `message_id`**（§2.1）。
- 有序事件：部分事件为 ordered（"the next event is pushed only after the previous event has been successfully received"）；消费必须保证前后事件正常消费以防阻塞；是否为有序看各事件页说明。
- 事件不保证不丢：`[本地]` 11-feishu.md §2.15（官方指南页口径，建议配合主动查询兜底）。

---

## 4. 验签与加密算法

来源：接收事件页全文（"Step 3: Receive events"）。密钥位置：应用管理平台 **事件与回调 > 加密策略**（`encrypt_key` 可查看；Verification Token 可查看/重置）。

### 4.1 Verification Token 校验（默认，低安全）

从请求 body 取 Verification Token 值与应用内的值比对；一致即来源合法。原文："This verification method is simple but has lower security. Without the Encrypt Key encryption strategy, the Verification Token will be transmitted in plain text, posing a data leakage risk." 配置了 Encrypt Key 后如仍需取 Token，必须**先解密事件**才能拿到。

### 4.2 签名校验（配置 Encrypt Key 后必须用）

算法（逐字）："Concatenate the request headers `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce` with `encrypt_key`, encode … `encode('utf-8')` to get `byte[] b1`, and then concatenate with the **original request body** …, resulting in `byte[] b`. Use the **sha256** algorithm to hash `b` … Verify whether `s` matches the request header **`X-Lark-Signature``."

即：`signature = hex(sha256( timestamp + nonce + encrypt_key + 原始body字节 ))`，body 用原始字节，**不要反序列化后再算**（Go 示例原注）。

官方示例（逐字，Python 3 / Node.js / PHP；Java/Go/C# 见来源页，全同构）：

```python
import hashlib
bytes_b1 = (timestamp + nonce + encrypt_key).encode('utf-8')
bytes_b = bytes_b1 + body
h = hashlib.sha256(bytes_b)
signature = h.hexdigest()
# check if request headers['X-Lark-Signature'] equals to signature
```

```js
var crypto = require('crypto');
function calculateSignature(timestamp, nonce, encryptKey, body) {
        const content = timestamp + nonce + encryptKey + body
        const sign = crypto.createHash('sha256').update(content).digest('hex');
        return sign
}
```

```php
<?php
$encrypt_key = "";  // Encrypt Key from the Open Platform backend
$timestamp = "";
$nonce = "";
$body = ""; // Refers to the entire request body, do not calculate it after deserialization
$signature = hash("sha256", $timestamp . $nonce . $encrypt_key . $body);
// check if request headers['X-Lark-Signature'] equals to signature
```

### 4.3 事件解密（AES-256-CBC）

算法（6 语言示例同构，逐字要点）：`key = sha256(encrypt_key)`（32 字节）；base64 decode 后**前 16 字节为 IV**，剩余为密文；`AES-256-CBC` 解密去填充。

- Python（需 `pip install pycryptodome`，逐字）：
```python
import hashlib
import base64
from Crypto.Cipher import AES
class  AESCipher(object):
    def __init__(self, key):
        self.bs = AES.block_size
        self.key=hashlib.sha256(AESCipher.str_to_bytes(key)).digest()
    @staticmethod
    def str_to_bytes(data):
        u_type = type(b"".decode('utf8'))
        if isinstance(data, u_type):
            return data.encode('utf8')
        return data
    @staticmethod
    def _unpad(s):
        return s[:-ord(s[len(s) - 1:])]
    def decrypt(self, enc):
        iv = enc[:AES.block_size]
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        return  self._unpad(cipher.decrypt(enc[AES.block_size:]))
    def decrypt_string(self, enc):
        enc = base64.b64decode(enc)
        return  self.decrypt(enc).decode('utf8')
encrypt = "P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk="
cipher = AESCipher("test key")
print("明文:\n{}".format(cipher.decrypt_string(encrypt)))
```
官方断言该样例解密得 `hello world`（Java/Go 版行内注释原文 `//hello world`）。
- PHP（逐字）：
```php
<?php
$encrypt_data = ""; // The information to be decrypted
$encrypt_key = ""; // Encrypt Key from the developer console
$base64_decode_message = base64_decode($encrypt_data);
$iv = substr($base64_decode_message, 0, 16);
$encrypted_event = substr($base64_decode_message, 16);
$decrypt = openssl_decrypt($encrypted_event, 'AES-256-CBC', hash('sha256', $encrypt_key, true), OPENSSL_RAW_DATA, $iv);
print($decrypt);
// get the real event
```
- 加密信封：body 仅 `{"encrypt": "<base64>"}`（`[摘录]` configure-web-hook-url 页；url_verification 请求同样可能加密，§3.2）。

### 4.4 历史口径差异（照录，不采用）

`[摘录]` 历史卡片文档 `message-card-security-verification`（自声明不再维护）给出另一套 Token 验签：按 `timestamp、nonce、Verification Token、body` 顺序拼接 → `encode('utf-8')` → **SHA-1** → hex 记为 sig。现行事件页（§4.2）为 sha256 + Encrypt Key。**以现行页为准**，历史口径仅作兼容参考 → 待核验(09-27)（现行卡片回调是否仍可用该算法）。

---

## 5. 示例载荷原文（逐字）

### 5.1 url_verification（`[摘录]` 现行事件页 + `[本地]` 卡片页互证）

```json
{
  "challenge": "ajls384kdjxxxx",
  "token": "xxxxxx",
  "type": "url_verification"
}
```

```json
{ "challenge": "ajls384kdjxxxx" }
```

卡片页版（三参数全，`[本地]` `data/scrape-v1/feishu/md/a8017ce9ef6c.md` + `[摘录]` historical-version 页一致）：

```json
{
  "challenge": "1b6aef1a-401f-406a-be41-f48911e00be7",
  "type": "url_verification",
  "token": "qjSwzC****4T1uhJ"
}
```

```json
{ "challenge": "1b6aef1a-401f-406a-be41-f48911e00be7" }
```

### 5.2 v2.0 信封（overview 页逐字）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "f7984f25108f8137722bb63cee927e66",
        "token": "066zT6pS4QCbgj5Do145GfDbbagCHGgF",
        "create_time": "1603977298000000",
        "event_type": "contact.user_group.created_v3",
        "tenant_key": "xxxxxxx",
        "app_id": "cli_xxxxxxxx",
    },
    "event":{
    }
}
```

### 5.3 v1.0 信封（overview 页逐字，`type: event_callback` + `event.type` 判型）

```json
{
    "ts": "1502199207.7171419",
    "uuid": "bc447199585340d1f3728d26b1c0297a",
    "token": "41a9425ea7df4536a7623e38fa321bae",
    "type": "event_callback",
    "event": {
        "app_id": "cli_9c8609450f78d102",
        "chat_id": "oc_26b66a5eb603162b849f91bcd8815b20",
        "operator": {
            "open_id": "ou_2d2c0399b53d06fd195bb393cd1e38f2",
            "user_id": "gfa21d92"
        },
        "tenant_key": "736588c9260f175c",
        "type": "p2p_chat_create",
        "user": {
            "name": "user_name",
            "open_id": "ou_7dede290d6a27698b969a7fd70ca53da",
            "user_id": "gfa21d92"
        }
    }
}
```

### 5.4 im.message.receive_v1（receive 页逐字）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "5e3702a84e847582be8db7fb73283c02",
        "event_type": "im.message.receive_v1",
        "create_time": "1608725989000",
        "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        "app_id": "cli_9f5343c580712544",
        "tenant_key": "2ca1d211f64f6438"
    },
    "event": {
        "sender": {
            "sender_id": {
                "union_id": "on_8ed6aa67826108097d9ee143816345",
                "user_id": "e33ggbyz",
                "open_id": "ou_84aad35d084aa403a838cf73ee18467"
            },
            "sender_type": "user",
            "tenant_key": "736588c9260f175e"
        },
        "message": {
            "message_id": "om_5ce6d572455d361153b7cb51da133945",
            "root_id": "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
            "parent_id": "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
            "create_time": "1609073151345",
            "update_time": "1687343654666",
            "chat_id": "oc_5ce6d572455d361153b7xx51da133945",
            "thread_id": "omt_d4be107c616",
            "chat_type": "group",
            "message_type": "text",
            "content": "{\"text\":\"@_user_1 hello\"}",
            "mentions": [
                {
                    "key": "@_user_1",
                    "id": {
                        "union_id": "on_8ed6aa67826108097d9ee143816345",
                        "user_id": "e33ggbyz",
                        "open_id": "ou_84aad35d084aa403a838cf73ee18467"
                    },
                    "mentioned_type": "user",
                    "name": "Tom",
                    "tenant_key": "736588c9260f175e"
                }
            ],
            "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.53 Safari/537.36 Lark/6.7.5 LarkLocale/en_US ttnet SDK-Version/6.7.8"
        }
    }
}
```

要点：`content` 是 JSON 序列化字符串；`chat_type: p2p/group`；`sender_type: user/bot`；`message_type` 全表见 message_content 页（待核验(09-27)）。

### 5.5 im.message.message_read_v1（message_read 页逐字）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "5e3702a84e847582be8db7fb73283c02",
        "event_type": "im.message.message_read_v1",
        "create_time": "1608725989000",
        "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        "app_id": "cli_9f5343c580712544",
        "tenant_key": "2ca1d211f64f6438"
    },
    "event": {
        "reader": {
            "reader_id": {
                "union_id": "on_8ed6aa67826108097d9ee143816345",
                "user_id": "e33ggbyz",
                "open_id": "ou_84aad35d084aa403a838cf73ee18467"
            },
            "read_time": "1609484183000",
            "tenant_key": "736588c9260f175e"
        },
        "message_id_list": [
            "om_dc13264520392913993dd051dba21dcf"
        ]
    }
}
```

### 5.6 im.message.recalled_v1（recalled 页逐字）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "5e3702a84e847582be8db7fb73283c02",
        "event_type": "im.message.recalled_v1",
        "create_time": "1608725989000",
        "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        "app_id": "cli_9f5343c580712544",
        "tenant_key": "2ca1d211f64f6438"
    },
    "event": {
        "message_id": "om_dc13264520392913993dd051dba21dcf",
        "chat_id": "oc_5ad11d72b830411d72b836c20",
        "recall_time": "1615380573411",
        "recall_type": "message_owner"
    }
}
```

`recall_type`：`message_owner`（本人）/`group_owner`（群主）/`group_manager`（管理员）/`enterprise_manager`（企业管理员）。

### 5.7 contact.user.deleted_v3（deleted 页逐字，事件体节选结构）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "5e3702a84e847582be8db7fb73283c02",
        "event_type": "contact.user.deleted_v3",
        "create_time": "1608725989000",
        "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        "app_id": "cli_9f5343c580712544",
        "tenant_key": "2ca1d211f64f6438"
    },
    "event": {
        "object": {
            "open_id": "ou_7dab8a3d3cdcc9da365777c7ad535d62",
            "union_id": "on_2b832a8c219b087c57208039282c0aa3",
            "user_id": "e33ggbyz",
            "name": "John",
            "en_name": "San Zhang",
            "nickname": "Sunny Zhang",
            "email": "zhangsan@gmail.com",
            "enterprise_email": "demo@mail.com",
            "job_title": "software engineer",
            "mobile": "12345678910",
            "gender": 1,
            "avatar": {
                "avatar_72": "https://foo.icon.com/xxxx",
                "avatar_240": "https://foo.icon.com/xxxx",
                "avatar_640": "https://foo.icon.com/xxxx",
                "avatar_origin": "https://foo.icon.com/xxxx"
            },
            "status": {
                "is_frozen": false,
                "is_resigned": false,
                "is_activated": true,
                "is_exited": false,
                "is_unjoin": false
            },
            "department_ids": [
                "od-4e6ac4d14bcd5071a37a39de902c7141"
            ],
            "leader_user_id": "ou_3ghm8a2u0eftg0ff377125s5dd275z09",
            "city": "Hangzhou",
            "country": "China",
            "work_station": "Hangzhou",
            "join_time": 1615381702,
            "employee_no": "e33ggbyz",
            "employee_type": 1,
            "orders": [
                {
                    "department_id": "od-4e6ac4d14bcd5071a37a39de902c7141",
                    "user_order": 100,
                    "department_order": 100,
                    "is_primary_dept": true
                }
            ],
            "custom_attrs": [
                {
                    "type": "TEXT",
                    "id": "DemoId",
                    "value": {
                        "text": "DemoText",
                        "url": "http://www.fs.cn",
                        "pc_url": "http://www.fs.cn",
                        "option_id": "edcvfrtg",
                        "option_value": "option",
                        "name": "name",
                        "picture_url": "https://xxxxxxxxxxxxxxxxxx",
                        "generic_user": {
                            "id": "9b2fabg5",
                            "type": 1
                        }
                    }
                }
            ],
            "job_level_id": "mga5oa8ayjlp9rb",
            "job_family_id": "mga5oa8ayjlp9rb",
            "dotted_line_leader_user_ids": [
                "od-4e6ac4d14bcd5071a37a39de902c7141"
            ]
        },
        "old_object": {
            "department_ids": [
                "od-4e6ac4d14bcxxxx"
            ],
            "open_id": "ou_xxxxxxxxxx"
        }
    }
}
```

### 5.8 approval.approval.updated_v4（custom-approval-event 页模板结构，ID 为示意填充非原文）

```json
{
  "schema": "2.0",
  "header": {
    "event_id": "b53e80a132ec090ba249a8bb74da0123",
    "token": "ijuh4XAlBSRUIwhBFtLDSfWnIC61234",
    "event_type": "approval.approval.updated_v4",
    "app_id": "cli_xxx",
    "tenant_key": "d6ae59e175fxxx",
    "event_create_time": "1502199207.7171419"
  },
  "event": {
    "object": {
      "approval_id": "74333067777841234",
      "approval_code": "5B43240B-848C-49BD-9D27-11EF0EE11234",
      "version_id": "7459343285667611234",
      "widget_group_type": 0,
      "form_definition_id": "7459341670005371234",
      "process_obj": "{\"lineList\": xxx}",
      "timestamp": "1736763698",
      "extra": ""
    }
  }
}
```

（官方页示例字段均为空字符串模板，header 用 event_create_time 而非 create_time，照录模板语义即可，勿当回归向量；`event_create_time` 置于 header 内且 `timestamp` 为字符串型秒级，逐字保留。）

### 5.9 im.chat.member.bot.added_v1（added 页逐字）

```json
{
    "schema": "2.0",
    "header": {
        "event_id": "5e3702a84e847582be8db7fb73283c02",
        "event_type": "im.chat.member.bot.added_v1",
        "create_time": "1608725989000",
        "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        "app_id": "cli_9f5343c580712544",
        "tenant_key": "2ca1d211f64f6438"
    },
    "event": {
        "chat_id": "oc_413871888e0d5492e25b173f0812efb7",
        "operator_id": {
            "union_id": "on_8ed6aa67826108097d9ee143816345",
            "user_id": "e33ggbyz",
            "open_id": "ou_84aad35d084aa403a838cf73ee18467"
        },
        "external": false,
        "operator_tenant_key": "72ud6639",
        "name": "Group name testing",
        "i18n_names": {
            "zh_cn": "群聊",
            "en_us": "group chat",
            "ja_jp": "グループチャット"
        }
    }
}
```

### 5.10 发送消息请求/响应（create 页逐字）

请求：`POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id|user_id|union_id|email|chat_id`，头 `Authorization: Bearer <tenant_access_token|user_access_token>` + `Content-Type: application/json; charset=utf-8`。

```json
{
    "receive_id": "ou_7d8a6e6df7621556ce0d21922b676706ccs",
    "msg_type": "text",
    "content": "{\"text\":\"test content\"}",
    "uuid": "a0d69e20-1dd1-458b-k525-dfeca4015204"
}
```

`msg_type`：`text/post/image/file/audio/media/sticker/interactive/share_chat/share_user/system`。`content` 为 JSON 序列化字符串（文本 ≤150KB，卡片/富文本 ≤30KB）。`uuid` 为发送去重键（相同 uuid 1 小时内最多成功发送一条）。

响应（逐字节选，`message_id` 为后续管理操作键）：

```json
{
    "code": 0,
    "msg": "success",
    "data": {
        "message_id": "om_dc13264520392913993dd051dba21dcf",
        "root_id": "om_40eb06e7b84dc71c03e009ad3c754195",
        "parent_id": "om_d4be107c616aed9c1da8ed8068570a9f",
        "thread_id": "omt_d4be107c616a",
        "msg_type": "interactive",
        "create_time": "1615380573411",
        "update_time": "1615380573411",
        "deleted": false,
        "updated": false,
        "chat_id": "oc_5ad11d72b830411d72b836c20",
        "sender": {
            "id": "cli_9f427eec54ae901b",
            "id_type": "app_id",
            "sender_type": "app",
            "tenant_key": "736588c9260f175e"
        },
        "body": {
            "content": "{\"text\":\"@_user_1 test content\"}"
        },
        "mentions": [
            {
                "key": "@_user_1",
                "id": "ou_155184d1e73cbfb8973e5a9e698e74f2",
                "id_type": "open_id",
                "name": "Tom",
                "tenant_key": "736588c9260f175e"
            }
        ],
        "upper_message_id": "om_40eb06e7b84dc71c03e009ad3c754195"
    }
}
```

### 5.11 tenant_access_token 请求/响应（tenant_access_token_internal 页逐字）

请求：`POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`，`Content-Type: application/json; charset=utf-8`。

```json
{
    "app_id": "cli_slkdjalasdkjasd",
    "app_secret": "dskLLdkasdjlasdKK"
}
```

响应：

```json
{
    "code": 0,
    "msg": "ok",
    "tenant_access_token": "t-caecc734c2e3328a62489fe0648c4b98779515d3",
    "expire": 7200
}
```

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `tenant_access_token`（自建应用） | `POST /open-apis/auth/v3/tenant_access_token/internal`，body `{app_id, app_secret}` | 最长 2 小时（`expire: 7200`）；剩余有效期 <30 分钟时调用发新 token（新旧并存），≥30 分钟返回原 token——应缓存复用 | §5.11 全文 |
| `tenant_access_token`（商店应用） | app_ticket 体系换取 | — | `[本地]` 11-feishu.md §3.1（全文待核验(09-27)） |
| `user_access_token` | OAuth 2.0 授权码模式 | 需用户授权同意 | overview 订阅身份节全文 + `[本地]` 11-feishu.md §2.3 |
| `app_id` / `app_secret` | 创建应用即得（开发者后台 > 凭证与基础信息 > 应用凭证） | 长连接 client 初始化参数；验签不直接用 secret（用 Encrypt Key） | 长连接页全文 |
| `Verification Token` / `Encrypt Key` | 事件与回调 > 加密策略页查看/重置/编辑 | Token 明文比对；Key 参与 sha256 签名+AES | §4 全文 |
| 调用传参 | `Authorization: Bearer <tenant_access_token\|user_access_token>` | 发消息支持双 token；`receive_id_type` 决定 ID 类型 | create 页全文 |
| 发送去重 | 请求体 `uuid`（≤50 字符） | 相同 uuid 1 小时内最多成功一条 | create 页全文 |
| 频控（已核验片段） | 发消息接口限流 | 同一用户 5 QPS；同一群 5 QPS（群内机器人共享）；`230020` 触发限流；`230025` 超长 | create 页全文 |
| 频控（体系） | 等级 1–11/21 + 特殊频控；429（旧 400）+ code 99991400 + 头 `x-ogw-ratelimit-limit`/`x-ogw-ratelimit-reset`；**消息、群组、多维表格三类不支持申请提频**；自定义机器人 webhook 100 次/分钟、5 次/秒 | — | `[本地]` 11-feishu.md §2.21（官方频控页口径，全文待核验(09-27)） |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **群事件全文**：`im.chat.member.bot.deleted_v1`、`im.chat.member.user.added_v1`、群更新/解散、v1.0 `p2p_chat_create` 现状（是否仍可订阅）。→ 待核验(09-27)
2. **审批 v4 事件精确 type 名与事件体**：实例状态变更/任务状态变更/抄送状态变更/请假加班出差换班外出等特殊事件（仅 `approval.approval.updated_v4` 有名实锤；`status_changed` 路径页未取全文）。→ 待核验(09-27)
3. **通讯录其余事件全文**：user created/updated、department created/updated/deleted、scope/custom_attr/employee_type_enum。→ 待核验(09-27)
4. **日历/视频会议/任务/服务台/招聘/门禁事件全文**（§2.5，`[本地]` 仅路径级）。→ 待核验(09-27)
5. **商店应用凭证体系全文**：app_ticket 获取与 tenant_access_token（商店版）换取流程。→ 待核验(09-27)
6. **频控表全文直抓**：`server-docs/api-call-guide/frequency-control`（等级表/不可提频原文）。→ 待核验(09-27)
7. **challenge 时限口径**：现行事件页 1s vs 历史卡片页 3s（§3.2 已照录双口径；模拟器按 1s 实现、兼容 3s）。→ 待核验(09-27)
8. **历史卡片 sha1(Token) 验签现行有效性**（§4.4，历史文档自声明不再维护）。→ 待核验(09-27)
9. **`message_type`（message_content）全表**：文本/图片/富文本/卡片/文件等 `content` 结构。→ 待核验(09-27)
10. **事件全量**：动态目录无静态枚举，57 页为 `[本地]` 保守下限。→ 待核验(09-27)
11. **准入链路**：个人注册→免费建团队（租户）→建企业自建应用→管理员自审批跑通收发（`[本地]` cn-others.md §一.8 + 11-feishu.md §3；控制台流程页未直抓，ISV 商店应用需企业资质为官方原文已核验）。→ 待核验(09-27)
12. **官方 SDK 仓库直验**：`larksuite/oapi-sdk-*` GitHub 本体（包名出自官方文档，仓库内容未取）。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"飞书推事件给回调"：`POST` JSON 信封 `{schema:"2.0", header:{event_id,event_type,create_time(毫秒字符串),token,app_id,tenant_key}, event:{...}}`，头 `X-Lark-Request-Timestamp`（字符串）、`X-Lark-Request-Nonce`、`X-Lark-Signature: hex(sha256(timestamp+nonce+encrypt_key+原始body))`、`Content-Type: application/json`。
- 模拟加密事件：body 仅 `{"encrypt": base64(AES-256-CBC(key=sha256(encrypt_key), iv=前16B, 明文))}`；样例 `P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk=`（key=`test key`）→ `hello world`，可作加解密回归向量。
- 模拟首次配置校验：`POST {"challenge":"<同值>","token":"<token>","type":"url_verification"}`（加密时为 `{"encrypt":...}`），期望 1s 内响应 `{"challenge":"<同值>"}`。
- ID 形态：`app_id: cli_*`；`open_id: ou_*`；`user_id` 短串；`union_id: on_*`；`message_id: om_*`；`chat_id: oc_*`（单聊/群）；`tenant_key` 十六进制短串；`create_time` 毫秒字符串（如 `1608725989000`）。
- 重试语义：3s 内无 HTTP 200 即按 15s/5m/1h/6h 重推，最多 4 次；至少一次投递，消费方按 `header.event_id`（消息按 `message_id`）幂等；部分事件有序（阻塞排队）。
- 长连接模拟：`wss` 全双工，明文推送、零验签；约束：仅自建应用、≤50 连接、集群随机投递其一、成功打印 `connected to wss://...`。
- 勘误（相对起点线索）：已读事件真名 `im.message.message_read_v1`；撤回事件真名 `im.message.recalled_v1`；challenge 现行口径为 1s（卡片旧页 3s）。
