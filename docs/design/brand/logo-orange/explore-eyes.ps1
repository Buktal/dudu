# Compare DuDu's U-eye proportions using the existing Tauri SVG renderer.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$deskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../../dudu-desk')).Path
$refinementRoot = Join-Path $PSScriptRoot 'refinement'
$beforeSvg = Get-Content -LiteralPath (Join-Path $refinementRoot 'before-desktop.svg') -Raw
$beforeEyes = 'M72 109C74 123 82 131 94 131C106 131 114 123 116 109M148 109C150 123 158 131 170 131C182 131 190 123 192 109'
$studies = @(
  @{ name = 'before'; label = '原版'; eyes = $beforeEyes; stroke = '18' },
  @{ name = 'compact'; label = '整体收小 20%'; eyes = 'M84 111.2C85.6 122.4 92 128.8 101.6 128.8C111.2 128.8 117.6 122.4 119.2 111.2M144.8 111.2C146.4 122.4 152.8 128.8 162.4 128.8C172 128.8 178.4 122.4 180 111.2'; stroke = '14.4' },
  @{ name = 'balanced'; label = '单眼收小 20% · 调整间距'; eyes = 'M80.4 111.2C82 122.4 88.4 128.8 98 128.8C107.6 128.8 114 122.4 115.6 111.2M148.4 111.2C150 122.4 156.4 128.8 166 128.8C175.6 128.8 182 122.4 183.6 111.2'; stroke = '14.4' },
  @{ name = 'smaller'; label = '单眼收小 28%'; eyes = 'M84.16 112.08C85.6 122.16 91.36 127.92 100 127.92C108.64 127.92 114.4 122.16 115.84 112.08M148.16 112.08C149.6 122.16 155.36 127.92 164 127.92C172.64 127.92 178.4 122.16 179.84 112.08'; stroke = '12.96' }
)
Push-Location -LiteralPath $deskProjectRoot
try {
  foreach ($study in $studies) {
    $studySource = Join-Path $refinementRoot ($study.name + '.svg')
    $studySvg = $beforeSvg.Replace($beforeEyes, $study.eyes).Replace('stroke-width="18"', ('stroke-width="' + $study.stroke + '"'))
    [System.IO.File]::WriteAllText($studySource, $studySvg)
    & yarn tauri icon $studySource --output (Join-Path $refinementRoot $study.name) --png 16 --png 24 --png 32 --png 48 --png 192
    if ($LASTEXITCODE -ne 0) { throw ('Unable to render ' + $study.name) }
  }
} finally {
  Pop-Location
}
$sheet = [System.Drawing.Bitmap]::new(1080, 550)
$canvas = [System.Drawing.Graphics]::FromImage($sheet)
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#F4F6F8'))
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$heading = [System.Drawing.Font]::new('Microsoft YaHei UI', 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$label = [System.Drawing.Font]::new('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#26313B'))
$lightInk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E9EDF2'))
$darkSurface = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1D2C32'))
$canvas.DrawString('DuDu · 表情比例比较', $heading, $ink, 24, 20)
for ($column = 0; $column -lt $studies.Count; $column++) {
  $study = $studies[$column]
  $columnX = 24 + $column * 264
  $canvas.DrawString($study.label, $label, $ink, $columnX, 68)
  $largeImage = [System.Drawing.Image]::FromFile((Join-Path $refinementRoot ($study.name + '/192x192.png')))
  $canvas.DrawImageUnscaled($largeImage, $columnX + 20, 108)
  $largeImage.Dispose()
  $canvas.FillRectangle($darkSurface, $columnX, 400, 240, 116)
  $sampleX = $columnX + 15
  foreach ($size in @(16, 24, 32, 48)) {
    $sampleImage = [System.Drawing.Image]::FromFile((Join-Path $refinementRoot ($study.name + '/' + $size + 'x' + $size + '.png')))
    $canvas.DrawImageUnscaled($sampleImage, $sampleX, 346 - [int]($size / 2))
    $canvas.DrawImageUnscaled($sampleImage, $sampleX, 446 - [int]($size / 2))
    $sampleImage.Dispose()
    $canvas.DrawString(($size.ToString() + 'px'), $label, $ink, $sampleX, 375)
    $canvas.DrawString(($size.ToString() + 'px'), $label, $lightInk, $sampleX, 479)
    $sampleX += 56
  }
}
$sheet.Save((Join-Path $refinementRoot 'eye-studies.png'), [System.Drawing.Imaging.ImageFormat]::Png)
foreach ($resource in @($canvas, $sheet, $heading, $label, $ink, $lightInk, $darkSurface)) { $resource.Dispose() }
