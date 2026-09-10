# 知乎开放平台 事件推送 事实库

> 研究日期：2026-09-10。方法：WebFetch 直抓官方域名（`developer.zhihu.com`、`open.zhihu.com`）+ WebSearch 全网检索（官方站内 webhook/回调/事件推送/私信关键词 + 能力目录枚举）。
> 标注约定：`[官方直抓]` = 本次 WebFetch 官方域名返回（即使只是 SPA 壳/状态码，也是第一手返回）；`[第三方]` = 非官方页面/代码实现/文章，仅作"查过哪些入口"的旁证，不当官方事实；`待核验(09-27)` = 未能取得官方原文，需复核。
> 核心结论先行：**知乎开放平台无公开的消息/私信事件推送（无 webhook、无事件订阅、无回调配置）。** 官方开放能力为拉取式数据只读 API（搜索/热榜/直答/用户公开数据等），无"平台推事件给开发者服务器"机制。以下逐节举证。

---

## 1. 官方文档入口与关键页面地址

### 1.1 现行官方门户：`developer.zhihu.com`（知乎数据开放平台）

| 页面 | URL | 本次核验结果 |
|---|---|---|
| 门户首页 | https://developer.zhihu.com/ | `[官方直抓]` WebFetch 200 但正文仅 SPA 壳标题"知乎数据开放平台"，无静态正文（JS 渲染站，直抓取不到文档正文） |
| 文档中心 | https://developer.zhihu.com/docs | `[官方直抓]` 同上，仅回 SPA 壳标题，无正文 → 文档目录全文待核验(09-27) |
| 文档子页（`?key=` 路由） | https://developer.zhihu.com/docs?key=global_search | `[官方直抓]` 同样仅回 SPA 壳（该 `?key=` 路由形态出自第三方代码注释 `[第三方]` https://github.com/Amiyadesi/search-gateway，不代表官方确认） |
| 个人中心（Access Secret 签发） | https://developer.zhihu.com/personal | `[官方直抓]` 仅回 SPA 壳；"个人中心查看并获取 Access Secret"出自官方文档的第三方转述 `[第三方]`（WebSearch 首结果 developer.zhihu.com 鉴权说明页摘要），原文待核验(09-27) |

### 1.2 旧域名：`open.zhihu.com`

| 页面 | URL | 本次核验结果 |
|---|---|---|
| 根路径 | https://open.zhihu.com/ | `[官方直抓]` WebFetch 返回 **non-2xx（422）**，无文档正文。域名本身存在（urlscan 对 `www.zhihu.com` 的扫描显示子域 `open.zhihu.com` 存活 `[第三方]` https://api.urlscan.io/result/019d8f35-02ea-76ee-b87a-729d5cce70f6），但根路径不提供文档 |
| 文档/事件/回调子路径 | `open.zhihu.com` 下任何 `/document/*`、`/docs/*`、事件订阅、回调配置页 | 全网检索零命中 → 待核验(09-27)（不排除历史存在，但本次无任何官方或第三方证据指向其有推送文档） |

### 1.3 本次实际抓到并核实的页面清单

| 主题 | URL | 核验方式 |
|---|---|---|
| 门户/文档/个人中心 SPA 壳存在性 | https://developer.zhihu.com/ 等（§1.1） | `[官方直抓]` WebFetch（仅标题，无正文；2026-09-11 复验 `/`、`/docs`、`/personal` 仍只回标题"知乎数据开放平台"） |
| `open.zhihu.com` 根路径状态 | https://open.zhihu.com/ | `[官方直抓]` WebFetch（422；2026-09-11 复验仍为 422） |
| 同域官方文档 JSON 全量（29 条目：guide 3 + api 18 + skill 4 + mcp 4） | https://developer.zhihu.com/console/api/v2/docs | `[官方直抓]` 2026-09-11 全量拉取逐 key 对敲，见下表与 §2/§5/§6/§7 |

2026-09-11 官方 JSON 29 key 全表（`key / category / tab_name`，`content` 均为 markdown 官方正文）：

