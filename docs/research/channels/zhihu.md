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
| 门户/文档/个人中心 SPA 壳存在性 | https://developer.zhihu.com/ 等（§1.1） | `[官方直抓]` WebFetch（仅标题，无正文） |
| `open.zhihu.com` 根路径状态 | https://open.zhihu.com/ | `[官方直抓]` WebFetch（422） |
| 其余官方文档正文（鉴权说明、任一 API 参考页、事件/回调页） | — | **均未抓到** → 待核验(09-27) |

---

## 2. 消息/事件推送全清单

### 结论：无（`push 事件数 = 0`）

**知乎开放平台没有公开的消息推送、几种事件类型、Webhook、私信（DM）下发或接收事件。** 证据链：

1. **能力目录枚举中无推送类目。** 第三方对官方文档目录的统计（`[第三方]` https://www.jzl.com/news/zhihu-api）称"官方目录目前共有 21 条文档，涵盖 2 条指南、11 条 API、4 条 Skill 和 4 条 MCP，11 条 API 实际包含 14 个数据端点"，列出的能力为：知乎热榜（`hot_list`）、知乎搜索（`zhihu_search`）、全网搜索（`global_search`）、直答（`/v1/chat/completions`）、用户数据（创作列表/关注列表/收藏夹/收藏夹内容）、PDF 与 PPT 生成、额度（`quota`）、知识库——**无 webhook、无事件订阅、无回调、无私信**。该目录为第三方转述，官方目录原文待核验(09-27)，但它是目前最全的公开目录口径。
2. **能力实现交叉一致：全部为拉取式 REST，无订阅。** 多个独立第三方实现（`[第三方]` https://github.com/acedatacloud/skills/blob/main/skills/zhihu/scripts/search.py、`[第三方]` https://github.com/lioensky/VCPToolBox/blob/bdc2228c/Plugin/ZhihuSearch/ZhihuSearch.py、`[第三方]` https://github.com/dsd2077/CyberVerse/blob/5b42fc52/inference/plugins/voice_llm/persona/tools.py、`[第三方]` https://pypi.org/project/zhihu-search/）一致只实现 `GET /api/v1/content/{zhihu_search,global_search,hot_list}` + `POST /v1/chat/completions` + 用户公开数据/知识库/PDF/PPT/quota 查询，**没有任何 webhook 接收、事件订阅、回调验签代码**。`zhihu-search` v1.0.0 自述能力表（`[第三方]` https://pypi.org/project/zhihu-search/1.0.0/）："搜索直答热榜 4 + 官方额度 1 + 用户公开数据 5 + 知识库 4 + PDF 解析 3 + PPT 生成 2 + OAuth 辅助 2"，无推送项。
3. **"只读、无写入"口径旁证。** 第三方报道（`[第三方]` https://www.openai-hub.net/news/441/）称平台"does not expose user data or writing capabilities (like posting answers or liking/commenting), offering only read and search access"——连写入都不开放，更无"收到私信/被@时推事件给开发者"的推送语义。该表述为第三方概括，官方原话待核验(09-27)。
4. **关键词检索零命中。** `"developer.zhihu.com" webhook OR 回调 OR 事件推送 OR 私信` 全网检索：返回的命中全部是抖音开放平台私信 webhook、企微 webhook 概念科普、企业微信群推送等**其他平台**内容（见 §2.1 查过入口表），**零条知乎官方事件推送文档**。
5. **`open.zhihu.com` 只读旧口径（第三方，不采信为官方事实）。** CSDN 问答一条采纳回答（`[第三方]` https://ask.csdn.net/questions/9115943）称"知乎开放平台（open.zhihu.com）当前仅提供 /api/v4/topics、/api/v4/rank/hot 等只读接口"——与"无推送"方向一致，但它是第三方说法，官方原文待核验(09-27)。

### 2.1 为回答"有没有私信推送"而查过的入口（证据：均无）

