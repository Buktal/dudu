# DuDu 项目官网

官网源码位于仓库根目录 `website/`，不是 Git 子模块，不依赖服务端或构建工具。

- 中文首页：`index.html`；英文页面：`en.html`。
- 使用指南：`guides/index.html`、`guides/index.en.html`；部署、接待流程、微信公众号、Telegram、WhatsApp 与 MockPulse 各有中英文独立页面。
- 指南复用官网主题与字体，布局样式为 `guides/guide.css`，仅加载 `theme.js`，不加载首页场景脚本。
- 模块介绍：`products/` 下 Desk、Console、Admin、MockPulse、Server 的中英文独立页面；使用场景、主要功能、截图或流程、使用条件及文档入口。
- 公共样式：`style.css`；导览：`demo.css` / `demo.js`；消息动画：`scene.css` / `scene.js`；导航：`navigation.css` / `navigation.js`；模块页样式：`products/product.css`。
- 原生交互：`site.js`（产品页签与图片预览）；`demo.js` / `demo.css`（坐席接待导览）。首屏保留消息流动画；产品展示区统一为每项一张主图，独立介绍页通过顶部产品菜单与首页入口进入。
- 主题：`theme.js` 在首次绘制前应用外观，`theme.css` 提供明亮主题及公共表面色；消息动画与导览同步切换明暗外观；产品截图统一采用浅色素材，以保持跨模块一致性。
- 发布工作流：仓库根 `.github/workflows/pages.yml`。
- 发布地址：<https://buktal.github.io/dudu/>。

## 本地预览

在仓库根目录执行 `python -m http.server 5190 --directory website`，访问 <http://localhost:5190/>。修改内容时同步中英文页面，保持相对资源路径，以兼容 GitHub Pages 的 `/dudu/` 子路径。官网不调用业务 API，不收集访客数据，不嵌入统计脚本。

## 自动发布

仓库 Settings → Pages 的 Source 设置为 GitHub Actions。推送 `website/` 或工作流修改到 `main` 后自动发布，也可以手动运行 Publish project website。工作流只上传 `website/`，不上传仓库其余内容。

## 展示素材来源

截图为开发验收与本地预览材料，并非线上客户数据。页面保留来源说明，更新截图时同步替换中文与英文说明。历史布局不作为当前业务能力的依据，当前范围见[功能图谱](../docs/features/README.md)。

| 文件 | 原始文件（相对仓库根） | 来源 |
| --- | --- | --- |
| `assets/desk.png`（保留社交预览地址） | `docs/design/dudu-console/qa-desk-live-1440.png` | 2026-10-21 本地服务端联调，测试数据 |
| `assets/console-showcase.webp` | `docs/design/project-website/console-showcase.png` | 2026-10-21 当前正式组件、已有隔离浏览器夹具、浅色员工管理；未连接业务数据库 |
| `assets/admin.webp`（原始 JPG 保留） | `docs/design/dudu-admin/ui-after-overview.jpg` | 2026-09-30 历史布局验收，示例数据 |
| `assets/desk-daylight-calm.webp` | `docs/design/dudu-desk/palette-refresh/daylight-calm.jpg` | 2026-10-09 正式组件的历史布局，开发数据 |
| `assets/mockpulse-editor.webp` | `docs/design/project-website/mockpulse-editor.png` | 2026-10-21 当前源码网页预览的事件编辑局部；Tauri 本地接口不可用，未验证存储、签名和发送 |
| `assets/mockpulse.svg` | `mock-pulse/public/logo.svg` | MockPulse 项目标识；未使用原型截图代表当前应用 |
| `assets/dudu.svg` | `dudu-desk/public/logo.svg` | DuDu 项目标识与站点图标 |

## 接待导览与可访问性

