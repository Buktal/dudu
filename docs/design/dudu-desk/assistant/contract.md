# 坐席 AI 悬浮助手契约

日期：2026-10-26

## 使用方式

- Desk 的专注、并排、卡片接待布局共用悬浮助手，默认收起，右下角入口开合
- 助手跟随当前回复对象，明确显示来访用户和渠道，按来访用户保留本次工作区内的问答
- 支持会话摘要、回复建议、草稿润色、连续追问和按提问要求翻译
- 生成回复需明确采纳进入草稿，已有草稿使用「替换回复草稿」文案，继续沿用现有发送链路
- 采纳后收起助手并聚焦当前可见编辑器，草稿尚未再次编辑时可以撤销采纳
- 请求绑定发起时的来访用户，切换对象后迟到的结果仍归属原对象
- 支持停止、失败重试、新建当前 AI 对话、大小窗和左右位置切换
- 卡片完整对话的助手附着在对话弹层内，遵循其焦点范围，Esc 优先收起助手
- 卡片上采纳时打开当前对象的完整对话以继续编辑
- Alt + A 展开或收起，Enter 提问，Shift + Enter 换行
- 权限范围代数变化或退出工作区时取消请求、清空 AI 问答，AI 记录不写入渠道消息或数据库

## 企业服务选择

- 复用 Console「AI 与翻译服务」中的服务实例、加密凭据、修订控制与初始企业管理员权限
- defaultService 选择阅读翻译服务，assistantService 独立选择 AI 助手使用的服务
- assistantService 为 null 或缺省时不启用助手，空串无效，删除选中实例同时清空选择
- 允许已有通用模型服务，包括 OpenAI 兼容、Claude Messages 与 Ollama
- 常规翻译、环境依赖项目和专用豆包翻译 Responses 不可作为通用助手模型
- 未配置时显示配置指引，可刷新状态，不提供示例回答或自动切换其他模型
- 现有连接测试仍使用固定短文本执行服务调用，实际生产模型能力与凭据需部署方验证

## HTTP

沿用企业 JWT、HTTP 200 与 R 包装，路径中的 visitorId 是已有固定会话的来访用户 ID

| 方法与路径 | 请求 | R.data |
| --- | --- | --- |
| GET /api/desk/assistant | 无 | enabled、serviceName，未启用时 serviceName 为 null |
| POST /api/desk/visitors/{visitorId}/assistant | prompt、task、draft、history | visitorId、text、serviceName、revision、contextMessageCount、contextTruncated |
| GET /api/console/translation | 无 | 原配置字段新增 assistantService |
| PUT /api/console/translation | revision、defaultService、assistantService、services | 掩码后的已保存配置及目录 |

- prompt 为 1–2000 字符，task 为 chat、summary 或 reply
- draft 可省略或为空串，最多 4000 字符，只用于本次生成
- history 为最多 12 条先前 AI 问答，role 仅允许 user 或 assistant，每条最多 4000 字符，总长度最多 24000
- Desk 按完整问答选取最多最近 6 轮并限制总长度，不把失败或取消轮次传给模型
- 返回 text 为完整非空纯文本，最多 4000 字符，不接受截断或异常的供应商输出
- 回复返回的 visitorId 必须与发起对象一致，客户端拒绝错配结果

## 上下文与权限

- 服务端从当前授权访客读取近期记录，客户端不能指定企业、用户组、任意访客正文或 system 角色
- 最多扫描最近 41 条持久消息并选取最多 40 条已保存文本，总正文最多 16000 字符，按时间顺序提供
- 失败、发送中、结果未确认的坐席消息不作为已发送事实，非文本不推断图片或音频内容
- 同时提供共享标签、内部备注及本次草稿，不包含渠道凭据或其他来访用户的记录
- 历史超出边界时返回 contextTruncated=true，界面明确提示仅含部分历史
- 模型被要求把引用消息和备注当作资料，避免编造政策、订单结果、承诺或已执行操作
- 当前没有企业知识库检索和工具执行，助手的建议由坐席核对后采纳
- 外呼前后均核验接待权限，结束时复核服务配置修订，权限撤销或配置变化时丢弃结果
- 采纳时再核对当前回复对象、草稿内容、发送状态及工作区代数，不覆盖已变化的草稿

## 存储与运行

- V9 仅为 translation_setting 增加 nullable assistant_service，不修改 V8，不增加外键或 AI 记录表
- 原有加密配置及默认翻译选择保留，既有企业升级后助手默认未启用
- AI 请求复用现有模型协议、加密密钥与 HTTP 出站边界
- 全局最多 16 个、同企业最多 4 个模型或翻译请求，外呼限时 20 秒、响应最多 1 MiB
- 私有模型同样遵循 dudu.translation.allow-private-endpoints 配置，默认拒绝 HTTP 与私有网络
- Desk 最多同时协助 2 位来访用户，每位最多保留本次工作区最近 20 轮 AI 交互
