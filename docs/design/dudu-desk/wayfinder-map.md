## Destination

复用 Server 现有基础数据，确定覆盖 DuduDesk 已认可功能的最小三表结构、HTTP 接口和 Socket 报文，使实施能够开始。2026-10-10 已完成规划，业务实施转入下方 Spec 与实施票

## Notes

- 用户认可现有桌面功能，要求收简的是实现方式，不得借简化删减功能
- 先接通整条业务线；采用三表、普通查询/保存、直接通知和重连重新查询，禁止为未发生的问题预建额外状态、重试、重放、增量对账、冲突协商或补偿平台
- 当前发送仅纯文本，附件发送按用户先前决定延期；收到的非文本消息继续展示
- 复用六张基础表、企业/组权限、无状态 JWT、服务器本地时间和已有依赖；不加外键，不改历史迁移，不改消息虚拟滚动
- [对接 Spec](https://github.com/Buktal/dudu/issues/84)保持开放直到实施完成；业务票按企业登录至重连的一条顺序执行。规划票完成不能当成业务完成
- 本地单一实施契约为 docs/design/dudu-desk/implementation-contract.md；完整功能/实现核对为 implementation-simplification.md，实施顺序为 ticket-breakdown.md，均位于同目录

## Decisions so far

- [Desk 的来访身份、固定会话和个人状态怎样最少落表？](https://github.com/Buktal/dudu/issues/79)：三表、固定会话、共享状态与名片，取消个人阅读记录和星标；后续覆盖提示按最终契约
- [Desk 消息怎样记录发送结果、去重与待回复状态？](https://github.com/Buktal/dudu/issues/80)：直接发送、三态持久结果、结果一次通知，撤回额外可靠投递协议
- [Desk 入站媒体与渠道原始数据最少保留什么？](https://github.com/Buktal/dudu/issues/81)：统一消息内容与渠道现有引用，不预建自有文件平台
- [Desk 查询、版本和断线恢复需要哪些最少的持久化数据？](https://github.com/Buktal/dudu/issues/82)：普通列表分页、按需历史、既有版本合并、重连重新初始化
- [Desk 最终表结构与前端字段怎样逐项对齐？](https://github.com/Buktal/dudu/issues/83)：三表字段/索引、接口、报文与前端映射完整定稿，进入逐项实施

## Not yet specified

当前规划目标内没有继续阻塞开工的设计讨论。真实实施中遇到实际问题再就地修复，不恢复已撤回的复杂方案

## Out of scope

- [DuduDesk：附件准备与发送能力同步](https://github.com/Buktal/dudu/issues/93)：用户要求先纯文本，本轮延期，不表示已实现
- 个人星标/已读、会话认领、所有权复制、历史权限快照、每次接待新会话
- 重做 Admin、开发新的 Console 管理功能、CRM、AI、计费、统计平台、偏好/草稿跨设备同步
- 未确认发送状态、发送核实/自动重试、事件平台、持久恢复水位、重放、增量对账、补偿任务和并发协调框架
