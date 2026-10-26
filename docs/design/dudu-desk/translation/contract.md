# 文本消息阅读翻译契约

日期：2026-10-26

## 产品行为

- 坐席和来访用户的已保存纯文本消息可点击翻译，发送正文与历史原文不变
- 自动翻译默认关闭，在工作台设置中开启并选择阅读目标语言，偏好按员工保存并跨设备恢复
- 只处理已打开会话中挂载的消息行，不主动加载历史，不处理未打开会话和折叠卡片摘要
- 三种接待模式的完整会话共用消息入口，虚拟列表渲染范围内的历史消息也会触发翻译
- 原文始终显示，译文附在下方，可收起、失败重试与重新翻译
- 翻译失败不影响收发或接待状态，不自动切换其他服务
- 只有发送成功的坐席文本显示入口，本地发送中、结果未确认、失败消息及非文本不显示入口
- 目标语言变化清除此前消息行状态，关闭自动翻译忽略此前自动请求的迟到结果
- 当前提供 15 种阅读目标语言，各服务可能只支持其中一部分，不支持时明确失败

## 企业配置

- Console 翻译服务页实时核验初始企业管理员身份，仅维护本企业配置，普通管理员的组范围不扩大为全企业配置权限
- 支持多个命名服务实例，只选择一个企业默认服务，坐席不切换服务
- 常规与模型服务分别显示必要字段，常规服务不要求模型名
- 固定短文本连接测试真实执行翻译，不以地址可达或模型列表代替
- 秘密字段读取返回 `__DUDU_SECRET_PRESENT__`，同实例及同类型保存此标记时保留原值，填写新值替换
- 删除实例或选择不启用翻译后保存即可撤销配置
- 保存带 revision，拒绝旧版本覆盖，成功递增修订
- 普通员工不可维护配置，平台管理员不可访问企业翻译资源

## 服务目录

参考 Easydict 的 29 项注册，19 项提供网络接口适配，10 项显示明确环境或范围限制

- 常规：有道开放 API、DeepL 官方 API、Google Cloud Translation、百度、Microsoft Translator、火山、小牛、彩云、阿里
- 模型：OpenAI、DeepSeek、Groq、智谱、MiniMax、Gemini 兼容接口、Claude Messages、Ollama、自定义 OpenAI 兼容、豆包翻译 Responses
- 腾讯旧 TextTranslate 接口不可确认当前可用，不提供假成功适配
- Apple Dictionary、MDict、Apple Translate 依赖本机环境或属于词典查询，不能直接在通用 Java Server 启用
- Easydict 内置 AI 不借用上游访问能力，Claude Code、Codex CLI、GitHub Copilot 不借用本机登录身份
- 润色和摘要保留目录说明，不增加对应产品功能
- Google、Bing、有道采用企业自有凭据的正式接口，不搬用网页私有请求
- 上线前仍须用企业实际地址和凭据完成连接测试，受控替身不代表上游生产可用性

## HTTP

沿用 JWT、HTTP 200 与 R 包装，权限和参数错误沿用现有错误码，外部服务错误为 13100

| 方法与路径 | 请求 | R.data |
| --- | --- | --- |
| GET /api/console/translation | 无 | revision、defaultService、services、providers |
| PUT /api/console/translation | revision、defaultService、services | 掩码后的已保存配置及目录 |
| POST /api/console/translation/test | configuration、targetLanguage | text、targetLanguage、serviceName、revision=0 |
| GET /api/desk/translation/preferences | 无 | automatic、targetLanguage |
| PUT /api/desk/translation/preferences | automatic、targetLanguage | 已保存偏好 |
| POST /api/desk/messages/{messageId}/translation | version、targetLanguage | text、targetLanguage、serviceName、revision |

实例包含 id、name、provider、endpoint、values，id 为 1–64 位字母数字、下划线或连字符，provider 与 values 字段由目录确定，endpoint 为完整请求地址

服务端只从已授权消息读取正文，不接受任意正文请求，外呼完成时再次校验接待权限与配置修订，单次最多 4000 字符，不自动截断

模型使用非流式返回，Chat Completions 要求正常结束，Claude 与豆包按专有完成状态解析，不接受空输出或截断输出

## 持久化与资源边界

- V8 新增 translation_setting 和 translation_preference，无外键，不改变消息表
- 企业配置整体以 AES-GCM 加密，企业 ID 为认证数据，秘密值不写入日志
- 可配置至少 32 字符的 `dudu.translation.secret`，未配置时从现有 JWT 密钥派生用途隔离密钥
- 密钥变化后旧配置不能解密，迁移和备份须保管原密钥，否则需重新配置
- 默认禁止 HTTP、本地及私网目标，不跟随重定向，可信私有部署可由部署方显式设置 `dudu.translation.allow-private-endpoints=true`
- 自定义地址由企业管理员控制，生产仍应设置实际服务的出站网络策略，应用地址检查不替代网络隔离
- 外呼上限 20 秒、响应上限 1 MiB、全局最多 16 次及单企业最多 4 次并发，超出提示重试
- Desk 最多并发 3 次，同消息版本和语言合并在途请求，离开工作区取消请求
- 译文只保留在当前挂载消息组件，不落库、不跨坐席共享，重开或重新翻译时重新授权

## 验证记录

- 新增后端协议、权限、配置加密与前端交互测试通过，检查结果以本轮交付记录为准
- 浏览器实际操作确认手动及自动翻译、原文保留、连接测试和两类服务的字段
- 界面截图采用固定测试数据，未调用企业真实服务
- 独立迁移用例覆盖空库和 V7 升级，只使用 dudu_review 用户、自建自删的 dudu_review_translation 系列库
- 本机 Docker 引擎不可用，迁移用例尚未执行，不能视为已验证
- 企业真实凭据和各供应商生产调用尚未验证

## 界面证据

- [Desk 原文与译文](desk-preview.png)
- [Console 服务配置](console-preview.png)
