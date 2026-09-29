# DuduAdmin 界面生图提示词

状态：仅保留未执行的生图提示词，未生成图片。当前会话未提供内置 image_gen，本机未配置 OPENAI_API_KEY；用户已选择继续 Spec，见 [DuduAdmin 首版前端与数据契约 Spec](https://github.com/Buktal/dudu/issues/68)。本文不是已确认的视觉设计，不能据此确定布局、品牌继承或组件外观。

三张图都以“企业管理”为中心，保持相同功能与示意内容，比较布局、密度和色彩。图片中的企业资料仅用于视觉稿表达，不会作为运行时模拟数据加入正式前端。图中菜单组织属于探索方案，尚未定稿。

## 共同要求

- 用途：ui-mockup，DUDU 运营方使用的 DuduAdmin 纯 Web 管理后台。
- 画面：单张完整、正视的高保真桌面界面，横向 16:10；无设备外壳、透视、宣传标题、外部标注或水印。
- 品牌：沿用项目现有珊瑚橙 D 形气泡标识方向与 DuDu 字标，不重新设计品牌。相关品牌源见 `docs/design/brand/logo-orange/README.md`。
- 功能：运营概览、企业管理、操作记录、个人账号；不添加计费、套餐、订单、聊天、员工明细管理等未确认范围。
- 企业 ID 为六位、不按顺序排列；仅创建前可以选择，企业创建后不可改。
- 使用清晰的简体中文无衬线排版，数字等宽。图片文字必须按提示词准确呈现，避免编造无意义文案。
- 不在产品界面放数据库字段名、SQL、API 路径、演示标签或实现说明。

## A：明亮、轻量的企业管理

目标文件：`admin-concept-a.png`

```text
Use case: ui-mockup
Asset type: high-fidelity DuduAdmin desktop web interface concept
Primary request: Generate one polished flat screenshot of the Chinese DuDu enterprise administration app. Audience: the platform operator opening and maintaining companies. The main job of this page is finding a company or opening a new one.
Composition: 16:10 desktop canvas, slim left navigation, restrained top toolbar, spacious main company table. Crisp application design, not a marketing webpage. Use a small existing-style coral-orange D chat-bubble brand mark with DuDu text, no ornate logo invention.
Palette: porcelain #F8FAFC, white #FFFFFF, graphite #242A35, light border #E5E9EF, coral #F2785C, soft coral selection #FFF0EB. Restrained rounded corners, minimal shadows, precise alignment.
Typography: clean Simplified Chinese sans-serif like HarmonyOS Sans SC, medium-weight headings, generous readable body text, tabular numbers for IDs.
Text and content: navigation labels exactly “运营概览”, “企业管理”, “操作记录”, “个人账号”; 企业管理 is selected. Main heading “企业管理”. Primary button “创建企业”. Search placeholder “搜索企业名称或 ID”. Filter “全部状态”. Table headings “企业名称”, “企业 ID”, “联系人”, “状态”, “创建时间”, “操作”. Use only three sample rows: “云川科技 / 582713 / 陈晨 / 启用 / 2026-09-28 / 查看”, “禾木设计 / 316824 / 林悦 / 启用 / 2026-09-27 / 查看”, “青屿文化 / 749162 / 周宁 / 停用 / 2026-09-25 / 查看”. Top right small account menu “Admin”. Bottom-left brand area quiet and compact.
Constraints: accurate Chinese labels; plausible usable table widths; no decorative hero, no revenue metrics, no charts unrelated to companies, no employee/channel detail management. No browser device frame or perspective. This is a visual concept only.
```

## B：深色导航与紧凑工作区

目标文件：`admin-concept-b.png`

```text
Use case: ui-mockup
Asset type: alternative high-fidelity DuduAdmin desktop web interface concept
Primary request: Generate one flat, realistic Chinese enterprise administration screenshot for DuDu. Explore a compact professional layout for frequent company maintenance with a dark navigation rail and a bright, disciplined work area. Same business scope as a company management app, not commerce or chat support.
Composition: 16:10 desktop canvas. Narrow ink-blue sidebar, thin top toolbar, company search and filters tightly grouped above a full-width table. Small coral DuDu chat-bubble brand mark. Strong alignment, economical whitespace, clearly distinguished table header and selected row; modest 6px corner radius. The signature is a quiet dense work surface with exceptionally legible hierarchy.
Palette: navigation #1C2C40, main background #F3F6FA, surface #FFFFFF, text #25374D, action blue #356FC1, small brand coral #F2785C, border #DFE6EF.
Typography: crisp Simplified Chinese sans-serif like Source Han Sans, medium-weight interface labels, tabular IDs; avoid oversized dashboard numbers.
Text and content: left navigation exactly “运营概览”, “企业管理”, “操作记录”, “个人账号”; 企业管理 selected. Main heading “企业管理”. Button “创建企业”, search “搜索企业名称或 ID”, filter “全部状态”. Table headings “企业名称”, “企业 ID”, “联系人”, “状态”, “创建时间”, “操作”. Three rows: “云川科技 / 582713 / 陈晨 / 启用 / 2026-09-28 / 查看”, “禾木设计 / 316824 / 林悦 / 启用 / 2026-09-27 / 查看”, “青屿文化 / 749162 / 周宁 / 停用 / 2026-09-25 / 查看”. Small Admin account menu in upper right.
Constraints: accurate Chinese; single coherent screenshot; no billing, sales, revenue, tickets, chat panel, mock-data label, code identifiers, decorative gradients, device mockup or watermark. Keep interface practical and visually distinct from a spacious white-and-coral version.
```

## C：创建企业操作的聚焦布局

目标文件：`admin-concept-c.png`

```text
Use case: ui-mockup
Asset type: high-fidelity DuduAdmin company-creation interface concept
Primary request: Generate one realistic Chinese DuDu administration screenshot showing the company-management workspace with a focused “创建企业” side panel open. Make the enterprise ID selection flow immediately clear and usable. This concept compares a focused task panel against a full-page maintenance layout.
Composition: 16:10 desktop canvas, white shell with a compact horizontal primary navigation, quiet company table on the left and a generously sized white creation panel on the right, roughly 44% width. Thin divider, restrained shadow, no heavy modal dimming. Small coral D chat-bubble mark and DuDu wordmark. Field labels above fields; consistent spacing and generous input targets. No angled device presentation.
Palette: background #F5F7F9, surfaces #FFFFFF, text #28333D, muted text #7A8691, accent teal #207B78, existing brand coral #F2785C, borders #E1E7EB. Use a calm professional sans-serif Chinese typeface and tabular numerals for the company ID.
Text and content: navigation “运营概览”, “企业管理”, “操作记录”, “个人账号”. Creation panel title exactly “创建企业”. First field label “企业 ID”; value “582713”; adjacent buttons “随机生成” and “检测”; small green result “当前可用”. Helper “创建后不可修改”. Following fields “企业名称”, “联系人”, “联系方式”, “备注”. A divider then heading “初始企业管理员”; field “登录名” with value “admin”; field “初始密码” with masked bullets and an eye icon. Sticky footer buttons “取消” and “创建企业”. Keep company name and contact fields empty with neutral placeholders. Under ID availability show a short quiet line “提交时将再次确认 ID 是否可用”. Top-right account menu “Admin”. Background table has only a few subdued company rows with random six-digit IDs.
Constraints: preserve exact Chinese labels; two distinct ID actions, manual input possible; no extra company-code field; no fixed or auto-increment ID; no company employee or channel management tools; no billing, mock-data notices, implementation jargon, decorative illustrations, watermarks or perspective. Treat administrator credential and field grouping details as visual exploration, not a finalized business spec.
```

## 生成与检查

优先使用内置 image_gen，每张独立生成。若用户明确选择 API 备用方式，再使用 imagegen 技能提供的 CLI，不自行另写调用脚本。生成后检查中文、表格列、ID 位数、随机与检测按钮、功能边界，并将成品保存到本目录。最终展示实际生成图片，不用代码截图冒充生图。
