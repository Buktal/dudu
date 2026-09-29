# Render the selected DuDu refinement, including both transparent wordmarks.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$deskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../../dudu-desk')).Path
$refinementRoot = Join-Path $PSScriptRoot 'refinement'
$wordmarks = @(
  @{ name = 'light'; source = 'dudu-logo.svg' },
  @{ name = 'dark'; source = 'dudu-logo-dark.svg' }
)
Push-Location -LiteralPath $deskProjectRoot
try {
  foreach ($wordmark in $wordmarks) {
    $logoSvg = Get-Content -LiteralPath (Join-Path 'public' $wordmark.source) -Raw
    $renderSource = Join-Path $refinementRoot ('wordmark-' + $wordmark.name + '.svg')
    # The icon CLI accepts a square canvas; the logo retains its 672 x 192 ratio.
    $renderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="672" height="672" viewBox="0 0 672 672">' + $logoSvg + '</svg>'
    [System.IO.File]::WriteAllText($renderSource, $renderSvg)
    & yarn tauri icon $renderSource --output (Join-Path $refinementRoot ('wordmark-' + $wordmark.name)) --png 672
    if ($LASTEXITCODE -ne 0) { throw ('Unable to render the ' + $wordmark.name + ' wordmark.') }
  }
} finally {
  Pop-Location
}
$sheet = [System.Drawing.Bitmap]::new(960, 616)
$canvas = [System.Drawing.Graphics]::FromImage($sheet)
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#F4F6F8'))
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$heading = [System.Drawing.Font]::new('Microsoft YaHei UI', 26, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$label = [System.Drawing.Font]::new('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#26313B'))
$mutedInk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#5C6B76'))
$lightInk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E9EDF2'))
$whiteSurface = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FFFFFF'))
$darkSurface = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1D2C32'))
$canvas.DrawString('DuDu · 表情微调', $heading, $ink, 32, 24)
$canvas.DrawString('两个 U 收小 20%，微调间距，让表情和轮廓更平衡。', $label, $mutedInk, 34, 66)
$versions = @(
  @{ x = 32; name = '调整前'; folder = (Join-Path $refinementRoot 'before'); largeSize = 192 },
  @{ x = 496; name = '调整后'; folder = (Join-Path $PSScriptRoot 'desktop-preview-sizes'); largeSize = 256 }
)
foreach ($version in $versions) {
  $canvas.FillRectangle($whiteSurface, $version.x, 108, 432, 296)
  $canvas.DrawString($version.name, $label, $ink, $version.x + 24, 125)
  $largeImage = [System.Drawing.Image]::FromFile((Join-Path $version.folder ($version.largeSize.ToString() + 'x' + $version.largeSize + '.png')))
  $canvas.DrawImage($largeImage, [System.Drawing.Rectangle]::new($version.x + 24, 172, 192, 192))
  $largeImage.Dispose()
  $smallSamples = @(
    @{ size = 16; x = 266; centerY = 221 },
    @{ size = 24; x = 336; centerY = 221 },
    @{ size = 32; x = 258; centerY = 319 },
    @{ size = 48; x = 324; centerY = 319 }
  )
  foreach ($sample in $smallSamples) {
    $sampleImage = [System.Drawing.Image]::FromFile((Join-Path $version.folder ($sample.size.ToString() + 'x' + $sample.size + '.png')))
    $canvas.DrawImageUnscaled($sampleImage, $version.x + $sample.x, $sample.centerY - [int]($sample.size / 2))
    $sampleImage.Dispose()
    $canvas.DrawString(($sample.size.ToString() + 'px'), $label, $mutedInk, $version.x + $sample.x - 2, $sample.centerY + 30)
  }
}
for ($index = 0; $index -lt $wordmarks.Count; $index++) {
  $panelX = 32 + $index * 464
  $panelBrush = if ($index -eq 0) { $whiteSurface } else { $darkSurface }
  $panelInk = if ($index -eq 0) { $mutedInk } else { $lightInk }
  $panelLabel = if ($index -eq 0) { '浅色横版 · 透明底' } else { '深色横版 · 透明底' }
  $canvas.FillRectangle($panelBrush, $panelX, 428, 432, 152)
  $canvas.DrawString($panelLabel, $label, $panelInk, $panelX + 24, 442)
  $wordmarkImage = [System.Drawing.Image]::FromFile((Join-Path $refinementRoot ('wordmark-' + $wordmarks[$index].name + '/672x672.png')))
  $destination = [System.Drawing.Rectangle]::new($panelX + 24, 472, 336, 96)
  $canvas.DrawImage($wordmarkImage, $destination, 0, 0, 672, 192, [System.Drawing.GraphicsUnit]::Pixel)
  $wordmarkImage.Dispose()
}
$canvas.DrawString('16 / 24 / 32 / 48px 样例按实际像素展示', $label, $mutedInk, 32, 592)
$sheet.Save((Join-Path $PSScriptRoot 'refinement-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
foreach ($resource in @($canvas, $sheet, $heading, $label, $ink, $mutedInk, $lightInk, $whiteSurface, $darkSurface)) { $resource.Dispose() }
