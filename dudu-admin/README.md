# dudu-admin

> dudu-admin 是**嘟嘟（DuDu）的管理后台子项目**：纯 Web 前端（Vite + React 19 + shadcn，无桌面端）。
> 基于 vite-react-app 模板起步，业务模块待规划。

[功能规划与设计交接](../docs/design/dudu-admin/README.md)：先确认功能与数据契约，独立设计会话完成正式前端，随后实现后端并联调。Admin 不使用模拟数据；开发可选择接口环境，生产固定线上地址。表结构与环境入口目前仍为设计，尚未实现。

## 快速开始

```powershell
yarn install
yarn dev         # 本地开发
yarn build       # 类型检查 + 生产构建
yarn preview     # 预览构建产物
yarn lint        # 代码检查
yarn test        # 单元测试
yarn check:all   # 类型 + lint + 测试
```

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS 4 + shadcn（Base UI）
- 包管理与检查：Yarn 4、Biome、Vitest

## 目录结构

```text
├── src/             前端
│   ├── components/  跨模块共享组件（ui/ 为 shadcn CLI 生成物）
│   ├── lib/         纯函数工具
│   ├── test/        测试接线（setup + 冒烟）
│   └── App.tsx      占位页：shadcn 主题就绪
└── package.json     脚本与依赖声明
```

## 约定

架构分层、canonical stack 选型、测试边界、新依赖流程见仓库根 `AGENTS.md`（规范唯一入口，子项目不建 AGENTS.md）。
