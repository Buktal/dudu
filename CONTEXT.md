# CONTEXT.md

项目术语表（glossary）与领域语言。由 `/domain-modeling` 按需增量维护，消费规则见 `docs/agents/domain.md`。

## Projects

DUDU 下子项目对照表（口语 → 规范名，用于精准定位）：

| 规范名 | 口语别名 | 目录 | 一句话 |
| --- | --- | --- | --- |
| DUDU | 大项目 / 根仓库 | `/` | 容纳多个子项目的 monorepo 根 |
| MockPulse | Mock / 测试项目 | `mock-pulse/` | Tauri 2 + React 19 + Vite 的 mock 工具桌面端 |
| DUDU Server | 后端 / dudu 服务 | `dudu-server/` | Spring Boot 3.5（Java 21）消息聚合后端：渠道消息进 → 客服工作台 |
| DuduDesk | Desk / 客服端 / 工作台 | `dudu-desk/` | 嘟嘟客服坐席工作台（Tauri 2 + React 19，桌面端起步） |
| DuduAdmin | Admin / 管理后台 | `dudu-admin/` | 嘟嘟管理后台——纯 Web 前端（Vite + React 19 + shadcn），业务待规划 |
| DuduConsole | Console / 控制台 | `dudu-console/` | 嘟嘟控制台——纯 Web 前端（Vite + React 19 + shadcn），业务待规划 |

## Language

**渠道（Channel）**:
接入 DUDU 的外部聊天平台（微信、支付宝、B 站等），经回调把来访用户消息送入后端。
_Avoid_: 平台（口语可用，正式文档用渠道）、第三方

**坐席（Agent）**:
在工作台接待渠道来访用户的客服人员，是 DUDU 自有前端的登录用户。
_Avoid_: 客服（口语）、operator

**来访用户**:
通过渠道发起会话、最终由坐席接待的人，不是 DUDU 的登录用户。
_Avoid_: 客户、C 端用户

**工作台**:
坐席日常接待使用的 DUDU 自有前端（桌面端或网页）。
_Avoid_: 接待系统（口语别名）

**管理后台**:
按角色权限管理配置与数据的 DUDU 自有前端；与工作台同一套用户体系（单用户表 + role）。

**运行会话（RunSession）**:
mock-pulse 中「同一时刻只能有一个运行」的全局互斥与在途状态：能否启动、正在跑什么（直发 / 剧本 / 编排）、缺哪个渠道的连接、是否停止中。唯一裁决点在 runs 域 session 模块，thunk 与按钮都只问它。
_Avoid_: busy 状态、互斥标志（口语）

**运行实况（LiveRun）**:
run-progress 事件按 runId（含 lane 维度）收敛出的实时投影；剧本实况、编排实况、历史入列都是它的派生 selector。类型与投影单点在 runs 域 live 模块。
_Avoid_: 实时状态、进度状态（口语）

**失败策略（LanePolicy）**:
编排运行中「某步失败后如何继续」的决策表：编织方式（串行 / 并行）× 失败语义（stop / continue）× 取消源（编排停 / 用户停）→ 执行或跳过（含跳过原因）。决策单点在 Rust runs/policy。
_Avoid_: 旗标组合、失败标志（口语）

**引用解析**:
mock-pulse 中步骤/编排引用到注册表条目的查找与缺失分类单点：`{id, version}` → ok / id-missing / version-missing。事件素材版本、事件模板版本、编排 lane 剧本三处共用同一 kernel（events 域 resolve）；缺失含义（运行时钟抛错 / 展示时钟标记）归各调用时钟。
_Avoid_: 查找、引用查找（口语）

**渠道适配器（ChannelAdapter）**:
各渠道出站协议原语（握手、直发、回执投影）的统一 seam：高保真差异全部住在各渠道实现模块内部，分派经 connections 域静态注册表单点；新渠道接入 = 一个实现文件 + 注册表一行。
_Avoid_: 渠道封装、渠道 trait（口语）

**渠道事实库**:
`docs/research/channels/` 的核验结论集：渠道接入范围与事件模板全量的唯一基准。
_Avoid_: 调研文档（口语）

**事件模板（EventSchema）**:
内置只读、随应用分发的渠道事件样例：默认载荷、字段定义与期望回执三件套，全量锚定渠道事实库核验目录。
_Avoid_: 内置事件、demo 事件、预置事件

**事件素材（EventItem）**:
用户保存与版本化的事件实体，从模板另存或新建而来；剧本步骤与运行引用它的不可变版本。
_Avoid_: 事件样例（UI 旧文案，已统一为「事件素材」）

**模板直发**:
不落事件素材、以事件模板默认载荷（可临时编辑）直接发往该渠道当前连接的调试方式。
_Avoid_: demo 发送、试发

