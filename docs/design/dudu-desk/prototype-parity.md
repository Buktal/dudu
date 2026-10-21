# Desk 最终原型与正式实现差异清单

记录日期 2026-09-16

依据最终原型源码及冻结 HTML 做只读对照；审查时未运行页面或测试。正式代码当时由多个任务并发修改，以下记录的是发现时的差异，供实现后逐项验收，不能视为当前全部仍未修复

原型基线：docs/prototype/dudu-desk/src 与 docs/prototype/dudu-desk/dudu-desk-prototype.html。原型源码会导入正式项目 CSS，重新运行源码不能代替冻结 HTML 的视觉基线

## 功能差异（按优先级）

### 1. 排序与等待提示缺失

- 原型默认“等待最久”：待回复优先，再按等待秒数降序
- 第二项内部名 recent，实际 UI 为“消息最多”，按完整消息数量降序，并非最近活跃
- 正式查询原无排序字段，开发适配器仅按 updatedAt 排列
- 原型队列与速答卡显示等待时长，并在等待至少 180 秒时突出显示；正式只显示时间或状态
- 需要真实等待起点、消息总数契约；不能用最后活跃时间或已加载消息数冒充
- 原型证据：features/inbox/conversation-list.tsx:49、94、232；App.tsx:30；variants/stream.tsx:86。正式证据：features/inbox/development-api.ts:55；components/conversation-queue.tsx:51；types.ts:105

### 2. 发送并下一位的保护与候选范围不同

- 原型发送期间收到同访客新来信、或会话已结束时，不执行自动切换
- 正式仅检查发送成功、selectionRevision 和 replyId，没有提交时的最后入站消息快照保护
- 原型从全量可回复待接待会话按等待顺序选人，忽略当前搜索、渠道、星标筛选
- 正式只从当前筛选及已加载页的 queue.ids 选人，可能将“当前页没有”误报为“没有其他”
- 原型证据：features/inbox/use-inbox.ts:69、96；App.tsx:101。正式证据：features/inbox/stores/sending.ts:69

### 3. 筛选与搜索语义缩水

- 原型“全部”排除已结束；星标可包含已结束
- 正式 all 包含 closed，星标叠加当前状态筛选
- 原型搜索覆盖姓名、来源、账号、来源身份、标签与全部消息
- 正式仅姓名、外部 ID、账号名与最后一条预览，不含渠道名、标签、历史消息
- 开发适配器及事件匹配必须保持同一语义，完整历史检索需要服务端支持
- 原型证据：features/inbox/conversation-list.tsx:23。正式证据：features/inbox/stores/event-state.ts:86；development-api.ts:38

### 4. 常用入口缺失或行为变化

- 原型 rail 有所有会话、星标会话、搜索、快捷键帮助
- 正式 rail 仅“所有会话”，点击却只刷新当前筛选，没有返回所有会话
- 星标筛选已移到 QueueTools；单会话星标移到资料区；功能存在，但聊天头的直接星标入口缺失
- 快捷键帮助入口缺失。核心 Ctrl/Cmd K、Enter、Shift Enter、Ctrl/Cmd Enter、Alt 1/2 已实现
- 原型证据：variants.tsx:61；features/inbox/chat-panel.tsx:122；prototype-controls.tsx:99。正式证据：features/inbox/inbox-workspace.tsx:46；components/queue-tools.tsx:150；components/visitor-info.tsx:124

### 5. 结束接待到继续接待的闭环缺失

- 原型输入区提供“继续接待”。正式只有结束命令，没有恢复命令或按钮
- 需要真实恢复命令；原型使用本地 patch 不构成删除已批准交互的理由
- 原型证据：features/inbox/composer.tsx:101。正式证据：features/inbox/api.ts:49；components/conversation-pane.tsx:49

### 6. 标签与备注编辑交互变化

- 原型标签通过加号展开输入、Enter 添加、单标签删除按钮移除
- 正式是常驻逗号文本框，无法直接点击移除标签
- 备注从即时本地保留变成显式保存。真实保存、失败重试、撤销和草稿保护应继续保留；标签操作可恢复原型交互
- 原型证据：features/inbox/visitor-info.tsx:86。正式证据：features/inbox/components/visitor-info.tsx:224

