# 嘟嘟 Desk

嘟嘟（DuDu）的客服坐席桌面端，使用 React 19、Vite、Tailwind CSS、shadcn、Redux Toolkit 和 Tauri 2。本阶段将已确认的接待原型迁入正式前端，统一三种接待模式、八套主题、会话状态与 API 契约；初始范围见 [规格 #50](https://github.com/Buktal/dudu/issues/50)，当前功能见 [功能图谱](../docs/features/dudu-desk.md)。

2026-10-12 纯文本回复与实时推送已接通：未启用 Mock 时使用真实账户、访客摘要、按需历史、文本回复与 `/ws/desk` 实时通道适配器，登录后先建立 Socket、收到 ready 再读取初始数据，来信按 ID/version 合并（未打开访客只更新摘要，首次打开仍取最近页）；发送中先显示本地气泡，HTTP 返回与 Socket 通知按同一消息 ID 合并为一条，渠道失败按已保存的失败气泡展示真实原因并可手动重试（新 `clientRequestId`，原失败记录保留）；服务端不返回个人已读，待处理提醒在本次运行的内存态维护。收到 `access-changed`（员工-组或账号-组关系变化）后重查身份与列表，清理已无权的对话、名片、草稿、固定与提醒并保留仍有权数据，旧请求的迟到结果不写回新范围。断线后实时通道按退避自动重连，重连 ready 重新执行同一初始化查询——重查身份/权限、重读访客列表第一页与计数，显示中访客重取名片与最近页、旧历史缓存失效重载（更早消息照常向上分页），结果直接取查询结果；临时断线保留合法草稿与提醒，已处理事项不重新提醒，退出重登仍清空。本轮发送收窄为纯文本：附件准备/上传/发送延期，收到的非文本消息展示保留，真实适配器下附件入口按能力停用（不伪装可用），Mock 场景按自身能力数据保持可用。企业登录、身份恢复与接待范围已按 [企业认证子契约与实施票](../docs/design/dudu-desk/ticket-01-login.md)接入真实 Server：未登录时显示企业登录页，`unavailableInboxApi` 仍不会假装收发成功。Mock 数据需显式开启，开发运行与打包测试共用同一个开关，见下文。

## 运行与检查

在仓库根目录执行：

```powershell
cd dudu-desk
yarn install
yarn dev           # 浏览器开发运行
yarn tauri:dev     # Tauri 桌面开发运行
```

项目检查与构建命令：

```powershell
yarn lint
yarn check:type
yarn test
yarn build
yarn check:rust    # 涉及 Rust 改动时执行
yarn tauri:build
```

桌面命令需要本机 Tauri/Rust 构建环境。

开发运行时 Vite 将 `/api` 同源代理到 `127.0.0.1:8080`、将 `/ws` 以 WebSocket 代理到同一 Server（见 [vite.config.ts](vite.config.ts)），浏览器与桌面端都不需要跨域配置，本地 Server 用 `mvn spring-boot:run` 启动即可。打包运行时用 `VITE_API_ORIGIN` 注入线上 API 源地址（只允许协议、主机与端口），由部署层处理跨域，实时通道按该地址派生 wss/ws。真实适配器共用会话凭据：JWT 保存在内存与 `sessionStorage` 的 `dudu-desk.session` 中，登录后由账户适配器写入、inbox 按请求读取（见 [desk-session.ts](src/lib/desk-session.ts)），且与 API 源地址绑定；关闭窗口不承诺记住登录。

### Mock 打包测试

`VITE_DESK_MOCK=true` 在开发运行和生产构建中都生效：恢复模拟坐席身份，并加载相同的会话、消息和异常场景。无需另改登录页或滚动实现。

在 `dudu-desk/.env.local` 中开启可同时用于开发和打包；仅测试打包时，可写入 `dudu-desk/.env.production.local`：

```dotenv
VITE_DESK_MOCK=true
```

然后运行原有的 `yarn tauri:build`，启动 `dudu-desk/src-tauri/target/release/dudu-desk.exe`。这些 `.local` 文件不提交到 Git；开关在构建时确定，修改后需要重新打包。开关未设置或为 `false` 时不加载 Mock 适配器，生产构建会排除对应数据模块。此前在 Mock 中退出登录的同一运行会话仍保持退出状态，可用开发账号 `linzhou` / `desk123` 登录；登录表单中的企业 ID 填任意合法六位数字即可，Mock 不按企业区分。

`VITE_DESK_SCENARIO` 继续选择已有的 Mock 异常场景，缺省使用 `default`；拼错场景名会报错。

## 接待与偏好

三种模式通过顶部的分段按钮切换，共用同一个 inbox store 和同一份会话草稿。

右上角的坐席头像统一提供“坐席信息”“工作台设置”和“退出登录”。坐席信息显示当前身份、角色、所属企业及接待范围（本企业全部组或真实成员组，以及其中的渠道账号）；设置复用主题和接待方式控件，并提供“减少动态效果”。退出前确认未发送内容会清空，成功后销毁接待工作区并返回登录页；退出失败保留当前会话并允许重试，令牌已无效时本地清理并回到登录页。下一次登录从确认后的坐席和所属企业身份创建新的工作区。

| 模式 | 稳定标识 | 用途 |
| --- | --- | --- |
| 专注 | `calm` | 会话队列、完整聊天与来访用户资料，逐位接待 |
| 并排 | `parallel` | 左侧主接待、右侧手动固定会话，回复焦点独立；窄窗可切换查看 |
| 卡片 | `quick` | 只显示最后一条消息摘要并直接回复，打开完整历史后继续编辑同一份草稿 |

名称调整不改变稳定标识，已有模式偏好继续生效。“我的会话”旁的查询条件图标统一打开就近浮层，包含搜索、状态、来源和排序；指定筛选条件后显示圆点，清除筛选后消失，排序本身不计为筛选。Ctrl+K 打开浮层并聚焦搜索，Esc 关闭。状态菜单包含全部、待回复、等待中、已结束及对应计数；计数超过 999 时显示 `999+`。星标功能已移除，并排固定会话保留。

会话队列保留三行信息并压缩留白；顶部模式栏、会话标题和来访资料标题采用紧凑高度。消息时间默认隐藏，悬停或键盘聚焦对应消息时在外侧显示，预留位置避免跳动；时间朝向聊天区中央，与正文末行对齐，隐藏常规回执，不挤占正文或增加常规消息行高；失败与未确认提示单独保留在下方。卡片只显示与左侧列表共用的最后一条消息摘要，不因卡片挂载查询历史；完整对话按需加载消息并向上分页，首次展示（专注选中、并排任一侧、卡片展开）才读取最近页，切回已初始化的访客直接复用缓存。共用初始化流程只读取摘要并把首位访客设为当前对象，不预取历史与资料。点击“回复”展开编辑器，点击卡片外或键盘焦点移出后收起，操作表情、快捷回复等浮层时保持展开；草稿和附件继续按会话保留，收起后显示“继续草稿”。

桌面宽度下，专注与并排模式固定显示左侧会话队列，卡片模式不显示队列侧栏。并排会话的固定、取消固定及更换操作放在各自的窗口标题内；窄窗保留会话列表返回入口和主接待／固定会话切换。

三种模式共用来访资料面板与展开／收起控件。宽窗资料面板贴右侧，只保留聊天区的开关；窄窗使用带关闭按钮的抽屉。并排模式中，查看另一窗的资料会切换回复对象并展开面板，再次点击当前对象的开关才收起。渠道资料可一次复制渠道、账号、全部字段及来源身份，保留“渠道未提供”和“内容为空”的区别。使用说明集中在顶部工作台帮助中，以三种布局示意图配合快捷键说明。

会话标题、结束／继续接待、资料开关、队列标题与筛选排序都由公共组件维护，模式组件只组合布局及固定窗、完整历史等专属操作。卡片模式同样提供“等待最久”和“消息最多”，显式切换排序时重查结果，接待中的卡片位置保持稳定。

模式与会话切换使用短距离淡入，来访资料面板展开／收起同步过渡宽度与间距。复用已有 `motion/react`，不引入额外动效库；遵循系统减少动画设置，也可在工作台设置中主动关闭动态效果。退出中的布局停止响应快捷键，隐藏面板不可聚焦。

右上角主题菜单提供已选定的八套柔和配色，首先展示极昼白与极夜黑；窄窗下按每行左、右的顺序展示。主题名称与颜色更新，保留对应色系已有的稳定标识。

| 左列 | 右列 |
| --- | --- |
| 极昼白 `daylight` | 极夜黑 `midnight` |
| 栗木红 `crimson` | 麦穗金 `amber` |
| 草木绿 `citrus` | 牛仔蓝 `ocean` |
| 烟岚紫 `iris` | 亚麻褐 `oat` |

首次使用默认为极昼白与专注模式。七套浅色主题共用中性底色、面板、正文、辅助文字与灰阶，只改变客服消息背景、选中背景和按钮／标记的强调色。访客消息共用浅灰气泡；极夜黑使用中性炭灰底色、分层灰字与两档灰色气泡。气泡通过填色区分，不显示描边；选中会话以整块柔和背景区分，不加深色侧边条。主题选择由一个入口管理。

退出菜单的旧主题按相近色系恢复：珊瑚橙 `apricot`、莓果粉 `berry` → 栗木红；松柏绿 `pine` → 草木绿；冰川青 `sea` → 牛仔蓝。旧岩墨灰 `graphite`、雾白灰 `fog` 仍恢复为极昼白。迁移保留接待模式与减少动态效果偏好，下次偏好修改时保存当前主题标识。

| 状态 | 本次运行内切换会话、模式或主题 | 完整刷新、关闭重开或替换工作上下文 |
| --- | --- | --- |
| 主题、接待模式、减少动态效果 | 立即生效 | 从合法的本地偏好恢复 |
| 未发送文字、待发送附件 | 按会话保留 | 清空 |
| 并排固定对象、当前回复选择 | 按明确操作改变 | 不恢复旧状态 |
| 会话、消息、标签、内部备注 | 使用 API 确认的共享状态 | 重新读取 API |

[preferences.ts](src/lib/preferences.ts) 只保存 `dudu-desk.preferences` 中的 `{ version: 1, theme, mode, reduceMotion?: true }`，不持久化整个 store、账号或凭据。`reduceMotion` 缺省时跟随系统，兼容原有偏好。旧正式偏好的 `dark` 迁为极夜黑、`light` 迁为极昼白；`system` 仅在首次迁移时按系统外观解析。存储损坏或不可用不阻断本次运行。

## 样式的唯一入口

[src/index.css](src/index.css) 是正式 Desk 唯一的全局样式入口，统一 Tailwind、shadcn、字体、基础样式与主题语义变量。八套主题的颜色数值只在这里维护；业务组件使用语义 token 及其配对前景色。

`background`、`card`、`input`、`muted`、`secondary` 与 `sidebar-accent` 使用共用灰阶，正文和配对前景色保持一致；`accent` 是客服消息背景，`selection` 是同色系稍深的选中背景，`palette-base` 是主题强调色。`primary` 用于主要按钮、标记和焦点环：浅色下在基色中混入 18% 黑色，使组件已有的 80% 悬停填色仍保有文字对比度；极夜黑使用浅强调色搭配深色按钮文字。消息组合复用 Bubble 的 `secondary` 变体，仅将客服气泡的配对变量绑定到 `accent`，访客气泡沿用公共灰阶。状态色与渠道标识按各自语义维护，不随彩色主题改变。

[theme-palette.ts](src/lib/theme-palette.ts) 登记主题标识、名称、描述、顺序和深浅属性，并恢复旧主题标识。[ThemeProvider](src/components/theme-provider.tsx) 通过同一个偏好入口设置文档根的 `data-palette`、`.dark` 和 `color-scheme`，浮层与品牌也继承这一主题。布局优先组合现有组件 variant 和 Tailwind 工具类。

新增或调整颜色时，在 `index.css` 修改对应 token；不要再引入原型 CSS、独立亮暗控制器或覆盖 shadcn 控件的全局颜色层。`src/components/ui/` 是 shadcn CLI 生成物，只经 CLI 更新。工程规范见根 [AGENTS.md](../AGENTS.md)。

## 入口与目录

```text
src/
├── main.tsx                     唯一 CSS 导入与 ThemeProvider
├── App.tsx                      账户门禁与工作上下文组装
├── index.css                    全局样式与八套主题 token
├── features/account/
│   ├── index.ts / api.ts        账户公开入口与认证适配器契约
│   ├── account-provider.tsx    恢复身份、登录门禁与生命周期
│   ├── components/             企业登录页、账户菜单与坐席信息
│   ├── stores/session.ts       登录、退出、取消与竞态保护
│   ├── runtime.ts               适配器注入（显式 Mock 开关选择）
│   ├── http-account-api.ts      真实 Server 企业登录适配器与 token 管理
│   └── mocks.ts                 隔离的开发身份
├── features/inbox/
│   ├── index.ts                 feature 公开入口
│   ├── inbox-workspace.tsx      工作上下文、store 与适配器生命周期
│   ├── api.ts / types.ts        API 签名与领域载体
│   ├── runtime.ts               正式 / 开发适配器注入
│   ├── components/             三种布局及共享接待组件
│   ├── hooks/                  接待逻辑 hooks
│   ├── stores/                 状态、操作命令与 selectors
│   └── development/            Mock 适配器与固定数据工厂（按开关加载）
├── components/                 工作台外壳、设置、控件、动效与共享 UI
└── lib/                        偏好、时间、HTTP、附件等共享逻辑
src-tauri/                      Tauri 桌面宿主与本地平台桥接
```

跨 feature 通过各自的 `index.ts` 引用，业务 feature 单向依赖共享层。`App` 从账户会话提取 `agentId` / `workspaceId`，并将账户菜单作为插槽传入工作台；inbox 不依赖 account 内部实现。账户 feature 已接入真实 Server 认证（[http-account-api.ts](src/features/account/http-account-api.ts)）：token 只由适配器写入会话存储（[desk-session.ts](src/lib/desk-session.ts)），界面与业务 store 只接收身份及授权元数据，身份恢复必须经 `GET /api/desk/profile` 重新确认，不能仅凭本地 token 或解码结果放行。inbox 已接入真实访客摘要、按需历史、文本回复、结束／继续与实时通道适配器（[http-inbox-api.ts](src/features/inbox/http-inbox-api.ts)）：列表查询走 `POST /api/desk/visitors/query`，历史分页走 `GET /api/desk/visitors/{visitorId}/messages`（首次展示完整对话读取最近页，向上滚动用 `nextCursor` 读取更早页），纯文本回复走 `POST /api/desk/visitors/{visitorId}/messages`、能力走 `GET …/capability`，结束／继续走 `PUT /api/desk/visitors/{visitorId}/status`，来访资料读取与保存走 `GET/PUT /api/desk/visitors/{visitorId}/profile`，订阅走 `/ws/desk` 的 message、conversation 与 profile 报文，登录后只读写授权范围内的访客；服务端不返回个人已读，待处理提醒由本次运行的内存态维护（[reminders.ts](src/features/inbox/stores/reminders.ts)），附件发送尚未接入并在真实适配器下停用入口。也可向 `App` 注入稳定的 `accountApi` 与 `inboxApi`。`InboxWorkspace` 也保留独立 `api` / `context` 接口用于集成；现有签名见 [InboxApi](src/features/inbox/api.ts)，后端三表、HTTP 与 Socket 已在[最小对接契约](../docs/design/dudu-desk/implementation-contract.md)定稿；按实施票逐项接通，契约确定不代表全部真实适配器已经实现。

Tauri 承担桌面宿主与所需的平台桥接；渠道签名、加解密、回调和消息转发属于后续 Server 接入职责。

## 桌面窗口

主窗口使用 `decorations: false` 与 `shadow: false` 关闭原生标题栏及 Windows 白色边线，保留 `resizable: true`，由宿主处理边缘与角落缩放。[DesktopWindowControls](src/components/desktop-window-controls.tsx) 提供最小化、最大化／还原、关闭按钮，并跟随当前主题；纯浏览器运行时隐藏。最大化状态通过窗口 resize 事件同步，组件卸载时清理订阅和防抖任务。

标题栏空白区域使用 `data-tauri-drag-region="deep"`，由 Tauri 处理拖拽和双击最大化；交互控件不参与拖拽，窗口按钮区域显式设置为 `false`。[desktop-window.ts](src/lib/desktop-window.ts) 也提供同一套窗口命令用于其他入口，Web 下安全返回。关闭使用可拦截的 `Window.close()`，沿用上文的草稿生命周期：关闭重开不恢复未发送文字和附件。主窗口能力只新增拖拽、最小化、切换最大化和关闭四项权限，状态读取与事件订阅沿用现有 `core:default`。

## 相关资料

- [功能图谱](../docs/features/dudu-desk.md)
- [八套主题配色与实际界面验收](../docs/design/dudu-desk/palette-refresh/README.md)
- [工作台交互调整与验收截图](../docs/design/dudu-desk/workspace-polish/README.md)
- [正式规格 #50](https://github.com/Buktal/dudu/issues/50)
- [最小对接契约：三表、HTTP 与 Socket](../docs/design/dudu-desk/implementation-contract.md)
- [开发数据与异常场景](src/features/inbox/development/)
- [原型视觉与交互参考](../docs/prototype/dudu-desk/README.md)：仅作参考，不参与正式运行
- [领域词汇](../GLOSSARY.md)、[工程规范](../AGENTS.md)、[架构决策](../docs/adr/)
