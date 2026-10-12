# DUDU Server

Spring Boot 3.5 / Java 21 后端。基础能力（统一返回、业务异常、JWT 认证与参数注入、校验分组、MyBatis-Plus 分页与时间填充）之外，已提供 DuduAdmin 首版全部后端接口：平台登录、企业管理（开通、编辑、停用恢复、ID 候选与检测、重置初始管理员密码、资源汇总）、运营概览与操作记录查询。企业侧已按 [Desk 认证子契约](../docs/design/dudu-desk/ticket-01-login.md)实现 DuduDesk 企业登录、身份恢复与无状态退出（`/api/desk/login`、`/api/desk/profile`、`/api/desk/logout`），返回企业员工身份与当前接待范围；访客、消息与 Socket 接口仍待后续实施票接通。

## 开发入口

- [总体设计与阶段计划](../docs/design/dudu-server/README.md)：已确认模型、Admin 优先交付和待定问题。
- [功能图谱](../docs/features/dudu-server.md)：模块入口、行为和验证范围。
- [Admin 数据契约](../docs/design/dudu-admin/data-contract.md)：接口字段与错误码契约，首版后端按此实现。
- [Desk 最小对接契约](../docs/design/dudu-desk/implementation-contract.md)：三表、HTTP、Socket 与前端映射已定稿；企业认证字段见[认证子契约](../docs/design/dudu-desk/ticket-01-login.md)，业务尚待按实施票接通。
- [统一返回决策](../docs/adr/0006-always-200-segmented-error-codes.md)。
- [认证决策](../docs/adr/0007-jwt-auth-chain.md)。

Controller 通过 `@Me JwtUser user` 获取 token 载荷，所需类型均在 `config.auth`。响应体 `R` 与分页响应 `P`（平铺 code/msg/list/total/page/pageSize）位于 `common`，业务异常位于 `config.exception`。Admin 接口位于 `controller/admin/`，统一前缀 `/api/admin`，仅 `admin` 角色可访问（登录端点除外）；Desk 接口位于 `controller/desk/`，统一前缀 `/api/desk`，仅企业员工（`console`/`user`）可访问（登录端点除外），平台身份访问 Desk 资源返回 10106。数据库操作优先使用 MyBatis-Plus `IService` 与 Lambda 条件构造器，不新增 XML 或注解 SQL。

## 配置与检查

- 使用 Java 21 和 Maven，在本目录运行 `mvn clean test`。
- 密钥与数据源明文写在 `application.yaml`（本地开发默认值，开箱即跑）。生产在 jar 同目录 `.env` 用同名键覆盖（`dudu.auth.jwt-secret` 至少 32 字节随机值）；空白密钥仍启动失败，但漏写 `.env` 时应用会以开发密钥静默启动，部署时须人工核对。
- 首个平台管理员在启动时初始化：库中无平台账号时以 `AdminInitializer` 内置凭据 `Admin`/`admin` 创建（与前端登录表单预填约定一致，不是生产凭据，首登后经改密接口更换）。改密接口要求新密码 8–72 字符；初始化凭据不做该长度校验，如需改回短密码须重建初始化账号。
- 数据源为 `application.yaml` 明文默认值（`127.0.0.1:3306`、`dudu`/`123456`），无 `.env`、无环境变量直接跑；生产覆盖方式见「线上部署边界」。
- `/api/**` 默认需要 `Authorization: Bearer <token>`；放行路径仅 `POST /api/admin/login` 与 `POST /api/desk/login`，`/api/admin/**` 叠加 admin 角色校验，`/api/desk/**` 叠加企业员工身份校验。
- 业务表由 Flyway 版本化迁移维护（当前 V2：company、user、operation_log、user_group、user_group_member、company_channel）；已提交迁移不可变，变更新增迁移。

## 本地 MySQL

[compose.yaml](compose.yaml) 是 Server 的开发环境配置，固定使用 MySQL 8.4.11 LTS；不是 Docker Desktop 的全局设置，也不是生产部署清单。数据库为 `dudu`，应用账号为 `dudu`，默认只监听 `127.0.0.1:3306`，字符集为 `utf8mb4`。

在本目录操作：

1. 安装并启动 Docker Desktop 的 Linux 引擎。Windows 采用 WSL 2 后端，只需 WSL 运行环境，无需额外安装 Ubuntu；首次启用 Windows 虚拟机组件后须重启。
2. 直接启动即可：应用与容器默认都用本地开发口令 `123456`，无需任何 `.env`。
3. 运行 `docker --context desktop-linux compose up -d --wait`，再用 `docker --context desktop-linux compose ps` 查看健康状态。Linux 主机通常省略 `--context desktop-linux`。
4. 在本目录运行 `mvn spring-boot:run`。dudu-admin 开发服务器将 `/api` 同源代理到 8080（见其 `vite.config.ts`），无需任何 profile 或跨域配置；IDE 启动时将工作目录设为 `dudu-server`。连接使用 TLS。

日常停止使用 `docker --context desktop-linux compose stop`，恢复使用 `docker --context desktop-linux compose up -d --wait`。命名卷 `dudu-local_mysql-data` 保存数据，普通 `compose down` 不会删除它；不要给日常停止命令添加 `--volumes`。MySQL 初始化变量仅在空数据目录首次启动时生效，修改 `.env` 不会修改已有数据库账号密码。

本机 Docker 程序和数据盘沿用默认 C 盘位置，项目中的 Compose 只保存运行定义。MySQL 命名卷位于 Docker 的 Linux 数据盘内，不直接将 Windows 目录绑定到 `/var/lib/mysql`。这保留 Linux 文件系统语义，也避免数据库频繁读写跨越 Windows 文件共享层。

2026-09-29 已验证 MySQL 8.4.11 健康、Server 实际连接及容器重建后的数据保留。Flyway 11.7.2 对 MySQL 8.4 输出「超出已测试版本」提示，经 2026-09-30 实测仅警告不阻断：V1 业务表空库迁移与重启幂等（up to date）均通过，Admin 首版接口已在本地库完成全场景验收，详细范围见[功能图谱](../docs/features/dudu-server.md)。

## 线上部署边界

生产部署形态为 jar + 服务器本地 `.env`（新建空文件、不进 Git；键与 `application.yaml` 同名，写哪行覆盖哪项，不写的落到开发默认值）：

```
spring.datasource.url=jdbc:mysql://<主机>:3306/dudu?sslMode=REQUIRED&connectionTimeZone=Asia/Shanghai&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8
spring.datasource.username=dudu
spring.datasource.password=<正式口令>
dudu.auth.jwt-secret=<openssl rand -hex 32 生成>
```

在 `.env` 所在目录 `java -jar` 启动。注意：漏写 `dudu.auth.jwt-secret` 时应用会以开发密钥静默启动（不再 fail-fast），上线清单必须核对这一行。换服务器只需迁移 jar 与 `.env` 两个文件。服务端不做 CORS：前端开发走 Vite 同源代理，生产同源部署或由网关（如 Nginx）加 CORS 头。数据库尽量与开发使用相同的 8.4 补丁版本，配置私网访问、备份及恢复验证，并按实际负载确定资源和连接池。业务表仍由 Flyway 版本化迁移维护。
