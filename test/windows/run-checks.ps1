# Spec: 09-windows s.9.2 (identity, AUMID, foo://), s.9.3 (per-user NSIS install, no admin), s.9.18 (Credential Manager),
# s.9.23 (uninstall). Real Windows checks on the packaged installer: silent install, what it leaves on the PC, a launch
# driven through UI Automation (window_checks.py), the toast identity Windows needs, a Credential Manager round trip
# through foo's own keyring code, and silent uninstall. Writes results.json and SUMMARY.md to -Out.
# Not built yet in foo, so recorded as "gap" (never as a pass): the tray icon and foo's own toasts (09 s.9.0.1).
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$results = New-Object System.Collections.ArrayList
function Check([string]$name, [string]$status, [string]$detail = '') {
  [void]$results.Add([pscustomobject]@{ check = $name; status = $status; detail = $detail })
  Write-Host ("[{0}] {1} {2}" -f $status, $name, $detail)
}
function Pass-Fail([string]$name, [bool]$ok, [string]$detail = '') { Check $name ($(if ($ok) { 'pass' } else { 'fail' })) $detail }

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\foo'
$exe = Join-Path $installDir 'foo.exe'
$profileDir = Join-Path $env:RUNNER_TEMP 'foo-win-profile'
$env:FOO_DATA_DIR = Join-Path $profileDir 'data'
$env:FOO_LOCAL_DIR = Join-Path $profileDir 'local'
$uninstallKeys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
function Foo-UninstallEntry { Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'foo*' } }

# 1. Silent install, per user, no admin.
$t0 = Get-Date
$p = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
$secs = [int]((Get-Date) - $t0).TotalSeconds
Pass-Fail 'silent install (/S) exits 0' ($p.ExitCode -eq 0) "exit $($p.ExitCode), $secs s"
Pass-Fail 'installed per user under %LOCALAPPDATA%\Programs\foo' (Test-Path $exe) $exe
$entry = Foo-UninstallEntry
Pass-Fail 'Apps & features entry under HKCU (no admin)' ($null -ne $entry) "$($entry.DisplayName) $($entry.DisplayVersion)"
$lnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\foo.lnk'
Pass-Fail 'Start menu shortcut' (Test-Path $lnk) $lnk

# 2. Toast identity: Windows shows toasts only for an app whose Start menu entry carries its AUMID (09 s.9.2).
# The shortcut's own AUMID property is read directly: the Start menu index (Get-StartApps) can lag behind a fresh install.
$lnkAumid = (New-Object -ComObject Shell.Application).NameSpace((Split-Path $lnk)).ParseName((Split-Path $lnk -Leaf)).ExtendedProperty('System.AppUserModel.ID')
Pass-Fail 'Start menu shortcut carries AUMID com.foo.desktop (toasts can show)' ($lnkAumid -eq 'com.foo.desktop') "$lnkAumid"
try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>foo CI check</text></binding></visual></toast>')
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('com.foo.desktop').Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  Start-Sleep -Seconds 2
  $hist = @([Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('com.foo.desktop')).Count
  Pass-Fail 'a toast under foo''s AUMID is accepted by Windows' $true "history $hist"
  [Windows.UI.Notifications.ToastNotificationManager]::History.Clear('com.foo.desktop')
} catch {
  Pass-Fail 'a toast under foo''s AUMID is accepted by Windows' $false $_.Exception.Message
}
Check 'foo''s own toasts' 'gap' 'not built yet (09 s.9.0.1; later milestone)'

# 3. The installed app under UI Automation.
$ErrorActionPreference = 'Continue'
python (Join-Path $PSScriptRoot 'window_checks.py') $exe | Tee-Object -FilePath (Join-Path $Out 'window-checks.jsonl')
foreach ($line in Get-Content (Join-Path $Out 'window-checks.jsonl')) {
  if ($line -match '^\{') { $r = $line | ConvertFrom-Json; Pass-Fail $r.check $r.ok $r.detail }
}
$ErrorActionPreference = 'Stop'
Get-Process foo -ErrorAction SilentlyContinue | Stop-Process -Force
$proto = Get-ItemProperty 'HKCU:\Software\Classes\foo' -ErrorAction SilentlyContinue
Pass-Fail 'foo:// links registered for this user' ($null -ne $proto -and $proto.'URL Protocol' -ne $null) "$($proto.'(default)')"
$tray = Get-ChildItem 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue |
  Where-Object { (Get-ItemProperty $_.PSPath).ExecutablePath -like '*\foo.exe' }
if ($tray) { Check 'tray icon registered with Windows' 'pass' } else { Check 'tray icon' 'gap' 'not built yet (09 s.9.0.1, s.9.4 row 6; later milestone)' }

# 4. Credential Manager round trip through foo's own keyring adapter (run by foo.exe as Node).
$env:FOO_RESOURCES = Join-Path $installDir 'resources'
$env:ELECTRON_RUN_AS_NODE = '1'
# A native command's stderr must not end the script under 'Stop' (PowerShell 5.1 NativeCommandError).
$ErrorActionPreference = 'Continue'
$set = & $exe (Join-Path $PSScriptRoot 'credman-check.js') 2>&1 | Out-String
Pass-Fail 'Credential Manager: foo writes a secret and reads it back' ($LASTEXITCODE -eq 0) $set.Trim()
$listed = (cmdkey /list | Out-String) -match 'foo/test/ci-check'
Pass-Fail 'Credential Manager: Windows lists the entry (cmdkey)' $listed ''
$del = & $exe (Join-Path $PSScriptRoot 'credman-check.js') delete 2>&1 | Out-String
Pass-Fail 'Credential Manager: foo deletes it and it is gone' ($LASTEXITCODE -eq 0) $del.Trim()
Remove-Item Env:ELECTRON_RUN_AS_NODE
$ErrorActionPreference = 'Stop'

# 5. Silent uninstall.
$un = Join-Path $installDir 'Uninstall foo.exe'
if (Test-Path $un) {
  $p = Start-Process -FilePath $un -ArgumentList '/S' -Wait -PassThru
  for ($i = 0; $i -lt 30 -and (Test-Path $exe); $i++) { Start-Sleep -Seconds 1 } # the uninstaller re-launches itself from %TEMP%
  Pass-Fail 'silent uninstall removes foo.exe' (-not (Test-Path $exe)) "exit $($p.ExitCode)"
  Pass-Fail 'silent uninstall removes the Apps & features entry' ($null -eq (Foo-UninstallEntry)) ''
  Pass-Fail 'silent uninstall removes the Start menu shortcut' (-not (Test-Path $lnk)) ''
} else {
  Pass-Fail 'uninstaller present' $false $un
}

$results | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $Out 'results.json')
$md = @('| Check | Result | Detail |', '|---|---|---|') + ($results | ForEach-Object { "| $($_.check) | $($_.status) | $($_.detail -replace '\|', '/') |" })
$md | Set-Content -Encoding utf8 (Join-Path $Out 'SUMMARY.md')
$failed = @($results | Where-Object { $_.status -eq 'fail' }).Count
Write-Host "$failed failed, $(@($results | Where-Object { $_.status -eq 'gap' }).Count) gaps (not built yet)"
if ($failed -gt 0) { exit 1 }
