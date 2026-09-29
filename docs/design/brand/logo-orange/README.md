# DuDu 珊瑚橙图标

桌面图标使用圆角珊瑚橙底、奶白色 D 形气泡与两个 U 形眼睛。
横版 logo 使用透明底、橙色气泡，分别配深色和浅色字标。

## 2026-09-18 表情比例微调

参考微信图标的留白和表情占比，每个 U 等比缩小 20%，并重新安排间距。
保留 DuDu 的 D 形轮廓、珊瑚橙渐变、圆角背景和字标。

| 参数（256 单位画布内的气泡坐标） | 调整前 | 调整后 |
| --- | --- | --- |
| 单个 U 的路径宽度 | 44 | 35.2 |
| 单个 U 的路径深度 | 22 | 17.6 |
| 桌面图标描边 | 18 | 14.4 |
| 横版 logo 描边 | 16 | 12.8 |
| 两眼中心间距 | 76 | 68 |
| 桌面图标两眼净间距 | 14 | 18.4 |

单眼缩小后，中心略微靠拢，但两条笔画之间的空白反而增大，保证小图标的区分度。
选择 `refinement/balanced.svg` 的比例；另外两种收缩比例保留为设计比较。

## 源文件与产物

- `desktop.svg`：桌面图标源文件，同步到 `dudu-desk/public/logo.svg`。
- `dudu-desk/public/dudu-logo.svg`、`dudu-desk/public/dudu-logo-dark.svg`：透明底横版。
- `desktop-generated/`：Tauri CLI 导出；根目录的 17 个桌面资源同步到 `dudu-desk/src-tauri/icons/`，ICO 同步到 `public/favicon.ico`。
- `desktop-preview.png`：当前图标在浅、深背景下的实际尺寸预览。
- `refinement-preview.png`：本次调整前后及横版预览。
- `refinement/before-*.svg`：本次调整前的快照。
- `refinement/eye-studies.png`：四种表情比例比较。

以上子项目文件路径均相对仓库根；本目录内的设计文件路径相对本目录。

## 重建

从仓库根运行 PowerShell：

```powershell
& ./docs/design/brand/logo-orange/explore-eyes.ps1
& ./docs/design/brand/logo-orange/generate-desktop.ps1
& ./docs/design/brand/logo-orange/preview-refinement.ps1
```

复用仓库现有 Tauri CLI 渲染 SVG，以 .NET System.Drawing 排版预览，无新增依赖。
大图和 16、24、32、48px 实际尺寸均检查；横版按原始 672:192 比例展示。
Tauri 打包图标随下一次桌面程序构建更新。
