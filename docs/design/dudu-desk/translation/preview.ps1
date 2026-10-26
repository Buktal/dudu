param([ValidateSet('desk','console')][string]$Project = 'console', [switch]$Narrow)
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$projectRoot = Join-Path $workspace "dudu-$Project"
$source = Join-Path $projectRoot '.translation-preview.tsx'
$html = Join-Path $projectRoot '.translation-preview.html'
$mobile = Join-Path $projectRoot '.translation-mobile.html'
if ((Test-Path -LiteralPath $source) -or (Test-Path -LiteralPath $html) -or ($Narrow -and (Test-Path -LiteralPath $mobile))) { throw '临时预览文件已存在，请先检查用途' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "preview-$Project.tsx") -Destination $source
[System.IO.File]::WriteAllText($html, '<!doctype html><html lang="zh"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>翻译界面验证</title><div id="root"></div><script type="module" src="/.translation-preview.tsx"></script></html>')
if ($Narrow) {
    [System.IO.File]::WriteAllText($mobile, '<!doctype html><html lang="zh"><meta charset="UTF-8"><title>窄屏布局验证</title><body style="margin:0;background:#e8edf3;display:flex;justify-content:center"><iframe title="390px 窄屏界面" src="/.translation-preview.html" style="width:390px;height:700px;border:0;background:white"></iframe></body></html>')
}
Push-Location $projectRoot
try { yarn exec vite --host 127.0.0.1 --port $(if ($Project -eq 'console') { 1425 } else { 1423 }) --strictPort }
finally {
    Pop-Location
    Remove-Item -LiteralPath $source, $html
    if ($Narrow) { Remove-Item -LiteralPath $mobile }
}
