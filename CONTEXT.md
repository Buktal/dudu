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