| # | key | category | tab_name |
|---|---|---|---|
| 1 | `authorization` | guide | 鉴权 |
| 2 | `zhihu_oauth_integrated` | guide | 接入知乎 OAuth |
| 3 | `zhihu_cli` | guide | Zhihu CLI |
| 4 | `quota` | api | 额度查询 API |
| 5 | `global_search` | api | 全网搜索 API |
| 6 | `zhihu_search` | api | 知乎搜索 API |
| 7 | `hot_list` | api | 知乎热榜 API |
| 8 | `question_recommendations` | api | 问题推荐 API |
| 9 | `question_answers` | api | 问题回答 API |
| 10 | `user_content_detail` | api | 我的创作全文 API |
| 11 | `user_content_comments` | api | 我的创作评论 API |
| 12 | `creator_account_stats` | api | 账号创作数据 API |
| 13 | `creator_content_stats` | api | 单篇创作数据 API |
| 14 | `user_contents` | api | 用户的内容 API |
| 15 | `user_followees` | api | 用户的关注 API |
| 16 | `user_collections` | api | 用户的收藏 API |
| 17 | `user_favlists` | api | 用户收藏夹列表 API |
| 18 | `favlist_contents` | api | 收藏夹内容 API |
| 19 | `zhida` | api | 直答 API |
| 20 | `pdf_parse` | api | PDF 解析 API |
| 21 | `ppt_generation` | api | PPT 生成 API |
| 22 | `zhida_skill` | skill | 直答 Skill |
| 23 | `zhihu_search_skill` | skill | 知乎搜索 Skill |
| 24 | `global_search_skill` | skill | 全网搜索 Skill |
| 25 | `hot_list_skill` | skill | 知乎热榜 Skill |
| 26 | `global_search_mcp` | mcp | 全网搜索 MCP |
| 27 | `hot_list_mcp` | mcp | 知乎热榜 MCP |
| 28 | `zhihu_search_mcp` | mcp | 知乎搜索 MCP |
| 29 | `zhida_mcp` | mcp | 直答 MCP |

口径说明（`[官方直抓]` 同一 JSON）：jzl 转述的"21 条文档 / 11 条 API"为旧快照，现行官方为 29 key / 18 api；两口径均无推送类目。注意 18 个 api key 中**无独立知识库 key**（知识库仅作为 quota 额度项 `knowledge` 与 CLI 能力出现）；用户数据 5 端点即 key 14–18；PDF 为 1 key 内 3 步（上传/建任务/轮询），PPT 为 1 key 内 2 步（建任务/轮询）。另：官方鉴权正文内的个人中心链接为 https://developer.zhihu.com/profile（与 §1.1 的 `/personal` 转述并存，登录后或为同一页）。

---

## 2. 消息/事件推送全清单

### 结论：无（`push 事件数 = 0`）

**知乎开放平台没有公开的消息推送、几种事件类型、Webhook、私信（DM）下发或接收事件。** 证据链：

1. **能力目录枚举中无推送类目（2026-09-11 已用官方全量目录确认）。** 同域官方文档 JSON（`[官方直抓]` https://developer.zhihu.com/console/api/v2/docs，29 key：guide 3 + api 18 + skill 4 + mcp 4，见 §1.3 全表）逐 key 核对：**无 webhook、无事件订阅、无回调、无私信类目**。第三方对官方目录的旧统计（`[第三方]` https://www.jzl.com/news/zhihu-api，"21 条文档 / 2 指南 / 11 API / 4 Skill / 4 MCP"）为旧快照，API 数以官方现行 18 为准；两口径均无推送项。另对官方 29 key 正文全文关键字检索：`webhook/Webhook/事件推送/私信/push/Push/callback/Callback/subscribe/Subscribe/notify/Notify/长连接/长轮询/open.zhihu.com/5000` **全部零命中**；`回调` 仅命中 2 处，均为 OAuth 登录授权回调地址 `redirect_uri`（见 §6，非事件推送）。"无推送"至此由"第三方转述+检索零命中"的消极证据，升级为**官方全量目录枚举**确认（官方明示"仅拉取"语句仍未见，见 §7-10）。
2. **能力实现交叉一致：全部为拉取式 REST，无订阅。** 多个独立第三方实现（`[第三方]` https://github.com/acedatacloud/skills/blob/main/skills/zhihu/scripts/search.py、`[第三方]` https://github.com/lioensky/VCPToolBox/blob/bdc2228c/Plugin/ZhihuSearch/ZhihuSearch.py、`[第三方]` https://github.com/dsd2077/CyberVerse/blob/5b42fc52/inference/plugins/voice_llm/persona/tools.py、`[第三方]` https://pypi.org/project/zhihu-search/）一致只实现 `GET /api/v1/content/{zhihu_search,global_search,hot_list}` + `POST /v1/chat/completions` + 用户公开数据/知识库/PDF/PPT/quota 查询，**没有任何 webhook 接收、事件订阅、回调验签代码**。`zhihu-search` v1.0.0 自述能力表（`[第三方]` https://pypi.org/project/zhihu-search/1.0.0/）："搜索直答热榜 4 + 官方额度 1 + 用户公开数据 5 + 知识库 4 + PDF 解析 3 + PPT 生成 2 + OAuth 辅助 2"，无推送项（其中 REST 路径/直答三模型/轮询语义 2026-09-11 已与官方 JSON 逐条对上，见 §5–§6）。
3. **"只读、无写入"口径旁证。** 第三方报道（`[第三方]` https://www.openai-hub.net/news/441/）称平台"does not expose user data or writing capabilities (like posting answers or liking/commenting), offering only read and search access"——连写入都不开放，更无"收到私信/被@时推事件给开发者"的推送语义。该表述为第三方概括，官方原话待核验(09-27)。
4. **关键词检索零命中。** `"developer.zhihu.com" webhook OR 回调 OR 事件推送 OR 私信` 全网检索：返回的命中全部是抖音开放平台私信 webhook、企微 webhook 概念科普、企业微信群推送等**其他平台**内容（见 §2.1 查过入口表），**零条知乎官方事件推送文档**。
5. **`open.zhihu.com` 只读旧口径（第三方，不采信为官方事实）。** CSDN 问答一条采纳回答（`[第三方]` https://ask.csdn.net/questions/9115943）称"知乎开放平台（open.zhihu.com）当前仅提供 /api/v4/topics、/api/v4/rank/hot 等只读接口"——与"无推送"方向一致，但它是第三方说法，官方原文待核验(09-27)。

