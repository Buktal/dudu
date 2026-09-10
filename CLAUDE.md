# mock-pulse

Tauri 2 + React 19 + Vite（`mock-pulse/src` 前端 + `mock-pulse/src-tauri` Rust 后端）。

## Agent skills

### Issue tracker

Issues live in GitHub Issues for Buktal/dudu (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### 输出落点

- Research 输出放 `docs/research/`，按主题建子目录归类。
- Prototype 输出放 `docs/prototype/`，按需建子目录归类；只在该目录下新增文件，不改业务代码。

## Architecture — 单向依赖

- 纵切 `features/<domain>/{components,hooks,stores,api.ts,index.ts}`；共享 `components/|hooks/|stores/|lib/`；静态 `assets/`；`components/ui/` 生成物经 CLI 变更。
- 依赖方向：`features → components|hooks|stores|lib`，`components → lib`；跨 feature 经对方 `index.ts`。

## Reuse-first — 复用优先

Canonical stack（同场景唯一选型）：

1. 优先 `@magicui`（UI/动效），其次 shadcn 
2. recharts（图表） 
3. dayjs（时间，经 `lib/` 封装） 
4. streamdown（markdown） 
5. tiptap（复杂输入/富文本） 
6. @dnd-kit（core + sortable + utilities，headless 配 shadcn，键盘可排序） 
7. react-virtuoso（长列表） 
8. lodash-es（具名导入） 
9. vitest + @testing-library + jsdom（逻辑测试） 
10. @faker-js/faker（dev 原型 mock，`seed` 固定，factory 手写落 `features/<domain>/mocks.ts`，`api.ts` 直接返回数据）

Workflow：

1. `search` — 先搜 `components/`、`hooks/`、`lib/` + 已装依赖，报已搜路径 + 不满足点。
2. `evaluate` — 给候选 + 取舍。
3. `gate` — 报 `yarn add <包>` + 理由 + 备选，明示同意后装。
4. `wrap` — 最薄封装：定最小输入/输出/边界，沉入对应分层。

Done gate：分层落位 ✓、新增依赖已批准 ✓、`yarn lint` ✓。

## Testing — logic-only

- Colocate：与被测同目录，`.test.ts(x)`，显式 `import { describe, expect, it } from "vitest"`（配置：`mock-pulse/vite.config.ts#test`）。
- Cover 仅三类：`lib/` 纯函数、`stores/` slice、`features/<domain>/` 非展示逻辑（数据整形、状态机、`api.ts` 契约）；其余免测。
- Single smoke：仅 `mock-pulse/src/test/smoke.test.tsx`。E2E（Playwright）待完整用户流程到达时再议。

## Toolchain

- `yarn` / `yarn dlx`（yarn 4）；命令查 `mock-pulse/package.json` scripts（`lint|format` 经 biome，`test|test:watch` 经 vitest）。
- UI：`yarn dlx shadcn@latest add <component>`；动效：`yarn dlx shadcn@latest add @magicui/<component>`（registry：`mock-pulse/components.json`）；主题 token：`mock-pulse/src/index.css`。
- 别名 `@/` → `mock-pulse/src`。
