# dudu-console

> dudu-console 是**嘟嘟（DuDu）的控制台子项目**：纯 Web 前端（Vite + React 19 + shadcn，无桌面端）。
> 企业管理前端，连接真实 Server API。

## 首版方案

[实施规格与文档入口](../docs/design/dudu-console/README.md)、[数据与接口契约](../docs/design/dudu-console/data-contract.md)、[功能图谱](../docs/features/dudu-console.md)、[验收记录](../docs/design/dudu-console/acceptance.md)。覆盖企业管理员登录与个人改密、员工、用户组与成员、13种已有渠道账号的配置维护和换组。初始管理员管理全企业，普通管理员按当前成员关系管理所属组。

开发时先启动 dudu-server（8080），Vite 将 `/api` 同源代理到该服务。使用已有企业的管理员身份登录；Console 不提供企业开通或模拟登录。生产构建部署时，网关须将 `/api` 转发到 Server。

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

快捷键：任意非输入焦点下按 `d` 切换深浅主题（输入框等可编辑元素内不触发）。

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS 4 + shadcn（Base UI）
- 包管理与检查：Yarn 4、Biome、Vitest

## 目录结构

```text
├── src/             前端
│   ├── components/  跨模块共享组件（ui/ 为 shadcn CLI 生成物）
│   ├── api/         会话、请求与响应校验
│   ├── features/    个人账号、员工、用户组与渠道账号
│   ├── lib/         纯函数工具
│   ├── test/        测试接线（setup + 冒烟）
│   └── App.tsx      登录、导航与业务路由
└── package.json     脚本与依赖声明
```

## 约定

架构分层、canonical stack 选型、测试边界、新依赖流程见仓库根 `AGENTS.md`（规范唯一入口，子项目不建 AGENTS.md）。
