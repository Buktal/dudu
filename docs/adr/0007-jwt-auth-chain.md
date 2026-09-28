# dudu-server 认证链路：Hutool JWT 单密钥 + default-deny + ArgumentResolver

dudu-server 认证继续复用 Hutool JWT，不引入 Spring Security/JJWT。签名算法固定 HS256，载荷字段全部定义于 `config.auth.JwtUser`：签发通过 `JSONUtil.parseObj` 序列化，解析通过 Hutool 的 payload 直接 `toBean`，不手动拆解 token、不引入 Map 中间模型。签名密钥通过 `dudu.auth.jwt-secret` 配置；默认环境要求 `DUDU_AUTH_JWT_SECRET`，缺失或空白即启动失败，显式 dev profile 才提供开发密钥。

`/api/**` 默认需要认证，拦截器直接验证 Authorization；Controller 通过 `@Me JwtUser user` 获取完整的强类型载荷，MeResolver 直接读取 Authorization 并调用相同的解析方法。按用户在 2026-09-28 的明确要求，彻底移除 request attribute，不使用 ThreadLocal 或其他身份上下文。带 @Me 的受保护接口因此验证两次，换取无共享状态和较小实现；没有 @Me 的接口仍由拦截器保护。以后有放行路径时在 WebConfig 中维护（当前无）。

不设开发假登录端点：真实登录、用户表、角色拦截和多租户等业务另行实现；此前可经 JwtManager.createToken 生成联调 token。原始来源：地图 #6 决策（Q2/Q3/Q4/Q10/Q11/Q12）；此次以用户要求的直接注入方案更新。

## Considered Options

- Spring Security 全家桶：被否——单实例小服务背过滤器链复杂度不值，null-safety/规约也不贴。
- JJWT 独立库：被否——Hutool JWT 满足 HS256 单密钥场景，复用优先。
- request attribute 传递身份（旧实现）：原先可避免重复解析；用户明确要求完全移除，现以直接解析替代，不换成其他共享上下文。
- TokenAspect AOP 改入参（BangBu 写法）：被否——AOP 只放横切关注点（仓库规约），改写入参是隐形魔法，ArgumentResolver 是 Spring 为此场景的原生机制。
- 默认放行 + @Token 标注才拦（BangBu 模式）：被否——新增端点忘标注即裸奔；default-deny + 写死放行路径安全默认。
- 白名单含 /actuator/health：被否（实现偏差，见 #10 评论）——拦截器范围仅 /api/**，加了是永不被查询的死配置。
- yml 可配置白名单（dudu.auth.whitelist）：被否——单实例生产白名单恒为空，属死配置；环境变量可在部署期无声放大放行面、绕过代码 review。放行路径在 WebConfig 写死，真登录落地时直接写死登录端点。
- Jackson 作为业务 JSON 栈：被否（2026-09-28 决策反转，原"Jackson 唯一栈、禁 Hutool JSONUtil"）——单实例小服务 JSON 全走 Hutool 一把梭，减少技术栈数量；Spring MVC 消息转换仍为框架内置 Jackson，业务代码不直接引用。
