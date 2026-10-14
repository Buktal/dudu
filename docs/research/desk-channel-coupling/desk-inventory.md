# Desk 盘点：渠道耦合点与 Mock 残留清单

- 来源票：[Buktal/dudu#98](https://github.com/Buktal/dudu/issues/98)（父地图 #96）
- 基线：main @ `a2f17d4`（2026-10-13，已含「移除 Mock 模式与模拟数据」重构）
- 范围：DuduDesk（`dudu-desk/`）产品链路 + 全仓 Mock 扫描；测试文件中的 vi.mock/fixture 与 mock-pulse 子项目按票定义排除
- 结论速览：**Desk 非测试源码与打包配置 Mock 零残留**（仅 1 个未使用依赖 + 若干文档表述）；**渠道耦合只有视觉层一处**（图标 + 配色），其余渠道维度全部由 Server 接口下发，新渠道接入 Desk 可零改动上线、可选增强视觉。

---

## 第一部分：Mock 残留清单

判定口径：产品链路（非测试）中会伪装数据、伪造成功或提供假实现的代码、配置与当前性文档；测试工具（夹具、FakeSocket、vi.mock）与 mock-pulse 不算。

### 残留（建议清理）

| # | 位置 | 现状 | 清理动作建议 |
| --- | --- | --- | --- |
| R1 | `dudu-desk/package.json` devDependencies：`@faker-js/faker: ^10.6.0`（约 60 行） | 全 `dudu-desk/src`（含测试）无任何 import；由 `eabbc68` 随前端矩阵引入，原服务已删除的固定数据工厂（`development/` mocks），`a2f17d4` 清理时漏掉了清单 | `cd dudu-desk && yarn remove @faker-js/faker` 并同步 `yarn.lock` |
| R2 | 根 `GLOSSARY.md`「开发联调世界（Development World）」词条（约 191–194 行） | 词条描述「可显式启用的模拟接待环境」，该特性已随 `a2f17d4` 删除（`VITE_DESK_MOCK` 开关、`development/` 目录、`account/mocks.ts` 均不存在）；全文件无其他词条交叉引用该词 | 整条删除（词条正文 + `_Avoid_` 行） |

### 过时表述（按文档性质分级处理）

| # | 位置 | 现状 | 处理建议 |
| --- | --- | --- | --- |
| R3 | `docs/design/dudu-desk/implementation-contract.md` 153 行 | 定稿契约（唯一实施依据）含「真实适配器去掉其强制要求，Mock 可保留自己的字段」，指向已删除的 Mock 世界 | 微调该句为过去时或删去分句（契约其余内容不受影响） |
| R4 | `docs/design/dudu-desk/ticket-01-login.md` 46、57、59 行 | 登录实施票的验收步骤引用 `VITE_DESK_MOCK=true` 与「关闭 Mock」流程；该文档被 `docs/features/dudu-desk.md` 第 3 行引用为登录接入的实施依据，读者按步骤操作会失效 | 文档头补一行历史标注（如「2026-10-13 起 Mock 开关已移除，涉及步骤仅存档」），验收条目可不逐条改写 |
| R5 | `docs/design/dudu-desk/scroll-compatibility/README.md` 10、40、42 行 | 叙述「runtime 按 `VITE_DESK_MOCK` 加载现有 Mock」的架构描述、启用步骤，并引用 `dudu-desk/README.md#mock-打包测试`（锚点已不存在） | 历史验收记录，建议在文首补失效标注；至少修正失效锚点 |
| R6 | `docs/design/dudu-desk/card-summary/README.md` 5、8、10、25 行；`docs/design/dudu-desk/palette-refresh/README.md` 51–52 行 | 验收记录含「在浏览器 Mock 界面核验」表述与 `$env:VITE_DESK_MOCK='true'` 复现脚本，现已不可复现 | 同 R5：历史记录补失效标注即可，不必重写正文 |
| R7 | `docs/features/dudu-desk.md` 7、9、15、21 行 | 按日期的变更日志条目中出现「Mock 世界仍用自身词表」「Mock 开发世界保留自身游标字段」「Mock 数据与真实路径共存」「Mock 场景按自身能力数据保持可用」——均为当时状态记录；第 5 行已有 2026-10-13 移除记录整体说明 | 保留原文（符合「历史资料标明日期」约定）；如担心误导，可在第 5 行移除记录中点明「下文历史条目中的 Mock 表述自即日起失效」，不必逐条修改 |
| R8 | `docs/design/dudu-desk/data-contract.md`（29、40、119、173、192、195、196 行）、`integration-spec.md`（5、171、192 行）、`contract-unblocking-note.md`（13 行） | 历史讨论/Spec/发布记录中的 Mock 表述；三者文档头均已自我声明「仅供追溯」「历史发布记录」性质 | 保留不动（符合历史资料约定），无需清理 |

### 已核实为零残留的扫描面

- `dudu-desk/src` 非测试源码：`mock|fake|stub|dummy|fixture|simulat` 零命中（命中文件全部为 `*.test.*`）。`a2f17d4` 已删 `src/features/inbox/development/`（api/conversations/media/mocks/portraits/scenarios 及测试）、`src/features/account/mocks.ts`、`.env.example` 中的 `VITE_DESK_MOCK` / `VITE_DESK_SCENARIO` 两项。
- 打包配置：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/src/{lib,main}.rs`、`src-tauri/capabilities/`、`vite.config.ts`、`index.html` 均无渠道/Mock 内容；`.env.example` 仅存 `VITE_API_ORIGIN`（打包 API 源，正当配置）。
- `dudu-desk/README.md`：无 Mock 残留；「`unavailableInboxApi` 仍不会假装收发成功」为正当表述。
- `dudu-server` 产品链路（`src/main`）：零 Mock；`ChannelEnum` 注释提及 MockPulse 仅说明「枚举不含其回调子类型」，正当。
- 根 `GLOSSARY.md` 其余 mock 命中全部属于 mock-pulse 词条（正当测试替身项目）。
- 正当测试工具（非残留，列出备查）：`dudu-desk/src/features/inbox/test-fixtures.ts`（`a2f17d4` 由 `development/fixtures.ts` 转正的共享夹具）、`http-inbox-test-support.ts`、`inbox-live-test-support.ts`（FakeSocket）、`stores/test-support.ts`。
- 失败兜底而非假实现（非残留）：`dudu-desk/src/features/inbox/api.ts` 的 `unavailableInboxApi` 与 `src/features/account/api.ts` 的 `unavailableAccountApi`——全部方法抛 `unavailable`，不伪装成功。仅其中一处注释过时：`api.ts` unavailableInboxApi 上方「A real adapter is injected here later」与现状不符（`runtime.ts` 已恒注入真实适配器），可在下次触达该文件时就地更正。

### 「Mock 附件链路」工程选择的落点（票点名项）

#84 汇总评论保留的 4 项工程选择之一「Mock 附件链路」，其实质是：实施期 Mock 世界里附件准备/发送由开发适配器合成承载（原 `development/attachments.ts`、`development/media.ts` 合成静音 WAV 与占位字节）。核验结论：**该链路的代码落点已随 `a2f17d4` 整体删除，产品链路无残留**；当前附件能力的「未接入」语义由真实适配器如实承载：

- `dudu-desk/src/features/inbox/http-inbox-api.ts` 137–143 行：`send` 对非空 `attachments` 抛 `DeskApiError("unavailable", "当前仅支持文字回复，附件发送尚未接入")`（拒绝而非静默丢弃）；
- `dudu-desk/src/features/inbox/api.ts`：`prepareAttachment` 未被真实适配器覆盖，继承 `unavailableInboxApi` 的不可用语义；
- `dudu-desk/src/features/inbox/components/attachment-picker.tsx`：入口按 `attachmentEntryRestriction`（来自接口下发 capability）停用；
- 现存痕迹只在文档：#84 汇总评论原文与 `docs/features/dudu-desk.md` 第 15 行对 Mock 媒体合成的历史描述（见 R7）。

---

## 第二部分：渠道耦合点清单

Server 侧事实：`dudu-server/src/main/java/com/dudu/duduserver/constant/ChannelEnum.java` 目前 5 值（`wechat`/`alipay`/`douyin`/`xiaohongshu`/`bilibili`），`displayName`（微信、支付宝……）为唯一显示名来源，经 `DeskConversationViews` 装配进 `DeskVisitorIdentityVO.channelName` 下发；渠道目录经会话列表 `channels` 字段下发。核对结论：**Desk 没有自己的渠道枚举清单，渠道维度除视觉层外全部数据驱动。**

### 有硬编码、新渠道可选跟随（非阻塞）

| # | 位置 | 内容 | 新渠道接入时的跟随改动判断 |
| --- | --- | --- | --- |
| C1 | `dudu-desk/src/features/inbox/components/channel-glyph.tsx` 4–13 行 `channelTones` | 渠道 ID → 色调 Map，8 项：`wechat`、`wechat-kf`、`wechat-mp`、`wecom`、`telegram`、`douyin`、`whatsapp`、`xiaohongshu` | 未登记的渠道 ID 回落 `neutral` 色调 + Globe 兜底图标，**不阻塞上线**；可选增强：为新渠道加 tone 映射。注意该表含 Server 枚举没有的前瞻 ID（wechat-kf/wechat-mp/wecom/telegram/whatsapp），且缺 Server 已有的 `alipay`/`bilibili`——与 Server 枚举不联动，纯前端视觉层 |
| C2 | 同文件 23–63 行 `ChannelGlyph` | 各渠道内联 SVG path；`wecom` 特判用 lucide 图标、`whatsapp` 特判描边填充、`wechat` 前缀匹配 | 新渠道默认 Globe 图标即可用；可选增强：补渠道 SVG path（每个渠道一段 `channelId === "…"` 分支） |
| C3 | `dudu-desk/src/index.css` 183–244 行 | `--channel-{tone}-foreground/surface` 颜色变量，7 组渠道色 + `neutral` 兜底（未登记色调走 muted） | 新渠道不加变量即用中性色，**不阻塞**；可选增强：按品牌色补一组变量（`channel-glyph.tsx` 的 tone 名即变量名） |

### 数据驱动、新渠道零改动（核验过的下发链路）

| # | 耦合维度 | 位置与链路 | 判断 |
| --- | --- | --- | --- |
| C4 | 渠道筛选 | `dudu-desk/src/features/inbox/components/queue-tools.tsx` 59–76 行：筛选项取自接口下发的 `state.inbox.queue.channels` 目录（`{id, name}[]`），目录缺失时回落为当前会话 identity 去重推导；`conversation-query.ts` 22–35 行按 `channelId` 等值比较；`http-inbox-api.ts` 211–241 行把 `channelId` 透传 `POST /api/desk/visitors/query` | 零改动：新渠道出现在 `channels` 目录即可筛选 |
| C5 | 渠道显示名 | `dudu-desk/src/features/inbox/components/identity.tsx`（`SourceBadge`/头像角标显示 `identity.channelName`，tooltip 同）；`http-inbox-contract.ts` 68–80 行 `parseIdentity`、162–168 行 `parseChannels` 按字符串解析，无枚举校验 | 零改动：显示名即 Server `ChannelEnum.displayName`，Server 加枚举值即生效 |
| C6 | 渠道资料字段 | `dudu-desk/src/features/inbox/components/visitor-info.tsx` 179–208 行、`channel-profile.ts`：`VisitorProfile.fields` 为通用 `{label, value}` 三态结构（available/empty/not-provided），label 由 Server 下发，Desk 不区分渠道；复制文案（`formatChannelProfile`）同样通用 | 零改动：新渠道的 visitor_profile 扩展字段按 label/value 下发即可展示与复制（字段差异建模属父图 #96「渠道建模决策」范围） |
| C7 | 媒体渲染假设 | `dudu-desk/src/features/inbox/components/message-body.tsx` 153–215 行：公开 http(s) 链接直连渠道（`safeAssetUrl` 只校验协议/主机合法性，无渠道域名白名单），仅渠道标识素材经 `GET /api/desk/messages/{messageId}/media?index=N` 认证取 Blob；`lib/attachment-utils.ts` 18–57 行 data: URL 按通用 mime 白名单校验 | 零改动：新渠道媒体按契约给 url 或走媒体接口即可；两点已知限制与渠道无关——data: 形式的图片 mime 白名单较窄（png/jpeg/gif/webp/avif/bmp/svg+xml），`docs/features/dudu-desk.md` 53 行记录的公众号 8K AMR 语音多数 WebView 不能播放、如实落「素材暂不可读取」，新渠道给非浏览器友好编码时行为相同（不转码） |
| C8 | 发送能力 | `dudu-desk/src/features/inbox/types.ts` `ReplyCapability`（kinds/mimeTypes/maxBytes/maxCount）；`reply/attachment-rules.ts`、`reply/send-rules.ts` 全按接口下发 capability 判断；`attachment-picker.tsx` 按限制停用入口 | 零改动：渠道能力差异由 Server `ChannelSendCapabilities` 决定，Desk 跟随显示 |
| C9 | 消息类型 | `dudu-desk/src/features/inbox/http-inbox-contract.ts` 229–309 行 `parseBody`：text/image/audio/video/file/reply/link/location/quote/card 十类分支 + 未知类型如实归 `unknown`（「暂不支持的消息 · 类型」）；`message-content.ts` 为深模块，新类型只改一张表 + 一个分支 | 基本零改动：新渠道私有消息类型自动落 unknown 兜底；若要专门展示再在契约层加分支 |
| C10 | 打包配置 | `dudu-desk/src-tauri/tauri.conf.json`（CSP 为 null、无域名白名单）、`src-tauri/src/lib.rs`（最小宿主）、`.env.example`（仅 `VITE_API_ORIGIN`） | 零改动：媒体域名、渠道回调均与打包配置无关 |
| C11 | 账号侧渠道字段 | `dudu-desk/src/features/account/api.ts` 12 行 `AgentAccessAccount.channel`（渠道 code 直通，`http-account-api.ts` 58 行仅 `requiredText` 校验）；坐席信息 UI 当前不消费该字段 | 零改动；若将来在坐席信息展示渠道账号明细，需 Server 同步下发显示名或 Desk 复用 `channelName` 惯例 |

### 汇总判断

Server 新增渠道（小程序、企微、抖音、WhatsApp 等）时，Desk 的最小跟随改动为 **0**：筛选、显示名、资料、能力、媒体、消息类型、打包全部由接口/契约驱动，未知渠道 ID 有 neutral + Globe 兜底。可选增强集中在 C1–C3 的视觉层（tone 映射、SVG 图标、配色变量），建议在每张渠道实施票的验收项里作为可选项标注，不作为 Desk 阻塞条件。

---

## 附：核验方法

- 全文扫描：`dudu-desk/src`、`src-tauri`、打包配置对 `mock|Mock|MOCK|fake|stub|dummy|fixture|simulat` 及 `VITE_DESK_MOCK|VITE_DESK_SCENARIO` 的命中逐条定性；`dudu-server/src/main`、`docs/features/`、根 `GLOSSARY.md`、`dudu-desk/README.md`、`docs/design/dudu-desk/`、`docs/adr/` 的 mock 命中逐条定性。
- 渠道维度：`dudu-desk/src` 非测试源码对 `channel` 及 9 个渠道 ID（wechat/wechat-kf/wechat-mp/wecom/telegram/douyin/whatsapp/xiaohongshu/alipay/bilibili）的命中逐条定性；Server 侧核对 `ChannelEnum`、`DeskConversationViews`、`ChannelSendCapabilities` 的下发链路。
- 关键调用点人工读码：`queue-tools.tsx`、`identity.tsx`、`message-body.tsx`、`http-inbox-contract.ts`、`http-inbox-api.ts`、`attachment-rules.ts`、`message-content.ts`、`visitor-info.tsx`、`attachment-utils.ts`、`tauri.conf.json`。
