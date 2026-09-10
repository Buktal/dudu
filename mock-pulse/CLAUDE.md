# mock-pulse

Tauri 2 + React 19 + Vite 桌面应用（`src/` 前端 + `src-tauri/` Rust 后端）。

## Toolchain

- 包管理走 `yarn` / `yarn dlx`（yarn 4）。
- 校验与格式化跑 `yarn lint` / `yarn format`，风格与作用域以 `biome.json` 为准。
- 加 UI 组件：`yarn dlx shadcn@latest add <component>`，动效走 `yarn dlx shadcn@latest add @magicui/<component>`（registry 已配在 `components.json`）。主题 token 在 `src/index.css`。
- 初始化已定：`yarn dlx shadcn@latest init --preset bbVJxce --template vite --pointer`（style `base-maia`，base-ui 系）。
- 别名 `@/` → `src/`。

## Frontend（分层 × 复用）

### 分层：目录与引用方向

```
src/
├── components/ui/        shadcn / magicui 生成物，只经 CLI 增删
├── components/           跨 feature 共享组件
├── features/<domain>/    纵切：components/ hooks/ stores/ api.ts index.ts
├── hooks/                跨 feature hooks
├── stores/               全局 redux toolkit slice
├── lib/                  纯函数（无组件）
└── assets/               静态资源
```

引用只许向下：`features → components/hooks/stores/lib`，`components → lib`；跨 feature 只走对方 `index.ts`。

### 复用：选型（同一场景只用这一个）

- UI 组件、动效展示：shadcn + `@magicui` registry。
- 时间：dayjs，复用封装收进 `lib/`。
- markdown 渲染：streamdown。
- 复杂输入/富文本：tiptap。
- 拖拽排序：@dnd-kit（core + sortable + utilities；headless 配 shadcn，键盘可排序）。
- 长列表/虚拟列表：react-virtuoso。
- 工具方法、算法：lodash-es（具名导入）。
- 原型 mock：@faker-js/faker（dev），`seed` 固定；关联手写 factory；mock 落 `features/<domain>/mocks.ts`，`api.ts` 直接返回数据。

### 复用：动手顺序

1. 找现成：先搜 `components/`、`hooks/`、`lib/` 和已装依赖，说得出哪一点不满足才往下走。
2. 找依赖库：给出候选和取舍。
3. 提案等同意：报 `yarn add <包>` + 理由 + 备选，经明确同意再装。
4. 最后手写：回到最小输入/输出/边界，用最薄的一层实现；写完沉进对应分层，供下次复用。

完成标准：新文件落在分层里；新增依赖已获同意；`yarn lint` 通过。

