# DUDU

Monorepo。口语别名 → 目录对照见根 `CONTEXT.md`。规范唯一入口在本文件——子目录不建 AGENTS.md / CLAUDE.md。

## Agent skills

- Issue tracker：GitHub Issues（`gh` CLI）→ `docs/agents/issue-tracker.md`。
- Triage labels：五个规范 label 原样沿用 → `docs/agents/triage-labels.md`。
- Domain docs：单 context 布局（根 `CONTEXT.md` + `docs/adr/`）→ `docs/agents/domain.md`。

## 输出落点

- Research → `docs/research/<主题>/`。
- Prototype → `docs/prototype/`，只新增文件，不改业务代码。

## 子项目

| 项目 | 形态 | 定位 |
| --- | --- | --- |
| mock-pulse | Tauri 2 桌面端 | 聊天平台回调模拟工具，零资质本地联调 |
| dudu-desk | Tauri 2 桌面端 | 客服工作台坐席端 |
| dudu-admin | 纯 Web | 管理后台 |
| dudu-console | 纯 Web | 控制台 |
| dudu-server | Spring Boot | 消息聚合后端：渠道消息进 → 客服工作台，回复转发回渠道 |

## 前端规范 — React 19 + Vite 家族

适用子项目表中全部前端项目，路径相对各项目根；Tauri 项目另配 `src-tauri` Rust 后端：`tauri:dev` / `tauri:build`，Rust 改动跑 `check:rust`。

### Architecture — 单向依赖

- 纵切 `features/<domain>/{components,hooks,stores,api.ts,index.ts}`；共享 `components/|hooks/|stores/|lib/`。
- 依赖方向：`features → components|hooks|stores|lib`，`components → lib`；跨 feature 走对方 `index.ts`。
- `components/ui/` 为 CLI 生成物，只经 CLI 变更。

### Reuse-first — canonical stack（同场景唯一选型）

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

### Testing — logic-only

- Colocate：与被测同目录 `.test.ts(x)`，显式 `import { describe, expect, it } from "vitest"`（未开 globals）。
- 仅测三类：`lib/` 纯函数、`stores/` slice、`features/<domain>/` 非展示逻辑（数据整形、状态机、`api.ts` 契约）。
- 全局 smoke 仅 `src/test/smoke.test.tsx`；E2E 待完整用户流程再议。

### Toolchain

- 包管理 `yarn` / `yarn dlx`；命令以所在项目 `package.json` scripts 为准。
- UI：`yarn dlx shadcn@latest add <component>`；动效：`yarn dlx shadcn@latest add @magicui/<component>`（registry：各项目 `components.json`）。
- 主题 token：`src/index.css`；别名 `@/` → `src`。

## 后端规范 — dudu-server（Spring Boot，Java 21）

路径相对 `dudu-server/`。选型以 `pom.xml` 为准（分区注释即清单，版本号只在 `<properties>` 管理）。单实例、无 Redis/MQ；跨实例方案（连接路由、token 集中缓存）到量级再引入。

### Reuse-first

按序取用，每层先证明"没有"再自建：

1. 通用工具（日期、加密、IO、Bean 转换、XML）→ Hutool；微信回调 XML 用 `XmlUtil`。
2. JSON → Jackson（`ObjectMapper` + `JsonNode`），全仓库唯一 JSON 栈；Hutool 的 `JSONUtil`/`JSONObject` 禁用，防两库序列化漂移。调平台 OpenAPI → `RestClient`。
3. 数据访问 → MyBatis-Plus（`BaseMapper`/`IService`）；分页走 `MybatisPlusInterceptor`，复杂 SQL 落 XML mapper。
4. 参数校验 → jakarta validation（`@Valid`/`@NotBlank`）在 Controller 入参完成；service 里手写 if 判空视为未校验。
5. 健康检查 → `/actuator/health`；自建 health 端点视为重复实现。

新增第三方依赖先审批：报"已搜 pom 分区 + 上述内置为何不满足"，同意后引入并落位对应分区；到节点再加，不预防性堆。

### Null-safety

可能为 null 的取值与导航一律走 `Optional`，不手写 null/空串 if 链：

- 包装 `Optional.ofNullable(...)`；字符串判空用 `.filter(s -> !s.isBlank())`。
- 链式 `map`/`flatMap`/`filter` 完成取值与转换，终结用 `orElse`/`orElseGet`/`orElseThrow`，不用裸 `get()`。
- 可能缺值的返回值，方法签名直接声明 `Optional<T>`。

`if (obj != null)`、`if (str != null && !str.isEmpty())` 后接 get/对象处理，视为未判空。

### Flyway — 表结构唯一入口

- 改表 = 新增迁移 `src/main/resources/db/migration/V<N>__<desc>.sql`，启动自动执行。
- 迁移一旦提交不可变：后续变更、回滚都靠新增迁移。
- 本地手动 DDL 仅限排障；要留下的结构变更必须回到迁移文件。

Done gate：删库重启，Flyway 能从零建出全部表结构。
