# 딜 데스크 - 사이트 올리기
# web\ 폴더만 gh-pages 브랜치로 잘라 올린다 (GitHub Pages 가 그 브랜치 루트를 서빙).
# 쓰기: 먼저 main 에 커밋 → .\deploy.ps1
# PowerShell 5.1 은 git 이 stderr 로 쓰는 진행 메시지를 오류로 읽으므로 Stop 대신 종료 코드를 본다.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$cfg = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\config.js'), [Text.Encoding]::UTF8)
if ($cfg -match "API_URL:\s*''") { Write-Host '※ config.js 의 API_URL 이 비어 있습니다 - 올린 사이트는 시험 모드(각자 브라우저에만 저장)로 돕니다.' -ForegroundColor Yellow }
if (git status --porcelain web) { Write-Host 'web\ 에 커밋 안 한 변경이 있습니다. 먼저 커밋하세요.' -ForegroundColor Red; exit 1 }
# 판 번호 찍기: index.html 의 ?v= 와 DD_VERSION, version.txt. 열린 화면이 version.txt 를 보고 새 판이면 스스로 다시 연다.
$ver = Get-Date -Format 'yyMMddHHmmss'
$ix = Join-Path $PSScriptRoot 'web\index.html'
$h = [IO.File]::ReadAllText($ix, [Text.Encoding]::UTF8)
$h = [regex]::Replace($h, '\?v=[A-Za-z0-9]+', "?v=$ver")
$h = [regex]::Replace($h, "DD_VERSION = '[^']*'", "DD_VERSION = '$ver'")
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ix, $h, $utf8)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'web\version.txt'), "$ver`n", $utf8)
git add web/index.html web/version.txt *> $null
git commit -q -m "배포 판 $ver" *> $null
git push -q origin main *> $null
if (git branch --list gh-pages-build) { git branch -D gh-pages-build *> $null }
git subtree split --prefix web -b gh-pages-build *> $null
if ($LASTEXITCODE -ne 0) { Write-Host 'subtree split 실패' -ForegroundColor Red; exit 1 }
git push origin gh-pages-build:gh-pages --force *> $null
$code = $LASTEXITCODE
git branch -D gh-pages-build *> $null
if ($code -ne 0) { Write-Host 'gh-pages 올리기 실패 (git push)' -ForegroundColor Red; exit 1 }
Write-Host ('올렸습니다 (판 ' + $ver + ', main ' + (git rev-parse --short HEAD) + '). 1분쯤 뒤 반영되고, 열려 있던 화면은 다시 볼 때 새 판으로 바뀝니다.') -ForegroundColor Green
