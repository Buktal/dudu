# GLOSSARY.md

项目术语表（glossary）与领域语言。由 `/domain-modeling` 按需增量维护，消费规则见 `docs/agents/domain.md`。

## Projects

DUDU 下子项目对照表（口语 → 规范名，用于精准定位）：

| 规范名 | 口语别名 | 目录 | 一句话 |
| --- | --- | --- | --- |
| DUDU | 大项目 / 根仓库 | `/` | 容纳多个子项目的 monorepo 根 |
| MockPulse | Mock / 测试项目 | `mock-pulse/` | Tauri 2 + React 19 + Vite 的 mock 工具桌面端 |
| DUDU Server | 后端 / dudu 服务 | `dudu-server/` | Spring Boot 3.5（Java 21）消息聚合后端：渠道消息进 → 客服工作台 |
| DuduDesk | Desk / 客服端 / 工作台 | `dudu-desk/` | 嘟嘟客服坐席工作台（Tauri 2 + React 19，桌面端起步） |
| DuduAdmin | Admin / 管理后台 | `dudu-admin/` | 供 DUDU 运营方使用的企业开通与运营管理后台，纯 Web 前端 |
| DuduConsole | Console / 控制台 | `dudu-console/` | 供企业内部管理员管理员工、用户组和渠道接入账号的纯 Web 控制台 |

## Language

**企业**:
使用 DUDU 的独立组织，是成员权限与业务数据的隔离边界；企业员工是产品的实际使用者。
_Avoid_: 客户（易与来访用户混淆）

**员工**:
属于一家企业的 DUDU 使用者；每个员工 ID 唯一且固定关联一个企业 ID，昵称可以重复。员工可加入本企业的多个用户组。
_Avoid_: 来访用户（通过渠道联系企业的人）

**企业 ID**:
开通企业时选定的唯一六位数字标识，可随机生成或手动指定并检测可用性，创建后固定；数据关联、企业登录和页面展示共用。界面中的企业编号指同一个标识，不是另一套登录代码。
_Avoid_: 企业代码（暗示独立于企业 ID 的另一套编号）

**企业管理员**:
负责企业内部管理的员工；除初始企业管理员外，按组成员关系获得用户组权限，管理员身份本身不授予全部组权限。
_Avoid_: 平台管理员（管理 DUDU 的运营方身份）

**初始企业管理员**:
企业开通时初始化的企业管理员，自动拥有本企业全部用户组权限，包括以后新建的用户组，无需逐组加入。
_Avoid_: 普通企业管理员（按组成员关系授权）

**平台管理员**:
使用 DuduAdmin 开通企业并进行运营管理的 DUDU 运营方人员。
_Avoid_: 企业管理员（管理所属企业的员工与接待资源）

**登录名**:
员工用于登录所属企业的名称，在企业内唯一，不同企业可以使用相同登录名。企业 ID 与登录名共同区分企业登录身份；员工内部 ID 是稳定身份，昵称只是显示名称。
_Avoid_: 昵称（可以重复的显示名称）、员工 ID（稳定内部标识）

**用户组（UserGroup）**:
企业内部按接待职责划分的平级分组，可包含多名员工并负责多个渠道接入账号。
_Avoid_: 部门树、组织层级（当前用户组之间没有上下级关系）

**渠道（Channel）**:
接入 DUDU 的外部聊天平台（微信、支付宝、B 站等），经回调把来访用户消息送入后端。
_Avoid_: 平台（口语可用，正式文档用渠道）、第三方

**企业渠道账号（CompanyChannel）**:
企业接入某个渠道的具体账号，例如一个微信公众号；同一企业可以接入同一渠道的多个账号，每个账号只归属一个用户组。
_Avoid_: 渠道（指账号所在的外部聊天平台）、员工账号（用于登录 DUDU）

**坐席（Agent）**:
员工中在工作台接待渠道来访用户的人员，是 DUDU 自有前端的登录用户。
_Avoid_: 客服（口语）、operator

**来访用户**:
通过渠道发起会话、最终由坐席接待的人，不是 DUDU 的登录用户。
_Avoid_: 客户、C 端用户

**会话（Conversation）**:
来访用户在同一企业、同一渠道接入账号下持续使用的唯一聊天记录，跨多次接待保持同一会话身份。
_Avoid_: 接待单（一次接待过程）

**接待状态**:
会话当前处于待回复、等待中或已结束的共享状态，对所有有权接待该会话的坐席一致。
_Avoid_: 坐席个人回复状态、阅读进度（不决定是否待回复）

