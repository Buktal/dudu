# DuDu | Open-source multichannel customer support

[简体中文](README.md) | **English**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**Open-source, self-hosted multichannel customer support.**

DuDu is an open-source, self-hosted multichannel customer support system licensed under Apache-2.0. It brings WeChat, Telegram, WhatsApp and other channel messages into a unified inbox, scopes access by organization and group, and gives support agents one place to read conversation history, reply, and maintain visitor profiles. This repository includes the server, agent workspace, platform and organization administration apps, and a local channel callback simulator.

[Project website](https://buktal.github.io/dudu/en.html) · [Setup and integration guides](https://buktal.github.io/dudu/guides/index.en.html) · [Run locally](#run-locally) · [Channels and limitations](#channels-and-limitations) · [Development and contributions](#development-and-contributions) · [Documentation](docs/README.md)

![DuDu agent workspace with a conversation queue, chat history, and visitor profile](docs/design/dudu-console/qa-desk-live-1440.png)

*An actual workspace connected to a local Server during acceptance testing. All content shown is test data. The current interface is in Chinese.*

## Project overview

Multichannel support means dealing with scattered messages, inconsistent conversation states, and access rules for accounts and their history. DuDu brings these into one flow:

```text
Incoming callback → Verify and parse → Persist conversation → Push updates → Agent workspace
                                                                                 ↓
                                                                  Reply through the channel
```

It is intended for teams that need several official messaging integrations and want to host their own system and control organization data. It also serves developers working on messaging protocols, channel adapters, and support interfaces.

## Core capabilities

- **A unified inbox:** conversation queues, search and filters, history loaded on demand, live incoming messages, plain-text replies, and visible send failures.
- **Three workspace layouts:** focused, side-by-side, and cards, sharing conversation data and drafts. Run in a browser or build the Tauri desktop app.
- **Shared visitor profiles:** view information provided by the channel and maintain tags and internal notes shared by authorized staff.
- **Organization and group boundaries:** assign staff and channel accounts to groups. Permission changes make the workspace reload its scope; access to history follows current authorization.
- **Separate administrative roles:** platform administrators provision organizations; organization administrators manage staff, groups, and channel accounts. Secret credentials can be written but are never returned in read responses.
- **Local protocol testing:** MockPulse constructs channel callbacks, signatures, and encrypted payloads, with saved event fixtures, scripts, and orchestrated runs.

DuDu is under active development. Building from source and local integration testing are the main ways to use it today; there are no official release packages or hosted demo yet. See the [feature maps](docs/features/README.md) and [Console full-stack acceptance record](docs/design/dudu-console/acceptance.md) for implementation and validation scope.

## Channels and limitations

Server and Console currently cover **13 implemented channel adapters**. Each integration supports the specific interface below; it does not imply support for every product, event, or messaging capability offered by that platform.

| Channel | Supported interface / main boundary |
| --- | --- |
| WeChat Official Accounts | Plaintext callbacks; Official Account AES mode is not supported |
| WeChat Mini Programs | Customer service callbacks, including plaintext and encrypted modes |
| WeCom | Custom application agent callbacks; aibot is not supported |
| DingTalk | Encrypted HTTP callbacks; Stream is not supported |
| Feishu | HTTP Webhook, with optional encryption configuration |
| QQ | Bot Webhook; sending in guild/channel conversations is restricted |
| Weibo | Fan service messages; sending requires an existing authorized token |
| Douyin | Implemented direct messaging interface; sending requires existing authorization credentials |
| Xiaohongshu | Mini program customer service messaging |
| Alipay | Life Account messaging |
| Meituan | Partner platform push; HTTP on port 80/8080 only, preserving the actual public Host |
| Telegram | Bot API Webhook; token rotation must retain the same Bot ID |
| WhatsApp | Cloud API Webhook; sending is subject to platform permissions and conversation rules |

See the [channel configuration reference](docs/design/dudu-console/channel-fields.md) for fields and prerequisites, and the [channel research](docs/research/channels/README.md) for protocol sources. The research covers more platforms than the implemented adapters; research alone does not mean an integration is available.

**Current boundaries:** the agent workspace sends plain text only; attachment sending is disabled. Incoming non-text display and media retrieval depend on the channel. Console does not provide an OAuth authorization wizard, automatic connectivity checks, or channel health monitoring. Complete configuration only indicates that parameters are present, not that authorization is valid or production messaging works. Deployers must obtain platform approval and production credentials and validate the public end-to-end connection.

## Repository layout

| Project | Audience / responsibility | Technology |
| --- | --- | --- |
| [DuduDesk](dudu-desk/README.md) | Agents: conversations, replies, and visitor profiles | React, TypeScript, Tauri 2 |
| [DuduConsole](dudu-console/README.md) | Organization administrators: staff, groups, and channel accounts | React, TypeScript |
| [DuduAdmin](dudu-admin/README.md) | Platform administrators: organization provisioning, overview, and operation logs | React, TypeScript |
| [DUDU Server](dudu-server/README.md) | Authentication, authorization, persistence, channel adapters, HTTP/WebSocket | Java 21, Spring Boot 3.5, MyBatis-Plus, MySQL |
| [MockPulse](mock-pulse/README.md) | Developers: local callback simulation and protocol testing | React, Tauri 2, Rust |

Each frontend manages its dependencies independently using Yarn 4, Vite, Tailwind CSS, and shadcn. MockPulse is optional: run it when you need to simulate platform callbacks, not as a prerequisite for running the support system.

## Run locally

This is a development walkthrough. The administration apps and agent workspace run in a browser without Rust. Ports below are explicitly selected for this walkthrough.

### 1. Prerequisites

- Git, Java 21, Maven 3.9, and Docker Compose.
- Node.js 22.12+. Enable Corepack and use the Yarn 4 version declared in each project's `packageManager` field.
- For desktop builds, install Rust and the operating system dependencies listed in the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
git clone https://github.com/Buktal/dudu.git
cd dudu
corepack enable
```

### 2. Start MySQL and Server

From the repository root, start development MySQL and then Server in the same terminal:

```sh
docker compose -f dudu-server/compose.yaml up -d --wait
cd dudu-server
mvn spring-boot:run
```

Server listens on `8080`; Flyway applies database migrations automatically. The first start against an empty database creates the platform administrator **`admin` / `admin`**. The Compose database passwords and default Server JWT secret are for local development only and must be changed before exposing the service. See the [Server deployment instructions](dudu-server/README.md#线上部署边界).

### 3. Provision an organization and sign in

Open three additional terminals, each starting from the repository root:

```sh
# Terminal A: platform administration
cd dudu-admin
yarn install
yarn dev --port 5173 --strictPort
```

```sh
# Terminal B: organization console
cd dudu-console
yarn install
yarn dev --port 5174 --strictPort
```

```sh
# Terminal C: agent workspace
cd dudu-desk
yarn install
yarn dev
```

1. Open [Admin](http://localhost:5173), sign in with the local platform administrator, and create an organization with its initial administrator. Note its six-digit organization ID.
2. Open [Console](http://localhost:5174) and sign in using that ID and the initial administrator. Create staff accounts and groups, add group members, and connect a channel account.
3. Open [Desk](http://localhost:1423) and sign in with the organization ID and a staff account assigned to a group. An empty inbox is expected when no channel account is in the staff member's scope.
4. Configure the callback URL shown in Console on the channel platform, or use [MockPulse](mock-pulse/README.md) for local protocol tests. Desk shows conversations after receiving valid messages. Replies also require the channel's sending credentials and platform permissions.

All three frontend development servers proxy `/api` to the local Server; Desk also proxies `/ws`. Consult each project's README for production API origins, WebSocket routing, and public callback origin configuration. These commands are not a production deployment procedure.

## Development and contributions

Use [Issues](https://github.com/Buktal/dudu/issues) for bugs and proposals. Include the affected project, version or commit, reproduction steps, expected and actual behavior, and sanitized error details. Do not upload channel secrets, tokens, or real visitor data.

Before changing behavior, review the relevant [contracts and designs](docs/design/README.md) and [engineering conventions](AGENTS.md). Preserve authorization boundaries and update the corresponding feature map when changing a feature. In each affected frontend project, run:

```sh
yarn lint
yarn check:type
yarn test
yarn build
```

Run `mvn test` in `dudu-server/`. Database integration tests are skipped by default; enable them explicitly and use an isolated review database as described in the [Server testing instructions](dudu-server/README.md#数据库集成测试). Never point integration tests at development or production business databases. For desktop Rust changes, also run that project's `yarn check:rust`.

Further reading: [feature maps](docs/features/README.md) · [architecture decisions](docs/adr/) · [domain glossary](GLOSSARY.md) · [channel protocol research](docs/research/channels/README.md). Most detailed project documentation is currently in Chinese.

## Open-source license

DuDu is licensed under the [Apache License 2.0](LICENSE). It permits use, modification, distribution, and commercial use, including proprietary modified products, subject to its terms. Distributions must retain applicable copyright and license notices and identify modifications as required. The license does not grant trademark rights and provides no warranty.

Third-party dependencies and assets remain subject to their respective licenses; this project's license does not replace those terms.
