# DUDU

Monorepo。口语别名 → 目录对照见根 `CONTEXT.md`；进入子项目前先读其 AGENTS.md：

- `mock-pulse/AGENTS.md` — Tauri 2 + React 19 + Vite 前端：架构分层、canonical stack、测试、工具链。
- `dudu-server/AGENTS.md` — Spring Boot 后端：复用优先（Hutool/RestClient）、Flyway 表结构唯一入口、AOP 边界。

## Agent skills

- Issue tracker：GitHub Issues（`gh` CLI）→ `docs/agents/issue-tracker.md`。
- Triage labels：五个规范 label 原样沿用 → `docs/agents/triage-labels.md`。
- Domain docs：单 context 布局（根 `CONTEXT.md` + `docs/adr/`）→ `docs/agents/domain.md`。

## 输出落点

- Research → `docs/research/<主题>/`。
- Prototype → `docs/prototype/`，只新增文件，不改业务代码。