### 2.1 为回答"有没有私信推送"而查过的入口（证据：均无）

| 查过的入口 | 查法 | 结果 |
|---|---|---|
| `developer.zhihu.com/docs` 文档中心 | WebFetch 直抓 | SPA 壳，无正文；但同域官方文档 JSON（§1.3）已全量确认无私信/推送类目 |
| `developer.zhihu.com/personal` 个人中心 | WebFetch 直抓 | SPA 壳；官方鉴权正文（key=`authorization`）确认该页仅签发 Access Secret（链接指向 `/profile`），无回调地址配置项 |
| `open.zhihu.com/` | WebFetch 直抓 | 422，无文档 |
| 全网 `"developer.zhihu.com" webhook/回调/事件推送/私信` | WebSearch | 零命中（命中全为抖音/企微/飞书等其他平台） |
| 全网 `open.zhihu.com 开放平台` | WebSearch | 仅 1 条 CSDN 只读口径（§2 证据 5）+ 1 条 MCP 研报行项（Partner API/OAuth2，`[第三方]` https://github.com/theYahia/mcp-servers/blob/main/research/artifacts/China_MCP_Research.md），均无推送 |
| 官方文档 JSON 全文（29 key 正文）关键字检索 | 本地对 2026-09-11 拉取全文检索 webhook/推送/订阅/私信/回调(事件)/长连接等 | webhook/推送/订阅/私信等全部零命中；`回调`仅指 OAuth 登录 `redirect_uri`；`open.zhihu.com` 零提及 |
| 第三方 PyPI/skill/MCP 实现（4 个独立源） | WebSearch 源码级摘要 | API 全集无推送、无回调（§2 证据 2） |
| 旧 `www.zhihu.com/api/v4` 站内接口（topics/members/questions/answers 等） | WebSearch 百度开发者中心/百度云文章转述 | 均为**请求-响应式**站内 API（`[第三方]` https://developer.baidu.com/article/details/2973618、`[第三方]` https://cloud.baidu.com/article/3876845 等），且这些百度云/GitCode 文章的 OAuth/`/v4/oauth/token`/scope/GraphQL/WebSocket 描述**互相矛盾、与现行 developer.zhihu.com 的 Bearer+Access Secret 模型冲突**，疑为 AI 生成营销文，**不采信**，仅记录查过 |

### 2.2 易混淆项（明确排除，不是官方推送）

- **`POST https://www.zhihu.com/api/v4/messages` 私信发送**：出自 2017 年爬虫逆向博客（`[第三方，非官方]` https://foofish.net/http-requests-zhihu-api.html，转述站见 `[第三方]` https://www.zhangshengrong.com/p/LKa4m80NQG/），原理是**携带登录 cookie 模拟浏览器发私信**（请求体 `{"type":"common","content":...,"receiver_hash":<用户id>}`），且方向是**开发者主动发**而非**平台推事件**。与开放平台无关，MockPulse 不得将其作为官方私信推送/发送能力建模。
- **广告归因回调**（`sugar.zhihu.com/plutus_adreaper_callback`，`__CALLBACK__` 宏）：出自知乎商业广告文档（`[第三方 PDF]` https://zhstatic.zhihu.com/commercial/bidding/%E5%BA%94%E7%94%A8%E4%B8%8B%E8%BD%BDAPI%E8%BD%AC%E5%8C%96%E8%BF%BD%E8%B8%AA%E6%96%87%E6%A1%A35.pdf），是**广告主回传转化**给知乎广告平台，与开放平台消息/私信推送无关。
- **百度云/GitCode 系"知乎 API v4"营销文**（OAuth2/JWT/scope/`client_credentials`/WebSocket 实时接口/GraphQL 等说法，`[第三方]` https://cloud.baidu.com/article/3674376、https://cloud.baidu.com/article/3877783、https://blog.gitcode.com/6430a5754616a0fe64026b1dec8bc35b.html、https://blog.gitcode.com/e37a8f333ac3a9ab12707c5cf54b3ef8.html）：与现行官方可验证面（Bearer Access Secret + 搜索/热榜/直答）矛盾，多处互斥（如同一体系下 token 有效期/授权模式说法不一），判定为不可信营销文，**本库不采纳其任何 claim**，包括其中提到的"用户关系/私信接口""实时 WebSocket 连接"等。

