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

## Toolchain

- 包管理用 `yarn` / `yarn dlx`（yarn 4）。
- `yarn lint` / `yarn format` 以 `mock-pulse/biome.json` 为准；`yarn test` 单次 / `yarn test:watch` 监听。
- UI 用 `yarn dlx shadcn@latest add <component>`，动效用 `yarn dlx shadcn@latest add @magicui/<component>`（registry 已配在 `mock-pulse/components.json`）；主题 token 在 `mock-pulse/src/index.css`。
- 别名 `@/` → `mock-pulse/src`。

## Frontend（分层 × 复用）

### 向下引用

```
src/
├── components/ui/        shadcn / magicui 生成物，由 CLI 管理
├── components/           跨 feature 共享组件
├── features/<domain>/    纵切：components/ hooks/ stores/ api.ts index.ts
├── hooks/                跨 feature hooks
├── stores/               全局 redux toolkit slice
├── lib/                  纯函数（无组件）
└── assets/               静态资源
```

`features → components/hooks/stores/lib`，`components → lib`；跨 feature 经对方 `index.ts` 访问。

### 复用优先

同一场景只用这一个：shadcn + `@magicui`（UI/动效）、dayjs（时间，封装收进 `lib/`）、streamdown（markdown）、tiptap（复杂输入/富文本）、@dnd-kit（core + sortable + utilities，headless 配 shadcn，键盘可排序）、react-virtuoso（长列表）、lodash-es（具名导入）、recharts（图表）、vitest + @testing-library + jsdom（逻辑测试）、@faker-js/faker（dev 原型 mock，`seed` 固定，factory 手写，落 `features/<domain>/mocks.ts`，`api.ts` 直接返回数据）。

动手顺序：

1. 搜现成：先搜 `components/`、`hooks/`、`lib/` 和已装依赖，列出已搜路径 + 不满足点才往下走。
2. 找依赖库：给出候选和取舍。
3. 提案等同意：报 `yarn add <包>` + 理由 + 备选，经明确同意再装。
4. 手写最薄一层：明确最小输入/输出/边界，写完沉进对应分层。

完成标准：新文件落在分层里；新增依赖已获同意；`yarn lint` 通过。

### 逻辑才测

- 用例与被测文件同目录，后缀 `.test.ts(x)`，显式 `import { describe, expect, it } from "vitest"`（配置见 `mock-pulse/vite.config.ts` 的 `test` 段）。
- 测：`lib/` 纯函数、`stores/` slice、`features/<domain>/` 内非展示逻辑（数据整形、状态机、`api.ts` 契约）。
- 纯展示组件、`components/ui/` 生成物、Tauri 桥接模板、`mock-pulse/src/test/smoke.test.tsx` 之外的接线验证放一边；冒烟只留一个。
- E2E 暂缓：出现完整用户流程再议（Playwright），此前不引入。

