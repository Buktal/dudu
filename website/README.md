# DuDu 项目官网

官网源码位于仓库根目录 `website/`，不是 Git 子模块，不依赖服务端或构建工具。

- 中文首页：`index.html`；英文页面：`en.html`。
- 公共样式：`style.css`；消息流场景样式：`scene.css`；展示素材：`assets/`。
- 原生交互：`site.js`（消息示例、页签、图片预览）；`scene.js`（Canvas 投影、线路与消息动画）。
- 主题：`theme.js` 在首次绘制前应用外观，`theme.css` 提供明亮主题及公共表面色；Canvas 同步切换配色。
- 发布工作流：仓库根 `.github/workflows/pages.yml`。
- 发布地址：<https://buktal.github.io/dudu/>。

## 本地预览

在仓库根目录执行 `python -m http.server 5190 --directory website`，访问 <http://localhost:5190/>。修改内容时同步中英文页面，保持相对资源路径，以兼容 GitHub Pages 的 `/dudu/` 子路径。官网不调用业务 API，不收集访客数据，不嵌入统计脚本。

## 自动发布

仓库 Settings → Pages 的 Source 设置为 GitHub Actions。推送 `website/` 或工作流修改到 `main` 后自动发布，也可以手动运行 Publish project website。工作流只上传 `website/`，不上传仓库其余内容。

## 展示素材来源

截图为开发验收材料，并非线上客户数据。页面保留来源说明，更新截图时同步替换中文与英文说明。历史布局不作为当前业务能力的依据，当前范围见[功能图谱](../docs/features/README.md)。

| 文件 | 原始文件（相对仓库根） | 来源 |
| --- | --- | --- |
| `assets/desk.png` | `docs/design/dudu-console/qa-desk-live-1440.png` | 2026-10-21 本地服务端联调，测试数据 |
| `assets/console.png` | `docs/design/dudu-console/qa-console-live-1440.png` | 2026-10-21 本地服务端联调，测试数据 |
| `assets/admin.jpg` | `docs/design/dudu-admin/ui-after-overview.jpg` | 2026-09-30 历史布局验收，示例数据 |
| `assets/desk-parallel.png` | `docs/design/dudu-desk/workspace-polish/parallel.png` | 2026-09-18 历史布局验收，示例数据 |
| `assets/mockpulse.svg` | `mock-pulse/public/logo.svg` | MockPulse 项目标识；未使用原型截图代表当前应用 |
| `assets/dudu.svg` | `dudu-desk/public/logo.svg` | DuDu 项目标识与站点图标 |

## 消息流演示与可访问性

首屏采用独立网格列，文字与画布不再使用叠放定位；视口不超过 950 px 时转为上下布局。导航栏提供明亮／暗黑切换，首次跟随系统外观，手动选择写入本地存储并跨语言页面保留。存储不可用时仍可在当前页切换。

首屏是浏览器内的消息流示意，不连接业务 API，也不执行真实验签、持久化或渠道发送。所有示例固定可复现；选择渠道后停止自动轮换，以用户选择为准。Canvas 只负责视觉呈现，渠道按钮、示例内容与阶段说明均使用 DOM，支持键盘操作。

动效可暂停，并遵循系统 `prefers-reduced-motion` 设置；暂停时仍可选择渠道，立即展示该示例的结果。指针视差仅用于非触摸指针，页面隐藏或场景离开视口时停止渲染。Canvas 按设备像素比绘制，上限为 2。

产品页签支持左右方向键及 Home / End；图片预览使用原生 dialog，支持 Escape 关闭。JavaScript 不可用时保留完整产品内容、静态消息流说明及原图链接。

页面为静态 HTML/CSS/JavaScript，无构建依赖。校验包括脚本语法、相对资源链接、双语导航、移动布局、消息选择与暂停、页签键盘操作、图片预览和实际 Pages 发布结果；无需运行业务子项目测试。
