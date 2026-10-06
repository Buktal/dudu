# DUDU Server

Spring Boot 3.5 / Java 21 后端。基础能力（统一返回、业务异常、JWT 认证与参数注入、校验分组、MyBatis-Plus 分页与时间填充）之外，已提供 DuduAdmin 首版全部后端接口：平台登录、企业管理（开通、编辑、停用恢复、ID 候选与检测、重置初始管理员密码、资源汇总）、运营概览与操作记录查询。

## 开发入口

- [总体设计与阶段计划](../docs/design/dudu-server/README.md)：已确认模型、Admin 优先交付和待定问题。
- [功能图谱](../docs/features/dudu-server.md)：模块入口、行为和验证范围。
- [Admin 数据契约](../docs/design/dudu-admin/data-contract.md)：接口字段与错误码契约，首版后端按此实现。
- [统一返回决策](../docs/adr/0006-always-200-segmented-error-codes.md)。
- [认证决策](../docs/adr/0007-jwt-auth-chain.md)。

Controller 通过 `@Me JwtUser user` 获取 token 载荷，所需类型均在 `config.auth`。响应体 `R` 与分页响应 `P`（平铺 code/msg/list/total/page/pageSize）位于 `config.response`，业务异常位于 `config.exception`。Admin 接口位于 `controller/admin/`，统一前缀 `/api/admin`，仅 `admin` 角色可访问（登录端点除外）。数据库操作优先使用 MyBatis-Plus `IService` 与 Lambda 条件构造器，不新增 XML 或注解 SQL。

## 配置与检查

- 使用 Java 21 和 Maven，在本目录运行 `mvn clean test`。
- 默认环境要求提供 `DUDU_AUTH_JWT_SECRET`。生产 HS256 密钥使用至少 32 字节的随机值；开发可显式启用 `SPRING_PROFILES_ACTIVE=dev` 使用开发密钥。
- 首个平台管理员在启动时初始化：库中无平台账号时以 `AdminInitializer` 内置凭据 `Admin`/`Admin` 创建（与前端登录表单预填约定一致，不是生产凭据，首登后经改密接口更换）。改密接口要求新密码 8–72 字符；初始化凭据不做该长度校验，如需改回短密码须重建初始化账号。
- 本地 MySQL 与 `dev` 数据源配置见下文。默认环境仍通过 `SPRING_DATASOURCE_URL`、`SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD` 提供连接，不读取本地 `.env`。
- `/api/**` 默认需要 `Authorization: Bearer <token>`；唯一放行路径为 `POST /api/admin/login`，`/api/admin/**` 叠加 admin 角色校验。
- 业务表由 Flyway 版本化迁移维护（当前 V1：company、user、operation_log、reception_group、channel_account）；已提交迁移不可变，变更新增迁移。

## 本地 MySQL

[compose.yaml](compose.yaml) 是 Server 的开发环境配置，固定使用 MySQL 8.4.11 LTS；不是 Docker Desktop 的全局设置，也不是生产部署清单。数据库为 `dudu`，应用账号为 `dudu`，默认只监听 `127.0.0.1:3306`，字符集为 `utf8mb4`。

在本目录操作：

1. 安装并启动 Docker Desktop 的 Linux 引擎。Windows 采用 WSL 2 后端，只需 WSL 运行环境，无需额外安装 Ubuntu；首次启用 Windows 虚拟机组件后须重启。
2. 将 [.env.example](.env.example) 复制为 `.env`，分别填写两项不同的随机密码（建议 32 字节随机值的十六进制文本）。已有 `.env` 时保留原文件。真实 `.env` 已被 Git 忽略。文件内另附 `DUDU_AUTH_JWT_SECRET` 注释键：dev profile 已内置开发密钥，需要覆盖时取消注释并填实际值，不要留空取消注释（空值会以空白覆盖 dev 默认值）。
3. 运行 `docker --context desktop-linux compose up -d --wait`，再用 `docker --context desktop-linux compose ps` 查看健康状态。Linux 主机通常省略 `--context desktop-linux`。
4. 在本目录运行 `mvn spring-boot:run -Dspring-boot.run.profiles=dev`。IDE 启动时将工作目录设为 `dudu-server`、启用 `dev` profile；Spring 会从工作目录读取 `.env`。连接使用 TLS。

日常停止使用 `docker --context desktop-linux compose stop`，恢复使用 `docker --context desktop-linux compose up -d --wait`。命名卷 `dudu-local_mysql-data` 保存数据，普通 `compose down` 不会删除它；不要给日常停止命令添加 `--volumes`。MySQL 初始化变量仅在空数据目录首次启动时生效，修改 `.env` 不会修改已有数据库账号密码。

本机 Docker 程序和数据盘沿用默认 C 盘位置，项目中的 Compose 只保存运行定义。MySQL 命名卷位于 Docker 的 Linux 数据盘内，不直接将 Windows 目录绑定到 `/var/lib/mysql`。这保留 Linux 文件系统语义，也避免数据库频繁读写跨越 Windows 文件共享层。

2026-09-29 已验证 MySQL 8.4.11 健康、Server 实际连接及容器重建后的数据保留。Flyway 11.7.2 对 MySQL 8.4 输出「超出已测试版本」提示，经 2026-09-30 实测仅警告不阻断：V1 业务表空库迁移与重启幂等（up to date）均通过，Admin 首版接口已在本地库完成全场景验收，详细范围见[功能图谱](../docs/features/dudu-server.md)。

## 线上部署边界

生产环境另行确定部署清单或托管 MySQL，尽量与开发使用相同的 8.4 补丁版本。部署时注入正式数据库凭据与 JWT 密钥，配置私网访问、备份及恢复验证，并按实际负载确定资源和连接池；不启用 `dev` profile，也不上传本地 `.env`。业务表仍由 Flyway 版本化迁移维护。
