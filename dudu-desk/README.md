# dudu-desk

> dudu-desk 是**嘟嘟（DuDu）的客服工作台子项目**：坐席桌面端（Tauri 2），未来可能扩展移动端。
> 基于 mock-pulse 脚手架拷贝起步，业务模块待规划。

## 简介

dudu-desk 计划承载嘟嘟客服的坐席工作台：会话收发、客户信息与工单流转（具体范围待定）。
当前从 mock-pulse（Tauri 2 + React 19）脚手架拷贝而来，前端分层与工具链沿用其规范，
业务代码从零搭建。

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS + shadcn
- 桌面与后端能力：Tauri 2（Rust）—— 负责签名验算、加解密与本地服务端能力
- 包管理与检查：Yarn 4、Biome、Vitest

## 快速开始

```powershell
cd dudu-desk
yarn install
yarn dev         # 网页预览
yarn tauri:dev   # 桌面端运行
yarn lint        # 代码检查
yarn test        # 单元测试
```

## 目录结构

```text
dudu-desk/
├── src/           前端：业务模块（待规划）
│   ├── components/ 跨模块共享组件（含 shadcn 生成物）
│   └── lib/       纯函数工具
├── src-tauri/     Rust 后端能力（待规划）
└── package.json   脚本与依赖声明
```

## 相关文档

- 平台研究：`../docs/research/channels/`
- 架构决策记录：`../docs/adr/`
- 界面原型：`../docs/prototype/console.html`
- 工程规范：仓库根 `CLAUDE.md`
