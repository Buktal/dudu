# DuduDesk 原型的集成说明

本轮确定一个工作台提供自在、并肩、速答三种接待方式，保留四款已认可配色，追加岩墨灰、深海蓝、松柏绿。模式和配色是两个独立偏好：模式改变布局，主题统一改变整个工作台的颜色。

## 交互与状态

- 顶部分段按钮只切换接待布局，不增加左侧业务导航层级。
- 当前回复对象独立于并肩模式的主接待和固定访客，切换模式不会互换左右窗。
- 消息、草稿、标签、备注按访客身份集中管理，所有视图读取同一份数据。
- 主题入口位于右上角，基于已安装的 Base UI Popover / ToggleGroup 和现有 shadcn Button 组合；键盘焦点、外部点击、Esc 和收起后焦点回归由组件处理。
- 仅持久化主题偏好，存储键为 `dudu-desk-prototype.palette`。显式 URL 优先，其次本地偏好，默认青杏。正式集成时可接入应用的用户偏好存储。

## 样式唯一入口

`src/index.css` 直接导入 `../../../../dudu-desk/src/index.css`，复用 Tailwind、shadcn、字体、基础 reset、亮暗主题映射和圆角 token。原型在 `[data-palette]` 作用域里追加七组浅色主题值，不重建全局组件样式。

| 内容 | 当前落点 | 集成方式 |
| --- | --- | --- |
| shadcn 基础样式 | 正式 Desk 的 `src/index.css` | 保留正式项目唯一入口，不复制另一份 reset 或 `@theme` 映射 |
| 主题颜色 | 原型 `src/index.css` 的 `[data-palette]` 块 | 将选用的标准变量覆盖合入正式入口 |
| 主题元数据与读写 | `src/lib/theme-palette.ts` | 使用正式应用偏好存储，保留合法值校验 |
| 主题选择器 | `src/components/theme-picker.tsx` | 作为共享组件，通过 `value` / `onChange` 接收偏好 |
| 接待布局和工具条 | `src/variants*`、`src/reception-toolbar.tsx` | 迁入 `features/inbox/components/` |
| 会话和回复逻辑 | `src/features/inbox/` | 沿正式项目 feature 分层接入真实 API 和 store |
| 演示工具 | `src/prototype-controls.tsx`、`styles/prototype.css` 的演示部分 | 留在原型中，不迁入产品 |

颜色直接使用 shadcn 的 `background / foreground / card / popover / primary / secondary / muted / accent / border / input / ring / sidebar-*`，并使用对应的 foreground token；主题数增加时无需新增布局 CSS。仅补充 `success` 和 `warning` 两对状态 token。圆角沿用 `--radius` 与 shadcn 的派生档位。

布局 CSS 分为 `workspace / inbox / chat / messages / composer / quick-reply / visitor-info`，每个文件包含自身的响应式规则；`prototype.css` 承载演示工具和通用弹层外观。正式集成时，通用弹层可改用正式项目的 shadcn Dialog / Toast，演示部分留在原型。已移除折页实现、旧底部模式与配色预览入口、分散的覆盖文件。

主题作用域必须覆盖浮层：当前主题选择器通过 Portal 渲染，因此 Popup 同样带 `data-palette`。正式项目若把主题应用到 `html`，浮层将自然继承；采用局部工作台作用域时继续传入主题，避免弹出层颜色回到默认值。

## 正式集成时

1. 保留正式 Desk 的依赖、`components.json` 和 CSS 基础入口；原型的工具链、`@desk` 别名及 `@source` 外部文件扫描只用于此目录，不整体复制。
2. 迁入选定的 feature 组件与布局规则；共享 UI 直接引用 `@/components/ui`，CLI 生成的组件继续只经 CLI 更新。
3. 将主题 token 合入唯一 CSS 入口，沿用一套语义变量。三种模式使用相同的颜色，不为某个布局维护独立配色。
4. 消息发送、回复资格和回执以真实 API 契约实现；沿用按访客存草稿、主窗与固定窗独立的状态规则。原型数据和模拟定时器不作为生产实现。
5. 验证草稿与回复对象、模式切换、主题保存、Portal 主题继承、窄窗口和减少动态效果，再执行正式项目要求的检查。

现有品牌 SVG 保持原样。主题选择不改变渠道徽标含义；状态提示沿用独立语义色。
