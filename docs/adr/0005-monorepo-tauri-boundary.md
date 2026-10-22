# Monorepo + Tauri 边界：Rust 做重活，前端做薄

维持 `D:\Project\DuDu` monorepo（mock-pulse 为子目录），旧 05 的 `D:\BangBu-Lab\mock-pulse\` 独立仓方案作废——单人单项目阶段分仓只有成本没有收益。敏感决策不走 `.scratch/` 隔离，全放 `docs/`（私有仓）。前后端按复杂度/能力路由：Rust（`src-tauri`）承担验签 + 加密 + 外发请求（渠道适配器向用户配置的地址直发，纯外发模型，无本地 HTTP 端点），前端只做剧本编辑 / 触发 / 展示；后续前端缺库一律交 Rust，不重议（#4）

2026-10-22 修订注记：原文写作时曾以「假扮平台端点 + CORS」概括 Rust 职责，实际实现从未引入本地 HTTP 服务或 CORS 处理（`lib.rs` 仅注册命令与 opener 插件），本轮按事实改写为「外发请求」，消除术语与代码的漂移；边界本身（Rust 做重活、前端做薄）不变

## Consequences

- 一键跑链条不变：`yarn` / `yarn lint|format` / `yarn test`（biome + vitest logic-only）；目录真要动手只给定案，归执行票