**工作台**:
坐席日常接待使用的 DUDU 自有前端（桌面端或网页）。
_Avoid_: 接待系统（口语别名）

**管理后台**:
供 DUDU 运营方管理企业及配置的 DUDU 自有前端，即 DuduAdmin；与工作台同一套用户体系（单用户表 + role）。

**控制台**:
供企业内部管理员管理本企业员工、用户组和渠道接入账号的自有前端，即 DuduConsole。
_Avoid_: 管理后台（指 DUDU 运营方使用的 DuduAdmin）

**运行会话（RunSession）**:
mock-pulse 中「同一时刻只能有一个运行」的全局互斥与在途状态：能否启动、正在跑什么（直发 / 剧本 / 编排）、缺哪个渠道的连接、是否停止中。
_Avoid_: busy 状态、互斥标志（口语）

**运行实况（LiveRun）**:
run-progress 事件按 runId（含 lane 维度）收敛出的实时投影；剧本实况、编排实况、历史入列都是它的派生 selector。类型与投影单点在 runs 域 live 模块。
_Avoid_: 实时状态、进度状态（口语）

**失败策略（LanePolicy）**:
编排运行中「某步失败后如何继续」的决策表：编织方式（串行 / 并行）× 失败语义（stop / continue）× 取消源（编排停 / 用户停）→ 执行或跳过（含跳过原因）。决策单点在 Rust runs/policy。
_Avoid_: 旗标组合、失败标志（口语）

**启动结果（LaunchOutcome）**:
mock-pulse 三条启动路（模板直发 / 剧本运行 / 编排运行）共用的结果词汇：noop / needConnection（恒带缺失渠道）/ started / done。收敛单点在 runs 域 launch 模块，各 thunk 只取自己的子集。
_Avoid_: 返回值（口语）

**运行检查点（RunCheckpoint）**:
mock-pulse 剧本/编排运行启动即落盘的中断态记录：步骤先以未完成占位，运行中每步回执经检查点回写单点（runs 域 executor 的 write_checkpoint_step：patch_checkpoint_step 按 lane 顺序落位覆盖后注入落盘）持久化，正常结束由最终运行记录整体替换；进程中断后重启可追溯已完成步骤，且不会自动续发。
_Avoid_: 断点续跑（检查点不自动续发）、进度缓存（口语）

**引用解析**:
mock-pulse 中步骤/编排引用到注册表条目的查找与缺失分类单点：`{id, version}` → ok / id-missing / version-missing。事件素材版本、事件模板版本、编排 lane 剧本三处共用同一 kernel（events 域 resolve）；各时钟（运行 / 展示 / 编辑 / 守卫）的缺失含义收敛到同域 interpreter（interpret*）这一唯一出口，域外只经它消费，缺失语义变更只改 consequence 表一行。
_Avoid_: 查找、引用查找（口语）

**渠道适配器（ChannelAdapter）**:
各渠道出站协议原语（握手、直发、回执投影）的统一 seam：高保真差异全部住在各渠道实现模块内部，分派经 connections 域静态注册表单点；新渠道接入 = 一个实现文件 + 注册表一行。
_Avoid_: 渠道封装、渠道 trait（口语）

**渠道事实库**:
`docs/research/channels/` 的核验结论集：渠道接入范围与事件模板全量的唯一基准。
_Avoid_: 调研文档（口语）

**事件模板（EventSchema）**:
内置只读、随应用分发的渠道事件样例：默认载荷、字段定义与期望回执三件套，全量锚定渠道事实库核验目录。
_Avoid_: 内置事件、demo 事件、预置事件

**事件素材（EventItem）**:
用户保存与版本化的事件实体，从模板另存或新建而来；剧本步骤与运行引用它的不可变版本。
_Avoid_: 事件样例（UI 旧文案，已统一为「事件素材」）

**模板直发**:
不落事件素材、以事件模板默认载荷（可临时编辑）直接发往该渠道当前连接的调试方式。
_Avoid_: demo 发送、试发

**企业聚合失效**:
DuduAdmin 中企业资料、启停状态或初始管理员维护成功后，挂载中的企业列表与企业详情自动重新读取的共享失效语义；宣告与订阅收敛在 companies 域数据模块（company-data）单点，页面与弹层不再手工接线刷新。
_Avoid_: 手工刷新回调、onChanged 刷新链（旧实现）

