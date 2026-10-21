# DuDu 嘟嘟｜开源多渠道客服系统

**简体中文** | [English](README.en.md)

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**开源、自托管的多渠道客服系统。**

DuDu 是采用 Apache-2.0 许可证的开源多渠道客服系统，可自行部署，统一接待微信公众号、Telegram、WhatsApp 等渠道消息，按企业和用户组划分访问范围，让坐席在统一工作台查看历史、回复消息、维护来访资料。仓库包含服务端、坐席工作台、两类管理端，以及用于本地联调的渠道回调模拟工具。

[项目官网](https://buktal.github.io/dudu/) · [部署与接入指南](https://buktal.github.io/dudu/guides/index.html) · [本地运行](#本地运行) · [渠道与限制](#渠道与限制) · [开发与参与](#开发与参与) · [文档](docs/README.md)

![DuDu 客服工作台：会话队列、聊天记录与来访资料](docs/design/dudu-console/qa-desk-live-1440.png)

*实际工作台连接本地 Server 的验收截图，内容为测试数据。*

## 项目概述

多渠道接待的基本问题，是消息分散、接待状态不一致，以及账号和历史记录的访问范围难以维护。DuDu 通过统一的消息处理流程组织渠道接入与坐席接待：

```text
渠道来信 → 验签与解析 → 持久化会话 → 实时推送 → 坐席接待
                                               ↓
                                    按渠道实际能力发送回复
```

适合需要接入多个官方消息渠道、希望自行部署并控制企业数据的团队，也适合研究消息协议、渠道适配与客服工作台的开发者。

## 核心能力

- **统一接待**：会话队列、搜索与筛选、按需加载历史、实时来信、纯文本回复和失败状态展示。
- **多模式工作台**：专注、并排、卡片三种接待模式，共享会话数据与草稿；支持浏览器运行和 Tauri 桌面构建。
- **共享来访资料**：查看渠道提供的信息，维护有权员工之间共享的标签与内部备注。
- **隔离企业与接待范围**：企业内按用户组分配员工和渠道账号；权限变化后工作台重查范围，历史随当前授权可见。
- **分层管理**：平台管理员开通企业；企业管理员维护员工、用户组和渠道账号，凭据只写入、不读回秘密值。
- **本地协议验证**：MockPulse 构造渠道回调、签名和加密报文，支持事件素材、剧本及编排运行。

项目处于持续开发阶段。目前以源码构建和本地联调为主要使用方式，尚无正式发布包或托管演示。已实现能力与验收范围见[功能图谱](docs/features/README.md)和[Console 前后端验收记录](docs/design/dudu-console/acceptance.md)。

## 渠道与限制

Server 和 Console 当前覆盖 **13 种已有渠道适配器**。接入某个渠道只表示实现了下列指定体系，不代表该平台所有产品、事件和收发能力均可用。

| 渠道 | 当前接入体系 / 主要边界 |
| --- | --- |
| 微信公众号 | 明文回调；不支持公众号 AES 模式 |
| 微信小程序 | 客服消息回调，支持明文与加密模式 |
| 企业微信 | 自建应用 agent；不支持 aibot |
| 钉钉 | HTTP 密文回调；不支持 Stream |
| 飞书 | HTTP Webhook；可选加密配置 |
| QQ | 机器人 Webhook；频道会话发送受限 |
| 微博 | 粉丝服务消息；发送需已有授权令牌 |
| 抖音 | 已实现的私信接入；发送需已有授权凭据 |
| 小红书 | 小程序客服消息体系 |
| 支付宝 | 生活号消息体系 |
| 美团 | 合作中心推送；仅 HTTP、80/8080 入口，须保留实际公网 Host |
| Telegram | Bot API Webhook；凭据轮换必须保持同一 Bot ID |
| WhatsApp | Cloud API Webhook；发送受平台权限与会话规则约束 |

详细字段与准备条件见[渠道配置说明](docs/design/dudu-console/channel-fields.md)，协议依据见[渠道事实库](docs/research/channels/README.md)。事实库研究范围比正式适配器更广，研究过不等于已经接入。

**当前边界：**工作台出站仅接通纯文本，附件发送入口停用；入站非文本展示和媒体读取按具体渠道能力处理。Console 不提供 OAuth 授权向导、自动连通检测或渠道健康监控。参数齐全只表示配置存在，不能证明授权有效或生产可收发。生产账号申请、平台审核、正式凭据及公网端到端验证仍需部署方完成。

## 仓库组成

| 子项目 | 使用者 / 职责 | 技术 |
| --- | --- | --- |
| [DuduDesk](dudu-desk/README.md) | 坐席：接待、回复和来访资料 | React、TypeScript、Tauri 2 |
| [DuduConsole](dudu-console/README.md) | 企业管理员：员工、用户组、渠道账号 | React、TypeScript |
| [DuduAdmin](dudu-admin/README.md) | 平台管理员：企业开通、运营概览和操作记录 | React、TypeScript |
| [DUDU Server](dudu-server/README.md) | 认证、授权、持久化、渠道适配及 HTTP/WebSocket | Java 21、Spring Boot 3.5、MyBatis-Plus、MySQL |
| [MockPulse](mock-pulse/README.md) | 开发者：本地渠道回调模拟与协议联调 | React、Tauri 2、Rust |

各前端独立管理依赖，使用 Yarn 4、Vite、Tailwind CSS 和 shadcn。运行客服系统不需要启动 MockPulse；模拟平台回调时再使用它。

## 本地运行

以下步骤用于本地开发环境。管理端与工作台支持浏览器访问，无需安装 Rust。命令中的端口是本节显式指定的本地端口。

### 1. 准备环境

- Git、Java 21、Maven 3.9、Docker Compose。
- Node.js 22.12+；启用 Corepack，使用各子项目 `packageManager` 指定的 Yarn 4。
- 构建桌面端时，另按 [Tauri 2 环境要求](https://v2.tauri.app/start/prerequisites/)安装 Rust 和操作系统依赖。

```sh
git clone https://github.com/Buktal/dudu.git
cd dudu
corepack enable
```

### 2. 启动数据库和服务端

在仓库根目录启动开发 MySQL，再在同一终端启动 Server：

```sh
docker compose -f dudu-server/compose.yaml up -d --wait
cd dudu-server
mvn spring-boot:run
```

Server 监听 `8080`，Flyway 自动应用迁移。首次空库启动时创建平台管理员 **`admin` / `admin`**。Compose 的数据库口令及 Server 默认 JWT 密钥均仅用于本地开发；公开服务前必须更换，具体配置见 [Server 部署说明](dudu-server/README.md#线上部署边界)。

### 3. 开通企业，再登录控制台和工作台

分别开启三个终端，分别从仓库根目录运行：

```sh
# 终端 A：平台管理后台
cd dudu-admin
yarn install
yarn dev --port 5173 --strictPort
```

```sh
# 终端 B：企业控制台
cd dudu-console
yarn install
yarn dev --port 5174 --strictPort
```

```sh
# 终端 C：坐席工作台
cd dudu-desk
yarn install
yarn dev
```

1. 打开 [Admin](http://localhost:5173)，用本地平台管理员登录并开通企业，设置初始企业管理员，记录六位企业 ID。
2. 打开 [Console](http://localhost:5174)，用企业 ID 和初始管理员登录，创建员工、用户组，添加成员，再接入渠道账号。
3. 打开 [Desk](http://localhost:1423)，用企业 ID 和已分组员工登录。没有授权渠道账号时，空会话列表是正常状态。
4. 在渠道平台配置 Console 提供的回调地址；本地协议联调可使用 [MockPulse](mock-pulse/README.md)。收到合法来信后，Desk 展示会话；回复还需要该渠道的发送凭据与平台权限。

三个前端开发服务器均将 `/api` 代理到本机 Server，Desk 另代理 `/ws`。生产 API 地址、WebSocket 与公开回调根地址的配置以各子项目 README 为准；上述启动命令不是生产部署方案。

## 开发与参与

问题和改进建议请提交到 [Issues](https://github.com/Buktal/dudu/issues)。报告问题时附上子项目、版本或提交号、复现步骤、预期与实际行为，以及脱敏后的错误信息；不要上传渠道密钥、令牌或真实来访用户数据。

提交改动前，先查对应[数据契约与设计](docs/design/README.md)和[工程规范](AGENTS.md)，保持当前行为与权限边界。功能改动同步对应功能图谱。前端在所改子项目运行：

```sh
yarn lint
yarn check:type
yarn test
yarn build
```

Server 在 `dudu-server/` 运行 `mvn test`。普通测试默认跳过数据库集成用例；集成验证需显式配置门闩与独立评审数据库，见 [Server 测试说明](dudu-server/README.md)。不要指向开发或生产业务库。涉及桌面 Rust 改动时执行该子项目的 `yarn check:rust`。

更多入口：[功能图谱](docs/features/README.md) · [架构决策](docs/adr/) · [领域术语](GLOSSARY.md) · [渠道协议资料](docs/research/channels/README.md)。

## 开源许可证

DuDu 采用 [Apache License 2.0](LICENSE) 开源。允许使用、修改、分发和商业使用，包括在遵守许可证的前提下将修改版用于闭源产品。分发时须保留适用的版权与许可声明，并按条款标明修改；许可证不授予项目商标使用权，也不提供担保。

第三方依赖和素材仍遵循各自许可证；本项目许可证不替代它们的授权条件。

[![LINUX DO](https://img.shields.io/badge/LINUX%20DO-Recognized%20Community-blue?style=flat-square&logo=linux)](https://linux.do)
