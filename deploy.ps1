# 딜 데스크 - 사이트 올리기
# web\ 폴더만 gh-pages 브랜치로 잘라 올린다 (GitHub Pages 가 그 브랜치 루트를 서빙).
# 쓰기: 먼저 main 에 커밋 → .\deploy.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$cfg = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\config.js'), [Text.Encoding]::UTF8)
if ($cfg -match "API_URL:\s*''") { Write-Host '※ config.js 의 API_URL 이 비어 있습니다 - 올린 사이트는 시험 모드(각자 브라우저에만 저장)로 돕니다.' -ForegroundColor Yellow }
if (git status --porcelain web) { throw 'web\ 에 커밋 안 한 변경이 있습니다. 먼저 커밋하세요.' }
git branch -D gh-pages-build 2>$null | Out-Null
git subtree split --prefix web -b gh-pages-build | Out-Null
git push origin gh-pages-build:gh-pages --force
git branch -D gh-pages-build | Out-Null
Write-Host '올렸습니다. 1분쯤 뒤 https://miraekms1988-beep.github.io/deal-desk/ 에 반영됩니다 (Pages 캐시 10분).' -ForegroundColor Green
