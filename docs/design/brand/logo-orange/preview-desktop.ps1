$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$desktopPreview = [System.Drawing.Bitmap]::new(880, 366)
$canvas = [System.Drawing.Graphics]::FromImage($desktopPreview)
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f7f6'))
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$headingFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#26313b'))
$lightInk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#e9edf2'))
$canvas.DrawString('桌面图标 · 珊瑚橙底', $headingFont, $ink, 24, 21)
$canvas.DrawString('圆角橙色底，奶白色 D 形表情', $labelFont, $ink, 26, 58)

$surfaces = @(
  @{x=24; color='#e9eef2'; label='浅色桌面'; ink=$ink},
  @{x=452; color='#1d2c32'; label='深色桌面'; ink=$lightInk}
)
$samples = @(
  @{size=128; x=24; y=62; labelY=204},
  @{size=16; x=174; y=110; labelY=161},
  @{size=24; x=216; y=106; labelY=161},
  @{size=32; x=260; y=102; labelY=161},
  @{size=48; x=314; y=94; labelY=161}
)
foreach ($surface in $surfaces) {
  $surfaceBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($surface.color))
  $canvas.FillRectangle($surfaceBrush, $surface.x, 90, 404, 242)
  $surfaceBrush.Dispose()
  $canvas.DrawString($surface.label, $labelFont, $surface.ink, $surface.x + 18, 106)
  foreach ($sample in $samples) {
    $samplePath = Join-Path $PSScriptRoot ('desktop-preview-sizes/' + $sample.size + 'x' + $sample.size + '.png')
    $sampleImage = [System.Drawing.Image]::FromFile($samplePath)
    $canvas.DrawImageUnscaled($sampleImage, [int]($surface.x + $sample.x), [int](90 + $sample.y))
    $sampleImage.Dispose()
    $canvas.DrawString(($sample.size.ToString() + 'px'), $labelFont, $surface.ink, [single]($surface.x + $sample.x), [single](90 + $sample.labelY))
  }
}
$canvas.DrawString('小图标以实际像素尺寸展示', $labelFont, $ink, 25, 342)
$desktopPreview.Save((Join-Path $PSScriptRoot 'desktop-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$desktopPreview.Dispose()
$headingFont.Dispose()
$labelFont.Dispose()
$ink.Dispose()
$lightInk.Dispose()
