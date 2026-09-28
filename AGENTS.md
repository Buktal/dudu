# DUDU

## 任务规范

按任务预读对应规范：

- Issue 操作 → `docs/agents/issue-tracker.md`；GitHub Issues / `gh` CLI
- Issue 分诊与标签映射 → `docs/agents/triage-labels.md`；沿用既有标签
- 代码库探索、领域文档维护 → `docs/agents/domain.md`；单一上下文布局：根 `CONTEXT.md` + `docs/adr/`

## 通用规范

### 结构与产物

- 规范入口：根 `AGENTS.md` 为整个仓库的唯一规范入口；子目录不创建 `AGENTS.md` / `CLAUDE.md`
- 项目约定：子项目定位、目录、别名与领域术语以根 `CONTEXT.md` 为准
- 路径基准：文档路径相对仓库根；代码与配置路径相对适用子项目根
- 文件长度：单文件 ≤ 500 行；超限按职责拆分
- 调研产物 → `docs/research/<主题>/`
- 原型产物 → `docs/prototype/`；仅新增文件，业务代码只读
- 设计产物 → `docs/design/<主题>/`；设计与可视化的源文件、中间方案、预览截图、导出及复现脚本直接存入，同主题复用目录；工具必须使用会话目录时，完成前归档到对应项目目录，交付引用项目内路径
- 功能图谱 → `docs/features/<子项目>.md`；功能变更时同步维护，子项目 `README.md` 保留功能概览和入口链接

### 复用与依赖

- 选型约束：下表为同场景唯一选型，复用既有实现亦须遵循
- 复用顺序：仓库实现 → 已有依赖 / 框架内置 → 新增依赖；未覆盖场景采用主流、活跃维护的库
- 通用能力：算法、加解密、编解码、日期、随机由库实现
- 重复实现：发现仓库内自写通用工具而未用指定或主流库时，不论当前执行何种计划，继续执行并提醒用户路径与应复用库；不自行重构，无例外

新增依赖或手写通用实现统一执行：

1. 检索：按下表检查仓库与依赖，报告已搜路径及内置能力缺口
2. 准入：报告选型、理由、备选与取舍；新增依赖须附安装命令或清单变更，用户明确批准后引入；手写通用实现仅限业务/渠道特定语义或库无法表达的官方字节语义（如企微 PKCS#7-32），代码注释注明依据
3. 接入：定义最小输入、输出与边界，采用薄封装，归属对应分层

| 范围 | 检索与依赖管理 |
| --- | --- |
| 前端 | `src/components/`、`src/hooks/`、`src/lib/`、`package.json`；新增依赖用 `yarn add <包>` |
| Rust / Tauri | `src-tauri/`、`src-tauri/Cargo.toml` |
| Java | `src/main/java/`、`pom.xml` 分区；依赖归属对应分区，版本仅在 `<properties>` 定义 |

| 范围 | 场景 | 指定选型与边界 |
| --- | --- | --- |
| 前端 | UI / 动效 | `@magicui` 优先，shadcn 次之 |
| 前端 | 图表 | `recharts` |
| 前端 | 时间 | `dayjs`；经 `src/lib/` 封装 |
| 前端 | Markdown | `streamdown` |
| 前端 | 富文本 / 复杂输入 | `tiptap` |
| 前端 | 拖拽排序 | `@dnd-kit`（core + sortable + utilities）；headless + shadcn，支持键盘排序 |
| 前端 | 长列表 | `react-virtuoso` |
| 前端 | 工具函数 | `lodash-es`；具名导入 |
| 前端 | 逻辑测试 | `vitest` + `@testing-library` + `jsdom` |
| 前端 | 原型模拟数据 | `@faker-js/faker`（开发依赖）；固定 `seed`；手写数据工厂位于 `src/features/<domain>/mocks.ts`，`api.ts` 直接返回数据 |
| Rust | 哈希 / HMAC / RSA / Ed25519 | RustCrypto：`sha1` / `md-5` / `sha2` / `hmac` / `rsa` / `ed25519-dalek` |
| Rust | 时间 / 随机 / hex / Base64 | `time` / `rand` / `hex` / `base64`；依次对应 |
| Java | 日期 / 加密 / IO / Bean 转换 / XML | Hutool；微信回调 XML 使用 `XmlUtil` |
| Java | JSON / JWT | Jackson（`ObjectMapper` + `JsonNode`）为唯一 JSON 栈，含 JWT payload；Hutool JWT 仅签名/验签，禁用 Hutool `JSONUtil` / `JSONObject` |
| Java | 渠道 OpenAPI | `RestClient` |
| Java | 数据访问 | MyBatis-Plus（`BaseMapper` / `IService`）；分页用 `MybatisPlusInterceptor`，复杂 SQL 使用 XML mapper |
| Java | 参数校验 | Jakarta Validation（`@Valid` / `@NotBlank`）；在 Controller 入参完成 |
| Java | 健康检查 | `/actuator/health` |

