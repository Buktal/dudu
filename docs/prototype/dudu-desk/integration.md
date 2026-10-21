# DuduDesk 原型的集成说明

一个工作台提供自在、并肩、速答三种接待方式。主题共 12 款，以六组相邻选项进行比较，极昼白与极夜黑组成日夜配色。模式和主题是两个独立偏好：模式改变布局，主题统一改变整个工作台的颜色与深浅外观

## 交互与状态

- 顶部分段按钮只切换接待布局，不增加左侧业务导航层级
- 当前回复对象独立于并肩模式的主接待和固定访客，切换模式不会互换左右窗
- 并肩会话的接待角色、回复选择与访客信息合入一个头部；`ChatPanel` 通过 `paneRole` 区分主接待与固定接待，通过 `focused / onFocus` 显示并切换当前回复对象，不额外复制状态
- 消息、草稿、标签、备注按访客身份集中管理，所有视图读取同一份数据
- 主题入口位于右上角，基于已安装的 Base UI Popover / ToggleGroup 和现有 shadcn Button 组合；选择后保持展开以连续比较，「完成」、外部点击和 Esc 收起，焦点回归由组件处理。窄窗口只滚动选项区域
- 配色与排列顺序由 `src/lib/theme-palette.ts` 统一定义。杏桃橙继续使用原来的 `apricot` 键，已有偏好和链接保持有效；新增极昼白使用 `daylight`
- 仅持久化主题偏好，存储键为 `dudu-desk-prototype.palette`。显式 URL 优先，其次本地偏好，默认杏桃橙。正式集成时可接入应用的用户偏好存储

## 样式唯一入口

`src/index.css` 直接导入 `../../../../dudu-desk/src/index.css`，复用 Tailwind、shadcn、字体、基础 reset、亮暗主题映射和圆角 token。原型在 `[data-palette]` 作用域里追加十一组浅色、一组深色主题值，不重建全局组件样式

主题变量和 shadcn 的 `:root / .dark` 变量声明一样放在 CSS layer 之外，避免默认 `.dark` 声明盖过定制主题。极夜黑在工作台与 Portal 弹出层上启用 `.dark`，同时设置 `color-scheme: dark`，让原生滚动条与下拉控件同步；切回浅色时移除 `.dark` 并恢复 `color-scheme: light`

| 内容 | 当前落点 | 集成方式 |
| --- | --- | --- |
| shadcn 基础样式 | 正式 Desk 的 `src/index.css` | 保留正式项目唯一入口，不复制另一份 reset 或 `@theme` 映射 |
| 主题颜色 | 原型 `src/index.css` 的 `[data-palette]` 块 | 将选用的标准变量覆盖合入正式入口 |
| 主题元数据与读写 | `src/lib/theme-palette.ts` | 使用正式应用偏好存储，保留合法值校验 |
| 主题选择器 | `src/components/theme-picker.tsx` | 作为共享组件，通过 `value` / `onChange` 接收偏好 |
| 接待布局和工具条 | `src/variants*`、`src/reception-toolbar.tsx` | 迁入 `features/inbox/components/` |
| 会话和回复逻辑 | `src/features/inbox/` | 沿正式项目 feature 分层接入真实 API 和 store |
| 演示工具 | `src/prototype-controls.tsx`、`styles/prototype.css` 的演示部分 | 留在原型中，不迁入产品 |

颜色直接使用 shadcn 的 `background / foreground / card / popover / primary / secondary / muted / accent / border / input / ring / sidebar-*`，并使用对应的 foreground token；主题数增加时无需新增布局 CSS。仅补充 `success` 和 `warning` 两对状态 token。圆角沿用 `--radius` 与 shadcn 的派生档位

布局 CSS 分为 `workspace / inbox / chat / messages / composer / quick-reply / visitor-info`，每个文件包含自身的响应式规则；`prototype.css` 承载演示工具和通用弹层外观。正式集成时，通用弹层可改用正式项目的 shadcn Dialog / Toast，演示部分留在原型。已移除折页实现、旧底部模式与配色预览入口、分散的覆盖文件

主题作用域必须覆盖浮层：当前主题选择器通过 Portal 渲染，因此 Popup 同样带 `data-palette` 和对应的 `.dark` 类。正式项目若把主题应用到 `html`，浮层将自然继承；采用局部工作台作用域时继续传入主题，避免弹出层颜色回到默认值

## 正式集成时

1. 保留正式 Desk 的依赖、`components.json` 和 CSS 基础入口；原型的工具链、`@desk` 别名及 `@source` 外部文件扫描只用于此目录，不整体复制
2. 迁入选定的 feature 组件与布局规则；共享 UI 直接引用 `@/components/ui`，CLI 生成的组件继续只经 CLI 更新
3. 将主题 token 合入唯一 CSS 入口，沿用一套语义变量。三种模式使用相同的颜色，不为某个布局维护独立配色
4. 消息发送、回复资格和回执以真实 API 契约实现；沿用按访客存草稿、主窗与固定窗独立的状态规则。原型数据和模拟定时器不作为生产实现
5. 验证草稿与回复对象、模式切换、主题保存、Portal 主题继承、窄窗口和减少动态效果，再执行正式项目要求的检查