---

## 3. 回调机制

**无。** 无首次验证握手（无 `challenge`/`url_verification` 对等物）、无回调地址配置页、无重试/幂等/有序语义——因为不存在服务器向开发者推送的通道。

- 官方可验证的交互模型只有**开发者主动拉**：`GET` 搜索/热榜/用户数据/quota（`Authorization: Bearer <Access Secret>` + `X-Request-Timestamp` 秒级时间戳）与 `POST /v1/chat/completions` 直答（`[第三方交叉]` acedatacloud/skills、VCPToolBox、CyberVerse 三实现一致；官方原文待核验(09-27)）。
- 第三方实现中对长耗时任务（PDF 解析、PPT 生成）采用的是**轮询任务状态**（创建任务→查询状态，`[第三方]` https://pypi.org/project/zhihu-search/1.0.0/），而非回调通知——这本身就是"无推送"的旁证。
- 知乎直答流式（`stream:true` → `text/event-stream`）是**请求响应流**，不是事件推送（`[第三方]` https://pypi.org/project/zhihu-search/1.2.0/ 提及"当前版本只支持非流式。流式支持会随官方 API 一起来"；官方原文待核验(09-27)）。

---

## 4. 验签与加密算法

**无回调验签/回调解密。** 平台没有向开发者服务器发请求的动作，因此没有签名头、签名算法、Encrypt Key、AES 解密对等物。

请求侧（开发者→平台）的鉴权为 Bearer + 时间戳头（**非回调验签**，放在此处仅为防止与 §4 主题混淆；官方原文待核验(09-27)，以下引文出自官方文档的第三方转述/第三方实现交叉）：

```bash
# [第三方转述] https://developer.zhihu.com/ 官方鉴权说明页摘要（WebSearch 首结果）
curl -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -H 'Content-Type: application/json'
```

要点（`[第三方]` docs.rs 对官方文档的镜像转述 https://docs.rs/crate/zhihu-cli/latest/source/docs/api-reference.md + 三实现交叉一致；官方原文待核验(09-27)）：所有数据接口统一 Bearer；`X-Request-Timestamp` 为秒级 Unix 时间戳，服务端校验；通用错误码 `0` 成功 / `10001` 参数错误 / `20001` 鉴权失败 / `30001` 频率限制 / `90001` 内部错误。

---

## 5. 示例载荷原文（逐字）

**无官方推送载荷。** 本节请求侧示例 2026-09-11 已全部升级为官方文档 JSON 原文（`[官方直抓]` https://developer.zhihu.com/console/api/v2/docs，下按 `key` 引用；字段表为官方逐字，可作回归向量。`Url` 示例中的 `utm_medium=openapi_platform` 为官方溯源参数）。

### 5.1 站内搜索（`[官方直抓]` key=`zhihu_search`）

- `GET https://developer.zhihu.com/api/v1/content/zhihu_search`，头：`Authorization: Bearer <secret>`、`X-Request-Timestamp`（秒级）、`Content-Type: application/json`。
- Query：`Query`（必填，非空）；`Count`（默认 10，最大 10；`Count<=0` 回退 10，`>10` 截断 10）；`SortBy`（格式 `字段:方向:(最小值,最大值)`，字段 `CommentCount`/`VoteUpCount`/`EditTime`，方向 `asc`/`desc` 大小写不敏感，区间两端包含、空端不限，非负 int64，`EditTime` 映射发布时间秒级戳，非法值报参数错误；不传保持默认）。
- 响应 `Data`：`HasMore`（Bool，**当前实现固定 `false`**）、`SearchHashId`、`Items[]`、`EmptyReason`（可选）。
- `Item` 全集（15 字段）：`Title`、`ContentType`、`ContentID`、`ContentText`（摘要）、`Url`（带溯源 UTM）、`CommentCount`、`VoteUpCount`、`AuthorName`、`AuthorAvatar`、`AuthorBadge`、`AuthorBadgeText`、`EditTime`、`AuthorityLevel`、`RankingScore`（Float32）必返；`CommentInfoList[]`（可选，元素仅 `Content` 评论内容）。
- 错误码：`0` 成功 / `10001` 参数错误 / `20001` 鉴权失败 / `30001` 频率限制 / `90001` 内部错误。

### 5.2 全网搜索（`[官方直抓]` key=`global_search`）