| 查过的入口 | 查法 | 结果 |
|---|---|---|
| `developer.zhihu.com/docs` 文档中心 | WebFetch 直抓 | SPA 壳，无正文；无法从官方原文确认/证伪，但第三方目录转述（§2 证据 1）无私信项 |
| `developer.zhihu.com/personal` 个人中心 | WebFetch 直抓 | SPA 壳；第三方转述仅提 Access Secret 签发，无回调地址配置项 |
| `open.zhihu.com/` | WebFetch 直抓 | 422，无文档 |
| 全网 `"developer.zhihu.com" webhook/回调/事件推送/私信` | WebSearch | 零命中（命中全为抖音/企微/飞书等其他平台） |
| 全网 `open.zhihu.com 开放平台` | WebSearch | 仅 1 条 CSDN 只读口径（§2 证据 5）+ 1 条 MCP 研报行项（Partner API/OAuth2，`[第三方]` https://github.com/theYahia/mcp-servers/blob/main/research/artifacts/China_MCP_Research.md），均无推送 |
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

**无官方推送载荷。** 本节仅收录请求侧示例，且全部为第三方转述/实现（非官方逐字），仅供"拉取模型长什么样"参考，不得作回归向量：

### 5.1 站内搜索请求（`[第三方]` acedatacloud/skills 实现摘要）

- `GET https://developer.zhihu.com/api/v1/content/zhihu_search?Query=<关键词>&Count=<≤10>`
- 头：`Authorization: Bearer <secret>`、`X-Request-Timestamp: <秒级时间戳>`、`Content-Type: application/json`
- 响应 envelope：`{Code, Message, Data: {Items: [{Title, ContentType, ContentID, ContentText, Url(含 utm_medium=openapi_platform 溯源), CommentCount, VoteUpCount, AuthorName, AuthorAvatar, EditTime, ...}]}}`（字段名出自 `[第三方]` https://docs.rs/crate/zhihu-cli/latest/source/docs/api-reference.md；官方原文待核验(09-27)）

### 5.2 全网搜索请求（`[第三方]` 同上）

- `GET https://developer.zhihu.com/api/v1/content/global_search?Query=&Count=<≤20>&Filter=<高级表达式，需URL编码>&SearchDB=<all|realtime|static>`
- `Filter` 高级语法（`[第三方]` 同上）：`host=="example.com"`（`host=="zhihu.com"` 及其子域**不支持**，站内请用 `zhihu_search`）、`publish_time>=...`、`AND/OR` 大写；响应另有 `Data.HasMore`。

### 5.3 热榜请求（`[第三方]` 三实现交叉）

- `GET https://developer.zhihu.com/api/v1/content/hot_list?Limit=<≤30，默认30>`

### 5.4 直答请求（`[第三方]` https://pypi.org/project/zhihu-search/1.2.0/ + docs.rs 镜像）

- `POST https://developer.zhihu.com/v1/chat/completions`，body `{model: zhida-fast-1p5 | zhida-thinking-1p5 | zhida-agent, messages: [...], stream: bool}`，非流式 `application/json` / 流式 `text/event-stream`。

### 5.5 额度查询（`[第三方]` https://pypi.org/project/zhihu-search/1.0.0/）

- `GET /api/v1/quota`（官方额度接口；查询本身不消耗业务额度；`Code=30002` 提示查额度/权限）。路径与行为官方原文待核验(09-27)。
- 免费额度口径"每天免费 1000 次搜索调用"出自 `[第三方]` https://www.jzl.com/news/zhihu-api 与 `[第三方]` https://bittide.aicompass.dev/article/0d803615-e2db-4350-b582-7bf48baa2a8e，官方原文待核验(09-27)。

---

## 6. token / 凭证模型

| 凭证 | 换取方式 | 寿命/规则 | 出处 |
|---|---|---|---|
| `Access Secret`（数据接口 Bearer 口令） | 知乎开放平台个人中心查看/获取（`[第三方转述]` 个人中心 https://developer.zhihu.com/personal） | 长效口令；每次请求放 `Authorization: Bearer <secret>` 并带 `X-Request-Timestamp` 秒级时间戳 | 第三方转述+三实现交叉；官方原文待核验(09-27) |
| OAuth 授权码模式（用户授权类接口） | `zhihu-search` CLI 自述有"授权 URL、授权码换 token"辅助流程（`[第三方]` https://pypi.org/project/zhihu-search/1.4.1/） | 细节未知 | 官方原文待核验(09-27)；百度云系营销文中的 OAuth/`/v4/oauth/token`/scope 描述**不采信**（见 §2.2） |
| `tenant/app 票据`、`Encrypt Key`、`Verification Token` | — | **不存在**（无回调体系，无此类凭证） | §3–§4 结论 |
| 频控 | 通用错误码 `30001` 频率限制（`[第三方]` docs.rs 镜像）；`Code=30002` 查额度（`[第三方]` PyPI）；"每 IP 每小时 600 次"等数字仅见营销文，**不采信** | — | 官方原文待核验(09-27) |

