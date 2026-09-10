# dudu-server

Spring Boot（Java 21）消息聚合后端：各渠道消息进 → 客服工作台，回复转发回渠道。选型以 `pom.xml` 为准（分区注释即清单，版本号只在 `<properties>` 管理）。单实例、无 Redis/MQ；跨实例方案（连接路由、token 集中缓存）到量级再引入。

## Reuse-first

按序取用，每层先证明"没有"再自建：

1. 通用工具（日期、加密、IO、Bean 转换、XML）→ Hutool；微信回调 XML 用 `XmlUtil`。
2. JSON → Jackson（`ObjectMapper` + `JsonNode`），全仓库唯一 JSON 栈；Hutool 的 `JSONUtil`/`JSONObject` 禁用，防两库序列化漂移。调平台 OpenAPI → `RestClient`。
3. 数据访问 → MyBatis-Plus（`BaseMapper`/`IService`）；分页走 `MybatisPlusInterceptor`，复杂 SQL 落 XML mapper。
4. 参数校验 → jakarta validation（`@Valid`/`@NotBlank`）在 Controller 入参完成；service 里手写 if 判空视为未校验。
5. 健康检查 → `/actuator/health`；自建 health 端点视为重复实现。

新增第三方依赖先审批：报"已搜 pom 分区 + 上述内置为何不满足"，同意后引入并落位对应分区；到节点再加，不预防性堆。

## Null-safety

可能为 null 的取值与导航一律走 `Optional`，不手写 null/空串 if 链：

- 包装 `Optional.ofNullable(...)`；字符串判空用 `.filter(s -> !s.isBlank())`。
- 链式 `map`/`flatMap`/`filter` 完成取值与转换，终结用 `orElse`/`orElseGet`/`orElseThrow`，不用裸 `get()`。
- 可能缺值的返回值，方法签名直接声明 `Optional<T>`。

`if (obj != null)`、`if (str != null && !str.isEmpty())` 后接 get/对象处理，视为未判空。

## Flyway — 表结构唯一入口

- 改表 = 新增迁移 `src/main/resources/db/migration/V<N>__<desc>.sql`，启动自动执行。
- 迁移一旦提交不可变：后续变更、回滚都靠新增迁移。
- 本地手动 DDL 仅限排障；要留下的结构变更必须回到迁移文件。

Done gate：删库重启，Flyway 能从零建出全部表结构。

## AOP

切面只放日志、审计、重试、耗时这类横切关注点，业务规则写在 service；首选自定义注解 + 切点。

## 编译期处理器

新处理器保持与 Lombok 一致的 `optional=true`。
