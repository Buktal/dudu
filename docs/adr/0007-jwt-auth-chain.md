# dudu-server 认证链路：Hutool JWT 单密钥 + default-deny + ArgumentResolver

dudu-server 认证不引入 Spring Security/JJWT：Hutool JWT（已在栈内）只承担签发/验签，payload 读写走 Jackson（全仓唯一 JSON 栈，Hutool JSONUtil 禁用）；签名密钥 `dudu.auth.jwt-secret` 入配置、缺省即启动失败（生产走环境变量 `DUDU_AUTH_JWT_SECRET`）。`/api/**` 默认全拦（default-deny），白名单走 yml；token 装标准 `Authorization: Bearer` 头；Controller 经 `@Me JwtUser` 由 HandlerMethodArgumentResolver 注入当前用户——替代老项目 BangBu 的 TokenAspect（AOP 改写入参塞用户）。不设 dev-only 假登录端点：真登录（用户表/密码/角色拦截/多租户）等数据库与客户端就绪后另起，此前开发联调直接经 `JwtManager.createToken` 造 token。来源：地图 #6 决策（Q2/Q3/Q4/Q10/Q11/Q12）。

## Considered Options

- Spring Security 全家桶：被否——单实例小服务背过滤器链复杂度不值，null-safety/规约也不贴。
- JJWT 独立库：被否——Hutool JWT 满足 HS256 单密钥场景，复用优先。
- TokenAspect AOP 改入参（BangBu 写法）：被否——AOP 只放横切关注点（仓库规约），改写入参是隐形魔法，ArgumentResolver 是 Spring 为此场景的原生机制。
- 默认放行 + @Token 标注才拦（BangBu 模式）：被否——新增端点忘标注即裸奔；default-deny + 白名单安全默认。
- 白名单含 /actuator/health：被否（实现偏差，见 #10 评论）——拦截器范围仅 /api/**，加了是永不被查询的死配置。
