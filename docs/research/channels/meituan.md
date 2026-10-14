# 美团开放平台 消息推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓（open.meituan.com / developer.meituan.com / developer.waimai.meituan.com 均为 JS 渲染站，WebFetch 仅回壳）+ WebSearch 官方站内摘录（以下 `[摘录]` 均为搜索返回的官方页面原文摘录，未取全文）。
> 标注约定：`[摘录]` = WebSearch 返回的官方页面原文摘录；无标注 = 门户级公开事实（多源互证）；`待核验(09-27)` = 未能取得官方原文全文，需复核。
> 平台说明：美团有两个并存的开放体系，本库以 **技术服务合作中心**（developer.meituan.com / developer.waimai.meituan.com，外卖·闪购·医药·到店秒提的消息推送主体）为主，**生态开放平台**（open.meituan.com / openapi.meituan.com，OAuth2 用户体系）为辅，二者签名/token/网关均不同，见 §4/§6。

## 1. 官方文档入口与关键页面地址

- 生态开放平台门户：https://open.meituan.com/docs
- 生态开放平台接入指南（OAuth2）：https://open.meituan.com/docs/introduce
- 生态开放平台 API 签名页：https://open.meituan.com/docs/introduce/sign（`[摘录]` 仅标题段落，全文待核验(09-27)）
- 生态开放平台 Code 换 Token：https://open.meituan.com/docs/detail?id=2（`[摘录]` 参数表头，全文待核验(09-27)）
- 生态开放平台网关：https://openapi.meituan.com/（门户原文）
- 技术服务合作中心门户：https://developer.meituan.com/（联系邮箱 mtdeveloper@meituan.com）
- 技术服务合作中心文档中心：https://developer.meituan.com/docs
- 外卖开放平台（旧站，文档仍有效）：https://developer.waimai.meituan.com/home/docDetail/842 等（IM）、`/home/doc/market/17`（订单推送API）、`/home/doc/market/18`（取消订单推送API）、`/home/guide/31`（签名工具/签名算法）、`/home/guide/4`（推单流程/重试）、`/home/guide/6`（端口/参数结构）
- 新版服务商接口约定（必读）：https://developer.meituan.com/docs/biz/comm-dev-isv-api-rule（`[摘录]` 仅目录树：含"接口调用约定【必读】/签名规则/公共请求参数/授权说明/消息回调接入/消息推送公共请求参数/消息推送公共响应规范"，正文待核验(09-27)）
- 闪购开放平台（旧站）：https://open-shangou.meituan.com/（IM 开通指南 `/home/guide/44`、IM 文档 `/home/doc/market/34`，`[摘录]` 公告原文；正文待核验(09-27)）
- 闪购零售赋能站：https://developer-lingshou.waimai.meituan.com/docCenter/2（平台简介页）
- 闪购医药集市中心（tscc，IM 消息推送矩阵）：https://tscc.meituan.com/home/doc/market/460（`[摘录]` 目录行）
- 到店餐饮业务页：https://developer.meituan.com/ka/daocan（团购核销/联名会员卡）
- 外卖业务能力页：https://developer.meituan.com/isv/waimai（外卖通用解决方案/IM在线咨询/粉丝群）
- 签名问答（官方问答原文，最完整签名算法来源）：https://tscc.meituan.com/home/questionDetail/5730（`[摘录]` 全步骤）

本次实际抓到并核实的页面清单：

