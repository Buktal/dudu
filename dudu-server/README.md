# DUDU Server

Spring Boot 3.5 / Java 21 后端。基础能力（统一返回、业务异常、JWT 认证与参数注入、校验分组、MyBatis-Plus 分页与时间填充）之外，已提供 DuduAdmin 首版全部后端接口：平台登录、企业管理（开通、编辑、停用恢复、ID 候选与检测、重置初始管理员密码、资源汇总）、运营概览与操作记录查询。企业侧已按 [Desk 认证子契约](../docs/design/dudu-desk/ticket-01-login.md)实现 DuduDesk 企业登录、身份恢复与无状态退出（`/api/desk/login`、`/api/desk/profile`、`/api/desk/logout`），返回企业员工身份与当前接待范围；访客侧已实现授权范围内的摘要查询、单访客快照、按需历史分页、纯文本回复、共享名片读写、结束／继续接待与消息媒体按需读取（`POST /api/desk/visitors/query`、`GET /api/desk/visitors/{visitorId}`、`GET /api/desk/visitors/{visitorId}/messages`、`POST /api/desk/visitors/{visitorId}/messages`、`GET /api/desk/visitors/{visitorId}/capability`、`GET/PUT /api/desk/visitors/{visitorId}/profile`、`PUT /api/desk/visitors/{visitorId}/status`、`GET /api/desk/messages/{messageId}/media`），并随首张访客票建立 visitor、visitor_profile、message 三表；来信侧已实现**微信公众号（明文模式）回调入口** `/api/channels/{companyChannelId}/callback`（GET 验签回显 echostr、POST 验签解析 XML 入站）与入站管道（找到或创建访客与空名片、原子分配 sequence、更新最后摘要与待回复状态），事务提交后经 `/ws/desk` 实时网关向当前有权员工推送完整 message 报文（网关另发 conversation、profile 与权限范围变化报文）；员工-组与账号-组关系在管理端写入后向本企业已连接员工广播 `{"type":"access-changed"}`，各工作区据此重查身份与列表。渠道接入范围如实记录为 13 个渠道适配器（与 Console 渠道目录一致，`channel/` 下每渠道一个 Adapter）：回调接入公众号明文模式（协议事实见 [docs/research/channels/wechat-mp.md](../docs/research/channels/wechat-mp.md)，可用 mock-pulse 的 wechat-mp 剧本做受控替身；兼容/安全模式需 EncodingAESKey 解密，未接入按不支持处理）与企业微信自建应用 agent 通道（echostr 握手 + AES 密文信封，凭 `corpId`/`token`/`encodingAesKey`；`system=aibot` JSON 通道暂不接入；协议事实见 [docs/research/channels/wecom.md](../docs/research/channels/wecom.md)，可用 mock-pulse 的 wecom 剧本做受控替身）与 QQ 机器人 op13 握手 + Ed25519 验签推送（解析 C2C/群/频道消息事件并按场景前缀标记访客身份，关系链事件只应答；协议事实见 [docs/research/channels/qq.md](../docs/research/channels/qq.md)）与美团合作中心推送（POST 表单全量参签、待签串含按路由重建的完整回调 URL，IM 单聊按 push_content 解析入站、订单/门店及未知表单只应答；协议事实见 [docs/research/channels/meituan.md](../docs/research/channels/meituan.md)）与 WhatsApp Cloud API 推送（GET 三参 `hub.mode`/`hub.verify_token` 握手裸回 `hub.challenge` 纯文本、POST 按原始字节验 `X-Hub-Signature-256`，`messages[]` 按 type 映射统一消息体落库、statuses 与管理面字段变更只应答；协议事实见 [docs/research/channels/whatsapp.md](../docs/research/channels/whatsapp.md)）与 Telegram Bot API webhook（官方无 challenge 握手、GET 验证阶段按不支持应答，POST Update 推送按 `X-Telegram-Bot-Api-Secret-Token` 头与配置 secretToken 常量时间原样比对验签，`message` 文本与媒体按契约统一落库并以 `update_id` 为幂等键，其余事件族只应答；协议事实见 [docs/research/channels/telegram.md](../docs/research/channels/telegram.md)）；飞书接入 POST `url_verification` 握手回显 `challenge`（明文模式比对报文 `token`、配 Encrypt Key 时验 `X-Lark-Signature` 并 AES-256-CBC 解密信封，`im.message.receive_v1` 消息事件以 `message_id` 为幂等键落库；协议事实见 [docs/research/channels/feishu.md](../docs/research/channels/feishu.md)，可用 mock-pulse 的 feishu 剧本做受控替身）与支付宝生活号（无 GET 验证阶段，POST 表单网关验证握手验签通过回签名 XML 信封激活开发者模式，被动通知按 MsgType 落库并回无签名 XML ack，无 biz_content 的支付类表单推送验签通过按 success 应答；协议事实见 [docs/research/channels/alipay.md](../docs/research/channels/alipay.md)）与微信小程序客服会话（明文模式三参 sha1 验签，兼容/安全模式按四参 msg_signature 验签并 AES 解密信封、尾部 AppID 校验，XML/JSON 数据格式二选一，text/image/miniprogrampage 三包与进入会话事件按官方包解析；协议事实见 [docs/research/channels/wechat-mini.md](../docs/research/channels/wechat-mini.md)）与钉钉 httpCrypto 密文通道（无 GET URL 验证阶段，check_url 以加密事件形态走 POST，验签解密失败一律拒绝，机器人消息解析落库且应答加密 success 包；协议事实见 [docs/research/channels/dingtalk.md](../docs/research/channels/dingtalk.md)）与抖音 Webhooks（verify_webhook 握手与事件推送共用 `X-Douyin-Signature`（sha1(client_secret + body)）验签，握手按数字 challenge 原样回显；协议事实见 [docs/research/channels/douyin.md](../docs/research/channels/douyin.md)）与微博（验签密钥为 App Secret 的三参 sha1 验签，JSON 明文推送按官方要求 200 空串应答不重试；协议事实见 [docs/research/channels/weibo.md](../docs/research/channels/weibo.md)）与小红书（GET query 四参握手，推送全为加密 JSON 信封、四参 MsgSignature 验签解密并校验明文尾部 appId；协议事实见 [docs/research/channels/xiaohongshu.md](../docs/research/channels/xiaohongshu.md)）；事件推送只应答不落库，bilibili 仅保留渠道码值、未接入适配器，创建账号按不支持拒绝；出站发送接入公众号客服消息纯文本（凭 `appId`/`appSecret` 换取 access_token 后调 `/cgi-bin/message/custom/send`，成功以 `errcode=0` 为准）与企业微信应用消息纯文本（凭 `corpId`/`corpSecret`/`agentId` 换取 token 后调 `/cgi-bin/message/send`，成功保存返回的 `msgid`，接口地址可用 `dudu.channel.wecom.api-base` 覆盖）与 QQ 单聊/群纯文本主动消息（凭 `appId`/`appSecret` 换取 token 后按场景路由 `/v2/users|/v2/groups/{openid}/messages`，成功保存返回的 `id`，频道会话要求 WS 在线、如实受限；接口地址可用 `dudu.channel.qq.api-base` 覆盖）与美团 IM 消息纯文本（`POST msg/send` 表单全参参签，成功以家族错误形状缺席为准、接口不返回消息标识；接口地址可用 `dudu.channel.meituan.api-base` 覆盖）与 WhatsApp 纯文本消息（凭 `accessToken`/`phoneNumberId` 带 Bearer 调 `/v23.0/{phone_number_id}/messages` 下发 `{type:"text",text:{body}}`，成功保存 `messages[0].id`（wamid）作渠道消息标识，渠道 error 原样落库；接口地址可用 `dudu.channel.whatsapp.api-base` 覆盖）与 Telegram sendMessage 纯文本（`channel_info` 的 url 为含 `/bot<token>` 路径段的 Bot API 基址、token 走 URL 路径鉴权，`POST {url}/sendMessage` 下发 `{chat_id, text}`，成功以 2XY 且 `ok=true` 为准并取 `result.message_id` 作渠道消息标识，`ok:false` 错误包络含 429 频控 `retry_after` 原样落库）；飞书文本消息凭 `appId`/`appSecret` 换取 `tenant_access_token`（缓存复用，剩余不足 30 分钟换新）后调 `/open-apis/im/v1/messages?receive_id_type=open_id`，成功以 `code=0` 为准并取 `data.message_id` 作渠道消息标识；出站发送覆盖全部 13 渠道的纯文本回复器，其余渠道为小程序/微博/小红书客服消息主动回复与支付宝客服消息、钉钉机器人消息与抖音用户授权类消息接口（可用性随 refreshToken 如实回答），未配置凭据的账号一律如实返回不可发，不做自动重试与后台投递队列；消息媒体按需读取同样覆盖 13 渠道（公众号与小程序/企业微信临时素材、飞书消息资源协议层复合标识 `message_id:file_key:type`、WhatsApp 两步代理下载 `GET /v23.0/{media_id}` 换 5 分钟临时 url 再带 Bearer 取回字节、Telegram 凭消息中已存 file_id 经 `{url}/getFile` 换 `file_path` 后从 `/file/bot<token>/<file_path>` 取回、QQ 附件 url 直读、微博粉服 msget、支付宝/钉钉/抖音素材下载与小红书素材链接下载，上传 ≤50MB/下载 ≤20MB 等渠道自身超限如实拒绝）；断线重连由 Desk 自动重连后重新执行同一初始化查询，Server 不提供差量恢复接口。

