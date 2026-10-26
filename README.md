# DuDu 嘟嘟｜开源多渠道客服系统

**简体中文** | [English](README.en.md)

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**将多个渠道的消息集中到同一坐席工作台，支持在自己的服务器上部署。**

DuDu 帮助客服团队统一接收渠道来信、查看会话历史、回复消息并维护来访资料。系统接入微信公众号、Telegram、WhatsApp 等平台的指定消息体系，按企业和用户组划分访问范围。

[**体验接待导览**](https://buktal.github.io/dudu/demo.html) · [项目官网](https://buktal.github.io/dudu/) · [部署与接入指南](https://buktal.github.io/dudu/guides/index.html)

![DuDu 坐席工作台：会话列表、消息记录与来访资料](docs/design/dudu-console/qa-desk-live-1440.png)

*工作台界面示例，内容为演示数据。*

## 从哪里开始

| 您的目标 | 推荐入口 |
| --- | --- |
| 了解产品是否适合团队 | [接待导览](https://buktal.github.io/dudu/demo.html)：选择渠道来信、查看会话、模拟回复和查看来访资料 |
| 部署并使用系统 | [本地运行](#本地运行)，再按[使用指南](https://buktal.github.io/dudu/guides/index.html)配置企业与渠道 |
| 理解代码或参与开发 | [仓库组成](#仓库组成)、[开发与参与](#开发与参与)及[技术文档](docs/README.md) |

导览采用固定示例数据，不连接服务端或真实渠道，是精简的产品介绍，并非真实在线试用。项目处于持续开发阶段，目前需要通过源码构建和自行部署使用，尚无正式发布包。

## 团队如何使用 DuDu

1. **配置团队与渠道。** 平台管理员开通企业；企业管理员配置员工、用户组和渠道账号。
2. **接收并回复消息。** 坐席登录工作台，在授权范围内查看会话、读取历史并发送纯文本回复。
3. **保留接待上下文。** 有权限的员工共享来访标签与内部备注，为后续接待提供必要信息。

工作台提供专注、并排、卡片三种布局，共享会话数据与草稿，支持浏览器访问和 Tauri 桌面构建。**MockPulse 是可选的开发联调工具，运行客服系统无需启动它。**

各应用的功能与界面介绍：[Desk](https://buktal.github.io/dudu/products/desk.html) · [Console](https://buktal.github.io/dudu/products/console.html) · [Admin](https://buktal.github.io/dudu/products/admin.html) · [MockPulse](https://buktal.github.io/dudu/products/mockpulse.html) · [Server](https://buktal.github.io/dudu/products/server.html)。

## 是否适合您的团队

DuDu 适合需要接入多个官方消息渠道、能够自行部署和维护系统、希望控制企业数据的团队。部署与渠道接入需要相应的开发和运维能力。

- **当前能力**：统一会话、搜索与筛选、历史记录、实时来信、纯文本回复、消息阅读翻译、AI 会话摘要与回复草稿建议、来访标签与内部备注，以及员工、渠道、企业和用户组权限管理。
- **当前限制**：暂不支持发送附件；接收非文本消息与读取媒体取决于具体渠道。不提供内置 OAuth 授权向导、自动连通检测或渠道健康监控。
- **上线准备**：部署方需完成渠道账号申请、平台审核、凭据配置与真实收发验证。参数填写完整不代表授权有效或生产环境已可收发。

已实现能力及验证范围见[功能图谱](docs/features/README.md)。

## AI 悬浮助手

在接待会话旁展开助手，了解咨询来意、拟写回复、润色草稿或继续追问。助手跟随当前回复对象，适用于专注、并排、卡片三种布局；建议先采纳到回复草稿，由坐席核对后通过原有输入框发送

![Desk 悬浮 AI 助手：当前会话、回复建议与放入草稿操作](docs/design/dudu-desk/assistant/desk.png)

初始企业管理员在 Console 的 **AI 与翻译服务** 中选择受支持的通用模型，可与阅读翻译使用不同服务。启用后，授权会话的近期文本、标签、内部备注和本次草稿会发送给所选模型，未配置时助手不提供生成能力

![Console 独立选择默认翻译服务与 AI 助手模型](docs/design/dudu-desk/assistant/console.png)

*截图为真实组件的固定演示数据与模型响应；实际使用需接入企业自己的模型服务*

## 消息翻译

坐席可以逐条点击翻译，也可以在工作台设置中开启自动翻译并选择阅读语言，原文与译文同时保留，发送给来访用户的内容保持原样

**Desk：阅读译文与设置自动翻译**

![Desk 消息翻译：原文、译文与阅读语言设置](docs/design/dudu-desk/translation/desk-preview.png)

**Console：配置企业自己的翻译服务**

初始企业管理员可配置常规翻译 API 或模型翻译服务、测试连接并选择企业默认服务，凭据保存后不回显；各坐席使用同一企业默认服务，并保留自己的阅读偏好

![Console 翻译配置：企业默认服务、接口与凭据表单](docs/design/dudu-desk/translation/console-preview.png)

*截图为真实组件的固定演示数据，不连接供应商；实际翻译需配置企业自有服务并完成连接测试，支持范围与环境限制以控制台服务目录为准*

## 渠道与限制

目前已实现 **13 种渠道接入**。每种接入对应下表中的指定体系，不代表该平台所有产品、事件和收发能力均可用。

<details>
<summary>查看各渠道的接入体系与限制</summary>

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

</details>

详细字段与准备条件见[渠道配置说明](docs/design/dudu-console/channel-fields.md)。[渠道事实库](docs/research/channels/README.md)研究范围比正式接入更广，研究过不等于已经接入。

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
