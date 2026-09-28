# DUDU Server

Spring Boot 3.5 / Java 21 后端，目前提供统一返回、业务异常、JWT 认证和参数注入、校验分组、MyBatis Plus 分页及时间填充基础能力。

## 开发入口

- [功能图谱](../docs/features/dudu-server.md)：模块入口、行为和未完成范围。
- [统一返回决策](../docs/adr/0006-always-200-segmented-error-codes.md)。
- [认证决策](../docs/adr/0007-jwt-auth-chain.md)。

Controller 通过 `@Me JwtUser user` 获取 token 载荷，所需类型均在 `config.auth`。响应体 `R` 位于 `config.response`，业务异常位于 `config.exception`。

## 配置与检查

- 使用 Java 21 和 Maven，在本目录运行 `mvn clean test`。
- 默认环境要求提供 `DUDU_AUTH_JWT_SECRET`。生产 HS256 密钥使用至少 32 字节的随机值；开发可显式启用 `SPRING_PROFILES_ACTIVE=dev` 使用开发密钥。
- 正常启动前还需通过 Spring 数据源配置提供 MySQL 连接。当前尚无实体、Mapper 或数据库迁移，测试暂排除数据源自动配置，不代表数据库集成已完成。
- `/api/**` 默认需要 `Authorization: Bearer <token>`；当前没有真实登录端点或放行路径。
