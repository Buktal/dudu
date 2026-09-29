# DuduDesk 主题设计记录

本目录保存主题配色探索、界面对照与当时的检查结果。当前应用主题以 [正式样式入口](../../../../dudu-desk/src/index.css)及[主题注册表](../../../../dudu-desk/src/lib/theme-palette.ts)为准。

## 资料

| 文件 | 内容 |
| --- | --- |
| [themes-overview.png](themes-overview.png) | 十二主题的界面对照 |
| [base-colors.png](base-colors.png)、[bases.json](bases.json) | 主题基色展示与输入数据 |
| [hierarchy-before-after.png](hierarchy-before-after.png) | 界面层级调整对照 |
| [roles.css](roles.css)、[palette-audit.json](palette-audit.json) | 脚本生成的设计配色与检查结果 |
| [browser-theme-checks.json](browser-theme-checks.json)、[selection-style-checks.json](selection-style-checks.json) | 浏览器主题及选中状态检查记录 |

其他 PNG 保留不同主题、布局和调整前后的截图。

## 复现脚本

从仓库根运行，复用 DuduDesk 已有依赖：

```powershell
# 读取基色并输出转换结果
node docs/design/dudu-desk/themes/inspect-colors.mjs
# 重新生成本目录的 roles.css 与 palette-audit.json
node docs/design/dudu-desk/themes/build-palettes.mjs
# 根据保存的截图生成本目录的对照图
& ./docs/design/dudu-desk/themes/make-comparisons.ps1
```

脚本输出保存在本设计目录；正式应用的主题更新仍需在应用源码中进行。

返回 [Desk 设计资料](../README.md)。
