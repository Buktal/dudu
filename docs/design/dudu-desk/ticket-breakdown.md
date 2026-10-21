# DuduDesk 对接实施票索引

2026-10-10：消息、媒体、查询恢复及[最终契约](implementation-contract.md)已采用直接方案定稿。11 张已发布实施票中，附件发送延期，当前 10 张按一条业务线实施；设计完成不表示业务已实现

用户已认可的功能全部保留，实现收简见[核对记录](implementation-simplification.md)。字段/路径/报文使用[最终契约票](https://github.com/Buktal/dudu/issues/83)，各票在自己范围内贯通前后端与界面，不再等待额外重试、重放或并发方案

## 顺序与开工

| 次序 | 实施票 | 前一实施票 | 本地正文 |
| --- | --- | --- | --- |
| 1 | [企业登录与接待范围初始化](https://github.com/Buktal/dudu/issues/85) | 无，可首先开工 | [正文](ticket-01-login.md) |
| 2 | [持久访客列表、筛选与摘要查询](https://github.com/Buktal/dudu/issues/86) | 企业登录 | [正文](ticket-02-visitor-queue.md) |
| 3 | [按需对话历史与三种接待模式](https://github.com/Buktal/dudu/issues/87) | 访客列表 | [正文](ticket-03-history.md) |
| 4 | [实时来信与登录订阅衔接](https://github.com/Buktal/dudu/issues/88) | 对话历史 | [正文](ticket-04-live-incoming.md) |
| 5 | [文本回复、发送结果与共享提醒](https://github.com/Buktal/dudu/issues/89) | 实时来信 | [正文](ticket-05-text-reply.md) |
| 6 | [结束、继续与再次来信接待](https://github.com/Buktal/dudu/issues/90) | 文本回复 | [正文](ticket-06-reception-state.md) |
| 7 | [共享名片编辑与覆盖确认](https://github.com/Buktal/dudu/issues/91) | 接待状态 | [正文](ticket-07-visitor-profile.md) |
| 8 | [多类型消息与媒体查看](https://github.com/Buktal/dudu/issues/92) | 共享名片 | [正文](ticket-08-message-content.md) |
| 9 | [权限变更与工作区清理](https://github.com/Buktal/dudu/issues/94) | 消息媒体展示 | [正文](ticket-10-access-changes.md) |
| 10 | [断线后重新加载](https://github.com/Buktal/dudu/issues/95) | 权限变更 | [正文](ticket-11-recovery.md) |

[附件准备与发送能力同步](https://github.com/Buktal/dudu/issues/93)维持 not planned 关闭，含义为本轮延期，并未实现。[原范围](ticket-09-send-attachments.md)只供后续重新评估，不阻塞上述链路

当前原生前置：85 无；86←85（83 为已完成设计）；87←86；88←87；89←88；90←89；91←90；92←91；94←92；95←94。箭头右侧为前置。父 Spec 保持开放，不作为子实施票的开工阻塞

## 功能覆盖

保留 Spec 的 48 条故事，24 已改为直接的发送结果通知。原拆分编号仍对应 ticket-01 至 ticket-11；09 为延期附件票，不参与本轮覆盖

| 票 | 用户故事 | 验收场景 |
| --- | --- | --- |
| 01 | 1–5、30–31、45 | 1、14、17 |
| 02 | 3、6–9、11、17–18、47 | 1–3、6、16–17 |
| 03 | 9、11–16、19–20 | 3–4、17–18 |
| 04 | 6–8、10、14–16、17–18、31 | 2、4–6、8、14、17 |
| 05 | 19、21–27、30、40 | 7–10、15、17 |
| 06 | 6、26、28–29 | 2、9–10、17 |
| 07 | 17、32–39、47 | 6、11–12、16–17 |
| 08 | 11、41、47 | 3、15、17–18 |
| 10 | 3–5、8、44–46 | 1、14、17 |
| 11 | 14–16、30–31、36–39、42–45、47 | 4、8–9、11–18 |

故事 48 由所有实施票共同承担：如实更新已实现与未实现范围。访客票一次创建完整三表，其他票只新增必要业务实现。已有星标移除、卡片摘要、并排固定、草稿与滚动保持，不重复重写

## 验证边界

真实 Server HTTP/Socket＋独立 MySQL，两个 Desk 客户端验证正常业务同步，最后核验打包桌面；迁移验证空库和 V3 升级。完成项目已有 lint/类型/编译及与功能相关的测试，不新增重放、复杂并发、重复投递或补偿专项验收门槛

先前发布/认证解阻的记录见[历史说明](contract-unblocking-note.md)和[消息范围历史](message-scope-update.md)。早期数量和依赖是当时结果，当前正文及 GitHub 原生依赖为准

本轮发布后核验：消息、媒体、查询恢复、最终契约与规划地图均为 completed；Spec 保持开放且无开放设计阻塞。17 份远端正文与本地一致；企业登录未认领、开放阻塞数为 0，后续 9 张仅等待各自前一实施票。附件发送仍为 not_planned。48/48 故事与 18/18 场景覆盖保留，当前 10 票共 68 项核心验收；97 个本地链接及 Git 空白检查通过。本次没有修改业务代码或执行数据库/应用测试

推送前复核已补充现有失败气泡的手动重发规则，并标明旧集成笔记的阻塞结论已过期；手动重发只复用普通发送接口，不增加自动重试或新协议
