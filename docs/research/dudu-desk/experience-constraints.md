# DuduDesk 统一消息体验：必须保留的渠道边界

日期：2026-09-15。研究票：[统一消息体验需要保留哪些渠道边界？](https://github.com/Buktal/dudu/issues/24)，所属地图：[DuduDesk：寻找统一消息接待的工作台方向](https://github.com/Buktal/dudu/issues/23)。

本轮只服务于消息收发、来访用户资料和多会话切换的原型。目标是让坐席使用一套聊天方式，同时看清发送对象、来源账号和当前可用动作。

## 证据范围

- **本轮直读官方正文**：微信客服发送/资料、公众号服务号客服规则、小红书小程序收发、Telegram User/BusinessBotRights/sendMessage，以及 Zendesk、Intercom、Chatwoot 的下列帮助页。均通过只读 HTTP 获取。
- **沿用仓库事实快照**：抖音、WhatsApp 的部分消息字段及回执，微信客服接收机制、公众号 OpenID 作用域。来源为 2026-09-10/11 的 [channels](../channels/README.md)，下表同时指向其原始官方文档。没有把沿用快照表述为本轮逐项重验。
- **设计推论/原型假设**：以下明确标注的布局、排序、草稿和误发保护建议。未进行市场调研、坐席访谈或可用性实验，不能宣称已经提高接待效率。

## 已确认的渠道事实 → 原型含义

| 渠道与证据范围 | 身份、资料或消息事实 | 对这轮原型的约束 |
| --- | --- | --- |
| 微信客服 | 回调先通知，再通过 sync_msg 拉取真实消息；发送目标包括 external_userid 和 open_kfid。发送 API 仅适用于文档规定的“新接入待处理/由智能助手接待”状态；用户主动发消息后 48 小时内最多回复 5 条，再次来信可再次下发；API 成功不代表最终送达，仍会有发送失败事件。[S1][] [S2][] | 显示明确的微信客服账号；回复资格包括会话状态、时间、条数。原型中的“已发送”不要等同“已送达”，应包含异步失败样例。DUDU 坐席与微信平台的“接待人员状态”不是同一个概念。 |
| 微信客服资料 | 获取资料要求最近 48 小时内进入会话或发过消息。第三方和代开发应用不能取得头像，性别统一为 0；UnionID 有绑定与应用类型限制，第三方不可直接取得。[S3][] | 至少展示一位昵称存在、头像和其他资料缺失的来访用户；不得把“资料未取得”展示成“新用户”或自动补出地域、手机号。 |
| 公众号（此处证据为服务号树） | FromUserName 是 OpenID，对每个服务号唯一。用户发消息触发 5 条/48 小时；特定菜单点击、关注、扫码各为 3 条/1 分钟；菜单点击不会产生“用户发消息”的额度。[S4][] [S5][] | 不能把微信客服、服务号、小程序的规则合成一个“微信”规则；期限与剩余条数须分别表达。订阅号不能仅凭这份服务号证据标记为能力相同。 |
| 小红书小程序 | 接收字段含 FromOpenId、ToAppId；入站有 text/image/video/item/order。商品、订单消息给的是外部 ID，并不等于完整订单详情。官方原文为“开发者收到请求后 48h 内可以使用发送客服消息接口进行回复”；发送页列出 text/image/item/order 的对应字段。[S6][] [S7][] | 来源写“小红书小程序”，不能由此声称已接入专业号私信。统一消息卡保留商品/订单类型与已知 ID；不能假设收到视频就一定能发送视频，也不能把订单消息变成虚构的订单管理能力。 |
| 抖音企业号私信 | 入站有 conversation_short_id、消息 index、user_infos（open_id/nick_name/avatar），有文本、图片、视频及渠道卡片；另有按会话/index 对齐的已读事件与撤回事件。[S8][] [S9][] [S15][] | 会话外观可以统一；已读仅在确实收到事件时展示。来源视频/广告等资料只有实际取得才显示。本研究没有完成抖音发送窗口和全部发送权限的复核，不能标“无限制回复”。 |
| WhatsApp Cloud API | 仓库已摄取 contacts.profile.name、wa_id、来源号码元数据；用户来信开启/刷新 24 小时客服窗口，非模板回复受其约束；出站状态有 sent/delivered/read/failed，发送响应与状态回调分离。[S10][] [S11][] [S14][] | 输入框展示“可自由回复/窗口已结束”等能力状态；模板是额外能力，若本轮未实现，就明确等待用户新来信。不要把 WhatsApp ID 无条件当作可拨打手机号，也不要拿它自动合并其他渠道身份。 |
| Telegram | User.id 是标识；first_name 存在，last_name、username、language_code 均可缺失。普通 Bot 的 sendMessage 成功返回 Message；Business Bot 的 can_reply 特别限定最近 24 小时有入站消息的私聊，并有独立权限。[S12][] [S13][] [S16][] | 普通 Bot 与 Business Bot 的接入模式必须保留，不能套一个通用倒计时。“把来信标为已读”的权限也不是“对方已读了我的回复”的证据。 |

小红书 48h 的句子位于接收说明 [S6][]，发送接口页 [S7][] 没有再次写该规则；本轮已在 [S6][] 正文复现，不能因单看发送页而丢掉窗口。

## 统一的来访用户展示，不自动统一身份

以下是**从渠道字段推导的原型约束**，不是最终后端模型或跨渠道身份系统设计。

1. **一种访客行、一种消息时间线、一种资料侧栏。** 昵称是主识别；来源标签同时保留渠道与接入账号，例如“公众号 · 嘟嘟服务号”“小红书小程序 · 品牌旗舰店”。渠道图标与颜色是辅助线索，不能让坐席只靠颜色识别。
2. **把展示身份与发送地址分开。** 原型数据至少保存接入上下文、渠道内来访标识和会话标识；发送动作绑定当前会话的完整目标，不能从昵称或当前列表位置推导。不同来源的同名/同头像用户默认是不同身份。[S1][] [S5][] [S6][] [S8][] [S14][] [S12][]
3. **缺失资料要有明确语义。** “渠道未提供”“获取失败”“尚未填写备注”是三种情况。缺头像使用稳定的文字头像；缺昵称使用稳定短号。未取得的电话、地区、时区、会员身份和跨渠道历史不做推测。[S3][] [S6][] [S12][]
4. **侧栏先服务当前对话。** 最小内容为显示名、来源渠道/账号、当前已知资料、最近消息时间；入口页面、来源视频和历史接待仅在有数据时补充。来源字段与人工备注应能辨别，避免把坐席备注误认成渠道事实。
5. **保留四种不同的状态。** 坐席是否看过来信、是否轮到坐席回复、出站投递是否成功、当前渠道是否允许继续回复，彼此独立。“未读”不能代替“待回复”，“已读”不能代替“会话已处理”。

来源身份如果将来要关联，应另设有证据的确认流程。本轮不提供自动合并。Intercom 也将潜在重复联系人、查看匹配依据、预览合并和确认作为不同步骤；它并不支持所有渠道任意合并。[C2][]

## 消息聚合应做到什么程度

- **统一表现层**：同一套气泡间距、时间、方向、媒体预览、发送状态与失败重试入口；文本、图片、音频、视频、文件、链接、位置、引用/渠道卡片保留可辨别的类型。
- **接收与发送能力分开**：渠道能推送的类型不一定都能由 DUDU 发送，发送按钮按接入能力开放。以小红书入站 video 与发送页字段差异为直接例子。[S6][] [S7][]
- **不损失渠道卡片的含义**：商品卡、订单卡、留资卡在统一卡片壳中呈现已知内容；只取得 ID 就展示 ID 与类型，不编造价格、订单状态和可办理动作。[S6][] [S8][]
- **未知类型有可读兜底**：显示“暂不支持展示的渠道消息”与已知时间/来源；只有具备真实可用链接时才提供“在来源查看”，不能让按钮成为空承诺。
- **状态保留证据等级**：发送中、已受理/已发送、已送达、已读、失败按实际证据推进；缺少送达/已读能力时省略相应确认，不渲染通用双勾。失败消息留在原位置，重试仍绑定原来的目标。[S1][] [S9][] [S10][] [S16][]
- **原型中的时间和额度是演示数据**：明确模拟“还可回复 2 条”“剩余 18 分钟”“窗口已结束”等状态；生产值须来自真实接入状态，不能仅靠客户端时钟或对所有渠道写死一个规则。

## 三个成熟工作台的官方先例

| 官方来源（本轮已读） | 文档明确描述的行为 | 可以借鉴、但仍需验证的方向 |
| --- | --- | --- |
| Zendesk：About the Zendesk Agent Workspace [C1][] | 多渠道在同一工单界面处理；客户上下文和互动历史在右侧；会话新消息通常在底部。 | “队列—对话—资料”具有成熟先例；这不证明 DUDU 必须做成工单，也不证明侧栏越多越好。 |
| Intercom：The Inbox explained [C2][] | Inbox 集合会话与上下文；Ctrl/⌘K 提供可搜索操作；支持聊天/表格布局、筛选视图；右侧可看近期会话；重复身份有匹配依据、预览和确认。 | 为高频动作提供可发现的捷径；通过队列视图应对多会话，不必用平台分栏；本轮先测试聊天视图即可。 |
| Chatwoot：Working with keyboard shortcuts [C3][] | 快捷操作包括打开/解决会话、切换侧栏等；Win/⌘ + / 可以打开快捷键清单，也可从个人菜单进入。 | 快捷键需要界面入口与鼠标等价动作；不要求新坐席先背命令才能接待。 |

这些帮助文档提供产品设计先例，未提供本项目的完成时长、误发率或新手学习成本数据。

## 原型假设：值得让用户实际试用的交互

1. **按下一步动作组织队列。** 统一队列以待回复、等待对方、手动关注等会话状态为主；渠道是标签/筛选项。测试坐席能否不切换平台视角就找到下一位需要回复的人。
2. **每段会话独立保存草稿。** 切走再回来恢复文本与附件，列表有轻量草稿提示。多个同名访客和两个有草稿的会话要同时出现在样例中。
3. **发送目标紧邻输入框。** 用“回复给 小雨 · 抖音 / 品牌旗舰店”建立固定位置的身份提示；切会话时消息、资料、草稿、目标同步切换。常规发送不增加逐次确认弹窗。
4. **新消息不抢焦点。** 更新计数和行摘要，保留正在输入的会话、光标和阅读位置；新来信不能把列表自动选中项变成发送目标。正在看旧消息时以“有新消息”入口返回底部。
5. **连续接待由坐席推进。** “下一位待回复”提供明确按钮和可发现的快捷键；回复后保留当前对话，另用可选的“发送并下一位”测试效率与误操作的取舍。进入下一位不代表自动结束上一段会话。
6. **阻断原因贴近动作。** 过期、额度耗尽、权限不足、附件不支持和发送失败用简短具体文案呈现；提供真实可用的下一步。读回执缺失不能显示为失败。
7. **键盘不干扰写作。** 快捷切换只在适当焦点下工作；中文输入法候选确认不能触发发送；所有主要操作也有鼠标入口。每个版本使用相同语义，才能比较布局而不是重新学操作。

上述草稿、固定发送目标、不抢焦点和“下一位”都是待验证的设计假设；来源文档不能替代实际误发保护测试。

## 这轮原型最少要覆盖的场景

| 演示任务 | 要观察的结果 |
| --- | --- |
| 从混合渠道队列找到一位急需回复的来访用户 | 能同时说清访客、渠道和接入账号；不必进入多个平台分组。 |
| 给 A 写半条回复，切到同名 B 查看图片，再返回 A | 两段草稿独立，图片可读，恢复后发送目标仍为 A。 |
| 正在回复时另一渠道涌入 3 条消息 | 输入焦点与目标不变；新来信可被发现，且不会挤走当前会话。 |
| 遇到没有头像/电话的微信客服来访用户 | 能继续沟通，也能区分“未提供资料”和“加载失败”。 |
| 遇到窗口结束、条数耗尽或发送后失败 | 能解释为何不能继续自由回复、知道可用下一步；不会误把消息当作已送达。 |
| 收到只有订单 ID 或未知类型的消息 | 看得懂消息含义和来源，不误以为已经取得完整订单资料。 |

比较不同版本时记录：完成任务的切换次数、找错/发错目标次数、草稿丢失次数，以及坐席解释状态是否正确。先收观察结果，再决定默认布局和快捷方式。

## 尚未解答、不能写成产品承诺的部分

- 各渠道实际申请到的接入形态、账号权限和出站能力，尤其是抖音发送约束、公众号订阅号与服务号的差别。
- WhatsApp 本轮旧发送页虽返回 HTTP 200，但未取得可用正文；窗口和回执结论沿用已核验仓库快照。[渠道笔记](../channels/whatsapp.md)中计费争议不进入此次原型。
- 是否存在可授权使用的跨渠道身份关联证据；同名、头像或推测手机号均不构成本轮自动合并依据。
- 这轮不验证真实连接、送达、素材上传和历史拉取；不延伸订单办理、CRM、AI 自动接待或所有平台功能。

## 来源与快照索引
官方链接已逐条附于结论。仓库快照对应：[微信客服](../channels/wecom.md)、[公众号](../channels/wechat-mp.md)、[小红书](../channels/xiaohongshu.md)、[抖音](../channels/douyin.md)、[WhatsApp](../channels/whatsapp.md)、[Telegram](../channels/telegram.md)。


[S1]: https://developer.work.weixin.qq.com/document/path/94677 "微信客服：发送消息（本轮直读）"
[S2]: https://developer.work.weixin.qq.com/document/path/94670 "微信客服：接收消息和事件（沿用 wecom.md §2.6）"
[S3]: https://developer.work.weixin.qq.com/document/path/95159 "微信客服：获取客户基础信息（本轮直读）"
[S4]: https://developers.weixin.qq.com/doc/service/guide/product/kf/intro.html "服务号客服消息介绍（本轮直读）"
[S5]: https://developers.weixin.qq.com/doc/service/guide/dev/push/ "服务号消息与事件推送介绍（沿用 wechat-mp.md §6）"
[S6]: https://miniapp.xiaohongshu.com/doc/DC897608 "小红书：接收消息与发送消息（本轮直读）"
[S7]: https://miniapp.xiaohongshu.com/doc/DC234367 "小红书：发送客服消息 API（本轮直读）"
[S8]: https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook "抖音：接收私信消息事件（沿用 douyin.md §2.2）"
[S9]: https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/message-read-webhook "抖音：消息已读事件（沿用 douyin.md §5.13）"
[S10]: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status "WhatsApp：消息状态（沿用 whatsapp.md §2.1/§5.2）"
[S11]: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/ "WhatsApp：发送消息指南（沿用 whatsapp.md §6）"
[S12]: https://core.telegram.org/bots/api#user "Telegram：User（本轮直读）"
[S13]: https://core.telegram.org/bots/api#businessbotrights "Telegram：BusinessBotRights（本轮直读，同页 sendMessage）"
[S14]: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples/ "WhatsApp：消息载荷示例（沿用 whatsapp.md §5.1）"
[S15]: https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-withdraw "抖音：私信消息撤回事件（沿用 douyin.md §5.12）"
[S16]: https://core.telegram.org/bots/api#sendmessage "Telegram：sendMessage（本轮直读）"
[C1]: https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace "Zendesk：About the Zendesk Agent Workspace（本轮直读）"
[C2]: https://www.intercom.com/help/en/articles/6258745-the-inbox-explained "Intercom：The Inbox explained（本轮直读）"
[C3]: https://www.chatwoot.com/hc/user-guide/articles/1677698168-working-with-keyboard-shortcuts "Chatwoot：Working with keyboard shortcuts（本轮直读）"
