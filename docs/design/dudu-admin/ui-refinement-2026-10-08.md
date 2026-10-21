# DuduAdmin 界面精修（2026-10-08）

路径基准：本文代码路径相对 `dudu-admin/`；预览脚本的启动命令相对仓库根

## 已确认方向与实现

保留珊瑚橙品牌和现有组件体系，精修后台的密度、对齐和层次。用户确认去掉内容区重复的大标题与说明，并进一步压缩运营概览统计区

- 顶部导航统一承担页面标题，保留语义化 h1；内容区直接进入操作和数据
- 运营概览的四张大卡片与独立按钮行合并为统计栏。1440×960 下实测高 70px；390×844 下统计排成两列，操作自然换行。加载、失败不显示伪造的零值
- 查询页面统一工具栏。操作记录的企业 ID 可见标签隐藏，输入仍有可访问名称；占位符说明搜索用途。输入校验、清除错误、草稿重置和无结果清除筛选完整保留
- 统一浅灰工作区、表格表头、单元格间距、轻阴影、等宽 ID、状态标识、导航选中状态和键盘焦点。企业名称保留最小阅读宽度，窄屏表格在容器内滚动
- 个人账号、创建抽屉、详情及编辑表单沿用现有结构，调整分组、间距、选填提示及按钮层级

主要实现入口：`src/index.css`、`src/components/admin-layout.tsx`、`src/components/query-view.tsx`、`src/components/company-filters.tsx` 和各页面。未新增依赖，未修改生成的 UI 组件源文件或后端契约

## 验证

- `yarn check:all`：Biome、TypeScript 通过，17 个测试文件、79 项测试通过
- `yarn build`：生产构建通过
- 桌面与手机视口实际检查：运营概览、企业管理、操作记录、个人账号、导航抽屉、创建与编辑弹层、企业详情；概览和企业列表无页面横向溢出
- 实际交互检查：搜索与 Enter 提交、非法企业 ID 提示与重置、操作类型筛选、分页、详情跳转资源、弹层取消；概览空数据及失败展示正常
- 截图使用下述隔离固定数据；业务写入、密码变更与部署未执行。早期真实服务只进行登录和读取，业务数据为空。视觉验收不代替后端联调

## 当前截图

- [桌面运营概览](ui-after-overview.jpg)
- [手机运营概览](ui-after-overview-mobile.jpg)
- [企业管理](ui-after-companies.jpg) / [手机企业管理](ui-after-companies-mobile.jpg)
- [操作记录](ui-after-logs.jpg)
- [个人账号](ui-after-account.jpg)
- [企业详情](ui-after-company-detail.jpg)
- [编辑企业资料](ui-after-edit-company.jpg)
- [概览失败状态](ui-after-overview-error.jpg)

`ui-before-*.jpg` 是本轮调整前的参考截图，其余早期设计文件保留为历史材料

## 可复现预览

使用已安装的 dudu-admin 依赖，在仓库根运行

```powershell
node docs/design/dudu-admin/ui-review-server.mjs
```

打开 `http://127.0.0.1:5175/`，以任意测试登录名与密码登录。`?scenario=empty#/overview` 和 `?scenario=error#/overview` 分别展示空数据和失败

脚本仅绑定本机，固定 24 家虚构企业及操作记录，不连接数据库，拒绝业务写操作，独立于正式入口及构建。完成检查后关闭该进程
