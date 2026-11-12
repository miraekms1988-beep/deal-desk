@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; $c=[IO.File]::ReadAllText($f,[Text.Encoding]::UTF8); iex $c.Substring($c.LastIndexOf('#PS' + 'START'))"
pause
exit /b
#PSSTART
# 딜 데스크 - Outlook 개별 발송 도우미
# 내려받기 폴더의 가장 새 '발송묶음_*.ddmail.json' 을 읽어, 받는 사람마다 한 통씩 Outlook 으로 보낸다.
# 각 메일의 받는 사람(To) 칸에는 그 사람 한 명만 들어간다. 숨은참조·단체 발송은 쓰지 않는다.
$ErrorActionPreference = 'Stop'
try { $Host.UI.RawUI.WindowTitle = '딜 데스크 - Outlook 개별 발송' } catch { }
Write-Host ''
Write-Host '  DEAL DESK  ·  Outlook 개별 발송' -ForegroundColor Yellow
Write-Host ''

$dirs = New-Object System.Collections.ArrayList
try { [void]$dirs.Add((New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path) } catch { }
[void]$dirs.Add((Join-Path $env:USERPROFILE 'Downloads'))
[void]$dirs.Add((Split-Path -Parent $f))
$found = New-Object System.Collections.ArrayList
foreach ($d in ($dirs | Select-Object -Unique)) {
  if ($d -and (Test-Path -LiteralPath $d)) { foreach ($x in @(Get-ChildItem -LiteralPath $d -Filter '*.ddmail.json' -File)) { [void]$found.Add($x) } }
}
$pkgFile = $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $pkgFile) {
  Write-Host '  내려받은 발송 묶음(.ddmail.json)을 찾지 못했습니다.' -ForegroundColor Red
  Write-Host ('  찾아본 곳: ' + (($dirs | Select-Object -Unique) -join ', '))
  return
}

$pkg = [IO.File]::ReadAllText($pkgFile.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
$items = New-Object System.Collections.ArrayList
foreach ($it in $pkg.items) { [void]$items.Add($it) }
$atts = New-Object System.Collections.ArrayList
if ($pkg.attachments) { foreach ($a in $pkg.attachments) { [void]$atts.Add($a) } }
$age = (Get-Date) - $pkgFile.LastWriteTime

Write-Host ('  묶음     : ' + $pkgFile.Name)
Write-Host ('  만든 때  : {0:yyyy-MM-dd HH:mm} ({1:N0}분 전)' -f $pkgFile.LastWriteTime, $age.TotalMinutes)
if ($pkg.deal) { Write-Host ('  딜       : ' + $pkg.deal) }
Write-Host ('  제목     : ' + $items[0].subject)
Write-Host ('  첨부     : ' + $(if ($atts.Count) { ($atts | ForEach-Object { $_.name }) -join ', ' } else { '없음' }))
Write-Host ('  받는 사람: {0}명 - 한 명씩 따로 갑니다' -f $items.Count)
foreach ($it in ($items | Select-Object -First 60)) { Write-Host ('     · {0}  {1} <{2}>' -f $it.org, $it.name, $it.to) }
if ($items.Count -gt 60) { Write-Host ('     · … 외 {0}명' -f ($items.Count - 60)) }
if ($age.TotalHours -gt 12) { Write-Host '  ※ 12시간이 넘은 묶음입니다. 보내려던 묶음이 맞는지 확인하세요.' -ForegroundColor Yellow }

$ol = New-Object -ComObject Outlook.Application
$acct = $null
foreach ($a in $ol.Session.Accounts) {
  if ($a.SmtpAddress -and $pkg.from -and ($a.SmtpAddress.ToLower() -eq ([string]$pkg.from).ToLower())) { $acct = $a }
}
if ($acct) { Write-Host ('  보내는 계정: ' + $acct.SmtpAddress) -ForegroundColor Cyan }
else { Write-Host ('  보내는 계정: Outlook 기본 계정 - 딜 데스크 이메일(' + $pkg.from + ')과 같은 계정을 찾지 못했습니다') -ForegroundColor Yellow }
Write-Host ''
$ans = Read-Host '  S = 지금 한 통씩 보내기 / D = 임시보관함에만 넣기 / 그 밖 = 그만'
$mode = ([string]$ans).Trim().ToUpper()
if ($mode -ne 'S' -and $mode -ne 'D') { Write-Host '  그만뒀습니다. 아무것도 보내지 않았습니다.'; return }

$tmp = Join-Path $env:TEMP ('dealdesk-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$paths = New-Object System.Collections.ArrayList
foreach ($a in $atts) { $p = Join-Path $tmp ([string]$a.name); [IO.File]::WriteAllBytes($p, [Convert]::FromBase64String([string]$a.b64)); [void]$paths.Add($p) }

$ok = 0; $fail = 0; $n = 0
foreach ($it in $items) {
  $n++
  try {
    $m = $ol.CreateItem(0)
    if ($acct) { $m.SendUsingAccount = $acct }
    $m.To = [string]$it.to
    $m.Subject = [string]$it.subject
    $m.HTMLBody = [string]$it.html
    foreach ($p in $paths) { [void]$m.Attachments.Add($p) }
    if ($mode -eq 'S') { $m.Send() } else { $m.Save() }
    $ok++
    Write-Host ('  [{0}/{1}] {2}  {3} <{4}>  {5}' -f $n, $items.Count, $it.org, $it.name, $it.to, $(if ($mode -eq 'S') { '보냄' } else { '임시보관함' })) -ForegroundColor Green
  } catch {
    $fail++
    Write-Host ('  [{0}/{1}] {2} <{3}>  실패: {4}' -f $n, $items.Count, $it.org, $it.to, $_.Exception.Message) -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 700
}
try { [IO.Directory]::Delete($tmp, $true) } catch { }

Write-Host ''
Write-Host ('  끝났습니다: 성공 {0}통, 실패 {1}통' -f $ok, $fail) -ForegroundColor Yellow
if ($mode -eq 'S') { Write-Host '  Outlook 보낸편지함에서 확인할 수 있습니다. 딜 데스크에서 [발송 기록 남기기] 를 눌러 주세요.' }
else { Write-Host '  Outlook 임시보관함에서 확인한 뒤 보내 주세요. 다 보내면 딜 데스크에서 [발송 기록 남기기].' }
$del = Read-Host '  발송 묶음 파일을 지울까요? 메일 내용·첨부가 들어 있습니다 (Y/n)'
if (([string]$del).Trim().ToLower() -ne 'n') { [IO.File]::Delete($pkgFile.FullName); Write-Host '  지웠습니다.' }
