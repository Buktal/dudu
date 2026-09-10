# mock-pulse

Tauri 2 + React 19 + Vite（`src` 前端 + `src-tauri` Rust 后端）。

## Architecture — 单向依赖

- 纵切 `features/<domain>/{components,hooks,stores,api.ts,index.ts}`；共享 `components/|hooks/|stores/|lib/`；静态 `assets/`。
- 依赖方向：`features → components|hooks|stores|lib`，`components → lib`；跨 feature 走对方 `index.ts`。
- `components/ui/` 为 CLI 生成物，只经 CLI 变更。

## Reuse-first — canonical stack（同场景唯一选型）

1. UI/动效：`@magicui` 优先，shadcn 次之
2. 图表：recharts
3. 时间：dayjs（经 `lib/` 封装）
4. markdown：streamdown
5. 富文本/复杂输入：tiptap
6. 拖拽排序：@dnd-kit（core + sortable + utilities，headless 配 shadcn，键盘可排序）
7. 长列表：react-virtuoso
8. 工具函数：lodash-es（具名导入）
9. 逻辑测试：vitest + @testing-library + jsdom
10. 原型 mock：@faker-js/faker（dev 依赖，`seed` 固定；factory 手写落 `features/<domain>/mocks.ts`，`api.ts` 直接返数据）

新依赖 workflow：

1. `search` — 搜 `components/`、`hooks/`、`lib/` + 已装依赖，报已搜路径 + 不满足点。
2. `evaluate` — 给候选 + 取舍。
3. `gate` — 报 `yarn add <包>` + 理由 + 备选，明示同意后装。
4. `wrap` — 最薄封装：定最小输入/输出/边界，沉入对应分层。

Done gate：分层落位 ✓、新增依赖已批准 ✓、`yarn lint` ✓。

## Testing — logic-only

- Colocate：与被测同目录 `.test.ts(x)`，显式 `import { describe, expect, it } from "vitest"`（未开 globals）。
- 仅测三类：`lib/` 纯函数、`stores/` slice、`features/<domain>/` 非展示逻辑（数据整形、状态机、`api.ts` 契约）。
- 全局 smoke 仅 `src/test/smoke.test.tsx`；E2E 待完整用户流程再议。

## Toolchain

- 包管理 `yarn` / `yarn dlx`；命令以 `package.json` scripts 为准。
- UI：`yarn dlx shadcn@latest add <component>`；动效：`yarn dlx shadcn@latest add @magicui/<component>`（registry：`components.json`）。
- 主题 token：`src/index.css`；别名 `@/` → `src`。
