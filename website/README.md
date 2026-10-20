# DuDu 项目官网

官网源码位于仓库根目录 `website/`，不是 Git 子模块，不依赖服务端或构建工具。

- 中文首页：`index.html`；英文页面：`en.html`。
- 公共样式：`style.css`；展示素材：`assets/`。
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

页面为纯静态 HTML/CSS。校验项目包括相对资源链接、双语导航、移动布局、键盘焦点以及实际 Pages 发布结果；无需运行业务子项目测试。