品牌 SVG 的轮廓和橙色图形保持不变，字标通过 SVG 自身的深色媒体查询变为浅色，无需复制第二份几何路径。渠道标签、头像角标和回复对象统一使用 `source-identity` 的颜色规则；其数据颜色与工作台主题独立，深色下通过 `light-dark()` 保持可读性。状态提示沿用独立语义色

## 下一阶段：生产前端迁移

2026-09-16 确认先迁移 Desk 前端，随后接入真实收发。本阶段以当前三种接待方式、十二主题和一体化并肩头部为视觉基线；联调数据仅用于开发，正式入口不包含演示场景、模拟来信按钮或内存模拟发送

### 已确认的状态边界

- 关闭 Desk 后，主题和接待方式偏好保留
- 未发送草稿、当前来访用户和并肩固定窗口只保存在本次运行内，重启后不恢复
- 同一次运行内切换接待方式、主题或来访用户，草稿和并肩固定对象继续保留；新消息不抢走当前回复对象

原型目前只持久化主题，接待方式由 URL 表达；正式前端需补上接待方式偏好的保存。以上重启规则是生产规格，不把原型演示数据当作持久化数据源

### 正式工程的现状

- `dudu-desk/src/App.tsx` 仍是 shadcn 启动页；`components/ui` 现有 Button、Marquee，尚无会话 store、API client 或实时订阅
- 正式 `src/index.css` 已包含 Tailwind/shadcn 唯一基础入口；`components/theme-provider.tsx` 负责 `light / dark / system`、本地偏好与启动页的 `d` 快捷键
- Redux Toolkit、react-virtuoso、Tiptap、dayjs、lodash-es 等规范选型已安装，可按实际功能使用；新增第三方依赖仍遵循根 AGENTS.md 的审批流程
- Server 当前具备鉴权及统一响应骨架，仅有默认关闭的开发 token 端点；会话、消息历史、发送与实时推送接口尚未实现。前端接口契约需单独明确，真实收发验收留到后续阶段

### 样式与主题的唯一控制源

1. 以正式 `src/index.css` 保留唯一的 Tailwind/shadcn 导入、reset、字体、语义映射与圆角定义。将选定的十二组主题值合入同一入口，继续使用 `background / card / primary / muted / accent / sidebar-*` 等标准变量
2. 扩展现有 ThemeProvider，由一个偏好状态统一设置 `html` 的 `data-palette`、`.dark` 和 `color-scheme`。原型 App 中的独立主题 state、原型 storage key 和旧启动页的独立亮暗控制不叠加到正式应用；Portal 直接继承根主题
3. 业务组件组合正式 shadcn/Magic UI 组件，优先使用其 variant、size 和语义变量。CLI 生成的 `components/ui` 继续只经 CLI 更新，避免通过全局选择器重写其颜色、字体和状态
4. 布局优先用 Tailwind 工具类；确实需要的自定义布局样式按 feature/组件职责组织。统一的是变量、组件与基础入口，不把全部布局挤成一个巨大 CSS，也不复制原型的八份样式逐层覆盖
5. 演示工具栏、`tooling.mjs`、`@desk`、外部 `@source`、`prototype.css` 及演示数据不作为生产依赖。品牌素材、主题值和已经验证的交互规则按职责迁入正式目录

### 规格与实施顺序

按 Matt 主流程继续：`grill-with-docs → to-spec → to-tickets → implement`。本次范围和重启规则已明确，接下来将其收敛为可验收规格，再拆成带依赖关系的 GitHub Issues；本说明不代替最终规格，也不表示任务已发布

建议围绕可体验的功能分批落地

1. 统一主题与工作台入口：十二主题、偏好保存、正式组件基础和布局外壳
2. 自在接待：API 契约、正式会话状态、列表、消息历史、输入与资料面板；开发联调使用固定 seed 的独立 mock
3. 并肩与速答：复用同一份会话、草稿和消息状态，实现固定窗口、当前回复对象、卡片回复及完整历史
4. 完整交互与验收：附件/失败重试/回复限制/空态与错误态、历史分页和长列表、键盘可达性、三种布局与亮暗配色、Web 与 Tauri 构建

生产模型需区分来访用户身份、会话、消息、发送目标、回复资格和投递状态，遵循 [统一消息体验约束](../../research/dudu-desk/experience-constraints.md)。API client 必须解析 `R<T>.code`，遵循 [ADR-0006](../../adr/0006-always-200-segmented-error-codes.md) 与 [ADR-0007](../../adr/0007-jwt-auth-chain.md)。原型计数 ID、定时器回执、全量消息渲染和示例附件不直接充当生产实现
