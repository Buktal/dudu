# dudu-server 渠道建模：枚举一对一微信三分、wechat 码值迁移、channelInfo JSON 收窄、渠道资料通用数组

全渠道接入动工前，渠道在服务端的建模有四处悬空：ChannelEnum 粒度、存量 `wechat` 码值去向、channel_info 列的结构、渠道资料字段的形态——后续 12 张分渠道实施票都要建在这四处之上。决定：

- **枚举一对一、微信三分**：ChannelEnum 一渠道一值，粒度与渠道事实库（ADR-0008）的渠道目录一致，码值沿用 mock-pulse config.rs 的 serde 键（连字符小写）；微信按接入体系拆为公众号 `wechat-mp`、小程序 `wechat-mini`、企业微信 `wecom`，不共用宽值。值集随接入范围逐步补齐（新渠道接入即新增枚举值），fromCode 继续拒绝未知值。
- **存量码值迁移**：`wechat` 改为 `wechat-mp`，走新增 V5 迁移只 UPDATE `company_channel.channel` 一列（visitor/message 经 company_channel 关联，无冗余码值列）；枚举侧同步改为 `WECHAT_MP("wechat-mp")`。已提交迁移不可变，后续变更与回滚同样走新增迁移。
- **channel_info 保持 JSON**：不为渠道分化表结构；读取侧每渠道一个 Credentials record 收窄——沿用 WechatMpCredentials.of(CompanyChannelDO) 模式，字段对照 mock-pulse config.rs，缺失必需字段返回 null 由调用方按「该账号未配置」处理；凭据不写日志、不返回 Desk。
- **channel_fields 保持通用数组**：visitor_profile.channel_fields 维持通用 label/value 三态数组，不为渠道建专用资料结构；渠道差异由入站管道产出数组内容，Desk 原样展示与复制。

## Considered Options

- 微信共用一个宽值：被否——三套体系的回调验签、凭据与消息形态互不兼容，宽值把分派歧义埋进枚举，且 mock-pulse 侧已是三个独立 serde 键。
- channel_info 按渠道拆列/拆表：被否——渠道数量乘凭据字段演进会把结构迁移变成常态；JSON 列加读取侧 record 收窄已拿到类型安全。
- channel_fields 按渠道分化：被否——当前需求只有展示与复制，通用三态数组已覆盖。

2026-10-13 决策（issue #100），四项均经用户逐项确认。
