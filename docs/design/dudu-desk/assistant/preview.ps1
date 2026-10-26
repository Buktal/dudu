param([ValidateSet('desk','console')][string]$Project = 'desk', [switch]$Narrow)
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$projectRoot = Join-Path $workspace "dudu-$Project"
$source = Join-Path $projectRoot '.assistant-review.tsx'
$html = Join-Path $projectRoot '.assistant-review.html'
$mobile = Join-Path $projectRoot '.assistant-mobile.html'
if ((Test-Path -LiteralPath $source) -or (Test-Path -LiteralPath $html) -or (Test-Path -LiteralPath $mobile)) { throw '验收临时文件已存在，请先检查用途' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "preview-$Project.tsx") -Destination $source
[System.IO.File]::WriteAllText($html, '<!doctype html><html lang="zh"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 助手正式组件验收</title><div id="root"></div><script type="module" src="/.assistant-review.tsx"></script></html>')
if ($Narrow) {
    [System.IO.File]::WriteAllText($mobile, '<!doctype html><html lang="zh"><meta charset="UTF-8"><title>AI 助手窄屏验收</title><body style="margin:0;background:#e8edf3;display:flex;justify-content:center"><iframe title="390px 实际视口" src="/.assistant-review.html" style="width:390px;height:844px;border:0;background:white"></iframe></body></html>')
}
Push-Location $projectRoot
try { yarn exec vite --host 127.0.0.1 --port $(if ($Project -eq 'console') { 1425 } else { 1423 }) --strictPort }
finally {
    Pop-Location
    Remove-Item -LiteralPath $source, $html
    if ($Narrow) { Remove-Item -LiteralPath $mobile }
}
