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
