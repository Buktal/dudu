# GLOSSARY.md

项目术语表（glossary）与领域语言。由 `/domain-modeling` 按需增量维护，消费规则见 `docs/agents/domain.md`。

## Projects

DUDU 下子项目对照表（口语 → 规范名，用于精准定位）：

| 规范名 | 口语别名 | 目录 | 一句话 |
| --- | --- | --- | --- |
| DUDU | 大项目 / 根仓库 | `/` | 容纳多个子项目的 monorepo 根 |
| Worktrees | 工作树 | `worktrees/` | 临时 git worktree 检出目录（约定见 AGENTS.md「Worktree 零安装」条），已 gitignore，非子项目 |
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

**管理权限**:
企业管理员在控制台维护员工、用户组及企业渠道账号的权限范围，区别于工作台接待会话的权限。
_Avoid_: 接待权限（只描述工作台接待范围）

**接待范围**:
员工在工作台可以访问的用户组及其企业渠道账号范围，由企业隔离和当前组授权共同确定。
_Avoid_: 管理范围（不代表可以维护员工或渠道凭据）

**登录名**:
员工用于登录所属企业的名称，在企业内唯一，不同企业可以使用相同登录名。企业 ID 与登录名共同区分企业登录身份；员工内部 ID 是稳定身份，昵称只是显示名称。
_Avoid_: 昵称（可以重复的显示名称）、员工 ID（稳定内部标识）

**用户组（UserGroup）**:
企业内部按接待职责划分的平级分组，可包含多名员工并负责多个渠道接入账号。
_Avoid_: 部门树、组织层级（当前用户组之间没有上下级关系）

**渠道（Channel）**:
接入 DUDU 的外部聊天平台（微信公众号、微信小程序、企业微信、支付宝等），经回调把来访用户消息送入后端；同一平台的不同接入体系算不同渠道。
_Avoid_: 平台（口语可用，正式文档用渠道）、第三方、微信（不指明公众号/小程序/企业微信哪一个时）

**企业渠道账号（CompanyChannel）**:
企业接入某个渠道的具体账号，例如一个微信公众号；同一企业可以接入同一渠道的多个账号，每个账号只归属一个用户组。
_Avoid_: 渠道（指账号所在的外部聊天平台）、员工账号（用于登录 DUDU）

**坐席（Agent）**:
员工中在工作台接待渠道来访用户的人员，是 DUDU 自有前端的登录用户。
_Avoid_: 客服（口语）、operator

**来访用户**:
通过渠道发起会话、最终由坐席接待的人，不是 DUDU 的登录用户。
_Avoid_: 客户、C 端用户

**来访资料（VisitorProfile）**:
某个来访用户的渠道信息，以及有权接待的员工共同维护的标签和内部备注；在有权员工之间共享。
_Avoid_: 个人备注、个人标签（当前资料属于共享信息，区别于本地未读提示）

**待处理提醒**:
Desk 对需要接待的新来信的提醒，口语中也称未读提示；其他坐席已处理后同步清除，不要求每位坐席各自阅读。历史重新加载不制造已处理事项的提醒，退出登录或重新打开 Desk 后清除本次运行提示。
_Avoid_: 个人阅读进度、渠道已读回执（含义不同）

**会话（Conversation）**:
来访用户在同一企业、同一渠道接入账号下持续使用的唯一聊天记录，跨多次接待保持同一会话身份。
_Avoid_: 接待单（一次接待过程）

**接待状态**:
会话当前处于待回复、等待中或已结束的共享状态，对所有有权接待该会话的坐席一致。
_Avoid_: 坐席个人回复状态、阅读进度（不决定是否待回复）

**消息发送状态**:
一条坐席消息当前处于发送中、已发送或发送失败的状态，由服务端的实际发送结果决定；发送请求网络失败且暂无服务端证据时，工作台标注仅存本地的第四态"结果未确认"（unconfirmed），不经网络传输，回执证据落定后按服务端结果收敛。区别于整个会话的接待状态。渠道送达和已读回执另按真实渠道能力表达。
_Avoid_: 访客状态、个人已读状态（分别描述接待和个人阅读，含义不同）

**工作台**:
坐席日常接待使用的 DUDU 自有前端（桌面端或网页）。
_Avoid_: 接待系统（口语别名）

**AI 助手**:
坐席接待时使用的内部协作助手，基于当前授权会话帮助理解来意、拟写回复和调整草稿，建议经坐席核对后使用
_Avoid_: 自动客服（暗示直接接管接待和自动发送）

