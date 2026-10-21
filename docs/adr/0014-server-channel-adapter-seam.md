# dudu-server 渠道适配器 seam：ChannelAdapter 单接口、注册表单点分派、凭据包内收窄、渠道子包

13 个 HTTP 回调渠道接入动工前，服务端渠道协议的组织方式需要定形：现状只有公众号一族实现，分派硬编码在回调服务（`channel != WECHAT` 即不支持）与两个静态能力类里，Desk 回复/媒体服务按类型注入单实现——多渠道后按类型注入直接失败，逐渠道分支会扩散到 4 个调用方 × 13 渠道。决定参照 mock-pulse ChannelAdapter（ADR-0001）在 Server 建统一 seam

- **单接口聚合四件套与能力**：`ChannelAdapter` 一个接口承载 `channel()` 路由键、`verifyUrl`（GET 验证，无此阶段的渠道用 default 实现应答不支持）、`receive`（验签 + 解析，事件推送返回空载荷只应答）、`send`（纯文本）、`readMedia`（入站素材）、`sendRestriction`/`mediaRestriction`（吸收 ChannelSendCapabilities/ChannelMediaCapabilities 两个静态类）。四件套口径下每渠道全做，不按原语拆接口——拆分换来的部分实现灵活性没有需求支撑。入站落库（deskInboundService.accept）留在业务层，不进 Adapter
- **注册表单点分派**：`ChannelAdapterRegistry` 构造注入全部实现，按 `channel()` 建 Map；回调、回复、媒体、能力四处调用方只查表，零渠道分支。新渠道接入 = 新建一个渠道包（Spring 自动收录），比 mock-pulse 的静态注册表再省一行手写注册
- **凭据收窄住在渠道包内**：每渠道自带 `XxxCredentials` record + `static of(CompanyChannelDO)`（泛化 WechatMpCredentials 模式），缺失必需字段返回 null 由调用方按「未配置」处理；注册表与调用方不感知凭据类型。统一凭据层在 Java 类型系统下只能退化为通配符或 instanceof，不是抽象是丢失类型
- **渠道子包与自描述类名**：`channel/` 根只留 seam（接口、注册表）与中立类型（ChannelInboundMessage、ChannelSendResult、ChannelMediaResult、ChannelCallbackResult）；每渠道一个子包 `channel/wechatmp/`、`channel/feishu/`……包内类名保留渠道前缀（WechatMpProtocol 等）——类名在日志、堆栈与 IDE 标签里脱离包名出现，13 个渠道并存的目录里前缀保自描述。现有公众号六文件迁入 `wechatmp/`，不改名
- **回调入口透传 headers**：QQ（Ed25519）、飞书（X-Lark-Signature）、钉钉（密文签名）、Telegram（X-Telegram-Bot-Api-Secret-Token）的验签材料都在 HTTP header，controller 统一入口 `/api/channels/{companyChannelId}/callback` 的 GET/POST 把 query、headers、body 原样交给 Adapter，协议差异全部住在实现内

## Considered Options

- 按原语拆 Protocol/Sender/MediaReader/Capabilities 四接口分别注册：被否——四件套口径下每渠道全做，拆表灵活性无需求；同一渠道的协议知识散在多个类型，新渠道要动四张表
- 逐渠道分派（switch/if 链）：被否——13 渠道 × 回调/回复/媒体/能力 4 处调用方的分支矩阵，且各渠道验签方法名互不相同，调用方无法统一；现有两个泛化接口名存实亡
- channel_info 统一凭据层（泛型或 Object）：被否——异构凭据字段在 Java 下必退化为 instanceof；凭据字段集是渠道协议知识，应与协议实现同居
- 渠道实现平铺 channel/ 全前缀或子包内去前缀：被否——平铺约 80 文件一层不可读；去前缀后 Protocol/TextSender 裸名在日志与堆栈里失去渠道语境

2026-10-14 决策（issue #101）。seam 形态、凭据收窄与包落位经用户授权按最优方案裁定，本 ADR 记录裁定依据供复议