- `GET https://developer.zhihu.com/api/v1/content/global_search`，头同上。
- Query：`Query`（必填）；`Count`（**默认 10，最大 20**；官方未写截断/回退语义）；`Filter`（高级表达式，URL 编码）；`SearchDB`（默认 `all`，另 `realtime` 仅实时库 / `static` 仅静态库）。
- `Filter` 官方语法：`host` 支持 `==`/`!=`、值须双引号，**`host=="zhihu.com"` 及其子域不支持**（站内请用 `zhihu_search`）；`publish_time` 支持 `==`/`!=`/`>`/`>=`/`<`/`<=`、秒级 Int64 不加引号；`AND`/`OR` 须大写，`AND` 优先级高于 `OR`，可用 `()` 控制优先级。
- 响应 `Data`：`HasMore`（**是否有下一页数据**，与站内搜索的固定 `false` 不同）、`Items[]`；`Item` 字段同站内搜索但**无 `RankingScore`/`SearchHashId`**（`ContentText` 高亮用 `<em>`，`AuthorityLevel` 取值 1 低权威/2 中权威/3 高权威/4 超高权威）。
- 注意：官方 `global_search` 正文**无错误码表**（`10001/30002` 均零命中）。

### 5.3 热榜（`[官方直抓]` key=`hot_list`）

- `GET https://developer.zhihu.com/api/v1/content/hot_list`，Query：`Limit`（默认 30，最大 30；`Limit<=0` 或 `>30` 回退 30）。
- 响应 `Data`：`Total`（实际返回条数）、`Items[]`；`Item` 仅 4 字段：`Title`、`Url`、`ThumbnailUrl`（必返，无封面为空串）、`Summary`（必返，无摘要为空串）；**当前仅返回问题和文章两类**。
- 错误码：`0` / `20001` / `30001` / `90001`（官方表**无 `10001`**）。

### 5.4 直答（`[官方直抓]` key=`zhida`）

- `POST https://developer.zhihu.com/v1/chat/completions`，`application/json`；头 `Authorization: Bearer` + `X-Request-Timestamp`（秒级）。
- Body 仅保证三字段：`model`（必填：`zhida-fast-1p5` 快答 / `zhida-thinking-1p5` 深思 / `zhida-agent` 智能；缺失报 `missing_required_parameter`）、`messages[]`（`role`+`content`）、`stream`（默认 `false`）；其他字段不保证生效。
- `stream=false` → `application/json`（`choices[].message` 含 `reasoning_content`+`content`）；`stream=true` → `text/event-stream`（`data: {...chunk...}` … `data: [DONE]`，服务端心跳 `: keep-alive`；中途错误仍 HTTP 200，以 `finish_reason:"error"` chunk + `data: [DONE]` 收尾）。**流式已作为官方正式语义上线**（反转 §3 引用的第三方"流式随官方一起来"旧说法）。
- 约束：同一次流式 `id` 一致；`role`/`content` 上下文传参仅 `fast`/`thinking` 保证；实际可用模型受租户授权配置影响。

### 5.5 额度查询（`[官方直抓]` key=`quota`）

- `GET /api/v1/quota`（全址 `https://developer.zhihu.com/api/v1/quota`），头 `Authorization` + `X-Request-Timestamp`（官方明确：**与服务端时间相差不能超过 10 分钟**）。
- Query：`APIIDs`（可选，逗号分隔、只能出现一次；不传返回全部）。
- 9 个可查额度项（`APIID`）：`global_search` 全网搜 / `zhihu_search` 知乎搜索 / `hot_list` 热榜 / `question_answers` 知乎问题回答 / `user_data` 知乎用户数据（创作列表/关注/收藏/收藏夹） / `creator` 创作能力（问题推荐/本人全文/评论/账号统计/单篇统计） / `zhida_openai` 直答 / `knowledge` 知识库 / `tools` 小工具（PDF+PPT）。
- 响应 `Data[]`：`APIID`、`APIName`、`TotalQuota`（自然日总额度）、`TotalUsed`、`RemainingQuota`（最低 0）；**查询不消耗业务额度**；账号关联多租户时汇总；实际额度以查询结果为准。
- 错误码：`10001`（`APIIDs` 格式错/未知 ID）/ `20001` / `30001` / `90001`（额度数据读取失败）。官方正文**无"每天 1000 次"/"5000"数字**（`5000` 全文零命中；`1000` 仅出现在时间戳示例数字中），免费额度数字仍待核验(09-27)，见 §7-8。
- 默认配额（官方各 key 正文，仅两处有数字）：创作能力类（问题推荐/本人全文/评论/账号/单篇统计共用）默认每租户每自然日 **100 次**、未实名等低额度 **10 次**；问题回答摘要独立额度同样默认 100/低 10；日耗尽报 `30001`。

### 5.6 用户/创作/问题 API（`[官方直抓]` key=`user_contents`/`user_followees`/`user_collections`/`user_favlists`/`favlist_contents`/`user_content_detail`/`user_content_comments`/`creator_account_stats`/`creator_content_stats`/`question_recommendations`/`question_answers`）