## 开发入口

Console 企业管理接口已按[Console 数据契约](../docs/design/dudu-console/data-contract.md)实现：企业管理员认证与个人改密、初始管理员员工维护、按管理范围的用户组/成员维护，以及现有13种渠道账号的安全配置与换组。写入在企业行锁后重验实时身份与范围；凭据只写不读回，权限变更在事务提交后复用 Desk `access-changed` 通知。联调与生产验证边界见[Console 验收记录](../docs/design/dudu-console/acceptance.md)。

- [总体设计与阶段计划](../docs/design/dudu-server/README.md)：已确认模型、Admin 优先交付和待定问题。
- [功能图谱](../docs/features/dudu-server.md)：模块入口、行为和验证范围。
- [Admin 数据契约](../docs/design/dudu-admin/data-contract.md)：接口字段与错误码契约，首版后端按此实现。
- [Desk 最小对接契约](../docs/design/dudu-desk/implementation-contract.md)：已实现的三表、HTTP、Socket 与前端映射；企业认证字段见[认证子契约](../docs/design/dudu-desk/ticket-01-login.md)。
- [统一返回决策](../docs/adr/0006-always-200-segmented-error-codes.md)。
- [认证决策](../docs/adr/0007-jwt-auth-chain.md)。

Controller 通过 `@Me JwtUser user` 获取 token 载荷，所需类型均在 `config.auth`。响应体 `R` 与分页响应 `P`（平铺 code/msg/list/total/page/pageSize）位于 `common`，业务异常位于 `config.exception`。Admin 接口位于 `controller/admin/`，统一前缀 `/api/admin`，仅 `admin` 角色可访问（登录端点除外）；Desk 接口位于 `controller/desk/`，统一前缀 `/api/desk`，仅企业员工（`console`/`user`）可访问（登录端点除外），平台身份访问 Desk 资源返回 10106；渠道回调位于 `controller/channel/`，只开放 `/api/channels/*/callback` 且走渠道自身签名校验，不使用 Desk JWT，响应按渠道协议返回（echostr / success）而不套 R 包装；`/ws/desk` 实时网关在 `socket/`，连接后以 auth 报文完成同一套认证。数据库操作优先使用 MyBatis-Plus `IService` 与 Lambda 条件构造器，不新增 XML 或注解 SQL。