**企业列表筛选操作**:
DuduAdmin 中平台管理员对企业列表的筛选写接口词汇：setKeyword / setStatus / reset / setPage 四个命名操作；调用方只上报意图，不手工拼 CompanyQuery；机制侧的翻页不变量归分页查询（usePagedQuery）单点，companies 域数据模块（company-data）只装订命名操作映射与企业聚合失效。
_Avoid_: 裸 setFilters、手工拼查询对象（旧宽 interface）

**查询四键**:
DuduAdmin 中取数 hook（useQuery）对外恒定的 interface：{data, error, loading, refresh}；请求竞态防护（旧请求取消、迟到结果丢弃）与「失败不冒充空数据」都收敛在 use-query 单点实现并有 hook 级直接测试。
_Avoid_: 六键 spread（load/attempt 版本戳外泄的旧 interface）、调用方手工比较版本

**分页查询（usePagedQuery）**:
DuduAdmin 分页列表共用的取数机制：client 绑定、查询条件状态与翻页写接口（setFilter 合并补丁 / reset 重置 / setPage 翻页）收敛在 api 层 paged-query 单点；「筛选变化与重置都回第一页且保留 pageSize」「page 只暴露服务端回显这一份真相（加载或失败时回退请求值）」两条翻页不变量在此唯一实现与测试，domain 数据模块（useCompanies/useLogs）收缩为命名筛选操作薄壳。
_Avoid_: 逐页复制的 useState + useQuery 手工编排、useCallback 稳定身份仪式（调用方自写）

**列表页骨架（QueryView）**:
DuduAdmin 三个列表页（企业、企业资源汇总、操作记录）共用的加载→失败→空态→表格→分页编排单点：「失败不冒充空数据」由分支顺序（error 先于空态判定）单点保证；表格列与行走 children 槽，空态动作按钮与两套空态文案（筛选中 / 全量）归页面。
_Avoid_: 三步舞手写编排（loading/error/数据分支逐页复制）、失败态渲染空态文案

**路由构造（routes）**:
DuduAdmin 中 hash 路由地址的构造单点：页面间跳转只表达意图（overview / companies / companyCreate / companyDetail / resources 五个命名构造），参数名（companyId / create）、取值约定（create=1）、企业 ID 编码与「回纯列表即清参关闭弹层」的关闭语义收敛在 navigation.ts 一处，与解析侧（parseRoute / useRoute）共用同一组语法常量并有 builder→parser 往返测试；概览页、资源汇总页打开企业弹层等跨页跳转不再手写查询串。
_Avoid_: 手写路由字符串（模板串拼 `companies?companyId=`、字面量 `"companies?create=1"`）

**会话域操作（ConversationOperation）**:
DuduDesk 中对单个会话的一次请求级读写（读历史 / 读资料、存资料 / 星标 / 已读、发送、结束 / 恢复接待）的统一执行 seam：loading → api 调用 → 结算守卫 → 成功 / 失败效果。「迟到结果不得复活已移除会话」（仅当本次尝试仍是当前尝试且会话仍在册才结算）、响应校验惯用形（不匹配即 invalid-response）与失败映射兜底文案收敛在 inbox stores/requests 单点，各 thunk 只声明哪个键、调哪个 api、成功装什么。
_Avoid_: 手写 runOperation 仪式、逐处兜底串（旧实现）

**列表相位（ListPhase）**:
DuduDesk 中会话列表类界面（来访会话队列、卡片工作台、消息时间线、固定会话选择）共用的呈现映射单点：load-state + 条目数 → 首读 loading / 失败重试 / 空态 / 内容四相位。`!hasLoaded && status === "loading"`（首读恒占满屏，Live 事件或乐观发送抢先入列也不改；重读与续读保留已加载内容）这一 hasLoaded × status 不变量收敛在 inbox-state 的 isInitialRead，无 load-state 形状的读取（固定会话选择）以「在飞 + 无条目」表达同一相位；四相位分支与「有内容仍出错」的 compact 错误条归 InboxListPhase，调用点只保留内容分支、各自文案（含筛选双文案）与重试命令。
_Avoid_: 逐组件手写四态判定、hasLoaded×status 组合散落（旧实现）

**回执证据（ReceiptEvidence）**:
DuduDesk 中一条消息投递状态的服务端证据（版本 + delivery）：按 clientRequestId / serverId / id 三键关联（receiptKeys），版本新者优先、同版本按状态明确度取胜（evidenceRank + rememberReceipt），本地不确定的证据永不覆盖已存的服务端证据。形状与策略同址收敛在 inbox stores/receipts 单点，Live 合并内核、receipt 事件分支与重连对账共用同一合并算法。
_Avoid_: 消息 delivery 字段直读直写（绕过证据合并）、按事件到达顺序判新旧
