# Java 日志规范调研

> 调研日期：2026-09-29。目的：为 AGENTS.md 追加 dudu-server（Spring Boot 3.5 / Java 21）日志规范做前置调研。
> 已定决策：Java 日志统一用 Lombok `@Slf4j`。核心疑问：`log.info` 的消息内容怎么写——要不要写当前类名、方法名，还是写别的。
> 来源：阿里《Java 开发手册》日志规约、美团技术团队实践、Logback/Log4j2 官方文档、Spring Boot 默认配置。

## 一、核心疑问的答案：类名、方法名都不写

日志定位信息由框架层承担，消息层只写业务事实：

| 信息 | 由谁承担 | 机制 | 成本 |
| --- | --- | --- | --- |
| 类名 | logger 名（= 类全限定名） | `@Slf4j` 按类生成 logger；Spring Boot 默认 pattern 已含 `%logger{39}`，每行日志自动带类名 | 零（logger 名创建时已定，不抓栈） |
| 方法名 / 行号 | 不承担，生产禁用 | `%M` / `%L` 需运行时抓调用栈逐帧解析，Log4j2/Logback 官方均标注 expensive，是高频日志场景 QPS 瓶颈之一 | 高 |
| 消息 | 手写 | 事件 + 结果 + 关键业务标识 | — |

结论：

- **手写类名是重复**：`%logger` 已经在每一行输出类名，消息里再写 `XxxService.createOrder: ...` 是纯冗余。
- **手写方法名是易腐**：方法改名/移动后日志说谎，且没有 grep 价值（定位用 logger 名 + IDE 跳转更快）。
- **消息写「一件事」**：发生了什么动作、结果如何、能定位到具体业务对象的标识。即「事件 + 结果 + key=value 上下文」，例如 `log.info("[conversation] 会话已创建, enterpriseId={}, conversationId={}", ...)`。

## 二、各大厂规范怎么写（条文 + 呈现形式）

### 2.1 阿里《Java 开发手册》——业界事实标准

呈现形式：每条 = 【强制 | 推荐 | 参考】分级 + 条文 + 说明 + 正例/反例代码块。日志规约核心条文（语义摘录，非逐字）：

1. 【强制】用 SLF4J 门面 API，禁止直接用 Log4j/Logback API（实现可切换、处理统一）。
2. 【强制】变量拼接用占位符 `{}`，禁止字符串拼接（拼接在日志被禁用时也会执行）。
3. 【强制】trace/debug/info 必须用占位符或 `isDebugEnabled()` 条件输出。
4. 【强制】日志文件至少保存 15 天（有些异常以「周」为频次）。
5. 【强制】扩展日志命名 `appName_logType_logName.log`，stats/monitor/visit 分类，业务日志与错误日志分文件。
6. 【强制】避免重复打印，logback 配置 `additivity=false`。
7. 【强制】异常日志含两条信息：案发现场（关键参数）+ 完整堆栈——异常对象作 `log.error(msg, e)` 最后一个参数。
8. 【推荐】生产禁 debug 日志、有选择输出 info；注意量，防撑爆磁盘。
9. 【推荐】用户输入参数错误用 warn 记录，不要打 error——避免告警疲劳（狼来了），真正系统错误才 error。
10. 【参考】获取 logger：`private static final Logger logger = LoggerFactory.getLogger(Abc.class);`。

与 `@Slf4j` 的关系：Lombok 生成的正是第 10 条的声明（字段名 `log`），且是 SLF4J 类型——同时满足第 1 条（门面）与第 10 条（声明式），所以「必须 `@Slf4j`」与阿里规约完全兼容。

### 2.2 美团技术团队实践

- 级别语义策略化：ERROR = 需要立即告警响应；WARN = 定期看趋势、异常升高才排查；INFO = 核心业务事件，审计与链路追踪。
- 日志分类治理：系统异常日志（带堆栈）/ 接口摘要日志（入口出口、耗时、状态码）/ 业务摘要日志（关键动作 + 业务 ID）/ 详细日志（DEBUG，生产关）。
- 全链路排查：拦截器把 traceId / 操作人放 MDC，统一 pattern 输出（当前 dudu-server 无此需求，留作演进项）。
- 性能坑：同步日志、日志队列满时可阻塞业务线程（《日志导致线程 Block 的这些坑》）。

