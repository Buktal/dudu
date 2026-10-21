# 淘宝传输模式调研：全球栈 HTTPS 回调 vs TMC 长连接

> 研究日期：2026-10-13。任务来源：[#99 淘宝传输模式调研](https://github.com/Buktal/dudu/issues/99)，结论供 [#102 淘宝接入决策](https://github.com/Buktal/dudu/issues/102) 裁决
> 事实基准：[淘宝/天猫开放平台消息推送事实库](../channels/taobao.md)（研究日期 2026-09-10，下称「事实库」），本篇按条目号引用（§n），不重复其内容
> 标注体例沿用事实库：无标注 = 已核验原文；`[摘录]` = WebSearch 官方页面原文摘录（未取全文）；`待核验` = 未取原文。2026-10-13 新增核验逐条注明方式与来源，汇总见 §8
> 方法：事实库条目 + 增量核验——search.maven.org 官方 JSON API 直查、repo1.maven.org 直抓并本地解包 sources/二进制 jar、GitHub 仓库页直抓、WebSearch 官方文档摘录

## 0. 结论先行

1. **全球栈 HTTPS 回调不适用于国内商家 IM**：它是「Taobao Global Open Platform」（跨境供销/Lazada 域）的通道，消息域仅跨境交易；国内商家 IM 消息（OpenIM/旺旺聊天）只存在于国内 TOP 的 TMC topic 体系
2. **国内商家 IM 的推送通道唯一收敛到国内 TMC**（长连接，或其变体 API 轮询 / 聚石塔 MQ/ONS）
3. TMC 在 Java 21 / Spring Boot 3.5 侧**接入依赖有折衷**：官方 SDK 无 Maven 官方坐标（控制台手动下载）；Maven Central 仅第三方 repack（本次实测含完整 `TmcClient`，单 jar 零传递依赖）；协议可自实现但帧格式无官方文档
4. 常驻连接成本可控且有官方语义支撑多实例：同组连接竞争消费（免分布式锁）、首连后自动重连、未确认约 6 分钟重发、消息保留 8–24 小时（事实库 §3.1/§3.3）

## 1. 问题拆解（票 #99）

- (a) 全球栈 HTTPS 回调是否适用于国内商家的 IM（OpenIM OffMsgPush）场景，还是仅限跨境业务
- (b) TMC 长连接（`ws://mc.api.taobao.com/`）在 Java 21 / Spring Boot 3.5 侧的接入依赖与常驻连接成本（连接管理、重连、多实例部署）
- (c) 其他可行路径（MQ 等）

## 2. 线 a：全球栈回调适用范围——不适用国内商家 IM

| # | 证据 | 来源 |
|---|---|---|
| a1 | 国内 TOP 消息服务只有三种订阅方式：TMC 订阅（免费）/ MQ 订阅 / ONS 订阅，**没有向 ISV 服务器 POST 的 HTTP 回调** | 事实库 §3.1（`[摘录]` docId=101663） |
| a2 | 全球栈回调配置页与回调规范属于文档树 `treeId=735`「Taobao Global Open Platform」，是国内独立文档体系 | 事实库 §3.2（`[镜像全文]` open.alitrip.com articleId=119493/119404, treeId=735） |
| a3 | 全球栈官方示例载荷为 `site: "lazada_vn"` 交易域消息（`seller_id`/`message_type`/`data.order_status` 等），无任何 IM/聊天字段 | 事实库 §5.6（`[镜像全文]`） |
| a4 | 全球栈回调文档的消息结构参考仅指向「跨境供销平台、天猫香港」；天猫香港已于 2022-07-22 公告、2022-10-31 零时正式关闭入口，存续仅约 14 个月 | `2026-10-13 [摘录]` WebSearch（天猫香港公告转述：百度百科「天猫香港」词条、财新网《香港电商市场变阵？天猫香港退出 拼多多低调进入》、大公文汇网） |
| a5 | 国内商家 IM 的离线消息 topic `taobao_openim_OffMsgPush` 是国内 TMC 类目 cid=233 中唯一 topic（From淘宝） | 事实库 §2.4（`[镜像全文]` topic_list.htm?cid=233） |

**判定**：a1+a2 说明两套推送体系互不相通（国内无回调、回调属全球栈树）；a3+a4 说明全球栈回调的消息域是跨境交易（且其参考站之一已关停）；a5 说明 IM 消息只在国内 TMC。**全球栈回调对本项目「国内商家 IM」场景为零适用，本轮排除。**

## 3. 线 b：TMC 长连接的 Java 21 / Spring Boot 3.5 接入

### 3.1 依赖获取：官方渠道与 Maven Central 现状

- **官方渠道**：SDK（含 TMC）从 open.taobao.com 开发者控制台**手动下载**，官方文档的接入示例即基于该 SDK（事实库 §1/§5.1，`[摘录]` docId=101618）
- **Maven Central 无官方坐标**。`2026-10-13` 经 search.maven.org 官方检索 API（`solrsearch/select`）直查 `q=taobao-sdk`、`q=taobao-sdk-java`（零结果）、`q=taobao&rows=40`，无 `com.taobao` 官方 groupId 发布（**注**：API 回显有截断，未逐条核对全部返回 doc，此结论为「未发现官方坐标」而非「穷尽证明」）。检索命中的第三方 repack
  - `com.ganshane.specs:taobao-sdk`（最新 `20200313`，2020-03-13 发布，另有旧版本）——`2026-10-13` repo1.maven.org 目录直抓核验
  - `com.hynnet:taobao-sdk:20160607`——同上 API 返回（回显截断标注）
  - `com.dingtalk.open:taobao-sdk-java-auto`（约 2016，4 个版本）——mvnrepository 检索结果旁证（前轮 WebSearch；mvnrepository 站点本次直抓被安全验证拦截，未复核）
- **第三方 repack 非官方维护**：无阿里签名/发布渠道背书，版本停留在 2020 及更早，与官方控制台现行下载版可能存在滞后

### 3.2 repack 实测（2026-10-13 本地解包 `com.ganshane.specs:taobao-sdk:20200313`）

- 二进制 jar 771KB / 593 个 class，sources jar 518KB；**POM 无任何 `<dependencies>` 声明**（仅继承 oss-parent 7）
- TMC 完整在包：`com/taobao/api/internal/tmc/` 共 14 个源文件——`TmcClient`、`MixClient`（类注释「消息服务-推拉客户端」，推 + 定时拉兜底）、`Message`、`MessageHandler`、`MessageStatus`、`MessageKind`、`MessageFields`、`TmcHandler`、`DuplicateRemoverTmcHandler`、`TmcIdentity`、`KeySelector`、`TmcAuthGetRequest/Response`
- 传输层为阿里自研 `com.taobao.api.internal.toplink`（endpoint/channel/embedded 子包），**自带 embedded NIO 实现，未捆绑 netty**（jar 内无任何第三方 class）
- `tmc` + `toplink` 全部源码唯一的第三方 import 是 `org.apache.commons.logging`（grep 全量 import 核验）
- **依赖结论**：单 jar 即用、零传递依赖。在 Spring Boot 3.5 侧 `commons-logging` API 由 `spring-jcl` 天然提供，无新增依赖。代价：类在 `internal` 包（官方即声明无兼容性保证），且该坐标非官方维护

### 3.3 常驻连接的运行语义（源码默认值 + 官方文档）

`TmcClient.java` 源码默认值（`2026-10-13` 解包核验）

| 项 | 默认值 | 含义 |
|---|---|---|
| 服务地址 | `ws://mc.api.taobao.com/`（三参构造默认） | 生产；预发 `ws://premc.api.taobao.com/`（事实库 §3.1） |
| 授权 API 地址 | uri 含 `mc.api.taobao.com` 时自动 = `http://gw.api.taobao.com/router/rest`，`setAuthApiUrl` 可覆盖 | 用于连接鉴权（tmc.auth）；改预发需连 apiUrl 一起覆盖 |
| 分组 | `default`；另支持 minorGroup / filterExp | 同组竞争消费，见 §3.4 |
| 消息缓冲队列 | `queueSize = 2000` | 处理不过来时在客户端内存排队 |
| 处理线程 | `threadCount = CPU 核数 × 10` | `onMessage` 并发度 |
| 手动确认线程 | `confirmThreadCount = 4` | `useDefaultConfirm=false` 时启用 |
| 定时补拉 | `fetchPeriod = 15s` | MixClient 推拉合一的拉兜底周期 |
| 重连间隔 | `reconnectInterval = 10000ms` | 连接关闭后定时重连 |
| 心跳 | `heartbeatInterval = 45000ms` | 客户端-服务端保活 |
| 去重 | `removeDuplicate = false`；`KeySelector` 默认按交易/商品/退款 | `DuplicateRemoverTmcHandler` 可选启用 |
| 确认 | `useDefaultConfirm = true`（处理返回即自动确认） | 手动确认需显式关闭并配 confirm 线程 |

官方语义（事实库 §3.1/§3.3）：连接失败异常不可吞（首连成功后断线**自动重连**）；`onMessage` 抛异常或 `status.fail()` 即回滚重发；未确认约 6 分钟重发；消息保留 8–24 小时；确认比 <20% 自适应限流直至禁消费；订阅关系失效有约 5 分钟缓存

**成本画像**：每实例一条常驻 WebSocket（+45s 心跳与 15s 补拉定时器），资源占用为单连接 + 线程池（默认 CPU×10 个工作线程，可 `setThreadCount` 调小）；无需每用户建连（appkey 级订阅 + 分组路由）。对 DUDU Server 单实例的常态开销可忽略，真正的工程量在确认/幂等/重连策略配置（§3.6）

### 3.4 多实例部署

- **同组多连接 = 竞争消费**：「同一组的消息，随机发送到组内的某一个连接」（事实库 §3.1，`[摘录]` docId=101663）——多实例部署天然负载均衡，**不需要分布式锁或单实例选主**，代价是单条消息只达一个实例（不能靠多实例做广播冗余）
- 每应用最多 50 个分组、分组 API `taobao.tmc.group.add`/`taobao.tmc.user.permit`（topics 覆盖更新须全量，事实库 §3.1）——需要按租户隔离吞吐或分区处理时用分组，`default` 组够用时不必用
- 消息保留 8–24h + 约 6 分钟重发（事实库 §3.3）给滚动发布/重启留了缓冲：短暂掉线不丢消息，恢复后靠服务端重发补偿，消费端仍须幂等（事实库 §3.3：msg id + 业务键）

### 3.5 协议自实现的可行性边界

- 社区已有不依赖官方 SDK 的独立实现，证明 TMC 是标准 WebSocket + 应用层帧：Python `petronny/pytmc`（仓库描述「淘宝开放平台消息服务 Python Websocket 客户端」，唯一依赖 `python-websockets`，即标准 RFC6455）、`period331/taobao-tmc-python`、`pombreda/tmcpy`（PyPI 0.3.7）、Go `bububa/opentaobao`（api/tmc 包）（`2026-10-13` GitHub/PyPI 直抓）
- 但**帧格式无官方文档**（事实库待核验 #1：长连接帧格式与 consume 信封是否同构），自实现需逆向 pytmc 等源码或抓包，且无兼容性承诺；Node 生态无成熟客户端（前轮核验）
- **判定**：协议自实现技术可行、无必要——Java 侧已有可用的官方源码编译物（§3.2），自实现只应作为 repack 不可接受时的备选

### 3.6 与 Spring Boot 3.5 整合要点（供实施参考，非本轮决策）

- 依赖声明：引 `com.ganshane.specs:taobao-sdk:20200313`（或控制台下载 jar 入版本库/私服，二选一，#102 定）
- 生命周期：`TmcClient.connect()` 放 Spring 容器启动钩子、`close` 挂停机钩子；SDK 自带重连（10s 间隔）与健康语义，`connected` 原子位可作健康检查探针
- 确认策略：官方规范「收到消息先入待处理队列、异步消费」（全球栈回调同款口径，事实库 §3.2）在 TMC 侧对应**先确认后异步处理**或手动确认模式；须守住确认比 ≥20% 流控线（§3.3）
- 幂等：`message.getId()` + 业务键（tid/refund_id/num_iid）；SDK 内置 `DuplicateRemoverTmcHandler` 可选
- 环境：预发验证需同时覆盖 `ws://premc.api.taobao.com/` 与对应 apiUrl（§3.3 表）

## 4. 线 c：其他路径

- **API 轮询**（`taobao.tmc.messages.consume`/`confirm`）：官方定位「对多线程和长连接处理不方便的语言」、空轮询等 1 秒以上、低实时（事实库 §3.1/§5.2）。Java 侧已有长连接能力时不采用；仅可作小流量兜底或联调手段
- **聚石塔 MQ/ONS 订阅**：官方口径「TMC 订阅（免费）适用基本所有类型的消息，**仅部分涉及电商核心数据的消息 Topic 不支持 TMC 订阅，必须走 MQ 订阅/ONS 订阅入聚石塔**」；MQ/ONS 需购买聚石塔 RocketMQ 中间件实例、塔内消费（`2026-10-13 [摘录]` docId=101663 镜像 developer.alibaba.com treeId=813；消息同步组件流程另见 docId=102992：`taobao.jushita.jms.user.add` + 同步 MQ 消息权限包）。**含义**：MQ/ONS 不是「更高级的通用选项」，而是特定核心数据 Topic 的强制通道 + 塔内部署约束；对 IM/聊天域是否触发该强制，官方未逐 Topic 列明 → 移交 §7 开放问题
- **瓦力（旺旺聊天消息服务）**：旺旺聊天消息的产品化订阅，本身经 TMC 推送，计费 0.01 元/百条（事实库 §2.4/§6，`[摘录]` 收费细则页 docId=104559）。它是 TMC 之上的业务开通项，不是独立传输通道——传输层仍走本篇线 b 的结论

## 5. 选项对比

| 维度 | A. 全球栈 HTTPS 回调 | B. 国内 TMC 长连接 | C. MQ/ONS（聚石塔）/ API 轮询 |
|---|---|---|---|
| 适用场景 | 跨境供销/Lazada 域交易消息 | 国内 TOP 基本所有类型消息，含 IM（cid=233）/瓦力 | MQ/ONS：仅特定核心数据 Topic（强制）；轮询：低实时兜底 |
| 对国内商家 IM | **不适用**（§2：两套体系 + 消息域不符） | **唯一可行推送通道** | MQ/ONS 未证实覆盖 IM；轮询实时性不足 |
| 接入依赖 | 标准 HTTPS 服务端（DUDU 已有形态） | 官方 jar 手动下载或第三方 repack（零传递依赖）；internal 包无兼容保证 | RocketMQ 实例采购 + 塔内部署 / 复用现有 TOP 客户端 |
| 常驻成本 | 无连接（被动收 POST） | 每实例 1 条 WebSocket + 心跳 45s + 线程池；首连后自动重连 | MQ 实例固定成本；轮询无常驻但实时性差 |
| 多实例 | 无状态水平扩展 | 同组竞争消费，免锁；非广播 | 塔内消费者组语义；轮询指针单点 |
| 可靠语义 | 500ms 内 200，失败半小时重试至多 12 次 | 约 6 分钟重发、保留 8–24h、确认比 20% 流控 | MQ 自控保留；轮询确认后不可再取 |
| 安全/合规 | https + OV/EV 证书、明文 + HMAC-SHA256 头 | 明文 JSON、appkey/appsecret 鉴权（连接签名） | 数据不出塔合规通道 |
| mock-pulse 现状 | 已模拟（`mock-pulse` taobao 模块，模块头注明「TMC 长连接不在范围」） | **未模拟**（事实库附录已给模拟口径速查，需新增 TMC 服务端模拟） | 均未模拟 |

## 6. 建议（供 #102 裁决）

1. **国内商家 IM 走 TMC 长连接**；全球栈 HTTPS 回调本轮排除（场景不符，非质量问题）——若未来做跨境渠道再按事实库 §3.2 单独立项
2. 接入形态二选一（#102 定）
   - 推荐：Maven 引 `com.ganshane.specs:taobao-sdk:20200313`（本次已实测可用、零传递依赖），接受「第三方 repack + internal 包」折衷并注释声明
   - 保守：控制台下载官方 jar 入私服/版本库，换取官方来源、付出分发管理成本
3. MQ/ONS 不作为 IM 通道候选（部署与采购约束，且未证实覆盖 IM topic）；API 轮询仅留作联调/兜底
4. 实施前置核验（移交 §7）：确认 IM/瓦力相关 topic 在 TMC 订阅下可用（未被「核心数据强制入塔」规则命中）、瓦力服务开通审批与计费确认

## 7. 开放问题（移交 #102 / 后续核验）

1. `taobao_openim_OffMsgPush` 及瓦力聊天 topic 是否属于「不支持 TMC 订阅、必须 MQ/ONS 入聚石塔」的核心数据 Topic（官方未逐 Topic 列明，`2026-10-13 [摘录]` docId=101663）
2. 瓦力服务开通链路、权限包与字段口径（事实库待核验 #4 仍未解）
3. TMC 长连接帧格式官方口径（事实库待核验 #1），影响 §3.5 自实现备选的评估深度
4. ganshane repack（2020）与现行控制台 SDK 的版本差异是否影响 IM topic 消费（需真连验证）

## 8. 来源清单（2026-10-13 增量核验）

| 事实 | 方式与来源 |
|---|---|
| Maven Central 无官方坐标、第三方 repack 坐标清单 | search.maven.org `solrsearch/select`（q=taobao-sdk / q=taobao-sdk-java / q=taobao&rows=40；回显截断，未逐条核对全部 doc） |
| ganshane repack 内容（TMC 14 源文件、toplink 传输、零依赖 POM、593 class、唯一 commons-logging import） | repo1.maven.org 直抓 `taobao-sdk-20200313.jar`/`-sources.jar`/`.pom` 并本地解包 grep（本次解包，原件在 `/tmp`，未入库） |
| `com.dingtalk.open:taobao-sdk-java-auto`（约 2016） | mvnrepository 检索结果旁证（前轮 WebSearch；站点本次直抓被安全验证拦截，未复核） |
| TMC 订阅免费、部分核心数据 Topic 强制 MQ/ONS 入聚石塔 | `[摘录]` docId=101663 镜像 developer.alibaba.com（treeId=813，更新 2026-08-28）；消息同步组件 docId=102992 |
| 天猫香港 2022-10-31 关闭入口 | `[摘录]` WebSearch：[百度百科「天猫香港」](https://baike.baidu.com/item/%E5%A4%A9%E7%8C%AB%E9%A6%99%E6%B8%AF/56897675)、财新网、大公文汇网（2022-07-22 公告转述） |
| pytmc / tmcpy / opentaobao 独立实现先例 | GitHub 仓库页直抓：[petronny/pytmc](https://github.com/petronny/pytmc)、[period331/taobao-tmc-python](https://github.com/period331/taobao-tmc-python)；PyPI tmcpy 0.3.7；Go bububa/opentaobao |
| mock-pulse 仅模拟全球栈回调 | 仓库内 `mock-pulse/src-tauri/src/connections/taobao/mod.rs` 模块头（本 worktree @ a2f17d4） |
| 其余 TMC 语义（地址/分组/重发/保留/流控/示例代码） | 事实库 §3.1/§3.3/§5.1（2026-09-10 核验，本篇未重复核验） |
