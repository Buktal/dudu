# Console 渠道配置字段

2026-10-20，按当前工作区实际实现定稿。路径基准：Java路径相对 `dudu-server/src/main/java/com/dudu/duduserver/channel/`，调研路径相对仓库根 `docs/research/channels/`。这份表是Console首版可编辑字段规格，不是所有官方渠道能力说明。

## 覆盖与配置语义

实际13个适配器全部列入目录；美团按[部署限制](data-contract.md#回调地址与部署)条件开放。bilibili只有枚举、没有适配器，不进入可接入选项。淘宝、饿了么等未实现的长连接协议不因目录需求而纳入。

下表 `*` 表示秘密，只写不回显。公钥虽然不是秘密，仍仅作为对应渠道配置使用。接收必需字段保存时必须齐全，发送字段允许未齐全并展示缺项；条件规则优先于简单必填标记。

| channel / 显示名 | 接收必需输入 | 发送必需输入 | 本轮限制 / 依据 |
| --- | --- | --- | --- |
| wechat-mp / 微信公众号 | token* | appId、appSecret* | 只支持明文回调；不展示公众号AES模式；wechatmp/ |
| wechat-mini / 微信小程序 | token*；密文回调还需appId、encodingAesKey* | appId、appSecret* | encodingAesKey可选，填写即要求appId；wechatmini/ |
| wecom / 企业微信 | corpId、token*、encodingAesKey* | corpId、corpSecret*、agentId | system后端固定agent，不开放aibot；wecom/ |
| qq / QQ机器人 | appSecret* | appId、appSecret* | op13握手、Ed25519事件；qq/ |
| weibo / 微博 | appSecret* | accessToken* | 接收不是自定义token，accessToken由管理员在平台取得；weibo/ |
| feishu / 飞书 | appId、verificationToken*；encryptKey*可选 | appId、appSecret* | HTTP Webhook；设置encryptKey时按现有验签解密路径；feishu/ |
| alipay / 支付宝生活号 | appId、appPrivateKey*、alipayPublicKey | 同接收 | 仅生活号体系；应用私钥与支付宝公钥分开，PEM多行输入；alipay/ |
| douyin / 抖音 | clientKey、clientSecret* | clientKey、clientSecret*、refreshToken* | 发送需已获授权refreshToken，本轮只填已有凭据，不做OAuth；douyin/ |
| xiaohongshu / 小红书 | token*、encodingAesKey*、appId | appId、appSecret* | url/system目前不由适配器读取，不作为可编辑输入；xiaohongshu/ |
| dingtalk / 钉钉 | token*、encodingAesKey*、ownerKey | appKey、appSecret*、agentId | system后端固定http_crypto，ownerKey为接收身份校验值而非secret；dingtalk/ |
| meituan / 美团 | app_id、app_secret* | 同接收 | 键名保留下划线；只开放既有HTTP入口，待签URL含实际Host；meituan/ |
| whatsapp / WhatsApp | appSecret*、verifyToken*；url由后端派生 | accessToken*、phoneNumberId | GET verifyToken和POST appSecret用途不同；api-base/version是部署配置；whatsapp/ |
| telegram / Telegram | secretToken* | botToken*（Console输入） | 持久url为秘密Bot API地址，由后端从botToken构造；无challenge GET；telegram/ |

字段规格对应各目录的 `*Credentials.java`、`*Adapter.java` 及发送/媒体读取实现；不是用一套通用token替代真实键名。目录的requiredForReceive/Send从本表产生，条件说明随notes下发。

## 秘密与输入映射

- 除表中明确的botToken映射，API fields键名等于现有channelInfo键名；非秘密值trim，密钥、密码、PEM原文保留，但全空白拒绝。普通token/ID最多4096字符，PEM字段最多16384字符，整体配置请求最多128KiB；这些是Console新输入边界，实施时由前后端共用契约并加边界用例，不冒充既有校验。
- appPrivateKey用textarea密码遮盖/展开控件，alipayPublicKey用普通多行输入；其他秘密用password控件。详情只返回configuredSecretFields，绝不返回“部分可见密钥”或原始channelInfo。
- Telegram输入的是平台给的Bot token；Console输入语法固定为 `^[0-9]+:[A-Za-z0-9_-]+$`，拒绝空白、斜杠、查询和fragment分隔符。后端仅构造 `https://api.telegram.org/bot<token>` 写到已有url，再校验scheme/host固定且无query/fragment；发送/素材实现继续复用该字段。UI和API不能输入任意出站URL；configuredSecretFields、missingSendFields和clear均统一用botToken，clear botToken删除持久url但保留下述botId，直接set/clear url或botId拒绝。老记录的url视为秘密，只表示已配置。secretToken是Webhook请求头校验用的另一个秘密。
- WhatsApp的url在现有Credentials整体校验中必需，但不是发送API地址。由服务端按账号ID和公开回调base派生并维护，详情用callbackUrl展示，用户不可自行写url。verifyToken和appSecret都不能省略。
- 钉钉固定system=http_crypto；企业微信固定system=agent。既有其他system记录如aibot只读显示“当前接入方式不受支持”，不自动转换、不将它计为接收配置齐全。
- 小红书既有url/system、通用externalAccountId等未使用键原样保留，不作为新表单字段回显。维护老配置要保留未知键，以免无关改动破坏其他消费者。
- 轮换发送凭据可以分次补齐，但保存后明确提示当前缺失字段。清除接收必需键导致最终配置不完整时整体拒绝；无需增加“半配置账号”持久状态。

## 渠道侧准备与验收

账号创建后提供只读回调地址和该渠道所需的明文/密文、token、事件订阅或授权准备说明。渠道侧操作由企业管理员完成，不向其索取平台登录密码。Console不代替渠道侧申请应用、开权限、审核或配置Webhook。

参数存在不表示渠道已授权、凭据未过期或生产可收发。首版不提供自动连接探测，不新增检测任务、轮询或“在线”状态。接入验收使用实际HTTP回调及既有mock-pulse受控对拍；真实平台生产验证另按账号条件记录。

素材能力也有不同前提：公众号/小程序用appId+appSecret；企微还要corpSecret/agentId；QQ公开签名附件无需额外素材凭据；微博用accessToken；小红书当前媒体限制依赖回调凭据token/encodingAesKey/appId而非发送appSecret；其余按适配器readMedia及mediaRestriction核实。不能用sendConfigured一项覆盖素材能力，Desk继续读取现有能力接口。

## 已配置身份字段不可换绑

下列身份键非空保存后不可修改或清除；原先缺失可首次补齐。密钥轮换允许，不改变channel或账号记录身份。冲突按12200拒绝且事务不落库；换真实外部账号使用新记录。

| 渠道 | 固定字段 |
| --- | --- |
| wechat-mp、wechat-mini、qq、feishu、alipay、xiaohongshu | appId |
| wecom | corpId、agentId |
| douyin | clientKey |
| dingtalk | ownerKey、appKey、agentId |
| meituan | app_id |
| whatsapp | phoneNumberId |
| telegram | 由Bot token数字前缀派生的channelInfo.botId；同ID可轮换秘密后半段 |
| weibo | 无可从现有配置安全解析的账号身份键 |

Telegram保存或首次维护合法旧url时在同一channelInfo内派生并保留botId。清除botToken只删url、不删botId；重新设置必须匹配该ID。该JSON派生键由服务端维护，用于防止先清除秘密再绕过账号身份保护，不是新增表/列或通用外部账号字段，不影响适配器继续读取url。

旧Telegram url无法按官方固定主机和token格式解析时，保留兼容读取但不允许原地替换或清除发送凭据，提示初始管理员新建账号；不把未知旧URL当作可任意修改的网络目标。

appId/clientKey可能只是应用标识，不足以证明授权所指账号；微博accessToken、抖音refreshToken等不透明授权也不能从本地字段证明仍指同一真实账号。编辑说明必须要求仅对同一外部账号轮换，首版不承诺自动检测这类换绑或重复接入；需要服务端核验外部归属时是后续独立能力。固定字段规则只是当前可实施的最小保护，不宣称解决了所有官方身份验证。

明确保留的限制：公众号不支持密文、企微不支持aibot、钉钉不支持Stream/旧体系；美团只在公开HTTP入口且Host一致条件下可验签。HTTPS反代不冒充已通过生产验证，当前没有自动修复该协议差异的方案。