首页优先面向评估产品的使用者：项目定位与消息流演示、接待导览、各应用职责、渠道范围、部署与参与入口。渠道按微信生态、国内平台和国际平台分组；消息能力、接入条件和使用方式直接展示，不折叠。README 提供简明介绍与按目标阅读的入口；使用指南和技术文档分别承载操作步骤和实现依据。

`#demo` 在当前页面使用固定示例数据，覆盖微信公众号、Telegram、WhatsApp 三种场景。可点击任一步骤，或使用固定位置的上一步／下一步完成会话查看、模拟回复和资料查看；界面内仍保留原操作。导览预览区域固定高度，内容在区域内滚动，切换步骤不改变页面高度。切换渠道或重新开始会清除本页模拟状态；主题切换保留当前导览进度。导览不调用业务 API，不采集输入，不保存回复或来访资料，不代表真实在线试用。简化界面不包含完整应用的全部控件。

全部操作使用原生按钮，具有选中、展开、禁用与状态播报语义；分步按钮保留操作焦点，使用明确的下一步动作名称；可直接跳转任一步骤。产品页签支持方向键与 Home / End，原图预览支持 Escape。无 JavaScript 时保留全部产品内容、截图和指南，并说明导览不可交互。减少动效设置保留静态展示。

新增渲染图片使用 WebP，来源截图归档于设计目录；渠道图形按统一白色容器显示，未取得合适图形的渠道使用文字标识。来源、固定版本及许可见 [assets/channels/README.md](assets/channels/README.md)。图形仅用于识别接入渠道，不代表平台背书。

本次改版记录、参考来源和验收见 [产品导览改版](../docs/design/project-website/product-tour.md)。页面为静态 HTML/CSS/JavaScript，无构建依赖；验证脚本语法、相对资源、锚点、双语内容、响应式布局与实际交互，无需运行业务子项目测试。

## 搜索与内容维护

每个公开页面具有独立标题、描述、canonical 与中英文 hreflang 配对；首页使用 SoftwareSourceCode 结构化数据，指南使用 CollectionPage / TechArticle。`sitemap.xml` 列出全部 28 个页面，`robots.txt` 声明其公开地址。增加页面时同步站内导航、语言对应关系和 sitemap，不填写虚构的评分、下载量或发布时间。

README 和官网描述统一围绕开源、自托管、多渠道客服及统一接待；渠道名称仅覆盖当前实现。指南说明具体任务并链接源码契约，字段、权限或部署行为变化时同步核对。本文路径均相对仓库根 `website/`。

Google Search Console 与 Bing Webmaster 的站点所有权验证和 sitemap 提交需在对应站长账号中完成；提供 sitemap 不等于已提交或已被索引，也不保证排名或 GitHub 推荐。

## 模块页维护

模块内容的唯一维护源为仓库根 `docs/design/project-website/module-content.json`，生成脚本为同目录 `build-product-pages.py`。在仓库根执行 `python docs/design/project-website/build-product-pages.py`，同步生成 10 个模块页面、公共产品菜单和 sitemap。首页和指南正文仍就地维护；不要直接修改生成的模块页正文。产品页面使用本地资源路径，兼容 GitHub Pages 子路径。

公开页面与 README 只展示用户需要的产品信息；截图日期、验收过程与详细来源保留在本说明和设计记录中，不放入营销文案。各模块截图区域统一比例、数量与浅色基调；页签摘要预留相同高度，切换不改变整页长度。

全站顶部导航保持相同顺序与交互：产品、演示、文档、语言、外观与 GitHub；文档目录和模块目录放在页面内部。顶部保留当前位置提示与滚动可见性。明亮主题沿用 DuDu 珊瑚橙品牌，暗黑主题保持原配色；核心文字与按钮对比度记录见设计目录。

演示使用独立页面 `demo.html` / `demo.en.html`，全站演示入口和选中状态与实际页面一致。首页保留导览简介与入口。明亮主题采用中性白和灰色正文，珊瑚橙仅用于品牌动作与局部提示；步骤使用分段背景而非长分隔线。