**AI 对话**:
坐席与 AI 助手围绕一位来访用户进行的内部问答，按来访用户区分，采纳结果形成可编辑的回复草稿
_Avoid_: 会话（指来访用户在渠道账号下的固定聊天记录）

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
mock-pulse 中步骤/编排引用到注册表条目的查找与缺失分类单点：`{id, version}` → ok / id-missing / version-missing。事件素材版本、事件模板版本、编排 lane 剧本三处共用同一 kernel（events 域 reference/resolve）；各时钟（运行 / 展示 / 编辑 / 守卫）的缺失含义收敛到同域 interpreter（reference/interpret，interpret*）这一唯一出口，域外只经它消费；缺失语义变更，引用形态（事件素材 / 事件模板版本）只改 consequence 表一行，存在性（presence）形态语义在 interpret 单点。
_Avoid_: 查找、引用查找（口语）

**线上编解码（codec）**:
mock-pulse 中事件报文三种线上形态（json / form / xml）的确定性字节编解码单点（events 域 codec/）：同输入同输出逐字节一致的拼装与解析（build*Body / parseWirePayload），不依赖 EventSchema，Rust 侧按同一语义对拍；schema 感知分支（contentString 往返、XML 排版装载）住 payload/ 各 adapter，payload.ts 只按模板的 wire 形态分发。
_Avoid_: 编码器、序列化工具（口语）

**渠道适配器（ChannelAdapter）**:
各渠道出站协议原语（握手、直发、回执投影）的统一 seam：高保真差异全部住在各渠道实现模块内部，分派经 connections 域静态注册表单点；宽配置 → 渠道字段的 downcast 收敛于适配器侧 narrow! 单点（注册表按 matches() 路由保证变体归属，错配即编程错误）；trait 默认握手客户端 5s（官方更严窗口的渠道覆写）；新渠道接入 = 一个实现文件 + 注册表一行。trait 与注册表住 adapter/，网络骨架住 net/。
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
DuduAdmin 中企业资料、启停状态或初始管理员维护成功后，挂载中的企业列表与企业详情自动重新读取的共享失效语义；维护命令以 write 显式声明写入，成功后由 client 提升数据修订（dataRevision），列表与详情查询经修订依赖重读，页面与弹层不再手工接线刷新。
_Avoid_: 手工刷新回调、onChanged 刷新链（旧实现）

**企业列表筛选操作**:
DuduAdmin 中平台管理员对企业列表的筛选写接口词汇：setKeyword / setStatus / reset / setPage 四个命名操作；调用方只上报意图，不手工拼 CompanyQuery；机制侧的翻页不变量归分页查询（usePagedQuery）单点，companies 域数据模块（company-data）只装订命名操作映射与企业聚合失效。
_Avoid_: 裸 setFilters、手工拼查询对象（旧宽 interface）

**查询四键**:
DuduAdmin 中取数 hook（useQuery）对外恒定的 interface：{data, error, loading, refresh}；请求竞态防护（旧请求取消、迟到结果丢弃）与「失败不冒充空数据」都收敛在 use-query 单点实现并有 hook 级直接测试。
_Avoid_: 六键 spread（load/attempt 版本戳外泄的旧 interface）、调用方手工比较版本

**分页查询（usePagedQuery）**:
DuduAdmin 分页列表共用的取数机制：client 绑定、查询条件状态与翻页写接口（setFilter 合并补丁 / reset 重置 / setPage 翻页）收敛在 api 层 paged-query 单点；「筛选变化与重置都回第一页且保留 pageSize」「page 只暴露服务端回显这一份真相（加载或失败时回退请求值）」「任一命名筛选已应用」的 filtered 派生（非分页字段非 undefined 且非空串即 true，0 等合法筛选值除外）三条机制不变量在此唯一实现与测试，domain 数据模块（useCompanies/useLogs）收缩为命名筛选操作薄壳并原样透传 filtered。
_Avoid_: 逐页复制的 useState + useQuery 手工编排、useCallback 稳定身份仪式（调用方自写）

**单记录查询（useAdminQuery）**:
DuduAdmin 单记录取数共用的绑定层：client 绑定（useAdmin）与 load 身份稳定在 api 层 admin-query 的 seam 处单点完成，与分页查询（usePagedQuery）严格对称；调用方只声明 adminApi 取数函数与业务参数 deps，对外仍是查询四键，请求竞态与「失败不冒充空数据」归 use-query 单点。
_Avoid_: 手写 useAdmin + useCallback 绑定仪式（旧实现）

**列表页骨架（QueryView）**:
DuduAdmin 三个列表页（企业、企业资源汇总、操作记录）共用的加载→失败→空态→表格→分页编排单点：「失败不冒充空数据」由分支顺序（error 先于空态判定）单点保证；页面把分页查询返回整只直传单个 query 投影 prop（结构化类型在骨架就地声明，不 import api/）；表格列与行走 children 槽，空态动作按钮与两套空态文案（筛选中 / 全量）归页面，空态文案取向由投影的 filtered 键机制供给。
_Avoid_: 三步舞手写编排（loading/error/数据分支逐页复制）、失败态渲染空态文案、逐页把查询返回值逐键转写成骨架 props 并手写 filtered 布尔（旧八 prop interface）