| 主题 | URL | 核验方式 |
|---|---|---|
| 订单推送API（签名同源/不写死参数/80或8080/非json+text/未排序） | https://developer.waimai.meituan.com/home/doc/market/17 | `[摘录]`（功能简介+5条注意事项+17个推送接口名） |
| 订单推送（外卖，必接项/订阅字段） | https://developer.waimai.meituan.com/home/doc/food/7 | `[摘录]`（功能简介+应用场景+注意事项+18个推送接口名） |
| 取消订单推送API（系统自动取消/防循环调用） | https://developer.waimai.meituan.com/home/doc/market/18 | `[摘录]`（简介+4条注意+1个推送接口名） |
| 推送已确认订单 status=4（2s/`{"data":"ok"}`/1分钟×3次/解码2次） | https://developer.waimai.meituan.com/home/docDetail/177 | `[摘录]` |
| 推送已完成订单 status=8（同上 + 状态码表/凌晨统一完成规则） | https://developer.waimai.meituan.com/home/docDetail/180 | `[摘录]` |
| 推送已完成订单-自研品牌商（回调地址配置路径） | https://developer.waimai.meituan.com/home/docDetail/179 | `[摘录]`（标题+配置路径） |
| 签名算法（url?排序参数+secret→MD5小写，推送解码2次） | https://developer.waimai.meituan.com/home/guide/31 | `[摘录]`（5步+推送解码3步） |
| 推单流程（失败1分钟重试×3/中途接单停推/建议全状态对接防漏单） | https://developer.waimai.meituan.com/home/guide/4 | `[摘录]` |
| 回调端口与参数结构（仅80/8080，10分钟生效；系统级+应用级） | https://developer.waimai.meituan.com/home/guide/6 | `[摘录]` |
| 接收订单数据接口【必须】（新订单推送/1分钟重推/5分钟未接单自动取消） | https://developer.meituan.com/docs/biz/biz_waimaing_d71cd046-d953-47c2-adb4-b2c170823b5a | `[摘录]` |
| 门店绑定/解绑推送（回调URL配置路径/ISV旧接口不兼容/失败重试3次） | https://developer.waimai.meituan.com/home/docDetail/439 | `[摘录]` |
| IM 单聊消息回调（biz_type=1/`{"data":"OK"}`/4s+短信报警/自发不推） | https://developer.waimai.meituan.com/home/docDetail/842 | `[摘录]` |
| IM 发送消息 biz_type=1 两方会话 / =4 评价匿名群聊 | https://developer.waimai.meituan.com/home/docDetail/845 | `[摘录]`（标题行） |
| 闪购 IM 上线公告（单聊群聊/查看回复/工单申请+appid审批/暂不支持发券） | https://developer.waimai.meituan.com/home/notice?noticeId=158 | `[摘录]`（2020-06-16公告全文段） |
| 闪购 IM 矩阵（IM消息推送必接/撤回必接/风控必接/已读推送/msgSend/msgRevoke/msgRead） | https://tscc.meituan.com/home/doc/market/460 | `[摘录]`（目录行） |
| 到店秒提：在线核销查询/确认订单必接/品牌订单状态变更必接（非外卖，/gw/mop/order/*） | https://developer.waimai.meituan.com/home/docDetail/880 | `[摘录]` |
| 订单管理（主动推送为主；接单/配送/查询/退款操作面） | https://developer.waimai.meituan.com/home/doc/food/6 | `[摘录]` |
| 同意退款语义（接口同意全额退款只推退款消息不推取消；后台手动同意则双推） | https://developer.waimai.meituan.com/home/docDetail/122 | `[摘录]` |
| 生态开放平台签名（除sign字典序→key1value1…→client_secret前置） | https://open.meituan.com/docs/introduce/sign | `[摘录]`（步骤1-2，哈希算法后缀截断→待核验(09-27)） |
| 生态开放平台 OAuth（授权码/隐式授权码；POST https://openapi.meituan.com/oauth/token；refresh_token 30天一次有效） | https://open.meituan.com/docs/introduce + https://open.meituan.com/docs/detail?id=2 | `[摘录]` |
| 签名问答全步骤（含ISV access_token参签/品牌商不参） | https://tscc.meituan.com/home/questionDetail/5730 | `[摘录]` |

---

## 2. 消息/事件推送全清单

推送方式统一为 **APP方URL（HTTP POST 回调，平台调商家）**，无长连接通道。以下接口名均为官方文档目录原文（`APP方URL` = 商家实现回调接口）。

### 2.1 订单类（外卖/闪购/医药共用目录，`[摘录]` market/17 + food/7）

| 回调 | 触发语义 | 必接 | 出处 |
|---|---|---|---|
| 推送已提交订单 | 用户提交（status=1） | — | market/17 目录行 |
| 推送已支付订单 | 支付成功（status=2） | 必接（food/7） | food/7 + market/17 目录行 |
| 推送已确认订单 | 商家确认（status=4） | — | docDetail/177 全文摘录 |
| 推送已完成订单 | 完成（status=8；自配/自取无明确完成时间时每日凌晨将超4h未完成转完成，预订单除外） | — | docDetail/180 全文摘录 |
| 推送用户或客服取消订单 | 系统/用户/客服取消（status=9） | — | market/18 目录行 |
| 推送订单配送状态（美配/企客；自配/代运营各有独立推送） | 配送状态变更 | — | food/7 + market/17 目录行 |
| 推送美配/企客订单异常配送信息 | 异常配送 | — | market/17 目录行 |
| 推送订单结算信息 | 结算 | — | market/17 目录行 |
| 推送催单消息 | 用户催单 | 必接（food/7） | food/7 目录行 |
| 隐私号降级通知推送 | 隐私号降级 | 必接（food/7） | food/7 目录行 |
| 推送订单信息修改消息 | 订单修改 | — | food/7 目录行 |
| 推送拣货完成消息 | 拣货完成（零售/闪购） | — | market/17 目录行 |
| 推送客服赔付商家责任订单信息 | 客服赔付 | — | market/17 + food/7 目录行 |
| 推送订单预计送达时间修改状态 | 送达时间变更 | — | food/7 目录行 |
| 推送订单出餐状态 / 推送可发配送状态 | 出餐/可发配送 | — | food/7 目录行 |
| 美团配送转自配送消息 | 配送方式切换 | — | food/7 目录行 |
| 接收商家申诉结果消息 | 申诉结果 | — | food/7 目录行 |
| 跑腿骑手转派推送 | 跑腿转派 | — | market/17 目录行 |
| 推送跨境订单清关信息 | 跨境清关 | — | docDetail/177 目录行 |
| 推送医药B2C订单新地址 / 快递物流状态更新 | 医药B2C | — | docDetail/177 目录行 |
| 商品品牌商订单推送 / 商品品牌商订单退款推送 | 品牌商维度 | — | market/17 目录行 |
| 推送非接口操作订单换货信息 | 换货（非接口操作） | — | market/17 目录行 |
| 7.5.1 接收订单数据接口【必须】 | 用户下单后推新订单（服务商版目录） | 必须 | developer.meituan.com 新版目录 `[摘录]` |

- 订单状态码（`[摘录]` docDetail/180）：`1-用户已提交订单；2-向商家推送订单；4-商家已确认；8-订单已完成；9-订单已取消`。
- 订单订阅字段（`[摘录]` market/17 + docDetail/180）：部分字段默认不推，需在开发者中心 **订单字段订阅** 开启，已订阅字段在已支付/已确认/已完成三种推送中同时生效；编号字段示例：`19 商家应收款详情 / 22 配送方式 / 28 取餐类型 / 29 打包袋 / 38 应收款详情(元)` 等 → 完整编号表待核验(09-27)。

### 2.2 售后类（退款/取消）

| 回调 | 触发语义 | 出处 |
|---|---|---|
| 取消订单推送API（美团系统自动取消；取消规则页另见） | 系统自动取消订单 | market/18 `[摘录]` |
| 退款信息推送API（目录存在，与订单/取消并列） | 退款申请/退款结果 | market/17、market/18 目录行（推送体全文待核验(09-27)） |
| 同意退款语义 | 接口同意**全额**退款→只推退款消息**不推**取消消息；商家端后台手动同意→双推 | docDetail/122 `[摘录]` |
| 用户退款超时 | 用户申请后商家30分钟（大连锁3小时）未处理→系统自动同意；打烊期间顺延至次日开业后30分钟（大连锁3小时） | docDetail/122 `[摘录]` |

### 2.3 门店/商品类

- 门店（`[摘录]` docDetail/439 + guide/4）：`推送门店状态变更`、`推送门店绑定和解绑消息`（op_type 1-绑定/2-解绑，字段 poi_info/op_time/op_source/token_info）、`门店审核结果推送`。门店同步操作面：poi/save、poi/mget、poi/online 等（guide/4）。
- 商品：**未发现独立的"商品变更推送"回调**（商品同步走 `foodCat/update`、`food/batchinitdata`、`food/batchbulksave`、`food/sku/sellStatus` 等主动接口，guide/4 `[摘录]`）。唯一商品维度的推送是闪购 `APP方URL 推送门店商品管家质量信息变更`（open-shangou docDetail/10097，见闪购建品宣导页引用）→ 全文待核验(09-27)。商品类写入记 §7。
- 评价：评价类API为轮询查询（目录仅见查询/回复能力），未见评价推送 → 待核验(09-27)。

### 2.4 IM/客服类

- 外卖在线联系 IM（`[摘录]` docDetail/842）：`消息回调-单聊消息：接收用户商家 1 对 1 聊天消息回调`——用户或商家发会话消息时推给服务商；**服务商自己经接口发出的消息不回推**。字段：`biz_type`（固定 1）、`app_poi_code`、`push_content`（详情见 developer.meituan.com 对应文章 §3.1，URL 已知、正文待核验(09-27)）、`extended_field`（可选）。
- 发送面（`[摘录]` docDetail/845）：`msg/send 发送IM消息（接单）`，当前仅支持 `biz_type=1 两方会话` 与 `biz_type=4 评价匿名群聊`。
- 风控/群聊（`[摘录]` docDetail/842 目录 + tscc/460 目录）：`接收IM发送消息被风控拦截的信息`、`接收匿名评价聊天群消息`；闪购矩阵另有 `IM消息推送（必接）`、`用户撤回消息推送（必接）`、`IM消息风控推送（必接）`、`已读状态消息推送`、`wm/IM/msgRead`、`ecommerce/IM/msgSend`（必接）、`ecommerce/IM/msgRevoke`、`ecommerce/IM/historyMsg/list` → 各推送体全文待核验(09-27)。
- 配套管理面（目录行）：在线联系开关、已读状态、会话已读时间、回复率权益、自动回复、屏蔽/解屏、机器人开关、欢迎语/常见问题配置。

### 2.5 到店类（区分"到店餐饮能力"与"到店秒提"）

- 到店餐饮（developer.meituan.com 能力页 `[摘录]`）：`团购核销`（套餐/代金券/秒杀/拼团收银核销）、`餐饮排队`、`餐饮预订`、`代金券一键买单`、`联名会员卡`——推送形态正文未抓到 → 待核验(09-27)。
- 到店秒提即"到店在线核销"（**非外卖**，走 waimai 网关 `/gw/mop/*`，`[摘录]` docDetail/880）：`/gw/mop/order/query 到店在线核销订单信息查询`、`到店核销-确认订单（必接）`、`品牌订单状态变更通知（必接）` → 推送体全文待核验(09-27)。

---

## 3. 回调机制

### 3.1 接入位置与传输约束（`[摘录]`）

- 配置位置：开发者中心 → **基础设置 → 回调接口设置**（正式地址），按推送项逐项填"xx推送回调URL"并开启回调（docDetail/177/179/180/439）。
- 新版位置：developer.meituan.com 开发者中心（消息回调接入/回调说明，目录见 §1；正文待核验(09-27)）。
- 端口：**仅支持 80 或 8080**，其他端口导致推送失败；回调端口修改后推单与 URL 监控 10 分钟内生效（guide/6）。
- 方法与编码：回调需支持 **POST**；**所有参数均为普通 POST 表单参数而非 JSON**（旧文称 Content-Type: text；新版推送页如 docDetail/835、521 明确为 Content-Type: application/x-www-form-urlencoded; charset=UTF-8，对象/数组先转 JSON 字符串再作 form 字段）；推送参数**尚未排序**，验签前需自行排序（market/17、food/7）。
- 验签解码：回调验签时**需解码 2 次**（先 utf8 解码、再对中文解码；无值参数也参与拼接）（docDetail/177/180、guide/31）。
- 防循环：收到"取消订单"回调后，**APP 方需避免再回调美团取消接口**，以免循环调用（market/18）。

### 3.2 成功应答

- 订单/取消/门店类：`{"data":"ok"}`（小写 ok；docDetail/177/180/439）。门店绑定页示例为 `{"data":"ok"}`，失败推送重试 3 次（docDetail/439）。
- IM 单聊回调：`{"data":"OK"}`（大写 OK；docDetail/842，本轮仅目录级证实，逐字待核验(09-27)）——与订单类大小写不同，照录。
- 响应时限：订单类 **2 秒内**（docDetail/177/180）；IM 类 **4 秒内**，超时或格式错误→重推**并触发短信报警**（docDetail/842，本轮仅目录级证实，逐字待核验(09-27)）。

### 3.3 重试、幂等、有序

- 订单三态推送（已支付/已确认/已完成）：失败→**每隔 1 分钟重试，共 3 次**（docDetail/177/180）。重试期间订单状态若变为已确认/已取消则**停止**对新订单消息的重试（docDetail/180）。
- 推单流程（guide/4 `[摘录]`）：推送失败 1 分钟后再次推单、最多重试 3 次；重试期间商家经手机/PC 接单致状态变化则不再继续重试；**建议对接所有推送订单状态以防漏单**。
- 新订单接收（新版 7.5.1 `[摘录]`）：接收失败→每隔 1 分钟重推（以订单未被确认 为条件）；**5 分钟未接单订单自动取消**。
- 幂等键：官方无"幂等键"命名；消费方应按 `order_id` + 状态机去重（status 1/2/4/8/9），同一订单多态推送天然重复——为模拟器侧推论，官方原文仅"对接所有推送状态"，幂等语义标待核验(09-27)。
- 有序性：官方未声明有序投递 → 待核验(09-27)。

---

## 4. 验签与加密算法

### 4.1 技术服务合作中心签名（外卖/闪购/医药/到店秒提通用，`[摘录]` guide/31 + questionDetail/5730）

算法（品牌商示例，原文字段名大小写照录）：

1. 将**所有参数（sig 除外）按参数名字母顺序排序**，`&` 连接：`app_id=1235123121&app_poi_code=31&timestamp=1389751221`（json 类型参数内的字段不参与排序）。
2. 按 `请求url + ? + 排序后参数 + consumer_secret（即 app secret）` 连接得待签字符串；中文保持原文、不单独转码。
3. **MD5** 加密得 32 位签名，**字母小写**。
4. 赋给 `sig` 作请求参数；发送请求时中文用 utf-8 编码。POST/GET 均同。
5. 系统级参数必含 `app_id`、`timestamp`（调用时时间戳）、`sig`；应用级参数为业务字段。

示例（官方原文数值照录）：待签 `http://waimaiopen.meituan.com/api/v1/poi/mget?app_id=1235123121&app_poi_codes=31&timestamp=1389751221d31ba58fd73c71db697ab5e4946d52d` → 签名 `00934d00d0aea6f12161edfb6456143d`（guide/31）。

推送验签要点（照录）：

- 推送签名构造与 APP 访问美团 API **方式相同**；强烈建议为回调接口设签名验证（market/17、food/7）。
- **不要将签名参数列表写死**，取 URL 全字段（sig 除外）参与验签（questionDetail/5730、market/17）。
- 推送参数中文需**解码 2 次**后再算签名；没有值的参数也需拼接（guide/31、docDetail/177）。
- ISV 应用：所操作门店的 `access_token` **必须参与签名计算并在请求中上传**；品牌商（自研）应用不涉及 access_token（questionDetail/5730）。
- 开发者中心提供签名工具（按 appid 自动取 secret）与 API 测试工具（核对签名前字符串）。

### 4.2 生态开放平台签名（open.meituan.com，`[摘录]`，后缀待核验(09-27)）

`[摘录]` 步骤：1）除 sign 外键值对按**字典序**排序，按 `key1value1key2value2…` 拼串；2）将 `client_secret` 拼在排序串**前面**得待签串（后续哈希步骤原文截断，MD5/SHA 取值与大小写均待核验(09-27)）。OAuth 相关接口除外，均需携带签名。

### 4.3 加密

- 回调/接口参数无 AES/RSA 加密机制（均为明文 POST + MD5 签名）；隐私号场景由平台侧做号码脱敏/隐私号替换（recipient_phone 兼容真实号与 `13812345678_1236` 隐私号格式，docDetail/177）→"无回调加密"为本次未见反例的结论，标待核验(09-27)。

---

## 5. 示例载荷原文（逐字摘录）

### 5.1 签名计算示例（guide/31 `[摘录]` 逐字）

```text
排序后：app_id=1235123121&app_poi_code=31&timestamp=1389751221
待签：http://waimaiopen.meituan.com/api/v1/poi/mget?app_id=1235123121&app_poi_codes=31&timestamp=1389751221d31ba58fd73c71db697ab5e4946d52d
签名：00934d00d0aea6f12161edfb6456143d
```

### 5.2 成功应答（docDetail/177/180/842 `[摘录]` 逐字）

```json
{"data": "ok"}
```

```json
{"data": "OK"}
```

订单类用小写 `ok`；IM 单聊回调用大写 `OK`。

### 5.3 已确认/已完成推送关键字段（docDetail/177/180 `[摘录]`，节选非全量）

```text
POST（Content-Type: text，普通 post 参数，非 json，未排序）
order_id=27061900338318741（long，bigint(20) 存储）
order_tag_list=8（set；8=处方药，36=团好药）
wm_order_id_view=27061900338318741（展示ID，与用户端/商家端一致）
app_poi_code=668921（APP方门店id，未绑三方id时默认等于美团门店id）
wm_poi_name=药品01店
recipient_phone=13812345678_1236（兼容真实号/隐私号双格式）
backup_recipient_phone=["13812345678_1236","13812345678_3456"]（无则 []）
delivery_time=0（0=立即送出，见 estimate_arrival_time；否则为用户所选秒级时间戳）
pay_type=2（1-货到付款，2-在线支付；现仅在线支付）
logistics_code=0000（默认不推，需订阅字段22；0000-商家自配、1001-美团加盟、2002-快送、3001-混合送、4015-企客全城送）
坐标系：高德（火星）坐标，百度系需自转，数值×1000000
```

### 5.4 IM 单聊回调（docDetail/842 `[摘录]`，字段表逐字）

```text
POST 至接入方注册回调地址
biz_type=int 必填，固定 1（聊天类型）
app_poi_code=string 必填，商家门店标识
push_content=string 必填，消息内容（结构见 developer.meituan.com 对应文章 §3.1，全文待核验(09-27)）
extended_field=string 可选，扩展信息
应答：{"data":"OK"}，4秒内；超时/格式错→重推+短信报警
```

### 5.5 门店绑定/解绑推送（docDetail/439 `[摘录]`，字段表逐字）

```text
op_type=String 必填，1-绑定门店；2-解绑门店
poi_info=String 必填，门店相关信息
op_time=String 必填，如 1583393145
op_source=String 必填，商家账号信息 或 "美团运营"
token_info=String 可选，推送token信息
应答：{"data":"ok"}，否则推送失败；失败重试3次
```

### 5.6 同意退款响应（docDetail/122 `[摘录]` 逐字）

```json
{ "data": "ok" }
```

```json
{ "data": "ng", "error": { "code": 808, "msg": "操作失败，订单支付状态发生变化，不能同意退款, wm_order_id=790579611172872" } }
```

### 5.7 发送 API 与 token（§6 联动，`[摘录]`）

```text
美团侧发送（商家调美团）：
GET/POST https://waimaiopen.meituan.com/api/v1/order/refund/agree?app_id=…&timestamp=…&sig=…  body: order_id + reason
POST https://waimaiopen.meituan.com/gw/mop/order/query（到店秒提查询，系统级 app_id/timestamp/sig + app_poi_code/order_id）
生态侧 OAuth：POST https://openapi.meituan.com/oauth/token（grant_type=authorization_code，参数含 client_secret/redirect_uri/code）
```

---

## 6. token / 凭证模型

| 凭证 | 换取/持有方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `app_id` + `app secret(consumer_secret)`（技术服务合作中心） | 创建应用即分配；开发者中心可查；签名工具按 appid 自动取 secret | 长期有效，自行保存；ISV 的门店 `access_token` 另参与签名 | guide/31 + questionDetail/5730 `[摘录]` |
| 门店 `access_token`（ISV 应用） | ISV 安全认证流程获取（《ISV安全认证》文档） | 请求时必传并参签 | questionDetail/5730 `[摘录]`（流程全文待核验(09-27)） |
| 品牌商（自研）应用 | 不涉及 access_token 参数 | — | questionDetail/5730 `[摘录]` |
| `access_token`/`refresh_token`/`openid`（生态开放平台 OAuth2） | `POST https://openapi.meituan.com/oauth/token`，`grant_type=authorization_code`，`redirect_uri` 需与申请时 HOST 一致 | `refresh_token` 30 天有效、**只能用一次**（刷新即失效）；openid 为用户在应用下唯一标识（≤255字符） | open.meituan.com/docs/detail?id=2 + /docs/introduce `[摘录]` |
| 授权模式 | 授权码模式、隐式授权码模式 | — | open.meituan.com/docs/introduce `[摘录]` |
| 调用传参（合作中心） | 系统级 `app_id/timestamp/sig`（+ ISV 的 `access_token`） | timestamp 为调用时时间戳；sig 见 §4.1 | guide/31 `[摘录]` |
| 订阅字段 | 开发者中心 订单字段订阅 / 订单订阅字段 | 已订阅字段在已支付/已确认/已完成三态推送同时生效 | market/17、docDetail/180 `[摘录]` |
| 频控 | 商品类 API 限流（目录单列"商品类API限流"）；IM 发送/订单接口 code 703 签名错、700 系统错等 | 阈值表全文待核验(09-27) | market/17 目录 + docDetail/122 `[摘录]` |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **新版消息回调正文**：`developer.meituan.com/docs/biz/comm-dev-isv-api-rule` 下"消息回调接入/消息推送公共请求参数/消息推送公共响应规范"全文（仅目录树已见）。→ 待核验(09-27)
2. **退款信息推送体**：`退款信息推送API` 各 APP方URL 推送字段（目录已见，推送体未抓到）。→ 待核验(09-27)
3. **取消订单推送体**：`推送用户或客服取消订单` 字段表 + 订单取消规则页。→ 待核验(09-27)
4. **商品变更推送是否存在**：除闪购商品管家质量变更（open-shangou docDetail/10097）外，外卖商品/评价是否有推送；商品类 API 限流阈值。→ 待核验(09-27)
5. **IM push_content 结构**：`push_content` 内消息类型/图片/语音/订单卡片结构（developer.meituan.com 对应文章 §3.1）。→ 待核验(09-27)
6. **闪购 IM 各推送体**：IM消息推送/用户撤回/风控/已读状态四推送字段 + msgSend/msgRevoke/msgRead/historyMsg 接口正文（tscc/460）。→ 待核验(09-27)
7. **到店推送正文**：团购核销/排队/预订/一键买单的回调形态；到店秒提品牌订单状态变更通知推送体。→ 待核验(09-27)
8. **生态开放平台签名后缀**：client_secret 前置后的哈希算法（MD5/SHA）与大小写、完整请求示例。→ 待核验(09-27)
9. **ISV 安全认证全文**：access_token 获取/刷新/过期规则。→ 待核验(09-27)
10. **幂等与有序**：平台是否承诺至少一次/去重键/有序（本库仅实锤"1分钟×3次"重试与"状态变化停推"）。→ 待核验(09-27)
11. **准入量化**：服务商 vs 品牌商 vs 个人开发者资质/保证金金额/审核时长；外卖/到店/闪购三域准入差异与 IM 单独审批（工单+appid）之外的前置条件。→ 待核验(09-27)
12. **"无回调加密"结论复核**：全站未见 AES/RSA 回调加密（仅 MD5 签名+隐私号脱敏），需复核新版安全文档。→ 待核验(09-27)

---

## 8. 实施补证（2026-10-14，#109 动工前置）

方法：WebSearch 官方站内摘录（docDetail/455、456、842、844、845 标题与请求示例片段）+ mock-pulse meituan 适配器源码对拍（行为基线，只读）+ cnblogs 美团回调生产代码互证。仍未取得官方原文的部分维持 §7 待核验，不编造。

1. **推送验签待签串含完整回调 URL**（§4.1 的 URL 语义补实）：mock-pulse `meituan/tests/chain.rs` 接收侧重签用 `url = format!("http://{host}{}", request_path)`，cnblogs 生产代码用 `"https://" + serverName + requestURI + "?" + TreeMap 排序串 + secret` → MD5 小写——两源一致证明待签串中的「请求 url」= `scheme://host/path` 全路径，排序串以 `?` 与 URL 相接。Server 侧落地：回调路径由统一路由确定性派生（`/api/channels/{id}/callback`），host 取请求 Host 头重建；scheme 恒 `http`（官方端口仅 80/8080 明文，guide/6），反代 https 场景未加 X-Forwarded-Proto 防御（边界注明，不为假想场景加逻辑）。
2. **「解码 2 次」的工程语义**：Spring `@RequestParam` 表单值已被容器解码一次，适配器对每个值再 `URLDecoder.decode` 一次即官方口径；解码失败（畸形 `%` 序列）保留一次解码值。cnblogs 生产代码对整个待签串再 decode 一次，与逐值 decode 等价（中文值一次解码后不再含 `%`/`+`）。
3. **IM 接口族路径前缀实锤**：`https://waimaiopen.meituan.com/api/v1/wm/IM/setPoiIMStatus`（docDetail/456 摘录）、`getPoiIMStatus`（docDetail/455）——IM 管理/发送接口在 `/api/v1/wm/IM/` 族下；但 `msg/send`（docDetail/845 标题实锤的官方 API 名）的完整 URL 未取得官方原文。落地：发送地址 = `dudu.channel.meituan.api-base`（默认 `https://waimaiopen.meituan.com/api/v1`）+ `/msg/send`，生产接入时按 docDetail/845 原文核对路径段。
4. **docDetail/842 字段表与请求示例**：搜索摘录显示请求示例含 `"extended_field": "example"`，字段 `biz_type/app_poi_code/push_content/extended_field` 与 §5.4 一致；`push_content` 内部结构（图片/语音/订单卡片）仍未取得官方原文（§7 第 5 条维持待核验）。guide/40（IM WebSocket SDK）摘录露出字段族 `msg_source`（1 商家/2 用户）、`msg_type`（1 文字/2 图片/3 其他）、`open_user_id`、`order_id`——佐证顾客级标识存在，但 HTTP 回调内的承载形态未实锤。
5. **msg/send 应用级参数与响应形状**：未取得官方原文（§7 第 6 条相关）。落地按以下实现选择（生产接入须核对）：会话目标与内容沿用回调字段同名词法 `biz_type=1`（两方会话，§2.4 实锤支持值）+ `app_poi_code` + `push_content`；响应按「合作中心 API 家族错误形状缺席即成功」解析——已实锤的错误形状为 `{"data":"ng","error":{"code":808,"msg":…}}`（§5.6）与 `{"code":803,"msg":"不存在此门店"}`（context7 官方文档镜像摘录）、`code 703 签名错/700 系统错`（§6），三类任一出现如实失败，否则成功（接口不返回消息标识）。
6. **访客身份粒度**：IM 单聊回调已实锤字段中无顾客级标识（见第 4 条），`app_poi_code` 是唯一实锤的会话归属标识 → 落地选择 externalUserId = `app_poi_code`（会话粒度=门店），`push_content` 结构实锤后再细化到顾客级。发送侧 `app_poi_code` 即该会话目标，往返自洽。
7. **入站媒体**：官方素材下载接口未实锤（§7 第 5/6 条）→ 媒体读取按现状如实处理：未配置凭据按受限说明；凭据齐备时也如实返回「接口未实锤」失败，不编造下载链路（票面渠道要点第 4 条口径）。
8. **未知表单形态**：验签通过的推送若不含 `biz_type`/`order_id`/`op_type` 任一判型键（美团推送族以事件为主体），按事件只应答 `{"data":"ok"}`，不落访客数据、不拒绝（拒绝会触发渠道 1 分钟×3 重推+短信报警）。

---

## 附：对 MockPulse 模拟的直接含义（速查）

- 模拟"美团推单给回调"：`POST` 普通表单参数（**非 JSON，Content-Type: text**，参数未排序），至少含 `app_id/timestamp/sig/order_id/app_poi_code`，签名= `MD5(回调URL全路径 + ? + 全字段除sig字母序&连接 + app_secret)` 小写；中文先 utf8、再中文二次解码后验签；端口仅 80/8080。
- 成功应答：订单/门店类 `{"data":"ok"}`（2s 内），IM 类 `{"data":"OK"}`（4s 内，大写）；超时/格式错即判失败。
- 重试语义：订单三态 1 分钟×3 次；新订单 1 分钟重推（未确认前提）、5 分钟未接单自动取消；IM 超时重推+短信报警；门店绑定失败重试 3 次；重试中状态流转（已确认/已取消/已接单）则停推。
- 状态机：`1已提交/2已推送/4已确认/8已完成/9已取消`；消费方按 `order_id` + 状态去重（官方无幂等键命名）。
- 必接项：已支付订单、催单、隐私号降级、7.5.1 新订单接收、到店秒提确认/状态变更、闪购 IM 四推送。
- 准入分支：合作中心（app_id/secret；ISV 加 access_token 参签）vs 生态开放平台（OAuth2 code→`POST openapi.meituan.com/oauth/token`，refresh 30 天一次有效）；外卖/闪购/医药/到店秒提共用合作中心签名，IM 需工单按 appid 单独开通。