- 用户数据 5 端点（`GET /api/v1/user/{contents,followees,collections,favlists,favlist_contents}`）：`X-OAuth-Token` 可选头——不传查本人，传入查该 OAuth 凭证对应的已授权用户（OAuth 为官方能力，见 §6）；`contents` 必填 `ContentType=all|answer|article|zvideo|pin|question`（`Limit` 默认 20 最大 50，`SortField=like_count|ts`）；`collections`/`favlists` 仅 `Limit` 默认 20；`favlist_contents` 必填 `FavlistUrlToken`（Int64，取自 favlists 的 `UrlToken`）；分页 `Paging{IsEnd,NextOffset,Totals}`；错误码含 `30002` 配额限制。
- 本人在创 4 端点（`GET /api/v1/user/{content_detail,content_comments,creator_account_stats,creator_content_stats}`）：仅当前 Access Secret 所属账号，**不接受 OAuth 身份切换**；`content_detail?ContentUrl=` 返回 `ContentType/ContentToken/Url/Title/Body`（HTML 正文，视频仅关联正文）；`content_comments` 分页根评论+`Children`（`Order=score|reverse|ascending`，`Limit` 1–50）；两统计支持 `StartDate/EndDate`（`YYYY-MM-DD`，须成对）；与问题推荐共用"创作能力"额度。
- 问题推荐（`GET /api/v1/user/question_recommendations`）：`Query` 缺省按画像推荐、传值按主题推荐（空串报 `10001`），`Count` 默认 5 范围 1–20，返回 `Title/Url`，不支持分页；问题回答（`GET /api/v1/content/question_answers`）：必填 `QuestionUrl`，`Offset` 默认 0、`Limit` 默认 20 范围 1–50，`Summary` 为服务返回截取文本（非 AI 生成），分页按 `Paging.IsEnd/NextOffset`（`Totals` 含被过滤项）。
- 扩展错误码（创作/问题类官方表）：`30002` 额外累计成功次数额度耗尽 / `30003` 风控拒绝（另 `user_contents` 等用户类表的 `30002` 写作"配额限制"）。

### 5.7 长任务轮询：PDF 解析 / PPT 生成（`[官方直抓]` key=`pdf_parse`/`ppt_generation`，轮询非回调的官方旁证）

- PDF 三步：`POST https://developer.zhihu.com/resources/v1/files`（`multipart/form-data`，`file` 仅 PDF、最大 100MB，`file_id` 24 小时内使用）→ `POST /api/v1/pdf-parse/tasks`（`{file_id}`，可选 `Idempotency-Key`，命中返回头 `Idempotent-Replayed: true`，初态 `pending`）→ `GET /api/v1/pdf-parse/tasks/{task_id}` 轮询（`task_status`，成功 `succeeded` 取 `result.url` 下载 JSON 解析结果 `schema_version=v1/pages[].blocks[]{type/box/content/image}`，`result.summary`+`expires_at_ms`，链接短期有效、过期重查；失败 `failed`+`error{code,message}`）。
- PPT 两步：`POST /api/v1/ppt-generation/tasks`（`{resource_url` 仅回答/文章链接，`num_pages` 6–21`}`，同样 `Idempotency-Key`）→ `GET /api/v1/ppt-generation/tasks/{task_id}` 轮询（`progress` 0–1，成功取 `result.url` 下 PPTX）。
- 长任务错误码含 `40001` 幂等键冲突 / `40002` 文件不存在或过期 / `40003` 活跃任务超限。

### 5.8 Skill / MCP 与 REST 对应（`[官方直抓]` key=`zhihu_search_skill`/`global_search_skill`/`hot_list_skill`/`zhida_skill` + 4 mcp + `zhihu_cli`）

- Skill zip（官方托管下载）：`https://developer.zhihu.com/download/{zhihu_search,global_search,hot_list,zhida}_skills.zip`；参数与 REST 同义（`query/count[1-10 站内]/count[1-20 全网]+filter+search_db/limit[1-30]/model+stream+output[json|sse|text]`）；另 CLI Skill：`https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip`。
- MCP：搜索族/热榜走 **MCP over SSE**（`SSE URL https://developer.zhihu.com/api/mcp/{global_search,zhihu_search,hot_list}/v1/sse` + `Message URL …/v1/message`，`endpoint` 事件带 `sessionId`；工具 `query[count 2–100 字符，条数范围同 REST]`，返回 MCP `text` 内 XML）；直答走 **MCP Streamable HTTP**（单一 `POST …/api/mcp/zhida/v1/stream` 承载 `initialize/tools/list/tools/call`，工具 `zhida{query,model}`，MCP 层等下游完整输出后一次性返回，想消费增量请用原生直答接口）。
- CLI 能力=REST 全集代理（搜索/热榜/直答/问题发现/回答摘要/本人创作/关注/收藏/知识库/额度查询），只查凭证所属账号、不代查他人（他人数据走 OAuth，见 §6）。

---

## 6. token / 凭证模型