**详情页骨架（DetailPane）**:
DuduAdmin 与 DuduConsole 详情路径（详情弹层与概览卡片）共用的加载→失败→内容三态编排单点（components 层 detail-pane，受控拷贝同步 ADR-0016）：「失败不冒充空数据」由分支顺序（error 先于内容）在外壳唯一保证；调用方只传 loading / error / refresh 三键与 children 内容槽，数据到位后的版式归调用方，外壳不含布局与卡片样式。
_Avoid_: 三步舞手写编排（loading/error/数据分支逐页复制）、失败态渲染内容槽

**筛选栏（FilterBar）**:
DuduAdmin 列表页共用的「草稿-提交-重置」编排单点（components 层 filter-bar）：输入只改草稿、点搜索才上报（去空格，空串归 undefined）、草稿跟随已应用值、重置立即清草稿（含校验错误）并上报 onReset、重置按钮仅在草稿或已应用条件存在时可见，这些不变量在 filter-bar 唯一实现与测试；搜索字段差异（标签、占位、校验）走 props，立即生效的下拉走 children 槽，企业筛选（CompanyFilters）与操作记录筛选收缩为它的薄组合。
_Avoid_: 逐页手写 form 草稿编排、remount key 换重置清空（旧形态）

**路由构造（routes）**:
hash 路由地址的构造单点，DuduAdmin 与 DuduConsole 各自一份、受控拷贝同步（ADR-0016）：页面间跳转只表达意图（admin：overview / companies / companyCreate / companyDetail / resources / logs / account 七个命名构造；console 同构含 employees / user-groups / channel-accounts / account），参数名（companyId / create 等）、取值约定（create=1）、企业 ID 编码与「回纯列表即清参关闭弹层」的关闭语义收敛在各自 navigation.ts 一处，与解析侧（parseRoute / useRoute）共用同一组语法常量并有 builder→parser 往返测试；布局导航与跨页跳转（概览页、资源汇总页打开企业弹层等）不再手写查询串。
_Avoid_: 手写路由字符串（模板串拼 `companies?companyId=`、字面量 `"companies?create=1"`）

**表单提交外壳（SubmitShell）**:
DuduAdmin 表单写操作共用的提交编排单点（components 层 submit-shell）：「校验文案即写错并中断」的守卫习惯、错误 Message 显示位、提交按钮 pending 禁用与「正在X」文案、弹层「pending 期不可关闭 + 隐藏关闭按钮」成对守卫都收敛在一处并有外壳级直接测试；竞态、取消与写回守卫仍归 useMutation 机制单点，调用方只留字段、校验函数与命令，非表单的按钮触发写操作（如企业 ID 检测、退出登录）不经此外壳。
_Avoid_: 逐表单手写守卫-写错-中断、错误 Message 位逐字复制、手写 loggingOut 重入门卫（旧形态）

**会话域操作（ConversationOperation）**:
DuduDesk 中对单个会话的一次请求级读写（读历史 / 读资料、存资料，发送、结束 / 恢复接待）的统一执行 seam：loading → api 调用 → 结算守卫 → 成功 / 失败效果。「迟到结果不得复活已移除会话」（仅当本次尝试仍是当前尝试且会话仍在册才结算）、响应校验惯用形（不匹配即 invalid-response）与失败映射兜底文案收敛在 inbox stores/requests 单点，各 thunk 只声明哪个键、调哪个 api、成功装什么。
_Avoid_: 手写 runOperation 仪式、逐处兜底串（旧实现）

**列表相位（ListPhase）**:
DuduDesk 中会话列表类界面（来访会话队列、卡片工作台、消息时间线、固定会话选择）共用的呈现映射单点：load-state + 条目数 → 首读 loading / 失败重试 / 空态 / 内容四相位。`!hasLoaded && status === "loading"`（首读恒占满屏，Live 事件或乐观发送抢先入列也不改；重读与续读保留已加载内容）这一 hasLoaded × status 不变量收敛在 inbox-state 的 isInitialRead，无 load-state 形状的读取（固定会话选择）以「在飞 + 无条目」表达同一相位；四相位分支与「有内容仍出错」的 compact 错误条归 InboxListPhase，调用点只保留内容分支、各自文案（含筛选双文案）与重试命令。
_Avoid_: 逐组件手写四态判定、hasLoaded×status 组合散落（旧实现）

**回执证据（ReceiptEvidence）**:
DuduDesk 中一条消息投递状态的服务端证据（版本 + delivery）：按 clientRequestId / serverId / id 三键关联（receiptKeys），版本新者优先、同版本按状态明确度取胜（evidenceRank + rememberReceipt），本地不确定的证据永不覆盖已存的服务端证据。形状与策略同址收敛在 inbox stores/receipts 单点，Live 合并内核（message 报文、发送响应与历史读取）与重连重载共用同一合并算法。
_Avoid_: 消息 delivery 字段直读直写（绕过证据合并）、按事件到达顺序判新旧