## 配置与检查

- 使用 Java 21 和 Maven，在本目录运行 `mvn clean test`。
- 密钥与数据源明文写在 `application.yaml`（本地开发默认值，开箱即跑）。生产在 jar 同目录 `.env` 用同名键覆盖（`dudu.auth.jwt-secret` 至少 32 字节随机值）；空白密钥仍启动失败，但漏写 `.env` 时应用会以开发密钥静默启动，部署时须人工核对。
- 首个平台管理员在启动时初始化：库中无平台账号时以 `AdminInitializer` 内置凭据 `admin`/`admin` 创建（不是生产凭据，首登后经改密接口更换）。改密接口要求新密码 8–72 字符；初始化凭据不做该长度校验。
- 数据源为 `application.yaml` 明文默认值（`127.0.0.1:3306`、`dudu`/`123456`），无 `.env`、无环境变量直接跑；生产覆盖方式见「线上部署边界」。
- 公众号接口地址配置键已随 V5 渠道码值迁移更名为 `dudu.channel.wechat-mp.api-base`（旧键 `dudu.channel.wechat.api-base` 不再读取）：从旧版本升级的存量部署须同步改名 `.env` 中的覆盖键，否则覆盖静默失效、回落官方域名。
- `/api/**` 默认需要 `Authorization: Bearer <token>`；放行路径为 `POST /api/admin/login`、`POST /api/desk/login` 与渠道回调 `/api/channels/*/callback`，`/api/admin/**` 叠加 admin 角色校验，`/api/desk/**` 叠加企业员工身份校验。
- 公众号回调验签读取账号 `company_channel.channel_info` 中的 `token` 键（服务器配置 Token），未配置该键的账号返回不支持；飞书回调读取 `appId`/`verificationToken`（必填）与 `encryptKey`（可选）：明文模式比对报文 `token`，配 `encryptKey` 时验 `X-Lark-Signature`（sha256(timestamp+nonce+encryptKey+body)）并解密信封；接口地址可用 `dudu.channel.feishu.api-base` 覆盖为受控替身；企业微信回调读取 `corpId`/`token`/`encodingAesKey` 三键（缺任一返回不支持，`corpSecret` 仅发送与素材需要，不影响回调验签解密）；Telegram 回调读取 `url`/`secretToken` 两键（缺 `secretToken` 返回不支持，头值与配置常量时间原样比对；url 为含 `/bot<token>` 路径段的 Bot API 基址，发送与素材同源取用）；`/ws/desk` 由连接后的 `{"type":"auth","token":…}` 报文认证，不属于 `/api/**` 拦截链。- 业务表由 Flyway 版本化迁移维护（当前 V6：V1–V2 建立 company、user、operation_log、user_group、user_group_member、company_channel 六张基础表，V3 移除全部外键，V4 新增 visitor、visitor_profile、message 三张访客会话表，V5 将公众号渠道码值 `wechat` 统一为 `wechat-mp`，V6 为 message 增加 (visitor_id, external_message_id) 唯一索引收敛渠道重推幂等）；已提交迁移不可变，变更新增迁移。