### 验收

- 前端改动：受影响子项目 `yarn lint` 通过
- Rust 改动：所属 Tauri 子项目 `yarn check:rust` 通过
- 数据库结构改动：空库启动，验证 Flyway 从零创建全部表结构

## 前端规范 — React 19 + Vite

### 模块边界

- 纵向切片：`src/features/<domain>/{components,hooks,stores,api.ts,index.ts}`；共享层：`src/{components,hooks,stores,lib}/`
- 单向依赖：`features → components|hooks|stores|lib`，`components → lib`；跨 feature 仅通过目标 `index.ts`

### 工具链

- 包管理：使用 `yarn` / `yarn dlx`；命令以子项目 `package.json` scripts 为准
- UI 组件：`src/components/ui/` 为 CLI 生成物，仅经 CLI 变更：`yarn dlx shadcn@latest add <component>` 或 `yarn dlx shadcn@latest add @magicui/<component>`；组件注册表以 `components.json` 为准
- 主题变量：定义于 `src/index.css`

### 逻辑测试

- 测试组织：测试与被测模块同目录，后缀 `.test.ts(x)`；显式 `import { describe, expect, it } from "vitest"`
- 测试范围：仅限 `src/lib/` 纯函数、`src/stores/` slice、`src/features/<domain>/` 非展示逻辑（数据整形、状态机、`api.ts` 契约）
- 冒烟测试：全局唯一入口为 `src/test/smoke.test.tsx`

## 后端规范 — Spring Boot / Java 21

适用范围：`dudu-server/`；单实例部署，不引入 Redis/MQ；连接路由、token 集中缓存等跨实例方案仅在扩容需求明确时引入

### 分层

- 包结构：`com.dudu.duduserver.{controller,service,mapper,config,exception,util,constant,common}`
- 数据与常量：`common` 承载跨层数据，`constant` 存放枚举
- 组件归属：认证组件位于 `config/auth/`，校验分组位于 `config/validate/`

### 接口与认证

- 响应：`common/R<T>` record，HTTP 恒 200，业务语义由 `code` 表达；错误码使用 `constant/ApiEnum`，新增码按既有分段扩展
- 业务异常：`exception/BizException` 携带 `ApiEnum` 错误码；校验失败处抛出，全局异常处理器统一转 `R`
- 认证：`Authorization: Bearer`；`/api/**` 默认拦截，白名单由 `dudu.auth.whitelist` 配置；Controller 通过 `@Me JwtUser` 注入当前用户

### 空值安全

- 取值与导航：可空值统一使用 `Optional.ofNullable(...)`；字符串通过 `.filter(s -> !s.isBlank())` 过滤
- 转换与终结：使用 `map` / `flatMap` / `filter` 转换，以 `orElse` / `orElseGet` / `orElseThrow` 终结；禁止裸 `get()` 或判空后直接解引用
- 返回类型：可能缺值时声明为 `Optional<T>`

### 数据库

- 结构迁移：Flyway 为数据库结构的唯一入口；新增 `src/main/resources/db/migration/V<N>__<desc>.sql`，启动自动执行
- 迁移约束：已提交迁移不可变；后续变更与回滚均新增迁移；本地手动 DDL 仅限排障，持久结构变更须纳入迁移
- 表结构：主键 `bigint` 自增；所有表包含 `create_time` / `update_time`（DB 默认 `CURRENT_TIMESTAMP` + MP 自动填充）；按需启用逻辑删除
