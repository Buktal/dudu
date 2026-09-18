# Rebuild the selected desktop icon and DuduDesk's bundled icon resources.
$ErrorActionPreference = 'Stop'
$deskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../dudu-desk')).Path
$desktopSource = Join-Path $PSScriptRoot 'desktop.svg'
$desktopExport = Join-Path $PSScriptRoot 'desktop-generated'
$desktopPreviewSizes = Join-Path $PSScriptRoot 'desktop-preview-sizes'

Push-Location -LiteralPath $deskProjectRoot
try {
  Copy-Item -LiteralPath $desktopSource -Destination 'public/logo.svg' -Force
  & yarn tauri icon $desktopSource --output $desktopExport
  if ($LASTEXITCODE -ne 0) { throw 'Tauri icon generation failed.' }
  & yarn tauri icon $desktopSource --output $desktopPreviewSizes --png 16 --png 24 --png 32 --png 48 --png 128 --png 256
  if ($LASTEXITCODE -ne 0) { throw 'Tauri icon preview generation failed.' }
  $desktopFiles = Get-ChildItem -LiteralPath $desktopExport -File |
    Where-Object { $_.Extension -in '.png', '.ico', '.icns' }
  foreach ($desktopFile in $desktopFiles) {
    Copy-Item -LiteralPath $desktopFile.FullName -Destination (Join-Path 'src-tauri/icons' $desktopFile.Name) -Force
  }
  Copy-Item -LiteralPath (Join-Path $desktopExport 'icon.ico') -Destination 'public/favicon.ico' -Force
  & (Join-Path $PSScriptRoot 'preview-desktop.ps1')
  Write-Output ('Updated {0} desktop resources and favicon.ico.' -f $desktopFiles.Count)
} finally {
  Pop-Location
}
