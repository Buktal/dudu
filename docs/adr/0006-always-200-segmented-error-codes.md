# dudu-server 统一返回：HTTP 恒 200 + 五位分段错误码 + sealed 异常

dudu-server 所有 `/api/**` 接口 HTTP 状态码恒 200，业务语义完全由响应体 `common/R<T>`（code/msg/data）表达；错误码 `constant/ApiEnum` 五位分段（0 成功、10001 未知、101xx 认证、11xxx 参数、13xxx 数据、14xxx 第三方，沿用 BangBu 模式重编），业务异常一律走 `exception/BizException` sealed 家族（Param/Data/Third/Auth 四类），全局异常处理器分流日志与码值。来源：wayfinder 地图 #6 两轮 grilling 决策（Q5/Q15/Q16）。

## Considered Options

- HTTP 状态如实（400/401/500 + body 业务码）：被否——用户裁定 200 表示"请求成功送达处理"，内部错误在 body 表达；监控损失由前端/日志按 code 统计弥补。
- 永远 200 + body 业务码（选定）：前端只看 code 分支，逻辑单一；代价是网关/浏览器工具看不到真实错误率。
- 错误码不分段、随手编：被否——分段是防码值冲突与快速定位域的前置约定，BangBu 已验证。
- 异常用继承树（BangBu BaseException 写法）：被否——JDK21 sealed 让全局处理器穷尽分支由编译器保证，新增家族漏处理直接编译失败。
