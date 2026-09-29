# DUDU Server 功能图谱

子项目入口：[dudu-server/README.md](../../dudu-server/README.md)。当前为基础模块，尚无真实登录和业务接口。

| 模块 | 入口 | 行为与限制 |
| --- | --- | --- |
| 统一返回 | `dudu-server/src/main/java/com/dudu/duduserver/config/response/R.java` | 应用层以 HTTP 200 和 code/msg/data 表达结果；成功码为 0 |
| 业务异常 | `dudu-server/src/main/java/com/dudu/duduserver/config/exception/` | BizException 携带 ApiEnum；统一处理绑定、校验、请求体、参数缺失及类型错误；未知异常返回 10001 |
| 认证 | `dudu-server/src/main/java/com/dudu/duduserver/config/auth/` | 固定 HS256；载荷直接映射 JwtUser；校验签名、算法、userId 和 exp；默认环境必须配置密钥 |
| 当前用户注入 | `@Me JwtUser user` | MeResolver 直接读取 Authorization，无 request attribute 或 ThreadLocal；载荷字段定义在 JwtUser，未知字段忽略 |
| 接口保护 | `dudu-server/src/main/java/com/dudu/duduserver/config/WebConfig.java` | `/api/**` 默认全拦，没有 @Me 也需认证；带 @Me 的接口由拦截器和解析器各验证一次；目前无放行路径 |
| 校验分组 | `dudu-server/src/main/java/com/dudu/duduserver/config/validate/` | Save、Query 继承 Default，保留公共约束并支持各自分组约束；暂无业务 DTO |
| 数据访问 | `dudu-server/src/main/java/com/dudu/duduserver/config/MybatisPlusConfig.java` | MySQL 分页拦截器已配置；本地 dev 数据源读取 `.env`；实体、Mapper 和业务迁移尚未落地 |
| 本地数据库环境 | `dudu-server/compose.yaml`、`dudu-server/.env.example` | MySQL 8.4.11、仅本机端口、应用账号、命名卷和鉴权 SQL 健康检查；仅供开发，需可用的 Docker Linux 引擎 |
| 时间填充 | `dudu-server/src/main/java/com/dudu/duduserver/config/MyMetaObjectHandler.java` | 插入填充 createTime、updateTime；更新填充时刷新已有 updateTime；实体需启用对应自动填充，纯 Wrapper 更新不保证触发 |

错误码保留既有分段：101xx 认证、11xxx 参数、13xxx 数据、14xxx 外部服务；DuduDesk 按 101xx 识别认证失败。新增业务码随实际业务定义。

## 验证范围

51 项测试覆盖返回体、错误码、异常转换、认证拦截、完整载荷注入、JWT 畸形输入与算法限制、并发签发解析、校验分组和时间填充；测试中的 Spring 冒烟检查仍排除数据源自动配置。

2026-09-29 另以可执行 JAR 和 `dev` profile 完成 MySQL 8.4.11 实连，数据库健康为 `UP`，Flyway 成功初始化空库历史表；强制重建 MySQL 容器后，server UUID、数据库、账号及历史表保留。现有 Flyway 11.7.2 输出 MySQL 8.4 版本兼容提示，业务迁移实施前需处理；当前没有业务迁移、实体或 Mapper，业务 SQL、分页及版本升级尚未验收。
