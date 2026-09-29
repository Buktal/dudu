# 嘟嘟 Desk

嘟嘟（DuDu）的客服坐席桌面端，使用 React 19、Vite、Tailwind CSS、shadcn、Redux Toolkit 和 Tauri 2。本阶段将已确认的接待原型迁入正式前端，统一三种接待模式、十二主题、会话状态与 API 契约；范围以 [规格 #50](https://github.com/Buktal/dudu/issues/50) 为准。

真实 Server 认证、会话、历史、收发、附件与推送接口留到下一阶段。正式入口先恢复坐席身份，未登录时显示登录页；当前 `unavailableAccountApi` 不会创建虚假登录，`unavailableInboxApi` 不会假装收发成功。开发数据需显式开启，详见 [开发联调说明](docs/development.md)。

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

桌面命令需要本机 Tauri/Rust 构建环境。开发场景、开关和受控事件示例统一维护在 [docs/development.md](docs/development.md)；正式构建排除开发数据入口。

## 接待与偏好

三种模式通过顶部的分段按钮切换，共用同一个 inbox store 和同一份会话草稿。

右上角的坐席头像统一提供“坐席信息”“工作台设置”和“退出登录”。坐席信息显示当前身份、角色及工作台；设置复用主题和接待方式控件，并提供“减少动态效果”。退出前确认未发送内容会清空，成功后销毁接待工作区并返回登录页；退出失败保留当前会话并允许重试。下一次登录从确认后的坐席和工作台身份创建新的工作区。

| 模式 | 稳定标识 | 用途 |
| --- | --- | --- |
| 专注 | `calm` | 会话队列、完整聊天与来访用户资料，逐位接待 |
| 并排 | `parallel` | 左侧主接待、右侧手动固定会话，回复焦点独立；窄窗可切换查看 |
| 卡片 | `quick` | 最新消息卡片直接回复，打开完整历史后继续编辑同一份草稿 |

名称调整不改变稳定标识，已有模式偏好继续生效。搜索框下方依次放置状态下拉框、来源下拉框和排序图标；状态菜单包含全部、待回复、等待中、已结束及对应计数。星标筛选包含已结束会话，计数超过 999 时显示 `999+`。卡片模式在宽窗中将工具并为一行，搜索框保持适当宽度。

桌面宽度下，专注与并排模式固定显示左侧会话队列，卡片模式不显示队列侧栏。并排会话的固定、取消固定及更换操作放在各自的窗口标题内；窄窗保留会话列表返回入口和主接待／固定会话切换。

三种模式共用来访资料面板与展开／收起控件。宽窗资料面板贴右侧，只保留聊天区的开关；窄窗使用带关闭按钮的抽屉。并排模式中，查看另一窗的资料会切换回复对象并展开面板，再次点击当前对象的开关才收起。渠道资料可一次复制渠道、账号、全部字段及来源身份，保留“渠道未提供”和“内容为空”的区别。使用说明集中在顶部工作台帮助中，以三种布局示意图配合快捷键说明。

会话标题、星标、结束／继续接待、资料开关、队列标题与筛选排序都由公共组件维护，模式组件只组合布局及固定窗、完整历史等专属操作。卡片模式同样提供“等待最久”和“消息最多”，显式切换排序时重查结果，接待中的卡片位置保持稳定。

模式与会话切换使用短距离淡入，来访资料面板展开／收起同步过渡宽度与间距。复用已有 `motion/react`，不引入额外动效库；遵循系统减少动画设置，也可在工作台设置中主动关闭动态效果。退出中的布局停止响应快捷键，隐藏面板不可聚焦。

右上角主题菜单首先展示品牌色珊瑚橙，朱砂红排第二，其余色系依次排列，最后提供黑白两款；窄窗下按每行左、右的顺序展示。

| 左列 | 右列 |
| --- | --- |
| 珊瑚橙 `apricot` | 朱砂红 `crimson` |
| 琥珀黄 `amber` | 青柠绿 `citrus` |
| 松柏绿 `pine` | 冰川青 `sea` |
| 钴蓝 `ocean` | 鸢尾紫 `iris` |
| 莓果粉 `berry` | 可可棕 `oat` |
| 极昼白 `daylight` | 极夜黑 `midnight` |

首次使用默认为珊瑚橙与专注模式。珊瑚橙取 Logo 渐变的中间色作为基色，沿用原杏桃橙的稳定标识 `apricot`，已有偏好自动使用新配色。极夜黑采用深色外观，其余十一款采用浅色外观；主题选择由一个入口管理。

主题先按基色区分，再在各自色系内分配明暗层级。旧岩墨灰 `graphite`、雾白灰 `fog` 的偏好恢复为极昼白，保留中性外观；其余既有主题标识继续有效。

| 状态 | 本次运行内切换会话、模式或主题 | 完整刷新、关闭重开或替换工作上下文 |
| --- | --- | --- |
| 主题、接待模式、减少动态效果 | 立即生效 | 从合法的本地偏好恢复 |
| 未发送文字、待发送附件 | 按会话保留 | 清空 |
| 并排固定对象、当前回复选择 | 按明确操作改变 | 不恢复旧状态 |
| 会话、消息、星标、标签、内部备注 | 使用 API 确认的共享状态 | 重新读取 API |

[preferences.ts](src/lib/preferences.ts) 只保存 `dudu-desk.preferences` 中的 `{ version: 1, theme, mode, reduceMotion?: true }`，不持久化整个 store、账号或凭据。`reduceMotion` 缺省时跟随系统，兼容原有偏好。旧正式偏好的 `dark` 迁为极夜黑、`light` 迁为珊瑚橙；`system` 仅在首次迁移时按系统外观解析。存储损坏或不可用不阻断本次运行。

## 样式的唯一入口

[src/index.css](src/index.css) 是正式 Desk 唯一的全局样式入口，统一 Tailwind、shadcn、字体、基础样式与主题语义变量。十二主题的颜色数值只在这里维护；业务组件使用语义 token 及其配对前景色。

`palette-base` 表示主题基色，用于主题预览；`background`、`card`、`input` 承载安静的基础界面；`muted`、`secondary`、`accent` 用于辅助信息与轻强调；`selection` / `selection-foreground` 用于选中会话与接待模式；`sidebar-accent` 用于来访用户资料卡和当前回复窗口的标题区；`primary` 用于主要按钮与重点标识。

[theme-palette.ts](src/lib/theme-palette.ts) 登记主题标识、名称、描述、顺序和深浅属性，并恢复旧主题标识。[ThemeProvider](src/components/theme-provider.tsx) 通过同一个偏好入口设置文档根的 `data-palette`、`.dark` 和 `color-scheme`，浮层与品牌也继承这一主题。布局优先组合现有组件 variant 和 Tailwind 工具类。

新增或调整颜色时，在 `index.css` 修改对应 token；不要再引入原型 CSS、独立亮暗控制器或覆盖 shadcn 控件的全局颜色层。`src/components/ui/` 是 shadcn CLI 生成物，只经 CLI 更新。工程规范见根 [AGENTS.md](../AGENTS.md)。

## 入口与目录

```text
src/
├── main.tsx                     唯一 CSS 导入与 ThemeProvider
├── App.tsx                      账户门禁与工作上下文组装
├── index.css                    全局样式与十二主题 token
├── features/account/
│   ├── index.ts / api.ts        账户公开入口与认证适配器契约
│   ├── account-provider.tsx    恢复身份、登录门禁与生命周期
│   ├── components/             登录页、账户菜单与坐席信息
│   ├── stores/session.ts       登录、退出、取消与竞态保护
│   └── runtime.ts / mocks.ts   适配器注入与隔离的开发身份
├── features/inbox/
│   ├── index.ts                 feature 公开入口
│   ├── inbox-workspace.tsx      工作上下文、store 与适配器生命周期
│   ├── api.ts / types.ts        API 签名与领域载体
│   ├── runtime.ts               正式 / 开发适配器注入
│   ├── components/             三种布局及共享接待组件
│   ├── hooks/                  接待逻辑 hooks
│   ├── stores/                 状态、操作命令与 selectors
│   └── development-*.ts / mocks.ts  开发联调与固定数据工厂
├── components/                 工作台外壳、设置、控件、动效与共享 UI
└── lib/                        偏好、时间、HTTP、附件等共享逻辑
src-tauri/                      Tauri 桌面宿主与本地平台桥接
docs/                           开发说明与适配器契约
```

跨 feature 通过各自的 `index.ts` 引用，业务 feature 单向依赖共享层。`App` 从账户会话提取 `agentId` / `workspaceId`，并将账户菜单作为插槽传入工作台；inbox 不依赖 account 内部实现。真实服务适配器可从各 feature 的 `runtime.ts` 接入，或向 `App` 注入稳定的 `accountApi` 与 `inboxApi`。`InboxWorkspace` 也保留独立 `api` / `context` 接口用于集成；身份、错误、事件和资源所有权见 [API 契约](docs/api-contract.md)。

Tauri 承担桌面宿主与所需的平台桥接；渠道签名、加解密、回调和消息转发属于后续 Server 接入职责。

## 桌面窗口

主窗口使用 `decorations: false` 与 `shadow: false` 关闭原生标题栏及 Windows 白色边线，保留 `resizable: true`，由宿主处理边缘与角落缩放。[DesktopWindowControls](src/components/desktop-window-controls.tsx) 提供最小化、最大化／还原、关闭按钮，并跟随当前主题；纯浏览器运行时隐藏。最大化状态通过窗口 resize 事件同步，组件卸载时清理订阅和防抖任务。

标题栏空白区域使用 `data-tauri-drag-region="deep"`，由 Tauri 处理拖拽和双击最大化；交互控件不参与拖拽，窗口按钮区域显式设置为 `false`。[desktop-window.ts](src/lib/desktop-window.ts) 也提供同一套窗口命令用于其他入口，Web 下安全返回。关闭使用可拦截的 `Window.close()`，沿用上文的草稿生命周期：关闭重开不恢复未发送文字和附件。主窗口能力只新增拖拽、最小化、切换最大化和关闭四项权限，状态读取与事件订阅沿用现有 `core:default`。

## 相关资料

- [功能图谱](../docs/features/dudu-desk.md)
- [工作台交互调整与验收截图](../docs/design/dudu-desk/workspace-polish/README.md)
- [正式规格 #50](https://github.com/Buktal/dudu/issues/50)
- [API 契约与后续接入](docs/api-contract.md)
- [开发数据与异常场景](docs/development.md)
- [本阶段检查、构建与审查记录](docs/verification.md)
- [原型视觉与交互参考](../docs/prototype/dudu-desk/README.md)：仅作参考，不参与正式运行
- [领域词汇](../CONTEXT.md)、[工程规范](../AGENTS.md)、[架构决策](../docs/adr/)