## 本地 MySQL

[compose.yaml](compose.yaml) 是 Server 的开发环境配置，固定使用 MySQL 8.4.11 LTS；不是 Docker Desktop 的全局设置，也不是生产部署清单。数据库为 `dudu`，应用账号为 `dudu`，默认只监听 `127.0.0.1:3306`，字符集为 `utf8mb4`。

在本目录操作：

1. 安装并启动 Docker Desktop 的 Linux 引擎。Windows 采用 WSL 2 后端，只需 WSL 运行环境，无需额外安装 Ubuntu；首次启用 Windows 虚拟机组件后须重启。
2. 直接启动即可：应用与容器默认都用本地开发口令 `123456`，无需任何 `.env`。
3. 运行 `docker --context desktop-linux compose up -d --wait`，再用 `docker --context desktop-linux compose ps` 查看健康状态。Linux 主机通常省略 `--context desktop-linux`。
4. 在本目录运行 `mvn spring-boot:run`。dudu-admin 开发服务器将 `/api` 同源代理到 8080（见其 `vite.config.ts`），无需任何 profile 或跨域配置；IDE 启动时将工作目录设为 `dudu-server`。连接使用 TLS。

日常停止使用 `docker --context desktop-linux compose stop`，恢复使用 `docker --context desktop-linux compose up -d --wait`。命名卷 `mysql-local-data` 保存数据，普通 `compose down` 不会删除它；不要给日常停止命令添加 `--volumes`。MySQL 初始化变量仅在空数据目录首次启动时生效，修改 `.env` 不会修改已有数据库账号密码。

本机 Docker 程序和数据盘沿用默认 C 盘位置，项目中的 Compose 只保存运行定义。MySQL 命名卷位于 Docker 的 Linux 数据盘内，不直接将 Windows 目录绑定到 `/var/lib/mysql`。这保留 Linux 文件系统语义，也避免数据库频繁读写跨越 Windows 文件共享层。

