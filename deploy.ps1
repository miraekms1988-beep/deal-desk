# 딜 데스크 - 사이트 올리기
# web\ 폴더만 잘라 사이트 저장소(mirae-dealdesk/mirae-dealdesk.github.io)의 main 에 올린다.
#   사이트 주소: https://mirae-dealdesk.github.io/  (PF 레이더와 다른 출처 - 같은 출처면 크롬이 앱을 따로 설치하지 못한다)
#   소스는 이 저장소(miraekms1988-beep/deal-desk) main 에 그대로 둔다.
# 쓰기: 먼저 main 에 커밋 → .\deploy.ps1
# PowerShell 5.1 은 git 이 stderr 로 쓰는 진행 메시지를 오류로 읽으므로 Stop 대신 종료 코드를 본다.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$SITE_REPO = 'https://github.com/mirae-dealdesk/mirae-dealdesk.github.io.git'
$SITE_URL = 'https://mirae-dealdesk.github.io/'
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
git push $SITE_REPO gh-pages-build:main --force *> $null
$code = $LASTEXITCODE
git branch -D gh-pages-build *> $null
if ($code -ne 0) { Write-Host "사이트 올리기 실패 (git push $SITE_REPO)" -ForegroundColor Red; exit 1 }
Write-Host ('올렸습니다 (판 ' + $ver + '). 1분쯤 뒤 ' + $SITE_URL + ' 에 반영되고, 열려 있던 화면은 다시 볼 때 새 판으로 바뀝니다.') -ForegroundColor Green
