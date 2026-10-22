# DuduAdmin 与 DuduConsole 前端机制层：受控拷贝与测试同步

DuduConsole 首版按设计决定「复用 Admin 的思路与交互原则，不跨项目导入平台业务」（docs/design/dudu-console/page-flows.md），实际落地方式是把 Admin 的机制层逐字拷贝后按需修改。2026-10-22 架构审查量化确认：console 非测试源码约 57%（约 3650 行）与 admin 逐字节或近似相同（use-query / use-mutation / paged-query / FilterBar / QueryView / SubmitShell / feedback / page-parts / 全套主题 CSS 与 16 个 ui 组件），且分叉已发生退化——console 丢失 admin 的路由语法常量回退手写字面量、拷贝件全部没有配套测试、theme-provider 出现单边快捷键演化。同日决策治理方式

- **不建共享包**：维持各子项目独立 yarn 安装拓扑，不做 workspace 化或 monorepo 包管理改造——根 AGENTS.md 的 worktree 零安装约定（node_modules junction 复用主检出）依赖每项目独立 node_modules 的现状，共享包需重写该约定并使 5 个子项目全部联动，收益不抵风险
- **受控拷贝**：机制层文件以 admin 为先导演化；console 同步拷贝时必须连同对应测试一起拷入（2026-10-22 已拷入 use-query / use-mutation / paged-query / filter-bar / query-view / submit-shell 六个单点测试作为分叉护栏，首跑全绿）；两侧机制层修 bug 或调语义时，另一侧在同一个变更中同步
- **分叉仅限真实业务差异**：登录字段、身份域模型、渠道配置等 console 特有语义可以分叉，但须在文件内可辨识；机制层（查询四键、分页查询、草稿-提交-重置、提交外壳）不允许单边演化
- GLOSSARY 的机制层词汇（查询四键、分页查询、列表页骨架、筛选栏、表单提交外壳、路由构造）按两项目通用的单点语义维护

## Considered Options

- workspace 共享包（一次收敛约 3650 行）：被否——安装拓扑变动、worktree 零安装约定重写、全部子项目联动；机制层尚在演化期，过早固化共享接口的迁移成本高于拷贝同步成本
- 完全独立实现（按设计文档字面执行）：被否——实际执行形态就是拷贝，「独立」只留下漂移风险而无隔离收益；平台业务不互导的边界继续成立
- 只修分叉不立规矩：被否——退化已实际发生（常量丢失、测试缺位、单边演化），无护栏时下一次单边修复必然再漏另一侧
- 未来第三个同类前端出现或拷贝同步成本失控时，再议共享包，不提前建设

2026-10-22 决策（全量架构审查 C-06）；同轮完成分叉回归修复与测试护栏拷入，实施记录见 docs/features/dudu-console.md