### 7. 固定访客选择器范围与副作用不同

- 原型列出全部未结束且非主窗访客
- 正式复用当前筛选队列、包含主窗；弹窗 QueueTools 会改变外部队列筛选
- 固定、替换、收起、恢复能力已存在，需核准候选范围并消除不必要的筛选副作用
- 原型证据：variants/parallel.tsx:137。正式证据：features/inbox/components/parallel-toolbar.tsx:142

### 8. 速答卡位置稳定性

- 原型冻结进入速答时的访客次序，且隐藏排序控件
- 正式直接使用查询队列；补排序时应单独保留速答的卡片位置稳定行为
- 原型证据：variants/stream.tsx:202、241。正式证据：features/inbox/components/quick-workspace.tsx:58、146

### 9. 计数与渠道列表的数据边界

- 原型 tabs 展示全部活跃数、待回复数，渠道选择器完整列出六个来源
- 正式无 tabs 数字，渠道选项仅从已加载会话推导
- 应补真实汇总及渠道目录；不能复制“6 个来源”，也不能拿分页长度当完整总数
- 原型证据：features/inbox/conversation-list.tsx:120。正式证据：features/inbox/components/queue-tools.tsx:39

## 视觉差异

### 已由主任务识别的共享布局

- 资料区原先正式宽度阈值为 1380px，原型约为 1090px
- 原型自在聊天区透明，正式成了整块白色大卡片
- 原型导航 rail 与队列组成连续区域，正式将两者分离

### 10. 气泡与消息层次

- 原型来信使用 card、出站使用 accent；正式为 outline/background 与 secondary
- 原型消息最大 min(80%, 520px)，非对称圆角，14px/1.85 行高，来信带小头像
- 正式最大 88%，统一圆角，没有来信头像，历史区域也失去原型的 910px 居中约束
- 真实投递状态必须保留，颜色、头像、宽度与圆角偏离没有生产行为依据
- 原型证据：styles/messages.css:13；styles/chat.css:65；features/inbox/message.tsx:31。正式证据：features/inbox/components/message-view.tsx:31；components/ui/bubble.tsx:24

### 11. 渠道识别

- 原型有方形圆角头像、渠道角标、来源独立颜色与 logo
- 正式变成圆形首字头像及普通 secondary 文字徽章
- 缺失头像时使用真实回退，仍可恢复轮廓、角标和渠道识别；不能由渲染器编造人物照片
- 原型证据：components/identity.tsx:48、161；styles/inbox.css:1。正式证据：features/inbox/components/identity.tsx:18

### 12. 输入区

- 原型工具栏在上方，并在右侧展示带渠道图标的回复对象标签；输入高 77px，键位提示在底部左侧
- 正式工具集中下方，回复对象是普通文字，输入区更高，快捷回复文字按钮变为图标
- 原型编辑器使用 card；正式使用 background。限制与附件状态应保留，基本布局可恢复
- 原型证据：features/inbox/composer.tsx:212；styles/composer.css:5。正式证据：features/inbox/components/composer.tsx:109

### 13. 资料区及队列层次

- 原型资料区为 sidebar 背景、独立头像块、分组 card、强调色备注块，左侧单边圆角
- 正式为一整块 card 与裸分区；标签常驻输入与较高备注框进一步改变密度
- 原型队列标题 25px，有副标题与标识；tabs 先于搜索。正式标题 16px，搜索先于状态按钮
- 原型证据：styles/visitor-info.css:5、29、51；variants.tsx:94。正式证据：features/inbox/components/visitor-info.tsx:85；components/queue-tools.tsx:70

## 已对齐或应保留的差异

- 所有主题变量与冻结基线一致；基础字体、radius 变量一致。主要偏差来自 token 使用与组件布局
- 已迁移：核心快捷键、表情与快捷回复、真实附件准备及发送、图片放大、音视频播放、原消息重试、完整对话、查看最新消息、共享草稿
- 保留真实受理、送达、未确认等状态，能力限制、分页及加载错误、资料保存回执、缺失字段提示
- 不直接迁入演示场景控制、虚构商品价格、示例转写、虚构坐席身份与在线状态