2026-09-11 已升级为官方原文（`[官方直抓]` https://developer.zhihu.com/console/api/v2/docs，key=`authorization`/`zhihu_oauth_integrated`/`zhihu_cli` + 各 api key 鉴权节）：

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `Access Secret`（数据接口 Bearer 口令） | 开放平台个人中心查看/获取（官方鉴权正文链接为 https://developer.zhihu.com/profile） | 长效口令；每次请求 `Authorization: Bearer <secret>` + `X-Request-Timestamp` 秒级戳（quota 正文：与服务端时间相差**不能超过 10 分钟**）；通用错误码 `0`/`10001`/`20001`/`30001`/`90001` | 官方 key=`authorization` 全文通过 |
| OAuth 授权码模式（第三方 Web 登录 + 代查授权用户数据） | **官方能力**：发邮件至 `openplatform@zhihu.com` 申请 `app_id`/`app_key`（主题 `<公司/组织/产品名称>申请接入知乎 OAuth 服务`，材料：应用名/简介/≥256 图标/`redirect_uri`/申请人姓名电话/知乎个人主页/权限多选 A 邮箱 B 手机 C 公开内容）→ `GET https://openapi.zhihu.com/authorize?redirect_uri=&app_id=&response_type=code` → 回跳 `{redirect_uri}?authorization_code=` → 后端 `POST https://openapi.zhihu.com/access_token`（form：`app_id/app_key/grant_type=authorization_code/redirect_uri/code`）→ `{access_token, token_type: Bearer, expires_in: 3600}` → 调"获取用户信息"接口（官方正文仅一笔带过，**未给该接口 URL**） | `expires_in` 3600 秒；`code`/`token` 经后端交换、不暴露前端；`user_contents` 等 5 用户端点凭 `X-OAuth-Token` 头切换被授权用户；CLI 声明只用 Access Secret、**不接受 OAuth Token 代查** | 官方 key=`zhihu_oauth_integrated` 通过；`expires_in` 与用户信息接口 URL 缺口见 §7-7。百度云系营销文中的 OAuth/`/v4/oauth/token`/scope 描述**仍不采信**（见 §2.2） |
| `tenant/app 票据`、`Encrypt Key`、`Verification Token` | — | **不存在**（无回调体系，无此类凭证） | §3–§4 结论 |
| 频控/配额 | 通用 `30001`（频率/并发/日额度超限，部分 key 写作"请求过于频繁"）；`30002`（创作/问题类=额外累计成功次数耗尽，用户类=`配额限制`，PyPI 转述的"`Code=30002` 提示查额度"方向一致）；`30003` 风控拒绝；PDF/PPT 另有 `40001` 幂等冲突/`40002` 文件过期/`40003` 活跃任务超限；"每 IP 每小时 600 次"等数字仅见营销文，**不采信**；"每天 1000 次"官方 JSON 无此数（见 §5.5/§7-8） | — | 官方各 key 错误码表通过；免费额度数字仍待核验(09-27) |

---

## 7. 待核验清单（2026-09-11 官方 JSON 对敲结论；官方 URL 均为 https://developer.zhihu.com/console/api/v2/docs 下对应 key）

