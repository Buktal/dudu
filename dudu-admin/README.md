# dudu-admin

> dudu-admin 是**嘟嘟（DuDu）的管理后台子项目**：纯 Web 前端（Vite + React 19 + shadcn，无桌面端）。
> 面向平台管理员，提供企业开通与维护、运营概览、企业资源汇总、操作记录及个人账号管理。

[功能图谱](../docs/features/dudu-admin.md) · [前端实现与接口交接](../docs/design/dudu-admin/frontend-implementation.md) · [Spec #68](https://github.com/Buktal/dudu/issues/68)

正式程序始终请求真实 HTTP 接口；没有模拟登录或模拟数据开关。服务不可用时显示失败并允许重试。前端已实现，真实后端、数据库与部署环境的联调验收单独进行。

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

## 接口环境

- 开发默认通过 Vite 将同源 `/api` 请求代理到 `http://127.0.0.1:8080`。
- 复制 `.env.example` 为 `.env.local`，将 `VITE_API_ORIGIN` 替换为真实线上源地址。配置仅包含 HTTP/HTTPS、主机和端口，请求层追加 `/api`。
- 生产构建固定采用 `VITE_API_ORIGIN`，不显示环境入口，不读取浏览器保存的开发地址或 URL 覆盖参数。未配置时仍使用占位域名 `https://api.dudu.example`，发布前必须替换。
- 切换环境或退出会清除本机身份、页面数据和打开的企业，并取消在途请求。令牌只保存在当前标签页的 `sessionStorage`，恢复时重新请求账号资料。
- 本地默认同源代理无需跨域配置；生产跨源访问时由部署网关处理实际前端来源及 Authorization 请求头。

## 目录结构

```text
├── src/             前端
│   ├── components/  跨模块共享组件（ui/ 为 shadcn CLI 生成物）
│   ├── api/         统一请求、认证、环境、业务契约及响应校验
│   ├── features/    账号、企业、概览、资源、操作记录
│   ├── lib/         纯函数工具
│   ├── test/        测试接线与隔离 HTTP 返回
│   ├── navigation.ts  页面与企业详情的 hash 地址
│   └── App.tsx      身份恢复与页面入口
└── package.json     脚本与依赖声明
```

## 约定

架构分层、canonical stack 选型、测试边界、新依赖流程见仓库根 `AGENTS.md`（规范唯一入口，子项目不建 AGENTS.md）。

UI 组件通过现有 shadcn CLI 添加，没有新增依赖。Dialog/Sheet 的关闭按钮已作中文本地化；重新生成时需保留该文本。业务样式通过主题与调用处布局配置维护。
