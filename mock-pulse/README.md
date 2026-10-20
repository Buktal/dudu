# mock-pulse

> mock-pulse 是**嘟嘟（DuDu）的第一个子项目**：桌面端聊天平台回调模拟工具。
> 先打一记脉冲，再接真线 —— 零资质本地联调，验签、加密、重试全真。

## 简介

对接聊天开放平台（抖音、企业微信、小红书等）通常需要企业资质与公网可达的回调地址，联调成本高。
mock-pulse 在本地模拟平台侧行为：按官方文档定义的格式发送回调、校验签名、执行加密与重试逻辑，
开发者无需等待资质审批与公网环境，即可在本地完成对接验证。

## 特性

- **高保真模拟**：回调载荷、签名算法、加密方式严格复刻官方文档定义。
- **多平台剧本**：测试剧本按平台独立分组，支持单组执行与多组并发。
- **桌面端体验**：基于 Tauri 的本地应用，开箱即用。
- **合规优先**：仅使用各平台官方公开 API。

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS + shadcn
- 桌面与后端能力：Tauri 2（Rust）—— 负责签名验算、加解密与本地服务端能力
- 包管理与检查：Yarn 4、Biome、Vitest

## 快速开始

```powershell
cd mock-pulse
yarn install
yarn dev         # 网页预览
yarn tauri:dev   # 桌面端运行
yarn lint        # 代码检查
yarn test        # 单元测试
```

## 品牌图标

Logo 以消息气泡包裹 M 形脉冲线，代表本地模拟渠道消息与回调。矢量源文件为 `public/logo.svg`，侧栏与网页 SVG 图标共用此文件。

修改 SVG 后运行 `yarn icons:generate`，通过已安装的 Tauri CLI 同步桌面应用图标与 `public/favicon.ico`。

## 目录结构

```text
mock-pulse/
├── src/           前端：剧本编辑、执行触发与结果展示
│   ├── features/  按业务域纵切的模块
│   ├── components/ 跨模块共享组件（含 shadcn 生成物）
│   └── lib/       纯函数工具
├── src-tauri/     Rust 后端：验签、加解密与平台端点模拟
└── package.json   脚本与依赖声明
```

## 相关文档

- [平台研究](../docs/research/channels/README.md)
- [架构决策记录](../docs/adr/)
- [界面原型](../docs/prototype/mock-pulse/README.md)
- [工程规范](../AGENTS.md)