### 2.3 Logback / Log4j2 官方

- caller data（`%M` 方法名 / `%class` / `%L` 行号 / `%file`）需要抓取并解析调用栈，官方文档明确「expensive operation」。
- `%logger` 只是取 logger 实例名，零额外开销；推荐 pattern：`%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n`。

### 2.4 Spring Boot 3.5 默认行为（dudu-server 现状直接适用）

- 默认 SLF4J + Logback；dudu-server 未自定义 `logging.*`，走默认 pattern：时间、级别、PID、线程、`%logger{39}`、消息——**类名已在每一行**。
- 未输出方法名/行号（好事，保持默认即可）。

## 三、dudu-server 现状盘点

- 全库唯一日志使用处：`GlobalExceptionHandler.java`（`dudu-server/src/main/java/com/dudu/duduserver/config/exception/`）。
- 已符合：`@Slf4j`、占位符传参、异常作最后参数、级别决策写进类注释（业务异常 warn 不带栈、未知异常 error 带栈）。
- 已有自发风格：`[tag] 中文描述 参数…`，tag 现有 `[biz]` `[param]` `[unknown]` 三枚——可作为规范的雏形。

## 四、可直接落规范的无争议条目（各厂一致）

1. 统一 `@Slf4j`，禁止手写 `LoggerFactory.getLogger` / `System.out` / `e.printStackTrace()`。
2. 占位符 `{}` 传参，禁止拼接；仅当参数本身昂贵（如序列化大对象）才用 `isDebugEnabled()` 包裹。
3. 异常对象恒作最后一个参数：`log.warn("[x] 描述 {}", arg, e)`；error 恒带栈；warn 按是否需要堆栈取舍。
4. 级别语义：ERROR 系统故障需人介入；WARN 外部原因或可自动恢复（业务异常、用户输入错误）；INFO 关键业务节点（创建/状态跃迁/外部调用结果）；DEBUG 生产默认关。
5. 消息不写类名、方法名（本文档第一节结论）。
6. 不打敏感信息（token、密码、密钥、手机号明文）。
7. 消息写「事件 + 结果 + 关键标识」，一条日志只说一件事。

## 五、待决策点（写规范前需拍板）

1. **消息语言**：中文正文（现状，团队可读）vs 英文（阿里正例风格）。建议：中文正文 + 英文 tag/key。
2. **消息结构**：是否固定 `log.info("[tag] 事件描述 key={}, key={}", …)` 形态；tag 词表是否枚举（现有 biz/param/unknown，可扩展 auth/channel/repo 等）。建议：固定形态 + 枚举 tag。
3. **key=value vs 自然语句**：阿里正例是自然语句（"Processing trade with id: {}"）；现代实践多 key=value（结构化、grep/ELK 友好）。建议 key=value。
4. **规范落点**：
   - a. AGENTS.md「按需预读」加一行指针 + `docs/agents/logging.md` 专项规范（符合现有专项规范结构，推荐）；
   - b. 全部内联进 AGENTS.md 工程约定（条目约 10 条，AGENTS.md 会显著膨胀）；
   - c. dudu-server 子项目内（但这是编码约定，归 agents 规范更顺）。
5. **规范呈现形式**：参照阿里「分级（必须/优先/可选）+ 条文 + 正反例代码块」，还是轻量条目式。建议：条目 + 少量正反例，不引入分级（项目规模用不上三级）。

## 参考来源

- [阿里巴巴 Java 开发手册·日志规约解读（CSDN）](https://blog.csdn.net/weixin_42382291/article/details/107449028)
- [P3C 官方项目（GitHub）](https://alibaba.github.io/p3c/)
- [阿里云开发者社区·手册解读](https://developer.aliyun.com/article/72875)
- [美团技术团队：日志导致线程 Block 的这些坑](https://tech.meituan.com/2022/07/29/Tips-For-Avoiding-Log-Blocking-Threads.html)
- [Apache Log4j2 Pattern Layout（caller data 开销说明）](https://logging.apache.org)
- [Logback 官方文档](https://logback.qos.ch)
- [Baeldung: Guide to Logback](https://www.baeldung.com/guide-to-logback)