1. **官方文档目录全文**：~~21 文档/11 API/4 Skill/4 MCP 口径（jzl 转述）是否准确~~ → **通过（含口径修正）**：现行官方 29 key（guide 3 + api 18 + skill 4 + mcp 4，§1.3 全表），jzl"21/11"为旧快照；用户数据 5 端点=`user_contents/followees/collections/favlists/favlist_contents` 路径确认（§5.6）；知识库**无独立 api key**（仅 quota 额度项 `knowledge` + CLI 能力）；PDF=1 key 内 3 步、PPT=1 key 内 2 步（§5.7）；quota 路径 `GET /api/v1/quota` 确认（§5.5）。
2. **鉴权说明页原文**：~~Bearer + 时间戳 + 错误码表~~ → **通过**：官方 key=`authorization` 确认 `Authorization: Bearer` + `X-Request-Timestamp` 秒级 + curl 示例（与旧第三方转述逐字一致，转正）；错误码 `0/10001/20001/30001/90001`（`zhihu_search` 表）；quota 正文补充**时间差≤10 分钟**；个人中心官方链接为 `/profile`（§1.3 备注）。
3. **`zhihu_search` 响应字段原文**：~~Item 全集 + `Count` 上限 10~~ → **通过**：`Count` 默认 10/最大 10（`<=0` 回退 10，`>10` 截断 10）；`Item` 15 字段全集（Title/ContentType/ContentID/ContentText/Url 含 UTM/CommentCount/VoteUpCount/AuthorName/AuthorAvatar/AuthorBadge/AuthorBadgeText/EditTime/AuthorityLevel/RankingScore + 可选 CommentInfoList[].Content）；`HasMore` 固定 `false`；另有官方 `SortBy` 语法（第三方未提及，§5.1）。
4. **`global_search` Filter 语法原文**：~~`host`/`publish_time`/`AND/OR`/`SearchDB` + `Count` 上限 20 + `HasMore`~~ → **通过**：`Count` **默认 10**/最大 20（官方未写截断语义）；`host==/!=`（双引号，`zhihu.com` 及其子域禁用）/`publish_time` 比较符（无引号秒级戳）/`AND/OR` 大写（AND 优先）/括号；`SearchDB=all(默认)/realtime/static`；`HasMore`=是否有下一页；`Item` 无 `RankingScore`；**官方无错误码表**（缺口，非待核验：原文如此）。
5. **`hot_list` 原文**：~~`Limit` 上限 30/默认 30~~ → **通过**：`Limit` 默认 30/最大 30（`<=0` 或 `>30` 回退 30）；`Item` 仅 Title/Url/ThumbnailUrl/Summary（后两者必返、无则 `""`）；仅问题+文章；错误码表**无 `10001`**。
6. **直答接口原文**：~~`POST /v1/chat/completions` + 三模型 + 流式是否上线~~ → **通过**：`POST https://developer.zhihu.com/v1/chat/completions`；`zhida-fast-1p5`/`zhida-thinking-1p5`/`zhida-agent`；**流式已上线**（`stream=true` → `text/event-stream` + `: keep-alive` + `data: [DONE]`，§5.4；反转第三方旧说法）；仅 `model/messages/stream` 三字段受保证；上下文传参仅 fast/thinking 保证；可用性受租户授权影响。
7. **OAuth 辅助流程原文**：~~是否为官方能力~~ → **通过（主体）**：官方 key=`zhihu_oauth_integrated` 确认标准 Authorization Code Flow（`openapi.zhihu.com/authorize` → `redirect_uri?authorization_code=` → `POST openapi.zhihu.com/access_token` → `{access_token, Bearer, expires_in: 3600}`；邮件申请 `app_id/app_key`；`X-OAuth-Token` 用于 user_* 查他人）。残留缺口→待核验(09-27)："获取用户信息"接口 URL 官方正文未给；第三方 CLI 的"授权 URL/code 换 token"自述与官方端点一致、可对应。
8. **免费额度原文**：~~"每天 1000 次" + `GET /api/v1/quota`~~ → **部分通过**：接口路径/参数/行为**通过**（`GET /api/v1/quota`，`APIIDs` 可选逗号分隔，9 额度项，自然日口径，查询不耗额度，多租户汇总，§5.5）；数字**失败**：官方全文无"每天 1000 次"（`5000` 同样零命中），"1000 vs 5000 二选一"**二者皆非官方**，官方只给创作能力类默认 100/低 10 与"实际额度以查询结果为准"→ 额度数字部分保留待核验(09-27)。
9. **`open.zhihu.com` 历史**：→ **失败，保留待核验(09-27)**：官方 29 key 正文对 `open.zhihu.com` **零提及**；根路径 2026-09-11 复验仍 422；`/api/v4` 只读口径仍仅 CSDN 第三方说法。是迁移还是下线官方未说明。
10. **"无推送"反向确认**：→ **通过（目录枚举层面）**：29 key 全量枚举 + 全文推送类关键字零命中（§2 证据 1），push 事件数=0 维持；但官方**无"仅支持主动调用/不支持回调"明示语句**（仍为消极证据升级版，非官方亲口；核心结论不推翻，MockPulse 不建回调模拟器）。
11. **MCP/Skill 协议层**：→ **通过**：4 Skill zip 为官方 `developer.zhihu.com/download/*_skills.zip` 托管（另 CLI skill 经 `developer-cdn.zhihu.com`）；搜索族/热榜=MCP over SSE（`/api/mcp/*/v1/sse`+`/message`），直答=MCP Streamable HTTP（单一 `/api/mcp/zhida/v1/stream`）；工具名/参数与 REST 同义对应（§5.8）。

---

## 附：对 MockPulse 模拟的直接含义（速查）

- **不要为知乎建"事件推送/回调接收"模拟器**：无 webhook、无 challenge 握手、无签名验签、无重试语义。MockPulse 内知乎通道只需**请求-响应桩**（搜索/热榜/直答/用户公开数据/quota），以及**轮询任务状态桩**（PDF/PPT 长任务）。
- 若需占位建模：`GET {base}/api/v1/content/{zhihu_search,global_search,hot_list}` + 头 `Authorization: Bearer <secret>` / `X-Request-Timestamp: <秒级>`；`POST {base}/v1/chat/completions`；envelope `{Code:0, Message, Data:{Items:[...]}}`——但字段与限额全部来自第三方转述，**不得当回归向量**，待 §7 核验后才能固化。
- 勘误（相对常见误解）：`www.zhihu.com/api/v4/messages` 私信发送是 2017 年登录态逆向，不是开放平台能力；`sugar.zhihu.com` 回调是广告归因，不是消息推送；百度云/GitCode 系"v4 OAuth/WebSocket/GraphQL"文章不可信；`open.zhihu.com` 根路径现返回 422，现行门户是 `developer.zhihu.com`。