2026-09-29 已验证 MySQL 8.4.11 健康、Server 实际连接及容器重建后的数据保留。Flyway 11.7.2 对 MySQL 8.4 输出「超出已测试版本」提示，经 2026-09-30 实测仅警告不阻断：V1 业务表空库迁移与重启幂等（up to date）均通过，Admin 首版接口已在本地库完成全场景验收，详细范围见[功能图谱](../docs/features/dudu-server.md)。

## 线上部署边界

生产部署形态为 jar + 服务器本地 `.env`（新建空文件、不进 Git；键与 `application.yaml` 同名，写哪行覆盖哪项，不写的落到开发默认值）：

```
spring.datasource.url=jdbc:mysql://<主机>:3306/dudu?sslMode=REQUIRED&connectionTimeZone=Asia/Shanghai&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8
spring.datasource.username=dudu
spring.datasource.password=<正式口令>
dudu.auth.jwt-secret=<openssl rand -hex 32 生成>
```

在 `.env` 所在目录 `java -jar` 启动。注意：漏写 `dudu.auth.jwt-secret` 时应用会以开发密钥静默启动（不再 fail-fast），上线清单必须核对这一行。换服务器只需迁移 jar 与 `.env` 两个文件。服务端不做 CORS：前端开发走 Vite 同源代理，生产同源部署或由网关（如 Nginx）加 CORS 头。数据库尽量与开发使用相同的 8.4 补丁版本，配置私网访问、备份及恢复验证，并按实际负载确定资源和连接池。业务表仍由 Flyway 版本化迁移维护。

Console 展示的公网回调地址通过 `dudu.channel.callback-base-url=https://callbacks.example.com` 配置，只接受协议、主机和可选端口，不带路径或尾部斜杠。未配置时仅使用服务端请求的 origin，不代表公网可达；美团要求显式配置 HTTP 且端口为80或8080的实际入口，HTTPS-only部署不开放该渠道。

## 数据库集成测试

`mvn test` 默认跳过门闩集成用例。显式执行需设置 `DUDU_INTEGRATION_TEST=true`、`DUDU_TEST_JDBC_URL`、`DUDU_TEST_DB_USER` 和 `DUDU_TEST_DB_PASSWORD`；连接本地常驻 MySQL 的独立 `dudu_review_*` 库，评审用户的创建与授权语句见 [compose.yaml](compose.yaml)。禁止使用开发库 `dudu` 或生产业务库。

各用例的库名与清理约定以测试类及[Server 功能图谱](../docs/features/dudu-server.md)为准；部分渠道要求固定独立库，不能用同一个 URL 无差别执行全部集成用例。Console 的实际命令边界与结果见[验收记录](../docs/design/dudu-console/acceptance.md)。

## 坐席 AI 助手

GET /api/desk/assistant 返回企业助手可用状态，POST /api/desk/visitors/{visitorId}/assistant 基于已授权会话的近期文本、标签、内部备注和本次草稿执行真实模型请求，完成时重新核验接待权限与配置修订

V9 在 translation_setting 增加 assistant_service，既有企业默认未启用，由初始企业管理员在 Console 独立指定通用模型；复用现有凭据加密、HTTP 出站及并发限制，AI 问答不落库

AssistantMigrationTest 覆盖空库和 V8 升级，使用 dudu_review_assistant 系列独立评审库；本机 Docker Linux 引擎不可用，迁移尚未实测

## 翻译配置

V8 新增企业翻译配置和坐席偏好，部署后在 Console 的翻译服务页面填写企业自有地址与凭据并测试连接，Desk 在工作台设置启用自动翻译或逐条点击翻译

可用 dudu.translation.secret 指定至少 32 字符的稳定加密密钥，缺省从 JWT 密钥派生，改密钥前应保留原值，否则需要重新配置企业翻译服务；可信 Ollama 或私有服务部署需显式设置 dudu.translation.allow-private-endpoints=true 并控制出站网络权限

当前本机 Docker 引擎不可用，V8 空库及升级用例尚未执行；真实供应商连接仍需企业凭据验证
