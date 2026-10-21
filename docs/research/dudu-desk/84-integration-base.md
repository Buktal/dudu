# #84 集成基座：任务图、现状与开工门槛

> 历史核查记录（2026-10-10 早期）：下文任务图与开工门槛已被同日的[最终契约](../../design/dudu-desk/implementation-contract.md)和[实施票索引](../../design/dudu-desk/ticket-breakdown.md)取代。#80–#83 已完成，#85 无开放前置、可直接开工；#93 附件发送延期，其余实施按索引顺序推进。保留原文只供追溯，不作为当前阻塞依据

日期：2026-10-10。分支：`integration/desk-84-join`（基于 main `1fcfe5c`）。状态：**无可开工实施票，本次不写业务代码**

指针（唯一事实源，不复制正文）

- Spec：#84，本地 `docs/design/dudu-desk/integration-spec.md`
- 契约讨论（未定稿）：`docs/design/dudu-desk/data-contract.md`
- 拆分索引：`docs/design/dudu-desk/ticket-breakdown.md`（11 票 #85–#95，依赖图与覆盖核对）
- 前置阻塞：#80（消息规则）、#81（媒体边界）、#82（查询恢复）、#83（最终表结构与字段对齐），均为 open 的 `wayfinder:grilling` 票，需用户当面决策
- ADR：`docs/adr/0006`（恒200+业务码）、`0007`（无状态 JWT，不撤销）、`0010`（固定会话/共享接待）、`0011`（企业隔离/平级组/初始企业管理员/企业 ID 登录）

## 1. 任务图与 frontier（以 GitHub 原生依赖为准，已核验）

- `#83 ← #79(closed), #80, #81, #82`；`#84 ← #83`
- `#85 ← #83`；`#86 ← #85`；`#87 ← #86`；`#88 ← #87`
- `#89/#90/#91/#92 ← #88`；`#93 ← #89, #92`；`#94 ← #90, #91, #93`；`#95 ← #94`
- **frontier 为空**：#80/#81 无阻塞但属于 HITL grilling（需用户在场），#82/#83/#85–#95 均有 open 阻塞。`ticket-breakdown.md` 同样明确“当前没有可开工的实施票，不能自行猜字段”

## 2. 已核实现状（本次实测，非转述）

- Server 仅有平台登录 `POST /api/admin/login`，`dudu-server/.../dto/AdminLoginDTO.java` 只有 `username/password`，注释写明“企业登录接口另行实现”；`config/WebConfig.java` 全模块唯一放行路径即该登录端点
- Flyway 迁移仅 `V1__admin_core_tables.sql`、`V2__user_groups_and_company_channels.sql`、`V3__drop_all_foreign_keys.sql`；无 visitor/visitor_profile/message 表
- 以下为探索子代理报告、尚未复核：`R/P` 恒200、`ApiEnum` 分段与 ADR0006 文档名不一致；Desk `AccountApi` 无 `companyId`、`InboxApi` 12 方法生产占位、`ConversationOperation`/`ListPhase`/`ReceiptEvidence` 为替换核心位；术语残留 `reception_group/channel_account` 旧名、`unread/markRead` 旧链路、`InboxEvent` 无资料事件

## 3. #85 开工门槛（引用问题，不猜答案）

依次关闭 #80（成功确认点、失败保留、入站/出站去重范围、同键不同内容、消息顺序、回复/结束与新来信并发规则）、#81（渠道原始字段与类型边界、媒体副本/引用、可访问期限、准备后未发送清理）、#82（初始化时序、列表/历史游标、排序计数、资源版本、事件载荷、提交后漏推与重连补齐、名片覆盖确认竞态），再定稿 #83（三表逐字段类型/空值/默认/约束/索引、HTTP 路径与请求返回、错误码、Socket 信封、前端适配清单、最小迁移验收）。#83 决议与票内验收冲突时，先补齐草稿/票据再实施

## 4. Java 手册说明

用户已指定 `Java-Development-Manual.md`（黄山版）为依据。本次无 Java 改动，故未引用具体章节；#85 开工后涉及 DTO/校验/异常/建表/索引时，按 AGENTS.md Java 条款先查手册相关章节（命名、常量、OOP、异常日志、MySQL 建表/索引/SQL/ORM），结论以构建配置与实测核实
