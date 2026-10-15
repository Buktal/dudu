# dudu-server 统一返回：HTTP 恒 200 + 五位分段错误码 + 单一业务异常

dudu-server 的 `/api/**` 应用层响应以 HTTP 200 和 `common.R<T>`（code/msg/data）表达结果；错误码 `constant.ApiEnum` 五位分段（0 成功、10001 未知、101xx 认证、11xxx 参数、13xxx 数据、14xxx 第三方，沿用 BangBu 模式重编）。业务异常统一使用携带错误码的 `config.exception.BizException`，全局异常处理器转换为返回体。网络和网关故障仍由客户端单独处理。来源：wayfinder 地图 #6 两轮 grilling 决策（Q5/Q15/Q16），以及后续基础模块简化。

## 例外注记（2026-10-15）

- 路由层错误走真实状态码，不套 R：未匹配路径（404，`NoResourceFoundException`）与 HTTP 方法不匹配（405，`HttpRequestMethodNotSupportedException`）在进入控制器之前失败，不属于本决策「应用层响应恒 200」的范围，由全局异常处理器窄 handler 按 `ErrorResponse.getStatusCode()` 原样返回，不记 error 日志。`/api/**` 分层语义不变：无 token 时认证拦截器仍先以 200 + 1010x 拒绝，路由 404 只在认证放行后生效。
- 渠道回调既有事实收编：`/api/channels/*/callback` 按各渠道协议响应（原样回显 echostr / success），错误用真实 HTTP 状态表达、不套 R——渠道对端按协议解读状态行与回文体，R 信封会破坏握手。该行为自首个渠道回调落地即如此，原先仅记录在 dudu-server README 与控制器 Javadoc。

## Considered Options

- HTTP 状态如实（400/401/500 + body 业务码）：被否——用户裁定 200 表示"请求成功送达处理"，内部错误在 body 表达；监控损失由前端/日志按 code 统计弥补。
- 永远 200 + body 业务码（选定）：前端只看 code 分支，逻辑单一；代价是网关/浏览器工具看不到真实错误率。
- 错误码不分段、随手编：被否——分段是防码值冲突与快速定位域的前置约定，BangBu 已验证。
- sealed 异常家族（原选定）：最初希望通过编译器检查异常分类；后续实现已收敛为单个 BizException，错误码足以表达分类，继续维护子类没有额外收益。此次同步文档，保留简化后的实现。
- 数值重新分段：此次保留已有数值；DuduDesk 已使用 10100–10199 判断认证失败。无权限与业务状态不允许需要在实际业务落地时分别定义，不提前扩充空枚举。
