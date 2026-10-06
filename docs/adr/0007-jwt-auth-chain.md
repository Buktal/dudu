# dudu-server 认证：Hutool JWT、默认拒绝与参数注入

认证复用 Hutool JWT，固定 HS256，不新增认证依赖。JwtManager 保留 createToken、parseToken、parseAuthorization，载荷直接 JSONUtil.parseObj(user) 签发、toBean 解析。JwtUser.role 使用 UserRoleEnum，其 toString 与 JSON code 都是 admin/console/user，签发入口无需逐字段补 JSON。

签名密钥保留 dudu.auth.jwt-secret（环境变量 DUDU_AUTH_JWT_SECRET），Java 属性名简化为 secret；缺失或空白启动失败。ttl-seconds 默认 604800 秒（7 天），显式非正数启动失败。

POST /api/admin/login 是唯一公开登录端点；/api/** 默认认证，/api/admin/** 另校验平台管理员角色。Controller 通过 @Me JwtUser 读取身份。保留用户决定：不使用 request attribute、ThreadLocal 或共享身份上下文，因此守卫与参数解析器各自验证。DevCorsConfig 仅在 dev 注册 CorsFilter，在 MVC 前统一处理预检；不让每个 HandlerInterceptor 重复写预检判断。非 dev 使用同源部署。

## 2026-10-07 退出方案的最终取舍

用户先要求退出使 token 立即失效，随后明确否定为此新增表和服务，并要求恢复原 login/logout 路径与简单签发实现。最终取消本轮尚未提交的 token_revocation 方案及 jti，保留 POST /api/admin/logout 返回成功、前端清理本地 token。旧 token 在签名及有效期合法时仍可使用至 exp，退出、改密和停用都不承诺立即撤销它；不以接口返回成功冒充撤销成功。

选择简单无状态 JWT，接受无法即时撤销的限制；不另换内存黑名单或新增依赖。未来若再次要求即时撤销，应单独明确状态存储方案。login/logout 是用户明确保留的资源路径风格例外，HTTP 应用响应固定 200。

## 保留的既有约定

- 默认拒绝，公开路径在 WebConfig 写死，不引入部署可配置认证白名单。
- 不引入 Spring Security、JJWT 或 TokenAspect；现有 Hutool 与 Spring 参数解析器满足范围。
- Hutool 处理业务 JSON/JWT；Spring MVC 与 MP JSON 字段映射仍使用框架内置 Jackson。
