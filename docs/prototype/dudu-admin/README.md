# DuduAdmin 运营后台原型

AI Studio 生成的可交互原型，用于探索运营方管理后台：企业开通与维护、六位企业 ID 查重检测、运营概览、资源汇总与操作审计日志，支持开发与生产接口环境切换。原型仅验证交互方向，正式实现见 [Admin 设计资料](../../design/dudu-admin/README.md)与仓库根 `dudu-admin/` 子项目

## 运行

原型为 Vite + React 19 + Tailwind 4 项目，生成式能力依赖 Gemini API

1. 安装依赖：`npm install`
2. 在 `.env.local` 配置 `GEMINI_API_KEY`
3. 启动开发服务：`npm run dev`，访问 http://127.0.0.1:3000/

原型任务期间业务代码只读，迭代仅修改本目录