---

## 7. 待核验清单（统一标待核验(09-27)）

1. **官方文档目录全文**：21 文档/11 API/4 Skill/4 MCP 口径（jzl 转述）是否准确；用户数据 5 端点、知识库 4 端点、PDF 3 端点、PPT 2 端点、quota 端点的真实路径与字段。→ 待核验(09-27)
2. **鉴权说明页原文**：`Authorization: Bearer <Access Secret>` + `X-Request-Timestamp`（秒级）+ 错误码表（10001/20001/30001/90001）。→ 待核验(09-27)
3. **`zhihu_search` 响应字段原文**：Item 字段全集（Title/ContentType/ContentID/ContentText/Url/Author*/CommentInfoList/AuthorityLevel/RankingScore 等）与 `Count` 上限 10。→ 待核验(09-27)
4. **`global_search` Filter 语法原文**：`host`/`publish_time`/`AND/OR`/`SearchDB` 与 `Count` 上限 20、`HasMore` 语义。→ 待核验(09-27)
5. **`hot_list` 原文**：`Limit` 上限 30/默认 30。→ 待核验(09-27)
6. **直答接口原文**：`POST /v1/chat/completions`、三模型名（`zhida-fast-1p5`/`zhida-thinking-1p5`/`zhida-agent`）、流式是否已上线。→ 待核验(09-27)
7. **OAuth 辅助流程原文**：授权 URL 与 code 换 token 是否为官方能力（第三方 CLI 自述有，官方未见）。→ 待核验(09-27)
8. **免费额度原文**："每天 1000 次搜索调用"与 quota 接口 `GET /api/v1/quota`。→ 待核验(09-27)
9. **`open.zhihu.com` 历史**：该域是否曾承载开放文档/OAuth，422 是永久下线还是路径迁移；`/api/v4/topics`、`/api/v4/rank/hot` 只读口径（CSDN 第三方说法）是否曾为官方事实。→ 待核验(09-27)
10. **"无推送"反向确认**：官方文档是否明示"仅支持主动调用/不支持回调订阅"（目前是"检索不到任何推送文档"的消极证据，无官方明示）。→ 待核验(09-27)
11. **MCP/Skill 协议层**：官方 MCP Server / Skill zip（`download/*_skills.zip`）是否为官方托管、与 REST 的对应关系。→ 待核验(09-27)

---

## 附：对 MockPulse 模拟的直接含义（速查）

- **不要为知乎建"事件推送/回调接收"模拟器**：无 webhook、无 challenge 握手、无签名验签、无重试语义。MockPulse 内知乎通道只需**请求-响应桩**（搜索/热榜/直答/用户公开数据/quota），以及**轮询任务状态桩**（PDF/PPT 长任务）。
- 若需占位建模：`GET {base}/api/v1/content/{zhihu_search,global_search,hot_list}` + 头 `Authorization: Bearer <secret>` / `X-Request-Timestamp: <秒级>`；`POST {base}/v1/chat/completions`；envelope `{Code:0, Message, Data:{Items:[...]}}`——但字段与限额全部来自第三方转述，**不得当回归向量**，待 §7 核验后才能固化。
- 勘误（相对常见误解）：`www.zhihu.com/api/v4/messages` 私信发送是 2017 年登录态逆向，不是开放平台能力；`sugar.zhihu.com` 回调是广告归因，不是消息推送；百度云/GitCode 系"v4 OAuth/WebSocket/GraphQL"文章不可信；`open.zhihu.com` 根路径现返回 422，现行门户是 `developer.zhihu.com`。
