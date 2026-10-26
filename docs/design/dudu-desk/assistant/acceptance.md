# AI 悬浮助手实施与验证

日期：2026-10-26

## 实现入口

- dudu-desk/src/features/assistant 负责服务状态、问答请求、有限历史、悬浮窗口与问答展示
- dudu-desk/src/features/inbox/components/inbox-assistant.tsx 绑定现有回复对象和工作区生命周期
- dudu-desk/src/features/inbox/stores/assistant.ts 复用草稿编辑命令，核对对象、代数和原草稿后采纳
- dudu-server 的 assistant 包构建授权上下文，DeskAssistantController 提供真实 HTTP 接口
- TranslationService 与 TranslationEngine 复用现有配置、凭据和模型协议，新增独立助手选择
- dudu-console 的服务设置页分别维护翻译和助手使用的实例

## 自动验证

- Desk 全量 lint、类型检查、382 项测试和构建通过
- Desk 默认并发与构建同时运行时有 3 项达到 5 秒超时，结束构建后以 yarn test --maxWorkers=2 全量重跑通过，未放宽断言或超时
- Console 全量 lint、类型检查、89 项测试和构建通过
- Server 编译与默认 Maven 测试通过，变更后的模型和服务定向测试通过
- 新用例覆盖越权不外呼、生成期间撤权、配置变化、有限上下文和失败坐席消息排除
- 真实 HTTP 模型替身验证通用问答历史、协议字段和截断输出拒绝
- 前端验证迟到回答归属、取消与卸载、失败重试、配置刷新、采纳、撤销及错配响应拒绝
- 草稿命令测试确认不触发发送，并拒绝覆盖已变化的草稿、回复对象或权限代数
- 弹层承载用例验证助手入口位于可访问区域、配置就绪后可输入、Esc 不传给父弹层

## 外部验证边界

- 本机 Docker Desktop Linux 引擎管道不可连接，已尝试启动 Desktop 与仓库 Compose，MySQL 未能启动
- AssistantMigrationTest 已提供空库和 V8 升级场景，仅允许 dudu_review 用户创建并删除 dudu_review_assistant 系列库，本轮未执行
- 未修改开发库 dudu，未创建替代 MySQL 或 Testcontainers
- 未使用企业实际凭据调用生产供应商，真实模型效果与部署网络仍需具备服务配置的环境验证
- Desk 构建保留主包大于 500 kB 的提示，未为此修改无关构建配置

## 界面复现

以下脚本挂载正式组件并注入固定验收接口，不读取真实凭据，不作为生产运行入口

```powershell
./docs/design/dudu-desk/assistant/preview.ps1 -Project desk -Narrow
./docs/design/dudu-desk/assistant/preview.ps1 -Project console -Narrow
```

- Desk 为 http://127.0.0.1:1423/.assistant-review.html
- Console 为 http://127.0.0.1:1425/.assistant-review.html
- 各端的 .assistant-mobile.html 使用 390 × 844 的实际嵌套视口
- Desk URL 增加 unconfigured 查询参数可验证未配置状态，fail 可验证首次生成失败后重试，slow 可验证在途会话切换
- 结束脚本会清理创建的临时入口文件

验收数据源为 [Desk 验收入口](preview-desk.tsx)、[Console 验收入口](preview-console.tsx)，启动与清理逻辑为 [复现脚本](preview.ps1)

## 界面验收

- 专注模式生成回复后可采纳到实际输入框，发送仍由坐席操作
- 卡片完整对话弹层内可打开助手，采纳后焦点回到回复输入框，通过现有发送路径发出验收消息
- 并排模式切换回复对象后，助手切换到对应访客并保留各自问答
- Console 可分别选择百度翻译与通用模型助手，助手选项排除纯翻译服务
- 390 × 844 视口中助手窗口和输入区可用，外层页面滚动可查看底部控件

截图使用固定验收数据，回答标注为验收模型替身

- [Desk 悬浮助手](desk.png)
- [Console 独立服务选择](console.png)
- [窄屏界面](narrow.png)
