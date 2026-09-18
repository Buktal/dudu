$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$palettePreviewRoot = $PSScriptRoot
$paletteRows = Get-Content -LiteralPath (Join-Path $palettePreviewRoot 'bases.json') -Raw | ConvertFrom-Json
$headingFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 27, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#232629'))
$mutedInk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#65696f'))
$rule = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#dedfe1'))

function Draw-QueueCrop($graphics, $imageName, [int]$x, [int]$y) {
  $sourceImage = [System.Drawing.Image]::FromFile((Join-Path $palettePreviewRoot $imageName))
  try {
    $target = [System.Drawing.Rectangle]::new($x, $y, 266, 216)
    $source = [System.Drawing.Rectangle]::new(4, 188, 266, 216)
    $graphics.DrawImage($sourceImage, $target, $source, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $sourceImage.Dispose()
  }
}

$overview = [System.Drawing.Bitmap]::new(1200, 976)
$canvas = [System.Drawing.Graphics]::FromImage($overview)
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f7f6'))
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$canvas.DrawString('12 款主题 · 实际界面', $headingFont, $ink, 26, 24)
$canvas.DrawString('同一位置对照：基础输入保持轻，选中会话更鲜明。', $bodyFont, $mutedInk, 27, 67)
for ($i = 0; $i -lt $paletteRows.Count; $i++) {
  $palette = $paletteRows[$i]
  $x = 26 + ($i % 4) * 290
  $y = 112 + [Math]::Floor($i / 4) * 276
  $canvas.FillRectangle([System.Drawing.Brushes]::White, $x, $y, 278, 262)
  $canvas.DrawRectangle($rule, $x, $y, 278, 262)
  $baseBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($palette.base))
  $canvas.FillRectangle($baseBrush, $x + 12, $y + 15, 18, 18)
  $canvas.DrawRectangle($rule, $x + 12, $y + 15, 18, 18)
  $baseBrush.Dispose()
  $canvas.DrawString($palette.name, $labelFont, $ink, $x + 39, $y + 10)
  Draw-QueueCrop $canvas ('after-' + $palette.id + '.png') ($x + 6) ($y + 42)
}
$canvas.DrawString('嘟嘟 Desk · 12 款共用相同的明暗层次与选中规则', $bodyFont, $mutedInk, 27, 947)
$overview.Save((Join-Path $palettePreviewRoot 'themes-overview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$overview.Dispose()

$comparison = [System.Drawing.Bitmap]::new(790, 660)
$canvas = [System.Drawing.Graphics]::FromImage($comparison)
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f7f6'))
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$canvas.DrawString('琥珀黄与莓果粉 · 层次调整', $headingFont, $ink, 26, 23)
$canvas.DrawString('调整前', $labelFont, $mutedInk, 180, 82)
$canvas.DrawString('调整后', $labelFont, $ink, 480, 82)
$compareRows = @(@{id='amber'; name='琥珀黄'}, @{id='berry'; name='莓果粉'})
for ($i = 0; $i -lt $compareRows.Count; $i++) {
  $y = 121 + $i * 258
  $canvas.DrawString($compareRows[$i].name, $labelFont, $ink, 27, $y + 93)
  Draw-QueueCrop $canvas ('before-' + $compareRows[$i].id + '.png') 163 $y
  Draw-QueueCrop $canvas ('after-' + $compareRows[$i].id + '.png') 463 $y
  $canvas.DrawRectangle($rule, 162, $y - 1, 268, 218)
  $canvas.DrawRectangle($rule, 462, $y - 1, 268, 218)
}
$canvas.DrawString('基础底色降低存在感，选中色块加深，同时保留文字清晰度。', $bodyFont, $mutedInk, 27, 625)
$comparison.Save((Join-Path $palettePreviewRoot 'hierarchy-before-after.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$comparison.Dispose()
$headingFont.Dispose()
$labelFont.Dispose()
$bodyFont.Dispose()
$ink.Dispose()
$mutedInk.Dispose()
$rule.Dispose()
Write-Output 'Created themes-overview.png and hierarchy-before-after.png'
