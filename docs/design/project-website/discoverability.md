# 项目展示与搜索入口

2026-10-21。路径基准：本文源码路径相对仓库根。此次只修改展示内容、静态官网与 GitHub 仓库元信息，不改业务功能

## 内容结构

- `README.md` 默认中文，`README.en.md` 提供等价英文定位与指南入口
- `website/guides/` 包含指南概览及部署、接待流程、微信公众号、Telegram、WhatsApp、MockPulse 六类双语指南。正文针对实际操作，不按关键词重复生成内容
- 字段依据 `docs/design/dudu-console/channel-fields.md`；部署依据各子项目 README 与配置；功能范围依据 `docs/features/`。详细契约保持在原入口，指南引用它们
- 保留现有官网投影场景与主题设计；指南沿用冷白／深蓝底色、青色链接、正文与代码字体。桌面侧栏、移动横向导航减少正文之前的占屏

## 搜索信号

About 统一说明开源、自托管、统一接待、企业权限和代表渠道。Topics 在原有 14 项基础上增加 customer-support-platform、wechat、telegram、whatsapp，共 18 项，均有实现依据

官网 16 个页面具备独立描述、canonical、双语 hreflang 和结构化数据；sitemap 覆盖全部页面。首页、README 与指南互链。未虚构版本发布、评分、使用量或生产平台验收结果。未向 Google Search Console / Bing Webmaster 提交，后续需要所有者站长账号验证

## 验证

静态校验覆盖 16 页、508 个 HTML 链接及资源引用，检查本地目标、片段锚点、源码引用目标、每页唯一 h1、重复 ID、canonical、JSON-LD 与 sitemap 一致性，均通过。运行 `git diff --check`。仅文档与静态页面改动，不运行业务后端或前端套件

实际浏览器检查桌面明亮主题、移动英文暗黑主题、双语导航与跨页主题记忆；移动页无全页横向溢出，代码块保留内部滚动。截图：[指南首页](guides-desktop.png)、[移动部署指南](guides-mobile.png)
