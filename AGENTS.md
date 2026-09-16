# DUDU

Monorepo。规范唯一入口为本文件，子目录不建 AGENTS.md / CLAUDE.md；口语别名与目录对照见根 `CONTEXT.md`。

## Agent skills

- Issue tracker：GitHub Issues（`gh` CLI）→ `docs/agents/issue-tracker.md`。
- Triage labels：既有 label 原样沿用 → `docs/agents/triage-labels.md`。
- Domain docs：单 context 布局（根 `CONTEXT.md` + `docs/adr/`）→ `docs/agents/domain.md`。

## 子项目

| 项目 | 形态 | 定位 |
| --- | --- | --- |
| mock-pulse | Tauri 2 桌面端 | 聊天平台回调模拟工具，零资质本地联调 |
| dudu-desk | Tauri 2 桌面端 | 客服工作台坐席端 |
| dudu-admin | 纯 Web | 管理后台 |
| dudu-console | 纯 Web | 控制台 |
| dudu-server | Spring Boot | 消息聚合后端：渠道消息进 → 客服工作台，回复转发回渠道 |

## 输出落点

- Research → `docs/research/<主题>/`。
- Prototype → `docs/prototype/`，只新增文件，不改业务代码。

## 通用规范 — Reuse-first（不重复造轮子，全语言适用）

- 凡主流生态库（高知名度、活跃维护）能覆盖的场景不手写实现；算法、加解密、编解码、日期历法、随机等通用工具尤其如此。
- 「新增依赖需报备」对称适用于「手写通用实现」：手写同样要报理由。仅两类成立：a) 业务/渠道语义本身；b) 库无法表达的官方字节语义（如企微 PKCS#7-32 私有补位），须在代码注释注明。
- Rust（Tauri 项目 `src-tauri`）选型：哈希/HMAC/RSA/Ed25519 → RustCrypto 家族（`sha1`/`md-5`/`sha2`/`hmac`/`rsa`/`ed25519-dalek`）；时间 → `time`；随机 → `rand`；hex/Base64 → `hex`/`base64`。

## 前端规范 — React 19 + Vite 家族

适用子项目表中全部前端项目，路径相对各项目根。Tauri 项目含 `src-tauri` Rust 后端，Rust 改动跑 `check:rust`。

### Architecture — 单向依赖

- 纵切 `features/<domain>/{components,hooks,stores,api.ts,index.ts}`；共享 `components/|hooks/|stores/|lib/`。
- 依赖方向：`features → components|hooks|stores|lib`，`components → lib`；跨 feature 走对方 `index.ts`。
- `components/ui/` 为 CLI 生成物，只经 CLI 变更。
- 单文件 ≤ 500 行，超限拆分子组件或按职责拆模块。

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

1. `search` — 搜 `components/`、`hooks/`、`lib/` 与已装依赖，报已搜路径与不满足点。
2. `evaluate` — 给候选与取舍。
3. `gate` — 报 `yarn add <包>` + 理由 + 备选，明示同意后安装。
4. `wrap` — 最薄封装：定最小输入/输出/边界，落对应分层。

Done gate：分层落位 ✓、新增依赖已批准 ✓、`yarn lint` ✓。

### Testing — logic-only

- Colocate：与被测同目录 `.test.ts(x)`，显式 `import { describe, expect, it } from "vitest"`（未开 globals）。
- 仅测三类：`lib/` 纯函数、`stores/` slice、`features/<domain>/` 非展示逻辑（数据整形、状态机、`api.ts` 契约）。
- 全局 smoke 仅 `src/test/smoke.test.tsx`。

### Toolchain

- 包管理 `yarn` / `yarn dlx`；命令以所在项目 `package.json` scripts 为准。
- UI：`yarn dlx shadcn@latest add <component>`；动效：`yarn dlx shadcn@latest add @magicui/<component>`（registry：各项目 `components.json`）。
- 主题 token：`src/index.css`；别名 `@/` → `src`。

## 后端规范 — dudu-server（Spring Boot，Java 21）

路径相对 `dudu-server/`。选型以 `pom.xml` 为准（分区注释即清单，版本号只在 `<properties>` 管理）。单实例，无 Redis/MQ；跨实例方案（连接路由、token 集中缓存）到量级再引入。

### Reuse-first

按序取用，先确认各层内置无法满足再自建：

1. 通用工具（日期、加密、IO、Bean 转换、XML）→ Hutool；微信回调 XML 用 `XmlUtil`。
2. JSON → Jackson（`ObjectMapper` + `JsonNode`），全仓库唯一 JSON 栈；Hutool 的 `JSONUtil`/`JSONObject` 禁用，防两库序列化漂移。调平台 OpenAPI → `RestClient`。
3. 数据访问 → MyBatis-Plus（`BaseMapper`/`IService`）；分页走 `MybatisPlusInterceptor`，复杂 SQL 落 XML mapper。
4. 参数校验 → jakarta validation（`@Valid`/`@NotBlank`）在 Controller 入参完成；service 里手写 if 判空视为未校验。
5. 健康检查 → `/actuator/health`；自建 health 端点视为重复实现。

新增第三方依赖先审批：报"已搜 pom 分区 + 内置为何不满足"，同意后引入并落位对应分区。

### Null-safety

可能为 null 的取值与导航统一走 `Optional`：

- 包装 `Optional.ofNullable(...)`；字符串判空用 `.filter(s -> !s.isBlank())`。
- 链式 `map`/`flatMap`/`filter` 完成取值与转换，终结用 `orElse`/`orElseGet`/`orElseThrow`，不用裸 `get()`。
- 可能缺值的返回值，方法签名直接声明 `Optional<T>`。

`if (obj != null)`、`if (str != null && !str.isEmpty())` 后接 get/对象处理，视为未判空。

### Flyway — 表结构唯一入口

- 改表 = 新增迁移 `src/main/resources/db/migration/V<N>__<desc>.sql`，启动自动执行。
- 迁移一旦提交不可变，后续变更与回滚均靠新增迁移。
- 本地手动 DDL 仅限排障；留存的结构变更必须回到迁移文件。

Done gate：删库重启，Flyway 从零建出全部表结构。

### 骨架约定

- 分层：`com.dudu.duduserver.{controller,service,mapper,config,exception,util,constant}` + `common`（跨层载体）；枚举进 `constant` 包；认证组件在 `config/auth/`，校验分组在 `config/validate/`。
- 统一返回：`common/R<T>` record，HTTP 恒 200，业务语义全靠 code；错误码走 `constant/ApiEnum`，新码按既有分段扩展。
- 业务异常只用 `exception/BizException` sealed 家族，service 抛子类，全局处理器分流。
- 表约定：所有表 `create_time`/`update_time`（DB 默认 CURRENT_TIMESTAMP + MP 自动填充）、主键 bigint 自增；逻辑删除按表需要。
- 认证：Hutool JWT 只签验，payload 走 Jackson；`Authorization: Bearer`；`/api/**` 默认全拦，白名单 `dudu.auth.whitelist`；Controller 用 `@CurrentUser JwtUser` 注入当前用户；`dudu.auth.dev-token-enabled` 控制开发用登录端点，默认关。
- 单文件 ≤ 500 行，超限按职责拆分。
